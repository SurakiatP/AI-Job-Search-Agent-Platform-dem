from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session
from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import Grant, JobApplicationStatus, JobRevision, Run
from job_search_platform.main import create_app
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.runs import RunService

ORIGIN = "http://127.0.0.1:8765"


class _Files:
    async def reconcile_pending(self) -> None:
        return None


class _Lifecycle:
    async def start(self) -> None:
        return None

    async def close(self) -> None:
        return None


@pytest.fixture
def status_api(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    owner_sessions = OwnerSessions(
        sessions, allowed_origins={ORIGIN}, allowed_hosts={"127.0.0.1:8765"}
    )
    lifecycle = _Lifecycle()
    services = Services(
        sessions=sessions,
        owner_sessions=owner_sessions,
        files=_Files(),
        documents=object(),
        runs=RunService(sessions),
        grants=object(),
        settings=object(),
        approvals=object(),
        supervisor=lifecycle,
        runtime=lifecycle,
        queue=object(),
    )
    with TestClient(create_app(services), base_url=ORIGIN) as client:
        yield SimpleNamespace(client=client, sessions=sessions, services=services)


def _owner_csrf(context) -> str:
    nonce = asyncio.run(context.services.owner_sessions.create_launch_nonce(ORIGIN))
    response = context.client.post(
        "/api/v1/owner/bootstrap", json={"nonce": nonce.nonce}, headers={"Origin": ORIGIN}
    )
    assert response.status_code == 200
    return response.json()["csrf_token"]


def _write_headers(csrf: str) -> dict[str, str]:
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf}


@pytest.mark.integration
def test_owner_application_status_persists_per_job_revision_without_changing_run(status_api):
    with status_api.sessions.begin() as db:
        record = project(db)
        conversation = session(db, record.id)
        cv, job = revisions(db, record.id)
        provider_config(db, record.id)
        actor = owner(db)
        db.flush()
    run = asyncio.run(
        status_api.services.runs.submit(
            actor, record.id, run_request(conversation.id, job.id, cv_revision_id=cv.id)
        )
    )
    csrf = _owner_csrf(status_api)
    path = f"/api/v1/projects/{record.id}/jobs/{job.id}/application-status"

    initial = status_api.client.get(path)
    assert initial.status_code == 200
    assert initial.json() == {"job_revision_id": str(job.id), "application_status": "saved"}

    updated = status_api.client.patch(
        path, json={"application_status": "applied"}, headers=_write_headers(csrf)
    )
    assert updated.status_code == 200
    assert updated.json()["application_status"] == "applied"
    assert status_api.client.get(path).json()["application_status"] == "applied"
    listed = status_api.client.get(f"/api/v1/projects/{record.id}/jobs")
    assert listed.status_code == 200
    assert listed.json()[0]["application_status"] == "applied"

    reverted = status_api.client.patch(
        path, json={"application_status": "saved"}, headers=_write_headers(csrf)
    )
    assert reverted.status_code == 200
    assert status_api.client.get(path).json()["application_status"] == "saved"

    with status_api.sessions() as db:
        stored_job = db.get(JobRevision, job.id)
        stored_status = db.get(JobApplicationStatus, (record.id, job.id))
        stored_run = db.get(Run, run.id)
        assert (stored_job.title, stored_job.description) == (job.title, job.description)
        assert stored_status.status == "saved"
        assert stored_run.status == run.status == "queued"
        assert stored_run.job_revision_id == job.id


@pytest.mark.integration
def test_application_status_requires_owner_csrf_and_rejects_project_scoped_foreign_job(status_api):
    with status_api.sessions.begin() as db:
        first = project(db, "Synthetic first")
        second = project(db, "Synthetic second")
        _, foreign_job = revisions(db, second.id)
    csrf = _owner_csrf(status_api)
    foreign_path = f"/api/v1/projects/{first.id}/jobs/{foreign_job.id}/application-status"

    assert status_api.client.get(foreign_path).status_code == 404
    wrong_origin = status_api.client.patch(
        foreign_path,
        json={"application_status": "applied"},
        headers={"Origin": "https://untrusted.example", "X-CSRF-Token": csrf},
    )
    assert wrong_origin.status_code == 403
    missing_csrf = status_api.client.patch(
        foreign_path, json={"application_status": "applied"}, headers={"Origin": ORIGIN}
    )
    assert missing_csrf.status_code == 403
    assert status_api.client.patch(
        foreign_path, json={"application_status": "applied"}, headers=_write_headers(csrf)
    ).status_code == 404


@pytest.mark.integration
def test_external_grant_cannot_read_or_change_owner_application_status(status_api):
    with status_api.sessions.begin() as db:
        record = project(db)
        _, job = revisions(db, record.id)
        token = secrets.token_urlsafe(32)
        db.add(
            Grant(
                project_id=record.id,
                token_hash=hashlib.sha256(token.encode()).digest(),
                capabilities=["results:read", "jobs:evaluate"],
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
    path = f"/api/v1/projects/{record.id}/jobs/{job.id}/application-status"
    headers = {"Authorization": f"Bearer {token}"}
    assert status_api.client.get(path, headers=headers).status_code == 401
    assert status_api.client.patch(
        path, json={"application_status": "applied"}, headers=headers
    ).status_code in {401, 403}
