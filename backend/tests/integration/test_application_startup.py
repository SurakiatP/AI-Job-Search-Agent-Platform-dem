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

    def isolated_engine(url):
        # Keep credentials inside the adapter; never include them in assertions.
        if not isinstance(url, URL) or url.password in (None, "***"):
            raise AssertionError("production_connection_identity_redacted")
        return native_make_engine(url.set(database=migrated_engine.url.database))

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
            if client.list_objects_v2(Bucket=bucket).get("Contents"):
                raise AssertionError("startup_test_bucket_not_empty")
            client.delete_bucket(Bucket=bucket)
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "NoSuchBucket":
                raise


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
async def test_actual_launcher_serves_inside_running_loop_without_exposing_nonce(production_factory, tmp_path, monkeypatch, unused_tcp_port, host):
    factory, created = production_factory
    script = Path(__file__).resolve().parents[3] / "scripts" / "run_local.py"
    spec = importlib.util.spec_from_file_location("production_launcher_probe", script)
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    monkeypatch.setattr(launcher, "build_services", factory)
    monkeypatch.setenv("JSP_ALLOWED_ORIGINS", "")
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
    args = SimpleNamespace(frontend_dist=dist, build_frontend=False, host=host, port=unused_tcp_port)
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
        assert printed_launch_link == [True]
    finally:
        if servers:
            servers[0].should_exit = True
        else:
            task.cancel()
        await asyncio.wait_for(task, timeout=15)
    assert created[0].supervisor._dispatcher is None
