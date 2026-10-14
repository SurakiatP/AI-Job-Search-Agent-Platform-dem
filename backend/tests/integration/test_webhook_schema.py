"""FR-P06 schema. Synthetic data only."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from helpers import owner, project, provider_config, revisions, session
from job_search_platform.db.models import A2APushConfig, Grant, Project, Run, WebhookDelivery, WebhookEndpoint


def _endpoint(db, pid):
    row = WebhookEndpoint(project_id=pid, url="https://hooks.example.test/a", events=["run.completed"], secret="s" * 43)
    db.add(row)
    db.flush()
    return row


def _run_and_grant(db, pid):
    grant = Grant(project_id=pid, token_hash=hashlib.sha256(secrets.token_bytes(16)).digest(),
                  capabilities=["jobs:evaluate"], expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db.add(grant)
    db.flush()
    conversation = session(db, pid)
    cv, job = revisions(db, pid)
    run = Run(project_id=pid, actor_scope=f"grant:{grant.id}", idempotency_key=secrets.token_hex(8),
              request_digest="0" * 64, operation="evaluate_job", cv_revision_id=cv.id, job_revision_id=job.id,
              provider_configuration_id=provider_config(db).id, input_snapshot={}, config_snapshot={},
              output_language="en", status="queued", session_id=conversation.id)
    db.add(run)
    db.flush()
    return run, grant


@pytest.mark.integration
def test_delivery_needs_exactly_one_target_and_status_is_checked(db_session):
    pid = project(db_session, owner=owner(db_session)).id
    endpoint = _endpoint(db_session, pid)
    run, grant = _run_and_grant(db_session, pid)
    config = A2APushConfig(project_id=pid, run_id=run.id, grant_id=grant.id, config_id="c1",
                           url="https://hooks.example.test/b", token="t" * 16)
    db_session.add(config)
    db_session.flush()
    for target in ({}, {"endpoint_id": endpoint.id, "push_config_id": config.id}):
        with pytest.raises(IntegrityError):
            with db_session.begin_nested():
                db_session.add(WebhookDelivery(project_id=pid, event_type="ping", payload={}, **target))
                db_session.flush()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(WebhookDelivery(project_id=pid, endpoint_id=endpoint.id, event_type="ping", payload={}, status="lost"))
            db_session.flush()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(A2APushConfig(project_id=pid, run_id=run.id, grant_id=grant.id, config_id="c1",
                                         url="https://hooks.example.test/c", token="t" * 16))
            db_session.flush()


@pytest.mark.integration
def test_project_deletion_cascades(db_session):
    pid = project(db_session, owner=owner(db_session)).id
    endpoint = _endpoint(db_session, pid)
    db_session.add(WebhookDelivery(project_id=pid, endpoint_id=endpoint.id, event_type="ping", payload={}))
    db_session.flush()
    db_session.execute(delete(Project).where(Project.id == pid))
    db_session.flush()
    assert db_session.scalar(select(WebhookEndpoint.id)) is None
    assert db_session.scalar(select(WebhookDelivery.id)) is None
