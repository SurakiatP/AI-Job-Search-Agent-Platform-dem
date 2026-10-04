from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import boto3
import pytest
import yaml
from botocore.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import CVRevision, Project
from job_search_platform.integrations.hermes_runtime import ParsedInput
from job_search_platform.integrations.object_store import S3ObjectStore
from job_search_platform.main import create_app
from job_search_platform.services.approvals import ApprovalService
from job_search_platform.services.documents import Artifacts, Documents
from job_search_platform.services.files import Files
from job_search_platform.services.grants import Grants
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.runs import RunService
from job_search_platform.services.settings import Settings
from job_search_platform.workers.queue import PostgresRunQueue


def _private_secret(name: str) -> str:
    directory = Path(os.environ.get(
        "CORE02_PRIVATE_DIR",
        Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003",
    ))
    path = directory / name
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise RuntimeError("private_test_infrastructure_unavailable")
    return path.read_text(encoding="utf-8").strip()


class _Parser:
    def __init__(self) -> None:
        self.projects: dict[object, SimpleNamespace] = {}

    async def parse_input(self, project_id, relative_path: str) -> ParsedInput:
        body = (self.projects[project_id].workspace / relative_path).read_bytes()
        return ParsedInput(body.decode("utf-8"), "text", hashlib.sha256(body).hexdigest())


class _Runtime(_Parser):
    async def close(self, _project_id=None) -> None:
        return None


class _Supervisor:
    async def start(self) -> None:
        return None

    async def close(self) -> None:
        return None


class _Secrets:
    def put(self, value: str) -> str:
        return "keychain:00000000-0000-4000-8000-000000000001"

    def get(self, _reference: str) -> str:
        return "synthetic-secret"

    def delete(self, _reference: str) -> None:
        return None


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    port = int(os.environ.get("CORE02_MINIO_PORT", "59000"))
    client = boto3.client(
        "s3", endpoint_url=f"http://127.0.0.1:{port}",
        aws_access_key_id=_private_secret("minio-access-key"),
        aws_secret_access_key=_private_secret("minio-secret-key"),
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    bucket = f"jsp-api-{secrets.token_hex(8)}"
    client.create_bucket(Bucket=bucket)
    store = S3ObjectStore(client, bucket)
    runtime = _Runtime()
    parser = _Parser()
    files = Files(sessions, store, parser)
    artifacts = Artifacts(sessions, store, lambda project_id, run_id: tmp_path / str(project_id) / str(run_id))
    secret_store = _Secrets()
    owner_sessions = OwnerSessions(sessions, allowed_origins={"http://127.0.0.1:8765"}, allowed_hosts={"127.0.0.1:8765"})
    services = Services(
        sessions=sessions,
        owner_sessions=owner_sessions,
        files=files,
        documents=Documents(sessions, store),
        runs=RunService(sessions),
        grants=Grants(sessions),
        settings=Settings(sessions, secret_store),
        approvals=ApprovalService(sessions),
        supervisor=_Supervisor(), runtime=runtime, queue=PostgresRunQueue(sessions),
        artifacts=artifacts, secret_store=secret_store,
    )
    app = create_app(services)
    with TestClient(app, base_url="http://127.0.0.1:8765") as http:
        try:
            yield SimpleNamespace(client=http, sessions=sessions, parser=parser, runtime=runtime,
                                 s3=client, bucket=bucket, tmp_path=tmp_path)
        finally:
            for item in client.list_objects_v2(Bucket=bucket).get("Contents", []):
                client.delete_object(Bucket=bucket, Key=item["Key"])
            client.delete_bucket(Bucket=bucket)


def _owner(context) -> str:
    launch = asyncio.run(context.client.app.state.services.owner_sessions.create_launch_nonce("http://127.0.0.1:8765"))
    response = context.client.post("/api/v1/owner/bootstrap", json={"nonce": launch.nonce},
                                   headers={"Origin": "http://127.0.0.1:8765"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    csrf = response.json()["csrf_token"]
    replay = context.client.post("/api/v1/owner/bootstrap", json={"nonce": launch.nonce},
                                 headers={"Origin": "http://127.0.0.1:8765"})
    assert replay.status_code == 401
    restored = context.client.post("/api/v1/owner/session", headers={"Origin": "http://127.0.0.1:8765"})
    assert restored.status_code == 200 and restored.json()["csrf_token"] == csrf
    return csrf


def _write_headers(csrf: str) -> dict[str, str]:
    return {"Origin": "http://127.0.0.1:8765", "X-CSRF-Token": csrf}


@pytest.mark.integration
def test_owner_bootstrap_csrf_crud_and_empty_project_delete_only(api_context):
    client = api_context.client
    csrf = _owner(api_context)

    missing_origin = client.post("/api/v1/projects", json={"name": "No origin"},
                                 headers={"X-CSRF-Token": csrf})
    assert missing_origin.status_code == 403
    missing_csrf = client.post("/api/v1/projects", json={"name": "No token"},
                               headers={"Origin": "http://127.0.0.1:8765"})
    assert missing_csrf.status_code == 403

    created = client.post("/api/v1/projects", json={"name": "Synthetic project"}, headers=_write_headers(csrf))
    assert created.status_code == 201
    project_id = created.json()["id"]
    assert client.get("/api/v1/projects").status_code == 200
    tools = client.get("/api/v1/tools")
    assert tools.status_code == 200 and len(tools.json()["tools"]) == 5
    assert client.patch(f"/api/v1/projects/{project_id}", json={"name": "Renamed"},
                        headers=_write_headers(csrf)).json()["name"] == "Renamed"
    pref = client.patch(f"/api/v1/projects/{project_id}/preferences",
                        json={"locale": "en", "output_language": "th"}, headers=_write_headers(csrf))
    assert pref.status_code == 200 and pref.json()["locale"] == "en"
    session = client.post(f"/api/v1/projects/{project_id}/sessions", json={"title": "First"},
                          headers=_write_headers(csrf))
    assert session.status_code == 201
    message = client.post(f"/api/v1/projects/{project_id}/sessions/{session.json()['id']}/messages",
                          json={"content": "Synthetic message"}, headers=_write_headers(csrf))
    assert message.status_code == 202 and message.json()["role"] == "user"
    job = client.post(f"/api/v1/projects/{project_id}/jobs",
                      json={"title": "Engineer", "company": "Example", "description": "Synthetic role"},
                      headers=_write_headers(csrf))
    assert job.status_code == 201 and job.json()["revision"] == 1
    deletion = client.delete(f"/api/v1/projects/{project_id}", headers=_write_headers(csrf))
    assert deletion.status_code == 409
    assert deletion.json()["code"] == "project_not_empty"


@pytest.mark.integration
def test_concurrent_job_revisions_are_serialized_by_project(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    project_id = client.post("/api/v1/projects", json={"name": "Concurrent jobs"},
                             headers=_write_headers(csrf)).json()["id"]
    def submit(index: int):
        return client.post(
            f"/api/v1/projects/{project_id}/jobs",
            json={"title": f"Engineer {index}", "company": "Example", "description": f"Role {index}"},
            headers=_write_headers(csrf),
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, (1, 2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert sorted(response.json()["revision"] for response in responses) == [1, 2]


@pytest.mark.integration
def test_upload_download_private_minio_and_grant_cannot_read_raw_cv(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    project = client.post("/api/v1/projects", json={"name": "File project"}, headers=_write_headers(csrf)).json()
    project_id = project["id"]
    workspace = api_context.tmp_path / "parse" / project_id
    (workspace / "inputs").mkdir(parents=True)
    api_context.parser.projects[UUID(project_id)] = SimpleNamespace(workspace=workspace)

    raw_cv = b"Synthetic CV body"
    upload = client.post(f"/api/v1/projects/{project_id}/cv", files={"file": ("cv.txt", raw_cv, "text/plain")},
                         headers=_write_headers(csrf))
    assert upload.status_code == 201, upload.text
    assert upload.json()["revision"] == 1
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(CVRevision).where(
            CVRevision.project_id == UUID(project_id)
        )) == 1
    cv_revisions = client.get(f"/api/v1/projects/{project_id}/cv")
    assert cv_revisions.status_code == 200
    assert len(cv_revisions.json()) == 1
    assert cv_revisions.json()[0]["original_filename"] == "cv.txt"
    file_id = api_context.sessions().scalar(select(CVRevision.file_id).where(CVRevision.project_id == UUID(project_id)))
    stored = api_context.s3.list_objects_v2(Bucket=api_context.bucket)
    assert stored["KeyCount"] == 1
    downloaded = client.get(f"/api/v1/projects/{project_id}/files/{file_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.content == raw_cv
    assert downloaded.headers["cache-control"] == "no-store"
    assert downloaded.headers["x-content-type-options"] == "nosniff"

    expires = "2099-01-01T00:00:00Z"
    grant = client.post(f"/api/v1/projects/{project_id}/grants",
                        json={"capabilities": ["results:read"], "expires_at": expires},
                        headers=_write_headers(csrf))
    assert grant.status_code == 201
    token = grant.json()["token"]
    client.cookies.clear()
    denied = client.get(f"/api/v1/projects/{project_id}/files/{file_id}/download",
                        headers={"Authorization": f"Bearer {token}"})
    assert denied.status_code == 403


@pytest.mark.integration
def test_validation_error_never_echoes_credentials_or_raw_input(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    sentinel = "synthetic-provider-secret-do-not-echo"
    response = client.post("/api/v1/projects", json={"name": "Valid", "credential": sentinel},
                           headers=_write_headers(csrf))
    assert response.status_code == 422
    body = response.text
    assert sentinel not in body
    assert "input" not in body and "ctx" not in body
    assert set(response.json()) <= {"code", "message_key", "retryable", "correlation_id", "fields"}
    assert response.json().get("fields", {}) == {"credential": "invalid"}


def test_runtime_openapi_matches_application_contract_paths_methods_and_schemas(api_context):
    contract = yaml.safe_load((Path(__file__).resolve().parents[3] / "docs" / "contracts" / "application-api.yaml").read_text())
    runtime = api_context.client.get("/openapi.json").json()
    contract_methods = {
        (path, method)
        for path, operations in contract["paths"].items()
        for method in operations
        if method in {"get", "post", "put", "patch", "delete"}
    }
    runtime_methods = {
        (path.removeprefix("/api/v1"), method)
        for path, operations in runtime["paths"].items()
        for method in operations
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert runtime_methods == contract_methods
    assert runtime["servers"] == [{"url": "/api/v1"}]
    assert set(runtime["components"]["schemas"]) == set(contract["components"]["schemas"])
    assert "text/event-stream" in runtime["paths"]["/projects/{project_id}/runs/{run_id}/events"]["get"]["responses"]["200"]["content"]

    def refs(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "$ref":
                    yield child
                else:
                    yield from refs(child)
        elif isinstance(value, list):
            for child in value:
                yield from refs(child)

    for ref in refs(runtime):
        assert ref.startswith("#/components/")
        node = runtime
        for part in ref[2:].split("/"):
            node = node[part.replace("~1", "/").replace("~0", "~")]
