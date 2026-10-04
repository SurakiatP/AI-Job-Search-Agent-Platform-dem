"""Live PostgreSQL execution gates, independent of transport and native tools."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, run_request, session
from job_search_platform.db.models import Run
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue


def _ready(db):
    actor = owner(db)
    p = project(db)
    creator, token = grant(db, p.id, capabilities=("jobs:evaluate", "results:read"))
    chat = session(db, p.id)
    _, job = revisions(db, p.id)
    provider_config(db, p.id)
    db.commit()
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    service = RunService(factory)
    run = asyncio.run(service.submit(creator, p.id, run_request(chat.id, job.id)))
    return factory, service, PostgresRunQueue(factory), actor, creator, token, run


def test_queued_grant_run_is_not_dispatched_after_operation_permission_removed(db_session):
    factory, _, queue, _, _, token, run = _ready(db_session)
    with factory.begin() as db:
        db.get(type(token), token.id).capabilities = ["results:read"]
    assert queue.claim_next("worker") is None
    with factory() as db:
        assert db.get(Run, run.id).status == "failed"


@pytest.mark.parametrize("change", ["revoke", "remove_capability"])
def test_native_tool_reservation_denies_changed_creator_before_side_effect(db_session, change):
    factory, _, queue, _, _, token, run = _ready(db_session)
    assert queue.claim_next("worker").id == run.id
    with factory.begin() as db:
        row = db.get(type(token), token.id)
        if change == "revoke":
            row.revoked_at = datetime.now(timezone.utc)
        else:
            row.capabilities = ["results:read"]
    with pytest.raises(ServiceError) as error:
        queue.reserve_tool_call(run.id, "worker")
    assert error.value.code == "creator_unavailable"
    with factory() as db:
        row = db.get(Run, run.id)
        assert row.tool_calls == 0
        assert row.status == "failed"


def test_cancellation_denies_next_tool_without_claiming_execution_stopped(db_session):
    factory, service, queue, _, creator, _, run = _ready(db_session)
    assert queue.claim_next("worker").id == run.id
    asyncio.run(service.cancel(creator, run.project_id, run.id))
    with pytest.raises(ServiceError) as error:
        queue.reserve_tool_call(run.id, "worker")
    assert error.value.code == "cancellation_requested"
    with factory() as db:
        row = db.get(Run, run.id)
        assert row.tool_calls == 0
        assert row.status == "running"
    assert queue.finish(run.id, "worker", "cancelled").status == "cancelled"


def test_evaluation_report_and_completion_are_persisted_under_same_live_claim(db_session):
    factory, _, queue, _, _, _, run = _ready(db_session)
    assert queue.claim_next("worker").id == run.id
    queue.finish(run.id, "worker", "completed", evaluation_result={
        "report_markdown": "Synthetic evaluation: transferable analysis skills.",
        "score": 3.5,
    })
    with factory() as db:
        row = db.get(Run, run.id)
        assert row.status == "completed"
        assert row.evaluation_result["score"] == 3.5
        assert row.lease_owner is None


def test_invalid_evaluation_never_completes_or_persists_private_native_payload(db_session):
    factory, _, queue, _, _, _, run = _ready(db_session)
    queue.claim_next("worker")
    with pytest.raises(ServiceError) as error:
        queue.finish(run.id, "worker", "completed", evaluation_result={
            "report_markdown": "Synthetic", "score": 100, "trace": "private-sentinel",
        })
    assert error.value.code == "native_response_invalid"
    with factory() as db:
        row = db.get(Run, run.id)
        assert row.status == "running"
        assert row.evaluation_result is None


def test_completion_cannot_race_past_persisted_cancellation_intent(db_session):
    factory, service, queue, _, creator, _, run = _ready(db_session)
    queue.claim_next("worker")
    asyncio.run(service.cancel(creator, run.project_id, run.id))
    with pytest.raises(ServiceError) as error:
        queue.finish(run.id, "worker", "completed", evaluation_result={"report_markdown": "Synthetic"})
    assert error.value.code == "cancellation_requested"
    with factory() as db:
        assert db.get(Run, run.id).status == "running"


def test_heartbeat_reports_failed_creator_so_supervisor_stops_native_execution(db_session):
    factory, _, queue, _, _, token, run = _ready(db_session)
    queue.claim_next("worker")
    with factory.begin() as db:
        db.get(type(token), token.id).revoked_at = datetime.now(timezone.utc)
    assert queue.heartbeat(run.id, "worker").status == "failed"
    with factory() as db:
        assert db.get(Run, run.id).lease_owner is None


def test_cancellation_cleanup_retains_claim_until_executor_records_stop(db_session):
    factory, service, _, _, creator, _, submitted = _ready(db_session)
    queue = PostgresRunQueue(factory, lease_seconds=5)
    claimed = queue.claim_next("cleanup-worker")
    assert claimed.id == submitted.id
    original_expiry = claimed.lease_expires_at
    asyncio.run(service.cancel(creator, submitted.project_id, submitted.id))
    state = queue.heartbeat(submitted.id, "cleanup-worker", now=original_expiry - timedelta(seconds=1))
    assert state.status == "running"
    assert state.cancellation_requested_at is not None
    assert state.lease_expires_at > original_expiry
    state = queue.heartbeat(submitted.id, "cleanup-worker", now=original_expiry + timedelta(seconds=2))
    assert state.status == "running"
    assert state.tool_calls == 0
    stopped = queue.finish(submitted.id, "cleanup-worker", "cancelled", now=original_expiry + timedelta(seconds=3))
    assert stopped.status == "cancelled"
