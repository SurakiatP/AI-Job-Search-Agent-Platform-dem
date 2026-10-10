from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
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
from job_search_platform.db.models import (
    Approval, CVRevision, ConversationSession, Document, DocumentRevision, Grant, JobRevision, Message, Project, Run, RunArtifact, StoredFile,
)
from job_search_platform.integrations.hermes_runtime import ParsedInput
from job_search_platform.services.contracts import Actor
from job_search_platform.services.errors import ServiceError
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
from helpers import provider_config, revisions, primary_cv


ROOT_FOR_MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


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


def _legacy_session(context, project_id: str, title: str) -> str:
    """Unpaired sessions can no longer be created through the API; seed one as old data."""
    with context.sessions.begin() as db:
        row = ConversationSession(project_id=UUID(project_id), title=title)
        db.add(row)
        db.flush()
        return str(row.id)


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
    assert tools.status_code == 200 and len(tools.json()["tools"]) == 8
    assert client.patch(f"/api/v1/projects/{project_id}", json={"name": "Renamed"},
                        headers=_write_headers(csrf)).json()["name"] == "Renamed"
    pref = client.patch(f"/api/v1/projects/{project_id}/preferences",
                        json={"locale": "en", "output_language": "th"}, headers=_write_headers(csrf))
    assert pref.status_code == 200 and pref.json()["locale"] == "en"
    session_id = _legacy_session(api_context, project_id, "First")
    message = client.post(f"/api/v1/projects/{project_id}/sessions/{session_id}/messages",
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
def test_owner_renames_and_deletes_sessions_unless_runs_exist(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    project_id = client.post("/api/v1/projects", json={"name": "Sessions"}, headers=headers).json()["id"]
    base = f"/api/v1/projects/{project_id}/sessions"
    empty = _legacy_session(api_context, project_id, "Empty")
    busy = _legacy_session(api_context, project_id, "Busy")
    client.post(f"{base}/{empty}/messages", json={"content": "hello"}, headers=headers)

    renamed = client.patch(f"{base}/{empty}", json={"title": "  Renamed  "}, headers=headers)
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed" and renamed.json()["id"] == empty
    assert renamed.json()["cv_revision_id"] is None and renamed.json()["cv_outdated"] is False
    assert client.patch(f"{base}/{empty}", json={"title": "   "}, headers=headers).status_code == 422
    assert client.patch(f"{base}/{empty}", json={"title": ""}, headers=headers).status_code == 422
    assert client.patch(f"{base}/{empty}", json={"title": "x" * 201}, headers=headers).status_code == 422
    assert client.patch(f"{base}/{empty}", json={"title": "No csrf"},
                        headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403
    assert client.delete(f"{base}/{empty}", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.patch(f"{base}/{missing}", json={"title": "Nope"}, headers=headers).status_code == 404
    assert client.delete(f"{base}/{missing}", headers=headers).status_code == 404

    with api_context.sessions.begin() as db:
        cv, job = revisions(db, UUID(project_id))
        provider = provider_config(db, UUID(project_id))
        db.add(Run(project_id=UUID(project_id), actor_scope="owner", idempotency_key="session-run",
                   request_digest="a" * 64, session_id=UUID(busy), operation="evaluate_job",
                   cv_revision_id=cv.id, job_revision_id=job.id, provider_configuration_id=provider.id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="completed"))
    hidden = client.delete(f"{base}/{busy}", headers=headers)
    assert hidden.status_code == 200 and hidden.json() == {"mode": "hidden"}

    deleted = client.delete(f"{base}/{empty}", headers=headers)
    assert deleted.status_code == 200 and deleted.json() == {"mode": "deleted"}
    assert client.get(base).json() == []
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Message)
                         .where(Message.session_id == UUID(empty))) == 0


@pytest.mark.integration
def test_owner_lists_approvals_for_project_without_approvals(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    project_id = client.post("/api/v1/projects", json={"name": "Approvals"}, headers=_write_headers(csrf)).json()["id"]
    response = client.get(f"/api/v1/projects/{project_id}/approvals")
    assert response.status_code == 200 and response.json() == []


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


def _removal_project(api_context, csrf: str):
    """Project with a session, current CV and provider so owner runs can be admitted."""
    client = api_context.client
    pid = client.post("/api/v1/projects", json={"name": "Removal"}, headers=_write_headers(csrf)).json()["id"]
    sid = _legacy_session(api_context, pid, "S")
    with api_context.sessions.begin() as db:
        db.add(CVRevision(project_id=UUID(pid), cv_id=primary_cv(db, UUID(pid)).id, revision=1))
        provider_config(db, UUID(pid))
    return pid, sid


def _new_job(client, csrf, pid, title):
    created = client.post(f"/api/v1/projects/{pid}/jobs", json={"title": title, "description": "Synthetic role"},
                          headers=_write_headers(csrf))
    assert created.status_code == 201
    return created.json()["id"]


def _submit(client, csrf, pid, sid, job_id, key):
    return client.post(f"/api/v1/projects/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": sid, "operation": "evaluate_job", "job_revision_id": job_id,
        "output_language": "en", "idempotency_key": key})


@pytest.mark.integration
def test_owner_removes_job_softly_hides_it_and_blocks_new_runs_but_old_runs_stay(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    keep, gone = _new_job(client, csrf, pid, "Keep"), _new_job(client, csrf, pid, "Gone")
    first = _submit(client, csrf, pid, sid, gone, "before-removal")
    assert first.status_code == 202 and first.json()["job_removed"] is False
    other_run = _submit(client, csrf, pid, sid, keep, "other-job")
    assert other_run.status_code == 202
    status_url = f"/api/v1/projects/{pid}/jobs/{gone}/application-status"
    assert client.get(status_url).status_code == 200

    url = f"/api/v1/projects/{pid}/jobs/{gone}"
    assert client.delete(url, headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403  # no CSRF
    assert len(client.get(f"/api/v1/projects/{pid}/jobs").json()) == 2
    removed = client.delete(url, headers=headers)
    assert removed.status_code == 204 and removed.content == b""
    assert client.delete(url, headers=headers).status_code == 204  # idempotent
    assert [job["id"] for job in client.get(f"/api/v1/projects/{pid}/jobs").json()] == [keep]
    assert client.get(status_url).status_code == 404
    assert client.patch(status_url, json={"application_status": "applied"}, headers=headers).status_code == 404
    with api_context.sessions() as db:
        row = db.get(JobRevision, UUID(gone))
        assert row is not None and row.removed_at is not None and row.title == "Gone"

    blocked = _submit(client, csrf, pid, sid, gone, "after-removal")
    assert blocked.status_code == 409 and blocked.json()["code"] == "job_removed"
    replay = _submit(client, csrf, pid, sid, gone, "before-removal")  # idempotent replay still resolves
    assert replay.status_code == 202 and replay.json()["id"] == first.json()["id"]
    old = client.get(f"/api/v1/projects/{pid}/runs/{first.json()['id']}")
    assert old.status_code == 200 and old.json()["job_removed"] is True
    assert client.get(f"/api/v1/projects/{pid}/runs/{other_run.json()['id']}").json()["job_removed"] is False
    assert len(client.get(f"/api/v1/projects/{pid}/runs").json()) == 2

    missing = "00000000-0000-4000-8000-000000000000"
    assert client.delete(f"/api/v1/projects/{pid}/jobs/{missing}", headers=headers).status_code == 404
    other_pid, _ = _removal_project(api_context, csrf)
    assert client.delete(f"/api/v1/projects/{other_pid}/jobs/{keep}", headers=headers).status_code == 404

    token = client.post(f"/api/v1/projects/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read", "jobs:evaluate"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    client.cookies.clear()
    denied = client.delete(f"/api/v1/projects/{pid}/jobs/{keep}", headers={"Authorization": f"Bearer {token}"})
    assert denied.status_code in (401, 403)
    csrf = _owner(api_context)
    assert [job["id"] for job in client.get(f"/api/v1/projects/{pid}/jobs").json()] == [keep]


def _seed_document(api_context, pid: str, name: str = "letter.pdf", *, run_id=None):
    """Published document with one revision, file row and private object; optionally linked to a run."""
    body = f"%PDF synthetic {name}".encode()
    key = f"objects/{secrets.token_hex(16)}"
    api_context.s3.put_object(Bucket=api_context.bucket, Key=key, Body=body)
    project_id = UUID(pid)
    with api_context.sessions.begin() as db:
        file = StoredFile(project_id=project_id, kind="generated_document", publication_state="published",
                          storage_key=key, checksum_sha256=hashlib.sha256(body).hexdigest(),
                          size_bytes=len(body), mime_type="application/pdf", display_name=name)
        document = Document(project_id=project_id, document_type="cover_letter", title=name)
        db.add_all([file, document])
        db.flush()
        revision = DocumentRevision(project_id=project_id, document_id=document.id, revision=1,
                                    file_id=file.id, content_markdown="Synthetic body")
        db.add(revision)
        db.flush()
        if run_id is not None:
            db.add(RunArtifact(project_id=project_id, run_id=run_id, file_id=file.id, document_revision_id=revision.id))
        return SimpleNamespace(document=document.id, revision=revision.id, file=file.id, key=key)


def _object_exists(api_context, key: str) -> bool:
    return any(item["Key"] == key for item in api_context.s3.list_objects_v2(Bucket=api_context.bucket).get("Contents", []))


def _seed_completed_run(api_context, pid: str, sid: str, *, status="completed", key="doc-run"):
    with api_context.sessions.begin() as db:
        cv_id = db.scalar(select(CVRevision.id).where(CVRevision.project_id == UUID(pid)))
        provider_id = provider_config_id(db, UUID(pid))
        job = JobRevision(project_id=UUID(pid), revision=99, title="Doc job", description="Synthetic")
        db.add(job)
        db.flush()
        run = Run(project_id=UUID(pid), actor_scope="owner", idempotency_key=key, request_digest="b" * 64,
                  session_id=UUID(sid), operation="draft_documents", cv_revision_id=cv_id, job_revision_id=job.id,
                  provider_configuration_id=provider_id, input_snapshot={}, config_snapshot={},
                  output_language="en", status=status)
        db.add(run)
        db.flush()
        return run.id


def provider_config_id(db, project_id):
    return provider_config(db, project_id).id


@pytest.mark.integration
def test_owner_permanently_deletes_trashed_document_rows_files_and_objects_while_run_stays_readable(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    run_id = _seed_completed_run(api_context, pid, sid)
    doomed = _seed_document(api_context, pid, "doomed.pdf", run_id=run_id)
    survivor = _seed_document(api_context, pid, "survivor.pdf")
    trash_url = f"/api/v1/projects/{pid}/documents/{doomed.document}"
    url = f"{trash_url}/permanent"
    assert client.get(f"/api/v1/projects/{pid}/runs/{run_id}").json()["result_file_ids"] == [str(doomed.file)]
    assert client.get(f"/api/v1/projects/{pid}/files/{doomed.file}/download").status_code == 200

    assert client.delete(url, headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403  # no CSRF
    not_trashed = client.delete(url, headers=headers)  # permanent delete requires the trash first
    assert not_trashed.status_code == 409 and not_trashed.json()["code"] == "document_not_trashed"
    assert _object_exists(api_context, doomed.key)
    with api_context.sessions() as db:
        assert db.get(Document, doomed.document) is not None
    assert client.delete(trash_url, headers=headers).status_code == 204
    assert _object_exists(api_context, doomed.key)
    deleted = client.delete(url, headers=headers)
    assert deleted.status_code == 204 and deleted.content == b""
    with api_context.sessions() as db:
        assert db.get(Document, doomed.document) is None
        assert db.get(DocumentRevision, doomed.revision) is None
        assert db.get(StoredFile, doomed.file) is None
        assert db.scalar(select(func.count()).select_from(RunArtifact)) == 0
        assert db.get(Document, survivor.document) is not None and db.get(StoredFile, survivor.file) is not None
    assert not _object_exists(api_context, doomed.key) and _object_exists(api_context, survivor.key)
    assert [doc["id"] for doc in client.get(f"/api/v1/projects/{pid}/documents").json()] == [str(survivor.document)]
    assert client.get(f"/api/v1/projects/{pid}/files/{doomed.file}/download").status_code == 404
    run = client.get(f"/api/v1/projects/{pid}/runs/{run_id}")
    assert run.status_code == 200 and run.json()["result_file_ids"] == []
    assert client.get(f"/api/v1/projects/{pid}/runs").status_code == 200

    assert client.delete(url, headers=headers).status_code == 404  # already gone
    assert client.delete(trash_url, headers=headers).status_code == 404
    assert client.get(f"/api/v1/projects/{pid}/documents/trash").json() == []
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.delete(f"/api/v1/projects/{pid}/documents/{missing}", headers=headers).status_code == 404
    assert client.delete(f"/api/v1/projects/{pid}/documents/{missing}/permanent", headers=headers).status_code == 404
    other_pid, _ = _removal_project(api_context, csrf)
    assert client.delete(f"/api/v1/projects/{other_pid}/documents/{survivor.document}", headers=headers).status_code == 404
    assert client.delete(f"/api/v1/projects/{other_pid}/documents/{survivor.document}/permanent", headers=headers).status_code == 404
    assert _object_exists(api_context, survivor.key)

    token = client.post(f"/api/v1/projects/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read", "documents:draft"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    client.cookies.clear()
    for suffix in ("", "/permanent"):
        denied = client.delete(f"/api/v1/projects/{pid}/documents/{survivor.document}{suffix}",
                               headers={"Authorization": f"Bearer {token}"})
        assert denied.status_code in (401, 403)
    denied = client.post(f"/api/v1/projects/{pid}/documents/{survivor.document}/restore",
                         headers={"Authorization": f"Bearer {token}"})
    assert denied.status_code in (401, 403)
    assert _object_exists(api_context, survivor.key)


@pytest.mark.integration
def test_document_delete_refused_while_approval_pending_then_allowed_once_settled(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    run_id = _seed_completed_run(api_context, pid, sid, status="waiting_approval", key="approval-run")
    seeded = _seed_document(api_context, pid, "approval.pdf", run_id=run_id)
    with api_context.sessions.begin() as db:
        approval = Approval(project_id=UUID(pid), run_id=run_id, action="delete_document_revision",
                            revision_id=seeded.revision, change_digest="c" * 64,
                            token_hash=hashlib.sha256(b"synthetic").digest(),
                            expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        db.add(approval)
        db.flush()
        approval_id = approval.id
    url = f"/api/v1/projects/{pid}/documents/{seeded.document}/permanent"
    assert client.delete(f"/api/v1/projects/{pid}/documents/{seeded.document}", headers=headers).status_code == 204
    blocked = client.delete(url, headers=headers)
    assert blocked.status_code == 409 and blocked.json()["code"] == "document_in_use"
    assert _object_exists(api_context, seeded.key)
    with api_context.sessions() as db:
        assert db.get(Document, seeded.document) is not None and db.get(Approval, approval_id) is not None

    with api_context.sessions.begin() as db:  # approved deletion not yet applied still blocks
        row = db.get(Approval, approval_id)
        row.consumed_at, row.decision = datetime.now(timezone.utc), "approve"
    assert client.delete(url, headers=headers).status_code == 409

    with api_context.sessions.begin() as db:  # rejected = settled history
        row = db.get(Approval, approval_id)
        row.decision, row.applied_at = "reject", datetime.now(timezone.utc)
    assert client.delete(url, headers=headers).status_code == 204
    with api_context.sessions() as db:
        assert db.get(Approval, approval_id) is None and db.get(Run, run_id) is not None
    assert not _object_exists(api_context, seeded.key)


@pytest.mark.integration
def test_document_delete_keeps_file_still_referenced_and_survives_object_store_failure(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    promoted = _seed_document(api_context, pid, "promoted.pdf")
    with api_context.sessions.begin() as db:  # a CV promoted from this draft keeps pointing at its file
        db.add(CVRevision(project_id=UUID(pid), cv_id=primary_cv(db, UUID(pid)).id, revision=2, file_id=promoted.file))
    base = f"/api/v1/projects/{pid}/documents"
    assert client.delete(f"{base}/{promoted.document}", headers=headers).status_code == 204
    assert client.delete(f"{base}/{promoted.document}/permanent", headers=headers).status_code == 204
    with api_context.sessions() as db:
        assert db.get(Document, promoted.document) is None
        assert db.get(StoredFile, promoted.file) is not None
    assert _object_exists(api_context, promoted.key)

    flaky = _seed_document(api_context, pid, "flaky.pdf")
    store = client.app.state.services.documents.object_store
    original = store.delete

    async def failing(_key):
        raise RuntimeError("synthetic-object-store-outage")

    store.delete = failing
    try:
        assert client.delete(f"{base}/{flaky.document}", headers=headers).status_code == 204
        response = client.delete(f"{base}/{flaky.document}/permanent", headers=headers)
    finally:
        store.delete = original
    assert response.status_code == 204
    with api_context.sessions() as db:
        assert db.get(Document, flaky.document) is None and db.get(StoredFile, flaky.file) is None
    assert _object_exists(api_context, flaky.key)  # orphan object left for later cleanup


@pytest.mark.integration
def test_trash_soft_deletes_lists_restores_and_is_idempotent(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    run_id = _seed_completed_run(api_context, pid, sid, key="trash-run")
    first = _seed_document(api_context, pid, "first.pdf", run_id=run_id)
    second = _seed_document(api_context, pid, "second.pdf")
    base = f"/api/v1/projects/{pid}/documents"
    assert client.get(f"{base}/trash").json() == []
    assert client.delete(f"{base}/{first.document}", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403
    assert client.post(f"{base}/{first.document}/restore", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403

    assert client.delete(f"{base}/{first.document}", headers=headers).status_code == 204
    with api_context.sessions() as db:
        stamp = db.get(Document, first.document).trashed_at
        assert stamp is not None and db.get(StoredFile, first.file) is not None
    assert client.delete(f"{base}/{first.document}", headers=headers).status_code == 204  # idempotent
    with api_context.sessions() as db:
        assert db.get(Document, first.document).trashed_at == stamp
    assert client.delete(f"{base}/{second.document}", headers=headers).status_code == 204
    assert client.get(base).json() == []
    trash = client.get(f"{base}/trash").json()
    assert [doc["id"] for doc in trash] == [str(second.document), str(first.document)]  # newest first
    assert all(doc["trashed_at"] for doc in trash)
    # Owner can still preview a trashed draft (file download, revisions) though run results drop it.
    assert client.get(f"/api/v1/projects/{pid}/files/{first.file}/download").status_code == 200
    assert client.get(f"{base}/{first.document}/revisions").status_code == 200
    assert client.get(f"/api/v1/projects/{pid}/runs/{run_id}").json()["result_file_ids"] == []

    restored = client.post(f"{base}/{first.document}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["id"] == str(first.document)
    assert restored.json()["trashed_at"] is None
    again = client.post(f"{base}/{first.document}/restore", headers=headers)  # idempotent
    assert again.status_code == 200 and again.json()["trashed_at"] is None
    assert client.get(f"/api/v1/projects/{pid}/runs/{run_id}").json()["result_file_ids"] == [str(first.file)]
    listed = client.get(base).json()
    assert [doc["id"] for doc in listed] == [str(first.document)] and listed[0]["trashed_at"] is None
    assert [doc["id"] for doc in client.get(f"{base}/trash").json()] == [str(second.document)]
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.post(f"{base}/{missing}/restore", headers=headers).status_code == 404
    assert client.delete(f"{base}/{missing}", headers=headers).status_code == 404


@pytest.mark.integration
def test_trashed_document_is_hidden_from_grants_but_not_the_owner(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    pid, sid = _removal_project(api_context, csrf)
    run_id = _seed_completed_run(api_context, pid, sid, key="grant-run")
    seeded = _seed_document(api_context, pid, "grant.pdf", run_id=run_id)
    token = client.post(f"/api/v1/projects/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    base = f"/api/v1/projects/{pid}"
    bearer = {"Authorization": f"Bearer {token}"}
    services = client.app.state.services

    def as_grant(path):
        saved = dict(client.cookies)
        client.cookies.clear()
        try:
            return client.get(f"{base}{path}", headers=bearer)
        finally:
            client.cookies.update(saved)

    assert as_grant(f"/files/{seeded.file}/download").status_code == 200
    assert as_grant(f"/runs/{run_id}").json()["result_file_ids"] == [str(seeded.file)]

    assert client.delete(f"{base}/documents/{seeded.document}", headers=headers).status_code == 204
    assert as_grant(f"/files/{seeded.file}/download").status_code == 404
    assert as_grant(f"/runs/{run_id}").json()["result_file_ids"] == []
    # Grant-facing service calls (MCP / A2A use these) no longer see the document.
    with api_context.sessions() as db:
        grant_id = db.scalar(select(Grant.id).where(Grant.project_id == UUID(pid)))
    grant_actor = Actor("grant", None, grant_id, UUID(pid), frozenset({"results:read"}))
    assert asyncio.run(services.documents.list_ready(grant_actor, UUID(pid))) == []
    assert asyncio.run(services.files.list_ready(grant_actor, UUID(pid))) == []
    with pytest.raises(ServiceError) as raised:
        asyncio.run(services.documents.get(grant_actor, UUID(pid), seeded.document))
    assert raised.value.code == "not_found"
    with pytest.raises(ServiceError) as raised:
        asyncio.run(services.documents.revisions(grant_actor, UUID(pid), seeded.document))
    assert raised.value.code == "not_found"

    assert client.post(f"{base}/documents/{seeded.document}/restore", headers=headers).status_code == 200
    assert as_grant(f"/files/{seeded.file}/download").status_code == 200
    assert as_grant(f"/runs/{run_id}").json()["result_file_ids"] == [str(seeded.file)]
    assert [d.id for d in asyncio.run(services.documents.list_ready(grant_actor, UUID(pid)))] == [seeded.document]


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


def _provider_project(api_context):
    csrf = _owner(api_context)
    return csrf, "/api/v1/settings/provider"


def test_provider_catalog_and_custom_base_url_validation(api_context):
    client = api_context.client
    assert client.get("/api/v1/providers").status_code == 401
    csrf, url = _provider_project(api_context)
    catalog = {p["id"]: p for p in client.get("/api/v1/providers").json()["providers"]}
    assert {"openai", "anthropic", "openrouter", "gemini", "deepseek", "xai", "zai", "kimi-coding", "alibaba",
            "minimax", "nvidia", "huggingface", "ai-gateway", "lmstudio", "custom"} == set(catalog)
    assert catalog["custom"]["requires_base_url"] and catalog["lmstudio"]["key_optional"] and catalog["lmstudio"]["local"]
    assert catalog["openai"]["default_base_url"] == "https://api.openai.com/v1"
    headers = _write_headers(csrf)

    def put(**body):
        return client.put(url, json={"model": "m", **body}, headers=headers)

    for bad in ("http://example.com/v1", "https://user:pw@example.com/v1", "https://example.com/v1?x=1",
                "https://example.com/v1#frag", "ftp://example.com", "https://example.com/" + "a" * 520):
        response = put(provider="custom", credential="k", base_url=bad)
        assert response.status_code == 422, bad
        assert "pw@" not in response.text
    assert put(provider="custom", credential="k").status_code == 422  # base URL required
    assert put(provider="openai").status_code == 409  # credential required
    assert put(provider="nope", credential="k").status_code == 400

    saved = put(provider="custom", credential="k", base_url=" https://llm.example.com/v1/chat/completions/ ")
    assert saved.status_code == 200
    assert saved.json()["base_url"] == "https://llm.example.com/v1" and saved.json()["provider_label"].startswith("Custom")
    assert client.get(url).json()["base_url"] == "https://llm.example.com/v1"
    assert put(provider="custom", credential="k", base_url="http://localhost:8080/v1").status_code == 200

    lm = put(provider="lmstudio")
    assert lm.status_code == 200 and lm.json()["base_url"] == "http://127.0.0.1:1234/v1"
    openai = put(provider="openai", credential="k")
    assert openai.json()["base_url"] == "https://api.openai.com/v1"


def test_trusted_provider_maps_hermes_id_and_base_url(api_context):
    csrf, url = _provider_project(api_context)
    api_context.client.put(url, json={"provider": "openai", "model": "m", "credential": "k"}, headers=_write_headers(csrf))
    settings = api_context.client.app.state.services.settings
    config = asyncio.run(settings.trusted_provider())
    assert (config.provider, config.base_url) == ("openai-api", "https://api.openai.com/v1")
    api_context.client.put(url, json={"provider": "custom", "model": "m", "credential": "k",
                                      "base_url": "https://llm.example.com/v1"}, headers=_write_headers(csrf))
    config = asyncio.run(settings.trusted_provider())
    assert (config.provider, config.base_url) == ("custom", "https://llm.example.com/v1")


def test_provider_models_listing(api_context, monkeypatch):
    from job_search_platform.services import settings as settings_module
    client = api_context.client
    csrf, url = _provider_project(api_context)
    headers = _write_headers(csrf)
    calls = []
    payload = {"data": []}

    def fake_get(target, request_headers, max_bytes):
        calls.append((target, request_headers))
        if isinstance(payload, Exception):
            raise payload
        return 200, json.dumps(payload).encode()

    monkeypatch.setattr(settings_module, "_get", fake_get)
    body = {"provider": "openai", "credential": "typed-key"}

    payload = {"data": [{"id": "b-model"}, {"id": "a-model"}, {"id": "a-model"}, {"nope": 1}]}
    response = client.post(url + "/models", json=body, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"models": [{"id": "a-model", "name": None}, {"id": "b-model", "name": None}]}
    assert calls[-1] == ("https://api.openai.com/v1/models", {"Authorization": "Bearer typed-key"})
    assert client.post(url + "/models", json=body).status_code == 403  # CSRF required

    payload = {"data": [{"id": "claude-x", "display_name": "Claude X"}]}
    response = client.post(url + "/models", json={"provider": "anthropic", "credential": "ak"}, headers=headers)
    assert response.json() == {"models": [{"id": "claude-x", "name": "Claude X"}]}
    assert calls[-1][0] == "https://api.anthropic.com/v1/models?limit=1000"
    assert calls[-1][1]["x-api-key"] == "ak" and "anthropic-version" in calls[-1][1]

    payload = {"models": [{"name": "models/gemini-2", "displayName": "Gemini 2"}]}
    response = client.post(url + "/models", json={"provider": "gemini", "credential": "gk"}, headers=headers)
    assert response.json() == {"models": [{"id": "gemini-2", "name": "Gemini 2"}]}

    payload = {"data": [{"id": f"m{i:04d}"} for i in range(600)]}
    models = client.post(url + "/models", json=body, headers=headers).json()["models"]
    assert len(models) == 500 and models[0]["id"] == "m0000"

    # No typed key: stored key only for a matching provider and base URL.
    payload = {"data": [{"id": "x"}]}
    assert client.post(url + "/models", json={"provider": "openai"}, headers=headers).status_code == 409
    client.put(url, json={"provider": "openai", "model": "m", "credential": "k"}, headers=headers)
    assert client.post(url + "/models", json={"provider": "openai"}, headers=headers).status_code == 200
    assert calls[-1][1] == {"Authorization": "Bearer synthetic-secret"}
    assert client.post(url + "/models", json={"provider": "openai", "base_url": "https://other.example.com/v1"},
                       headers=headers).status_code == 409
    assert client.post(url + "/models", json={"provider": "deepseek"}, headers=headers).status_code == 409
    keyless = client.post(url + "/models", json={"provider": "lmstudio"}, headers=headers)
    assert keyless.status_code == 200 and calls[-1][0] == "http://127.0.0.1:1234/v1/models"
    bad = client.post(url + "/models", json={"provider": "custom", "base_url": "http://example.com", "credential": "k"},
                      headers=headers)
    assert bad.status_code == 422

    sentinel = "typed-key-do-not-echo"
    payload = RuntimeError(sentinel)
    failed = client.post(url + "/models", json={"provider": "openai", "credential": sentinel}, headers=headers)
    assert failed.status_code == 502 and failed.json()["retryable"] is True
    assert failed.json()["code"] == "provider_models_unavailable" and sentinel not in failed.text


@pytest.mark.integration
def test_global_provider_settings_are_owner_only(api_context):
    client = api_context.client
    csrf = _owner(api_context)
    headers = _write_headers(csrf)
    url = "/api/v1/settings/provider"
    assert client.get(url).json()["configured"] is False
    assert client.put(url, json={"provider": "openai", "model": "m", "credential": "k"}, headers=headers).status_code == 200
    assert client.get(url).json()["revision"] == 1
    assert client.put(url, json={"provider": "openai", "model": "m2", "credential": "k"}, headers=headers).json()["revision"] == 2
    assert client.get("/api/v1/projects/00000000-0000-4000-8000-000000000000/settings/provider").status_code in (404, 405)
    pid, _ = _removal_project(api_context, csrf)
    token = client.post(f"/api/v1/projects/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read", "jobs:evaluate"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    client.cookies.clear()
    bearer = {"Authorization": f"Bearer {token}"}
    for call in (lambda: client.get(url, headers=bearer),
                 lambda: client.put(url, json={"provider": "openai", "model": "x", "credential": "k"}, headers=bearer),
                 lambda: client.post(url + "/models", json={"provider": "openai"}, headers=bearer),
                 lambda: client.post(url + "/test", headers=bearer)):
        assert call().status_code in (401, 403)
