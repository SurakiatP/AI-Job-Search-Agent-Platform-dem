from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import pytest
from sqlalchemy import func, select
from starlette.requests import Request

from helpers import provider_config, revisions, session
from job_search_platform.db.models import Grant, Project, Run
from job_search_platform.services.runs import append_event
from job_search_platform.services.errors import ServiceError
from job_search_platform.api.sse import stream_run_events
from test_rest_api import _owner, _write_headers, api_context


def _create_run(context, *, grant_token: str | None = None, project_id: str | None = None) -> tuple[str, str, str, str]:
    client = context.client
    csrf = _owner(context)
    if project_id is None:
        project_response = client.post("/api/v1/projects", json={"name": "SSE project"}, headers=_write_headers(csrf))
        project_id = project_response.json()["id"]
    with context.sessions.begin() as db:
        project = db.get(Project, UUID(project_id))
        cv, job = revisions(db, project.id)
        session_row = session(db, project.id)
        provider_config(db, project.id)
    request = {
        "session_id": str(session_row.id), "operation": "evaluate_job",
        "cv_revision_id": str(cv.id), "job_revision_id": str(job.id),
        "output_language": "en", "idempotency_key": "sse-synthetic-run",
    }
    headers = _write_headers(csrf) if grant_token is None else {"Authorization": f"Bearer {grant_token}"}
    created = client.post(f"/api/v1/projects/{project_id}/runs", json=request, headers=headers)
    assert created.status_code == 202, created.text
    return project_id, created.json()["id"], csrf, str(session_row.id)


def _finish(context, run_id: str) -> None:
    with context.sessions.begin() as db:
        run = db.scalar(select(Run).where(Run.id == UUID(run_id)).with_for_update())
        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
        append_event(db, run, "run_completed", {"status": "completed"})


def _request() -> Request:
    return Request({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "GET", "scheme": "http", "path": "/api/v1/events",
        "raw_path": b"/api/v1/events", "query_string": b"",
        "headers": [(b"host", b"127.0.0.1:8765"), (b"origin", b"http://127.0.0.1:8765")],
        "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 8765),
    })


@pytest.mark.integration
def test_sse_reconnect_replays_strictly_after_persisted_sequence(api_context):
    client = api_context.client
    project_id, run_id, _csrf, _session_id = _create_run(api_context)
    _finish(api_context, run_id)

    first = client.get(f"/api/v1/projects/{project_id}/runs/{run_id}/events",
                       headers={"Last-Event-ID": "0"})
    assert first.status_code == 200
    assert "id: 1\n" in first.text and "id: 2\n" in first.text
    replay = client.get(f"/api/v1/projects/{project_id}/runs/{run_id}/events",
                        headers={"Last-Event-ID": "1"})
    assert replay.status_code == 200
    assert "id: 2\n" in replay.text and "id: 1\n" not in replay.text
    complete = client.get(f"/api/v1/projects/{project_id}/runs/{run_id}/events",
                          headers={"Last-Event-ID": "2"})
    assert complete.status_code == 200 and "id: " not in complete.text
    invalid = client.get(f"/api/v1/projects/{project_id}/runs/{run_id}/events",
                         headers={"Last-Event-ID": "-1"})
    assert invalid.status_code == 400


@pytest.mark.integration
def test_rest_submission_idempotency_header_bounds_and_foreign_ids(api_context):
    client = api_context.client
    project_id, run_id, csrf, _session_id = _create_run(api_context)
    with api_context.sessions() as db:
        row = db.get(Run, UUID(run_id))
        request = {
            "session_id": str(row.session_id), "operation": row.operation,
            "cv_revision_id": str(row.cv_revision_id), "job_revision_id": str(row.job_revision_id),
            "output_language": row.output_language, "idempotency_key": row.idempotency_key,
        }
    headers = {**_write_headers(csrf), "Idempotency-Key": request["idempotency_key"]}
    replay = client.post(f"/api/v1/projects/{project_id}/runs", json=request, headers=headers)
    assert replay.status_code == 202 and replay.json()["id"] == run_id
    invalid_header = "x" * 129
    invalid = client.post(f"/api/v1/projects/{project_id}/runs", json=request,
                          headers={**_write_headers(csrf), "Idempotency-Key": invalid_header})
    assert invalid.status_code == 422
    assert invalid_header not in invalid.text
    assert invalid.json().get("fields") == {"idempotency_key": "invalid"}
    conflict = client.post(f"/api/v1/projects/{project_id}/runs", json={**request, "idempotency_key": "other"},
                           headers=headers)
    assert conflict.status_code == 409

    foreign = client.post("/api/v1/projects", json={"name": "Foreign project"},
                          headers=_write_headers(csrf)).json()
    response = client.get(f"/api/v1/projects/{foreign['id']}/runs/{run_id}")
    assert response.status_code == 404
    foreign_events = client.get(f"/api/v1/projects/{foreign['id']}/runs/{run_id}/events")
    assert foreign_events.status_code == 404
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Run).where(Run.project_id == UUID(project_id))) == 1


@pytest.mark.integration
def test_grant_is_rechecked_during_live_stream_and_disconnect_does_not_cancel_run(api_context, monkeypatch):
    client = api_context.client
    csrf = _owner(api_context)
    project = client.post("/api/v1/projects", json={"name": "Grant stream"}, headers=_write_headers(csrf)).json()
    project_id = project["id"]
    issued = client.post(
        f"/api/v1/projects/{project_id}/grants",
        json={"capabilities": ["jobs:evaluate", "results:read"], "expires_at": "2099-01-01T00:00:00Z"},
        headers=_write_headers(csrf),
    )
    assert issued.status_code == 201
    token = issued.json()["token"]
    project_id, run_id, _csrf, _session_id = _create_run(api_context, grant_token=token, project_id=project_id)
    async def exercise_revocation():
        services = client.app.state.services
        actor = await services.grants.authenticate(token)
        response = await stream_run_events(UUID(project_id), UUID(run_id), actor, services, None)
        iterator = response.body_iterator
        first = await anext(iterator)
        assert b"id: 1" in first
        with api_context.sessions.begin() as db:
            grant_id = UUID(issued.json()["id"])
            row = db.scalar(select(Grant).where(Grant.id == grant_id).with_for_update())
            row.revoked_at = datetime.now(timezone.utc)
        with pytest.raises(ServiceError, match="unauthorized"):
            await anext(iterator)
        await iterator.aclose()
    from builtins import anext
    import asyncio
    asyncio.run(exercise_revocation())

    with api_context.sessions() as db:
        persisted = db.get(Run, UUID(run_id))
        assert persisted.status == "queued"


@pytest.mark.integration
def test_sse_heartbeat_rechecks_access_and_client_close_leaves_run_queued(api_context, monkeypatch):
    import job_search_platform.api.sse as sse
    import asyncio

    monkeypatch.setattr(sse, "POLL_SECONDS", 0.01)
    monkeypatch.setattr(sse, "HEARTBEAT_SECONDS", 0)
    client = api_context.client
    project_id, run_id, _csrf, _session_id = _create_run(api_context)
    async def exercise_heartbeat_and_disconnect():
        services = client.app.state.services
        cookie = client.cookies.get("jsp_owner_session")
        actor = await services.owner_sessions.authenticate(cookie, host="127.0.0.1:8765", origin="http://127.0.0.1:8765")
        response = await stream_run_events(UUID(project_id), UUID(run_id), actor, services, None)
        iterator = response.body_iterator
        first = await anext(iterator)
        assert b"id: 1" in first
        heartbeat = await anext(iterator)
        assert b": heartbeat" in heartbeat
        await iterator.aclose()
    from builtins import anext
    asyncio.run(exercise_heartbeat_and_disconnect())
    with api_context.sessions() as db:
        persisted = db.get(Run, UUID(run_id))
        assert persisted.status == "queued"
