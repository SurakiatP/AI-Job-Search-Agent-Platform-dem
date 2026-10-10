"""Exercise the production factory and launcher with isolated synthetic storage."""

import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
import uvicorn
from sqlalchemy.engine import URL
from botocore.exceptions import ClientError

from job_search_platform import main
from job_search_platform.services.owner_sessions import CSRF_HEADER
from job_search_platform.services.maintenance import acquire_maintenance_lock
from job_search_platform.services.errors import ServiceError


@pytest.fixture
def production_factory(migrated_engine, monkeypatch):
    bucket = f"jsp-startup-test-{uuid4().hex}"
    monkeypatch.setenv("JSP_PRIVATE_BUCKET", bucket)
    native_make_engine = main.make_engine
    native_client = main.boto3.client
    created = []
    clients = []

    def tracked_client(*args, **kwargs):
        client = native_client(*args, **kwargs)
        clients.append(client)
        return client

    monkeypatch.setattr(main.boto3, "client", tracked_client)

    def isolated_engine(url, **kwargs):
        # Keep credentials inside the adapter; never include them in assertions.
        if not isinstance(url, URL) or url.password in (None, "***"):
            raise AssertionError("production_connection_identity_redacted")
        return native_make_engine(url.set(database=migrated_engine.url.database), **kwargs)

    monkeypatch.setattr(main, "make_engine", isolated_engine)

    def factory():
        services = main.build_services()
        created.append(services)
        return services

    yield factory, created
    for services in created:
        if services.engine is not None:
            services.engine.dispose()
    # Also clean up if factory construction failed after creating its bucket.
    for client in clients:
        try:
            # This fixture owns a UUID-named synthetic bucket, including browser upload objects.
            contents = client.list_objects_v2(Bucket=bucket).get("Contents", [])
            if contents:
                client.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": row["Key"]} for row in contents]})
            client.delete_bucket(Bucket=bucket)
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "NoSuchBucket":
                raise


@pytest.mark.integration
@pytest.mark.asyncio
async def test_maintenance_excludes_app_before_migration_and_entire_lifespan(production_factory, monkeypatch):
    factory, _ = production_factory
    services = factory()
    target = (main.PRIVATE_DIR, str(services.engine.url), services.files.object_store.bucket)
    migration_calls = []
    native_migrate = main._migrate

    def recorded_migrate(engine):
        migration_calls.append(True)
        native_migrate(engine)

    monkeypatch.setattr(main, "_migrate", recorded_migrate)
    with acquire_maintenance_lock(*target):
        blocked = main.create_app(service_factory=lambda: services)
        with pytest.raises(ServiceError, match="maintenance_active"):
            async with blocked.router.lifespan_context(blocked):
                raise AssertionError("maintenance_did_not_exclude_app")
        assert not migration_calls
    app = main.create_app(service_factory=lambda: services)
    async with app.router.lifespan_context(app):
        assert migration_calls == [True]
        with pytest.raises(ServiceError, match="maintenance_active"):
            acquire_maintenance_lock(*target)
    with acquire_maintenance_lock(*target) as guard:
        assert guard.held


@pytest.mark.integration
@pytest.mark.asyncio
async def test_production_factory_migrates_serves_owner_and_stops_dispatch(production_factory):
    factory, created = production_factory
    app = main.create_app(service_factory=factory)
    async with app.router.lifespan_context(app):
        services = created[0]
        project_id, run_id = uuid4(), uuid4()
        expected = services.runtime.workspace_root / str(project_id) / str(run_id) / "staging"
        assert services.artifacts.staging_root_for_run(project_id, run_id) == expected
        assert services.supervisor._dispatcher is not None
        launch = await services.owner_sessions.create_launch_nonce("http://127.0.0.1:8000")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
            denied = await client.get("/api/v1/projects")
            assert denied.status_code == 401
            response = await client.post("/api/v1/owner/bootstrap", json={"nonce": launch.nonce}, headers={"Origin": "http://127.0.0.1:8000"})
            assert response.status_code == 200
            headers = {"Origin": "http://127.0.0.1:8000", CSRF_HEADER: response.json()["csrf_token"]}
            project = await client.post("/api/v1/projects", json={"name": "Synthetic factory project"}, headers=headers)
            assert project.status_code == 201
            projects = await client.get("/api/v1/projects")
            assert projects.status_code == 200
            assert projects.headers["cache-control"] == "no-store"
            assert [row["name"] for row in projects.json()] == ["Synthetic factory project"]
    assert created[0].supervisor._dispatcher is None
    assert not created[0].supervisor._active


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("host", ["127.0.0.1", "::1"])
@pytest.mark.parametrize("open_browser", [False, True])
async def test_actual_launcher_serves_inside_running_loop_without_exposing_nonce(production_factory, tmp_path, monkeypatch, unused_tcp_port, host, open_browser):
    factory, created = production_factory
    script = Path(__file__).resolve().parents[3] / "scripts" / "run_local.py"
    spec = importlib.util.spec_from_file_location("production_launcher_probe", script)
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    monkeypatch.setattr(launcher, "build_services", factory)
    monkeypatch.setenv("JSP_ALLOWED_ORIGINS", "")
    import webbrowser
    opened = []
    monkeypatch.setattr(webbrowser, "open", lambda _: opened.append(True) or True)
    printed_launch_link = []

    def private_output(*values, **_kwargs):
        # A nonce may be printed to the owner's terminal, never test output.
        if values and str(values[0]).startswith("One-use owner launch link"):
            printed_launch_link.append(True)

    monkeypatch.setattr(launcher, "print", private_output, raising=False)
    servers = []
    native_server = uvicorn.Server

    class RecordedServer(native_server):
        def __init__(self, config):
            super().__init__(config)
            servers.append(self)

    monkeypatch.setattr(uvicorn, "Server", RecordedServer)
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html><body>Synthetic launcher page</body></html>")
    args = SimpleNamespace(frontend_dist=dist, build_frontend=False, host=host, port=unused_tcp_port, open_browser=open_browser)
    task = asyncio.create_task(launcher._launch(args))
    try:
        async with asyncio.timeout(20):
            while not servers or not servers[0].started:
                if task.done():
                    await task
                    raise AssertionError("launcher_stopped_before_serving")
                await asyncio.sleep(0.02)
        url_host = "[::1]" if host == "::1" else host
        async with httpx.AsyncClient(base_url=f"http://{url_host}:{unused_tcp_port}", trust_env=False) as client:
            response = await client.get("/")
            assert response.status_code == 200
            assert "Synthetic launcher page" in response.text
            assert (await client.get("/api/v1/projects")).status_code == 401
        if open_browser:
            async with asyncio.timeout(5):
                while not opened:
                    await asyncio.sleep(0.01)
        assert printed_launch_link == ([] if open_browser else [True])
    finally:
        if servers:
            servers[0].should_exit = True
        else:
            task.cancel()
        await asyncio.wait_for(task, timeout=15)
    assert created[0].supervisor._dispatcher is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_failed_native_shutdown_attempts_runtime_cleanup_and_keeps_target_locked(production_factory):
    factory, _ = production_factory
    services = factory()
    attempted = []
    real_close = services.supervisor.close

    async def failed_close():
        await real_close()
        raise ServiceError("native_stop_incomplete")

    async def recorded_runtime_close():
        attempted.append(True)

    services.supervisor.close = failed_close
    services.runtime.close = recorded_runtime_close
    app = main.create_app(services)
    try:
        with pytest.raises(ServiceError, match="native_stop_incomplete"):
            async with app.router.lifespan_context(app):
                pass
        assert attempted == [True]
        assert services.shutdown_confirmed is False
        with pytest.raises(ServiceError, match="maintenance_active"):
            acquire_maintenance_lock(main.PRIVATE_DIR, str(services.engine.url), services.files.object_store.bucket)
    finally:
        # This synthetic test started no native processes; release its guard explicitly.
        services.maintenance_lock.close()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_actual_built_frontend_with_production_rest_upload_and_session_restore(production_factory, monkeypatch, tmp_path, unused_tcp_port):
    import os
    factory, _ = production_factory
    origin = f"http://127.0.0.1:{unused_tcp_port}"
    monkeypatch.setenv("JSP_ALLOWED_ORIGINS", origin)
    app = main.create_app(service_factory=factory, frontend_dist=main.ROOT / "frontend" / "dist")
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=unused_tcp_port, access_log=False, log_config=None))
    task = asyncio.create_task(server.serve())
    try:
        for _ in range(200):
            if task.done():
                await task
                raise AssertionError("actual_frontend_server_failed")
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started
        launch = await app.state.services.owner_sessions.create_launch_nonce(origin)
        import json
        config = tmp_path / "synthetic-owner-session.json"
        config.write_text(json.dumps({"nonce": launch.nonce}))
        config.chmod(0o600)
        environment = dict(os.environ, JSP_E2E_BASE_URL=origin, JSP_E2E_SESSION_FILE=str(config),
                           PLAYWRIGHT_OUTPUT_DIR=str(tmp_path / "playwright-output"))
        process = await asyncio.create_subprocess_exec(
            "rtk", "proxy", "npm", "test", "--prefix", "tests", "--", "actual-backend.spec.ts", "--workers=1",
            cwd=main.ROOT, env=environment, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await asyncio.wait_for(process.communicate(), 180)
        assert process.returncode == 0, output.decode()
    finally:
        server.should_exit = True
        await task
