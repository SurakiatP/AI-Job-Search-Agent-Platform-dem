"""Local FastAPI application and production service assembly."""
from __future__ import annotations

import json
import os
import stat
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit
from uuid import uuid4

import boto3
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel

from job_search_platform.api.dependencies import Services
from job_search_platform.api.rest import _http_error, router as rest_router
from job_search_platform.api.sse import router as sse_router
from job_search_platform.db.session import make_engine
from job_search_platform.integrations.hermes_runtime import HermesRuntime
from job_search_platform.integrations.object_store import S3ObjectStore
from job_search_platform.integrations.secrets import MacOSKeychain
from job_search_platform.services.approvals import ApprovalService
from job_search_platform.services.documents import Artifacts, Documents
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.maintenance import acquire_maintenance_lock, assert_restore_ready
from job_search_platform.services.files import Files
from job_search_platform.services.grants import Grants
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.runs import RunService
from job_search_platform.services.settings import Settings
from job_search_platform.services import contracts
from job_search_platform.workers.executor import RunExecutor
from job_search_platform.workers.queue import PostgresRunQueue
from job_search_platform.workers.supervisor import WorkerSupervisor

ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = Path(os.environ.get("CORE02_PRIVATE_DIR", str(Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003")))
RUNTIME_METADATA = Path.home() / ".cache" / "job-search-platform" / "hermes-runtime.json"


def _private_text(name: str) -> str:
    path = PRIVATE_DIR / name
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RuntimeError("private_runtime_credentials_unavailable")
    return path.read_text(encoding="utf-8").strip()


def _origin_settings() -> tuple[set[str], set[str]]:
    default = {"http://127.0.0.1:8000", "http://localhost:8000"}
    raw = os.environ.get("JSP_ALLOWED_ORIGINS", "")
    origins = {entry.strip() for entry in raw.split(",") if entry.strip()} or default
    dev = os.environ.get("JSP_DEV_ORIGIN")
    if dev:
        parsed = urlsplit(dev)
        if parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.scheme != "http" or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise RuntimeError("development_origin_must_be_loopback")
        origins.add(dev.rstrip("/"))
    hosts: set[str] = set()
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.hostname is None or parsed.scheme != "http" or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise RuntimeError("owner_origin_invalid")
        hosts.add(parsed.netloc)
    return origins, hosts


def _migrate(engine) -> None:
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    cfg.set_main_option("prepend_sys_path", str(BACKEND_ROOT / "src"))
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")


def build_services() -> Services:
    """Assemble pinned local infrastructure without returning credential values."""
    user = _private_text("postgres-user")
    password = _private_text("postgres-password")
    db_url = URL.create("postgresql+psycopg", username=user, password=password,
                        host="127.0.0.1", port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")),
                        database=os.environ.get("JSP_DATABASE", "jobsearch_platform_core02"))
    engine = make_engine(db_url)
    sessions = sessionmaker(engine, expire_on_commit=False)

    access = _private_text("minio-access-key")
    secret = _private_text("minio-secret-key")
    client = boto3.client(
        "s3", endpoint_url=f"http://127.0.0.1:{os.environ.get('CORE02_MINIO_PORT', '59000')}",
        aws_access_key_id=access, aws_secret_access_key=secret, region_name="us-east-1",
        config=__import__("botocore.config", fromlist=["Config"]).Config(
            signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 2}),
    )
    bucket = os.environ.get("JSP_PRIVATE_BUCKET", "job-search-platform-private")
    try:
        client.head_bucket(Bucket=bucket)
    except Exception as exc:
        response = getattr(exc, "response", {})
        code = str(response.get("Error", {}).get("Code", ""))
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise RuntimeError("private_object_store_unavailable") from None
        client.create_bucket(Bucket=bucket)
    store = S3ObjectStore(client, bucket)

    try:
        metadata = json.loads(RUNTIME_METADATA.read_text(encoding="utf-8"))
        image = metadata["image"]
        if not isinstance(image, str) or not image:
            raise ValueError
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        raise RuntimeError("native_runtime_metadata_unavailable") from None
    runtime = HermesRuntime(image)
    secrets = MacOSKeychain()
    settings = Settings(sessions, secrets)
    runs = RunService(sessions)
    files = Files(sessions, store, runtime)
    documents = Documents(sessions, store)
    artifacts = Artifacts(sessions, store, lambda project_id, run_id: runtime.workspace_root / str(project_id) / str(run_id) / "staging")
    approvals = ApprovalService(sessions)
    grants = Grants(sessions)
    queue = PostgresRunQueue(sessions)
    executor = RunExecutor(sessions, queue, runtime, settings, artifacts, store,
                           workspace_root=runtime.workspace_root)
    supervisor = WorkerSupervisor(sessions, queue, executor, runtime)
    origins, hosts = _origin_settings()
    owner_sessions = OwnerSessions(sessions, allowed_origins=origins, allowed_hosts=hosts)
    return Services(sessions=sessions, owner_sessions=owner_sessions, files=files,
                    documents=documents, runs=runs, grants=grants, settings=settings,
                    approvals=approvals, supervisor=supervisor, runtime=runtime,
                    queue=queue, artifacts=artifacts, secret_store=secrets, engine=engine)


def _safe_field_names(exc: RequestValidationError) -> dict[str, str] | None:
    fields: dict[str, str] = {}
    aliases = {"Idempotency-Key": "idempotency_key"}
    for error in exc.errors():
        for part in error.get("loc", ()):
            field_name = aliases.get(part, part) if isinstance(part, str) else None
            if field_name in {
                "name", "locale", "output_language", "notifications_enabled", "title", "company",
                "source_url", "description", "content", "filename", "file", "mime_type", "session_id",
                "operation", "cv_revision_id", "job_revision_id", "idempotency_key", "retry_of_id",
                "action", "revision_id", "expected_cv_revision_id", "target_file_id", "decision",
                "capabilities", "expires_at", "provider", "model", "credential", "enabled", "base_url",
            }:
                fields[field_name] = "invalid"
    return fields or None


def acquire_service_maintenance(services: Services):
    """Hold the target lock and refuse an incomplete restore before any startup writes."""
    if services.engine is None:
        return None  # controlled transport fixtures only
    guard = services.maintenance_lock
    owns_guard = guard is None or not guard.held
    if owns_guard:
        guard = acquire_maintenance_lock(PRIVATE_DIR, str(services.engine.url), services.files.object_store.bucket)
    try:
        assert_restore_ready(PRIVATE_DIR, str(services.engine.url), services.files.object_store.bucket)
    except BaseException:
        if owns_guard:
            guard.close()
        raise
    services.maintenance_lock = guard
    return guard


def create_app(
    services: Services | None = None,
    *,
    service_factory: Callable[[], Services] = build_services,
    frontend_dist: Path | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        current = services or service_factory()
        owns_guard = current.maintenance_lock is None or not current.maintenance_lock.held
        guard = acquire_service_maintenance(current)
        try:
            if services is None:
                await __import__("asyncio").to_thread(_migrate, current.engine)
            app.state.services = current
            current.shutdown_confirmed = False
            try:
                await current.files.reconcile_pending()
                await current.supervisor.start()
                yield
            finally:
                supervisor_stopped = False
                runtime_stopped = False
                try:
                    await current.supervisor.close()
                    supervisor_stopped = True
                finally:
                    try:
                        await current.runtime.close()
                        runtime_stopped = True
                    finally:
                        current.shutdown_confirmed = supervisor_stopped and runtime_stopped
                        if current.engine is not None:
                            current.engine.dispose()
        finally:
            if owns_guard and guard is not None and current.shutdown_confirmed:
                guard.close()
                current.maintenance_lock = None

    app = FastAPI(title="Job Search Platform Application API", version="1.0.0",
                  servers=[{"url": "/api/v1"}], lifespan=lifespan)
    app.include_router(rest_router, prefix="/api/v1")
    app.include_router(sse_router, prefix="/api/v1")

    @app.middleware("http")
    async def no_store_api_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/v1/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ServiceError)
    async def service_error_handler(_request: Request, exc: ServiceError):
        return _http_error(exc)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError):
        correlation_id = uuid4()
        body: dict[str, Any] = {
            "code": "validation_error", "message_key": "errors.validation_error", "retryable": False,
            "correlation_id": str(correlation_id),
        }
        fields = _safe_field_names(exc)
        if fields:
            body["fields"] = fields
        return JSONResponse(body, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_request: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "method_not_allowed" if exc.status_code == 405 else "request_rejected"
        return JSONResponse({
            "code": code, "message_key": f"errors.{code}", "retryable": False,
            "correlation_id": str(uuid4()),
        }, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, _exc: Exception):
        return JSONResponse({
            "code": "internal_error", "message_key": "errors.internal_error", "retryable": False,
            "correlation_id": str(uuid4()),
        }, status_code=500)

    contract_schema_names = (
        "ApprovalDecision", "ApprovalRequest", "ApprovalView", "CVRevisionView", "CVUpdate", "CVView", "InlineJob",
        "DocumentRevisionView", "DocumentView", "ErrorView", "EvaluationResult", "FileView",
        "GrantIssueRequest", "GrantIssuedView", "GrantView", "JobCreate", "JobRevisionView",
        "MessageCreate", "OwnerBootstrapRequest", "OwnerBootstrapView", "PreferencesUpdate",
        "PreferencesView", "ProjectCreate", "ProjectUpdate", "ProjectView",
        "ProviderConnectionTestView", "ProviderSettingsUpdate", "ProviderSettingsView",
        "RevisionView", "RunEventData", "RunEventView", "RunRequest", "RunView",
        "SessionCreate", "SessionView", "SkillCoverage", "ToolConnectorSettingsView", "ToolConnectorUpdate",
        "ToolConnectorView", "ToolDescriptor", "ToolsView", "UploadRequest",
    )

    def openapi():
        if app.openapi_schema is not None:
            return app.openapi_schema
        from fastapi.openapi.utils import get_openapi
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes, servers=app.servers)
        schema["paths"] = {
            path.removeprefix("/api/v1"): operations
            for path, operations in schema["paths"].items()
        }
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        for name in contract_schema_names:
            model = getattr(contracts, name)
            if not isinstance(model, type) or not issubclass(model, BaseModel):
                continue
            model_schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
            components.update(model_schema.pop("$defs", {}))
            components[name] = model_schema
        for path, operations in schema["paths"].items():
            for operation in operations.values():
                if isinstance(operation, dict):
                    operation.get("responses", {}).pop("422", None)
        for upload_path, extra in (
            ("/projects/{project_id}/cv", {}),
            ("/projects/{project_id}/cvs", {"name": {"type": "string", "maxLength": 120}}),
            ("/projects/{project_id}/cvs/{cv_id}/revisions", {}),
        ):
            cv_upload = schema["paths"].get(upload_path, {}).get("post", {})
            if cv_upload:
                cv_upload["requestBody"] = {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object", "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}, **extra},
                    }}},
                }
        grant_routes = {
            "/projects/{project_id}/files/{file_id}/download": {"get"},
            "/projects/{project_id}/runs": {"get", "post"},
            "/projects/{project_id}/runs/{run_id}": {"get"},
            "/projects/{project_id}/runs/{run_id}/events": {"get"},
            "/projects/{project_id}/runs/{run_id}/cancel": {"post"},
        }
        for path, operations in schema["paths"].items():
            for method, operation in operations.items():
                if not isinstance(operation, dict):
                    continue
                if path == "/owner/bootstrap":
                    operation["security"] = []
                elif method in grant_routes.get(path, set()):
                    operation["security"] = [{"ownerSession": []}, {"projectGrant": []}]
                else:
                    operation["security"] = [{"ownerSession": []}]
        schema["security"] = [{"ownerSession": []}]
        schema["components"].setdefault("securitySchemes", {}).update({
            "ownerSession": {"type": "apiKey", "in": "cookie", "name": "jsp_owner_session"},
            "projectGrant": {"type": "http", "scheme": "bearer"},
        })
        for name in [key for key in components if key.startswith("Body_")]:
            components.pop(name)
        components.pop("HTTPValidationError", None)
        components.pop("ValidationError", None)
        app.openapi_schema = schema
        return schema

    app.openapi = openapi

    if frontend_dist is not None:
        dist = Path(frontend_dist).resolve()
        index = dist / "index.html"
        if not index.is_file():
            raise ValueError("frontend_dist_missing_index")
        app.mount("/assets", StaticFiles(directory=dist / "assets", check_dir=False), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def frontend(path: str):
            target = (dist / path).resolve()
            if target.is_relative_to(dist) and target.is_file():
                return FileResponse(target)
            return FileResponse(index)

    return app
