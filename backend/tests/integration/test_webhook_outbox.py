"""FR-P06 outbox: run events and digests enqueue in the same transaction. Synthetic data only."""
from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, session
from job_search_platform.db.models import A2APushConfig, Grant, Run, SavedSearch, WebhookDelivery, WebhookEndpoint
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.contracts import SavedSearchCreate
from job_search_platform.services.runs import append_event

NOW = datetime(2026, 10, 15, 1, 0, tzinfo=timezone.utc)


@pytest.fixture
def world(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        pid = project(db, owner=actor).id
        grant = Grant(project_id=pid, token_hash=hashlib.sha256(secrets.token_bytes(16)).digest(),
                      capabilities=["jobs:evaluate"], expires_at=NOW + timedelta(days=1))
        db.add(grant)
        db.flush()
        conversation = session(db, pid)
        cv, job = revisions(db, pid)
        run = Run(project_id=pid, actor_scope=f"grant:{grant.id}", idempotency_key="outbox", request_digest="0" * 64,
                  operation="evaluate_job", cv_revision_id=cv.id, job_revision_id=job.id,
                  provider_configuration_id=provider_config(db).id, input_snapshot={}, config_snapshot={},
                  output_language="en", status="queued", session_id=conversation.id)
        db.add(run)
        db.flush()
        db.add_all([
            WebhookEndpoint(project_id=pid, url="https://hooks.example.test/all", secret="s" * 43,
                            events=["run.completed", "run.failed", "digest.ready"]),
            WebhookEndpoint(project_id=pid, url="https://hooks.example.test/off", secret="s" * 43,
                            events=["run.completed"], enabled=False),
            A2APushConfig(project_id=pid, run_id=run.id, grant_id=grant.id, config_id="c1",
                          url="https://agent.example.test/push", token="t" * 20),
        ])
    return sessions, actor, pid, run.id, grant.id


def _deliveries(sessions):
    with sessions() as db:
        return db.scalars(select(WebhookDelivery).order_by(WebhookDelivery.created_at, WebhookDelivery.event_type)).all()


@pytest.mark.integration
def test_run_completed_enqueues_a2a_and_subscribed_webhook(world):
    sessions, _, pid, run_id, _ = world
    with sessions.begin() as db:
        run = db.get(Run, run_id)
        append_event(db, run, "run_completed", {"status": "completed"}, now=NOW)
    rows = _deliveries(sessions)
    a2a = [r for r in rows if r.push_config_id]
    hook = [r for r in rows if r.endpoint_id]
    assert len(a2a) == 1 and len(hook) == 1
    assert a2a[0].payload["statusUpdate"]["taskId"] == str(run_id)
    assert a2a[0].payload["statusUpdate"]["status"]["state"] == "TASK_STATE_COMPLETED"
    assert hook[0].event_type == "run.completed"
    assert hook[0].payload["id"] == str(hook[0].id) and hook[0].payload["data"]["run_id"] == str(run_id)
    assert set(hook[0].payload["data"]) == {"project_id", "run_id", "operation", "status", "job_revision_id"}


@pytest.mark.integration
def test_rolled_back_event_leaves_no_delivery(world):
    sessions, _, _, run_id, _ = world
    with pytest.raises(RuntimeError):
        with sessions.begin() as db:
            append_event(db, db.get(Run, run_id), "run_completed", {"status": "completed"}, now=NOW)
            raise RuntimeError("rollback")
    assert _deliveries(sessions) == []


@pytest.mark.integration
def test_progress_events_only_reach_a2a_when_state_changes(world):
    sessions, _, _, run_id, _ = world
    with sessions.begin() as db:
        run = db.get(Run, run_id)
        append_event(db, run, "run_progress", {"step": "x"}, now=NOW)
        append_event(db, run, "run_started", {"status": "running"}, now=NOW)
    rows = _deliveries(sessions)
    assert [(r.push_config_id is not None, r.payload.get("statusUpdate", {}).get("status", {}).get("state")) for r in rows] == [
        (True, "TASK_STATE_WORKING")]


@pytest.mark.integration
def test_revoked_grant_gets_no_a2a_delivery(world):
    sessions, _, _, run_id, grant_id = world
    with sessions.begin() as db:
        db.execute(update(Grant).where(Grant.id == grant_id).values(revoked_at=NOW - timedelta(minutes=1)))
        append_event(db, db.get(Run, run_id), "run_failed", {"status": "failed"}, now=NOW)
    rows = _deliveries(sessions)
    assert [r.event_type for r in rows] == ["run.failed"]


@pytest.mark.integration
def test_push_only_digest_runs_without_mailer(world):
    sessions, actor, pid, *_ = world
    items = [{"slug": "a", "title": "Synthetic job", "company": None, "cities": [], "age_days": 1, "stale": False,
              "source_url": "https://jobs.example.test/a"}]
    service = ss.SavedSearches(sessions, None, public_origin="http://127.0.0.1:8765",
                               search=lambda **kw: {"items": items, "total": 1, "limit": 20, "offset": 0})
    created = service.create(actor, pid, SavedSearchCreate(name="Push only", filters={"q": "x"}), now=NOW - timedelta(days=1))
    with sessions.begin() as db:
        db.execute(update(SavedSearch).where(SavedSearch.id == created.id).values(
            digest_enabled=False, push_enabled=True, next_run_at=NOW - timedelta(minutes=1)))
    assert asyncio.run(service.run_due(NOW)) == 1
    (row,) = [r for r in _deliveries(sessions) if r.event_type == "digest.ready"]
    assert row.payload["data"]["saved_search_id"] == str(created.id) and row.payload["data"]["items"][0]["slug"] == "a"
    with sessions() as db:
        assert db.get(SavedSearch, created.id).next_run_at == ss.next_slot(NOW, "daily")


@pytest.mark.integration
def test_digest_push_available(world):
    sessions, _, pid, *_ = world
    from job_search_platform.services import webhooks
    with sessions() as db:
        assert webhooks.digest_push_available(db, pid) is True
    with sessions.begin() as db:
        db.execute(update(WebhookEndpoint).where(WebhookEndpoint.project_id == pid).values(enabled=False))
    with sessions() as db:
        assert webhooks.digest_push_available(db, pid) is False
