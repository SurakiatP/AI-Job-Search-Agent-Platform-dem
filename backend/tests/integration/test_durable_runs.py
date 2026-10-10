"""FR-A03 automatic resume and FR-A02 needs_input. Synthetic data only."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session
from job_search_platform.api.a2a import _PlatformRequestHandler
from job_search_platform.db.models import Run, RunEvent
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue
from job_search_platform.workers.supervisor import WorkerSupervisor
from test_agent_applications import QUESTIONS, _PackRuntime, _ans, _good, _post, _prepare
from test_cv_tailoring import _execute_next, _interactive, _run, _setup
from test_paired_sessions import PREFIX
from test_rest_api import _write_headers, api_context  # noqa: F401


async def _queued_run(db_session):
    p = project(db_session, "Synthetic durable run")
    actor = owner(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    view = await RunService(sessions).submit(actor, p.id, run_request(chat.id, job.id))
    return sessions, PostgresRunQueue(sessions), view.id


def _events(sessions, run_id):
    with sessions() as db:
        return [e for e in db.scalars(select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.sequence))]


class _FakeRuntime:
    def __init__(self, root: Path):
        self.projects: dict = {}
        self.workspace_root = root

    async def stop_recorded_container(self, *_args):
        return True


@pytest.mark.parametrize("status, resume_count, cancelled, expected, expected_count", [
    ("running", 0, False, "queued", 1),
    ("running", 1, False, "interrupted", 1),  # a second interruption
    ("running", 0, True, "interrupted", 0),   # cancellation requested: never resumed
    ("queued", 0, False, "queued", 1),
    ("waiting_approval", 0, False, None, 0),  # keeps waiting
    ("needs_input", 0, False, None, 0),       # untouched
])
@pytest.mark.asyncio
async def test_interrupt_or_resume_decision_table(db_session, status, resume_count, cancelled, expected, expected_count):
    sessions, queue, run_id = await _queued_run(db_session)
    now = datetime.now(timezone.utc)
    with sessions.begin() as db:
        run = db.get(Run, run_id)
        run.status, run.resume_count = status, resume_count
        run.active_seconds, run.tool_calls = 12.0, 3
        if status == "running":
            run.lease_owner, run.lease_expires_at, run.heartbeat_at = "w", now + timedelta(seconds=30), now
            run.active_started_at = now
        if cancelled:
            run.cancellation_requested_at = now
    before = len(_events(sessions, run_id))
    assert queue.interrupt_or_resume(run_id, message_key="errors.worker_shutdown") == expected
    with sessions() as db:
        run = db.get(Run, run_id)
        assert run.status == (expected or status) and run.resume_count == expected_count
        assert run.lease_owner is None and run.lease_expires_at is None and run.active_started_at is None
        if expected:
            assert run.active_seconds >= 12.0 and run.tool_calls == 3
        assert (run.finished_at is not None) == (expected == "interrupted")
    new = _events(sessions, run_id)[before:]
    if expected == "queued":
        (event,) = new
        assert event.event_type == "run_resumed"
        assert event.public_data["status"] == "queued" and event.public_data["message_key"] == "events.run_resumed"
    elif expected == "interrupted":
        assert [e.event_type for e in new] == ["run_interrupted"]
    else:
        assert new == []


@pytest.mark.asyncio
async def test_graceful_close_resumes_once_then_second_interruption_interrupts(db_session, tmp_path):
    sessions, queue, run_id = await _queued_run(db_session)

    class Blocked:
        async def execute(self, run, lease_owner):
            await asyncio.sleep(3600)

    for attempt in (1, 2):
        supervisor = WorkerSupervisor(sessions, queue, Blocked(), _FakeRuntime(tmp_path), poll_interval=0.05, shutdown_timeout=0.2)
        supervisor._dispatcher = asyncio.create_task(supervisor._dispatch_loop())
        for _ in range(100):
            await asyncio.sleep(0.05)
            if supervisor._active:
                break
        assert supervisor._active, "run was never claimed"
        await supervisor.close()
        with sessions() as db:
            run = db.get(Run, run_id)
            assert run.status == ("queued" if attempt == 1 else "interrupted")
            assert run.resume_count == 1 and run.lease_owner is None
    assert [e.event_type for e in _events(sessions, run_id)].count("run_resumed") == 1
    assert queue.claim_next("after-interrupt") is None


@pytest.mark.asyncio
async def test_resumed_run_is_reclaimed_and_completes(db_session):
    sessions, queue, run_id = await _queued_run(db_session)
    lease = "first"
    assert queue.claim_next(lease).id == run_id
    assert queue.interrupt_or_resume(run_id, message_key="errors.worker_shutdown") == "queued"
    assert queue.claim_next("second").id == run_id
    queue.finish(run_id, "second", "completed")
    with sessions() as db:
        assert db.get(Run, run_id).status == "completed"


@pytest.mark.parametrize("scenario", ["running", "cancelled", "waiting_approval"])
@pytest.mark.asyncio
async def test_startup_reconcile(db_session, tmp_path, scenario):
    sessions, queue, run_id = await _queued_run(db_session)
    assert queue.claim_next("old-worker").id == run_id
    with sessions.begin() as db:
        run = db.get(Run, run_id)
        if scenario == "cancelled":
            run.cancellation_requested_at = datetime.now(timezone.utc)
        if scenario == "waiting_approval":
            run.status = "waiting_approval"
    supervisor = WorkerSupervisor(sessions, queue, object(), _FakeRuntime(tmp_path))
    await supervisor.reconcile_startup()
    await supervisor.reconcile_startup() if scenario != "running" else None
    expected = {"running": "queued", "cancelled": "interrupted", "waiting_approval": "waiting_approval"}[scenario]
    with sessions() as db:
        run = db.get(Run, run_id)
        assert run.status == expected
        assert run.resume_count == (1 if scenario == "running" else 0)
    types = [e.event_type for e in _events(sessions, run_id)]
    assert ("run_resumed" in types) == (scenario == "running")
    if scenario == "running":
        assert queue.claim_next("new-worker").id == run_id


@pytest.mark.asyncio
async def test_startup_reconcile_resumes_running_run_killed_before_its_sandbox_was_recorded(db_session, tmp_path):
    # A crash between claim and sandbox start leaves `running` with no container to stop; it must not
    # hold the project's single active slot forever.
    sessions, queue, run_id = await _queued_run(db_session)
    assert queue.claim_next("old-worker").id == run_id
    runtime = _FakeRuntime(tmp_path)

    async def nothing_recorded(*_args):
        return False

    runtime.stop_recorded_container = nothing_recorded
    await WorkerSupervisor(sessions, queue, object(), runtime).reconcile_startup()
    with sessions() as db:
        run = db.get(Run, run_id)
        assert (run.status, run.resume_count) == ("queued", 1)
    assert queue.claim_next("new-worker").id == run_id


def _parked(ctx):
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [[_ans("why", None)]])
    run_id = _prepare(ctx, csrf, pid, session_).json()["id"]
    _execute_next(ctx, runtime)
    return csrf, pid, session_, facts, run_id


def _input(ctx, csrf, pid, run_id, answers):
    return ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/input", headers=_write_headers(csrf), json={"answers": answers})


@pytest.mark.integration
def test_parked_pack_needs_input_does_not_block_queue_and_input_completes_it(api_context):
    ctx = api_context
    csrf, pid, session_, facts, run_id = _parked(ctx)
    run = _run(ctx, run_id)
    assert run.status == "needs_input" and run.result_payload["state"] == "parked"
    # The project queue is free: another run is claimable while the pack waits.
    other = _post(ctx, csrf, pid, session_, "tailor_cv", "t1").json()["id"]
    assert PostgresRunQueue(ctx.sessions).claim_next("other-worker").id == UUID(other)
    # Invalid or unknown answers change nothing.
    assert _input(ctx, csrf, pid, run_id, {"nope": "x"}).json()["code"] == "invalid_answer"
    assert _input(ctx, csrf, pid, run_id, {"why": "  "}).status_code == 422
    assert _run(ctx, run_id).status == "needs_input"
    # Apply submit needs a ready pack.
    assert _post(ctx, csrf, pid, session_, "apply_submit", "s0").json()["code"] == "apply_pack_required"
    done = _input(ctx, csrf, pid, run_id, {"why": "  I enjoy platform work  "})
    assert done.status_code == 200 and done.json()["status"] == "completed"
    payload = done.json()["result_payload"]
    assert payload["state"] == "ready" and payload["missing_required"] == []
    why = payload["answers"][0]
    assert why["answer"] == "I enjoy platform work" and why["source"] == "owner" and why["evidence_ids"] == []
    assert _run(ctx, run_id).finished_at is not None
    assert _post(ctx, csrf, pid, session_, "apply_submit", "s1").status_code == 202
    assert _input(ctx, csrf, pid, run_id, {"why": "again"}).json()["code"] == "run_not_awaiting_input"


@pytest.mark.integration
def test_model_suggested_boolean_parks_until_the_owner_confirms_it(api_context):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [_good(facts)])
    run_id = _prepare(ctx, csrf, pid, session_, questions=QUESTIONS).json()["id"]
    _execute_next(ctx, runtime)
    run = _run(ctx, run_id)
    payload = run.result_payload
    assert run.status == "needs_input" and payload["state"] == "parked" and payload["missing_required"] == ["auth"]
    auth = payload["answers"][1]
    assert auth["answer"] is None and auth["suggestion"] is True and auth["reason"] == "needs_confirmation"
    assert auth["evidence_ids"] == [facts["py"]]
    assert _post(ctx, csrf, pid, session_, "apply_submit", "s0").json()["code"] == "apply_pack_required"
    done = _input(ctx, csrf, pid, run_id, {"auth": True})
    assert done.status_code == 200 and done.json()["status"] == "completed"
    entry = done.json()["result_payload"]["answers"][1]
    assert entry["answer"] is True and entry["source"] == "owner" and "suggestion" not in entry and "reason" not in entry
    assert done.json()["result_payload"]["state"] == "ready"


@pytest.mark.integration
def test_partial_input_stays_needs_input_and_validates_kinds(api_context):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [[]])
    run_id = _prepare(ctx, csrf, pid, session_, questions=QUESTIONS).json()["id"]
    _execute_next(ctx, runtime)
    assert _run(ctx, run_id).result_payload["missing_required"] == ["why", "auth"]
    assert _input(ctx, csrf, pid, run_id, {"auth": "maybe"}).json()["code"] == "invalid_answer"
    assert _input(ctx, csrf, pid, run_id, {"level": "principal"}).json()["code"] == "invalid_answer"
    partial = _input(ctx, csrf, pid, run_id, {"auth": "true", "level": "senior"})
    body = partial.json()
    assert partial.status_code == 200 and body["status"] == "needs_input"
    assert body["result_payload"]["missing_required"] == ["why"] and body["result_payload"]["state"] == "parked"
    assert [a["answer"] for a in body["result_payload"]["answers"]] == [None, True, "senior"]
    assert _input(ctx, csrf, pid, run_id, {"why": "Because"}).json()["status"] == "completed"


@pytest.mark.integration
def test_pack_entries_own_kind_and_choices_drive_input(api_context):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [[]])
    run_id = _prepare(ctx, csrf, pid, session_, questions=QUESTIONS).json()["id"]
    _execute_next(ctx, runtime)
    with ctx.sessions.begin() as db:  # the entry's own choices, not the snapshot's, are the authority
        run = db.get(Run, UUID(run_id))
        run.result_payload = {**run.result_payload, "answers": [
            {**a, "choices": ["alpha"]} if a["question_id"] == "level" else a for a in run.result_payload["answers"]]}
    assert _input(ctx, csrf, pid, run_id, {"level": "senior"}).json()["code"] == "invalid_answer"
    assert _input(ctx, csrf, pid, run_id, {"auth": "maybe"}).json()["code"] == "invalid_answer"
    partial = _input(ctx, csrf, pid, run_id, {"auth": True, "level": "alpha"})
    assert partial.status_code == 200 and partial.json()["result_payload"]["missing_required"] == ["why"]
    assert [a["answer"] for a in partial.json()["result_payload"]["answers"]] == [None, True, "alpha"]
    assert _input(ctx, csrf, pid, run_id, {"why": "Because"}).json()["status"] == "completed"


@pytest.mark.integration
def test_concurrent_tailor_applies_queue_exactly_one_export(api_context):
    from concurrent.futures import ThreadPoolExecutor
    from helpers import owner
    from job_search_platform.db.models import Run as RunRow
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    run_id, _runtime = _interactive(ctx, csrf, pid, session_, facts)
    with ctx.sessions.begin() as db:
        actor = owner(db)
    runs = ctx.client.app.state.services.runs
    original = runs._queue_export

    def slow(*args, **kwargs):  # widen the race window so an unlocked read is caught
        import time
        time.sleep(0.5)
        return original(*args, **kwargs)

    runs._queue_export = slow
    try:
        def apply(_):
            try:
                return runs._tailor_apply_sync(actor, UUID(pid), UUID(run_id), [0, 1]).operation
            except Exception as exc:
                return getattr(exc, "code", repr(exc))
        with ThreadPoolExecutor(2) as pool:
            results = sorted(pool.map(apply, range(2)))
    finally:
        runs._queue_export = original
    assert results == ["export_document", "tailor_already_applied"]
    with ctx.sessions() as db:
        assert len(db.scalars(select(RunRow).where(RunRow.operation == "export_document")).all()) == 1


@pytest.mark.integration
def test_cancel_works_from_needs_input_and_input_is_owner_only(api_context):
    ctx = api_context
    csrf, pid, session_, facts, run_id = _parked(ctx)
    from test_agent_applications import _actor, _grant_view  # noqa: F401
    grant_actor = _actor(ctx, pid, "results:read", "applications:apply")
    with pytest.raises(Exception):
        asyncio.run(ctx.client.app.state.services.runs.submit_input(grant_actor, UUID(pid), UUID(run_id), {"why": "x"}))
    cancelled = ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/cancel", headers=_write_headers(csrf))
    assert cancelled.json()["status"] == "cancelled"
    assert _input(ctx, csrf, pid, run_id, {"why": "x"}).json()["code"] == "run_not_awaiting_input"


@pytest.mark.integration
def test_interactive_tailor_rests_in_needs_input_and_can_be_cancelled(api_context):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    run_id, _runtime = _interactive(ctx, csrf, pid, session_, facts)
    assert _run(ctx, run_id).status == "needs_input"
    cancelled = ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/cancel", headers=_write_headers(csrf))
    assert cancelled.json()["status"] == "cancelled"
    refused = ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/tailor/apply", headers=_write_headers(csrf),
                              json={"proposal_ids": [0]})
    assert refused.status_code == 404


def test_a2a_maps_needs_input_to_input_required():
    assert _PlatformRequestHandler._task_state("needs_input") == ("TASK_STATE_INPUT_REQUIRED", {})


def _publish_artifact(sessions, run_id):
    from job_search_platform.db.models import Document, DocumentRevision, RunArtifact, StoredFile
    with sessions.begin() as db:
        run = db.get(Run, run_id)
        pid = run.project_id
        cv_id, job_id = run.cv_revision_id, run.job_revision_id
        file_id = uuid.uuid4()
        db.add(StoredFile(id=file_id, project_id=pid, kind="generated_document", publication_state="published",
                          storage_key=f"k/{file_id}", checksum_sha256="a" * 64, size_bytes=1,
                          mime_type="application/pdf", display_name="x.pdf"))
        doc = Document(project_id=pid, document_type="cover_letter", title="t")
        db.add(doc)
        db.flush()
        rev = DocumentRevision(project_id=pid, document_id=doc.id, revision=1, file_id=file_id,
                               source_cv_revision_id=cv_id, source_job_revision_id=job_id, content_markdown="m")
        db.add(rev)
        db.flush()
        db.add(RunArtifact(project_id=pid, run_id=run_id, file_id=file_id, document_revision_id=rev.id))


@pytest.mark.asyncio
async def test_run_with_published_artifact_is_interrupted_not_resumed(db_session, tmp_path):
    sessions, queue, run_id = await _queued_run(db_session)
    assert queue.claim_next("old-worker").id == run_id
    _publish_artifact(sessions, run_id)
    supervisor = WorkerSupervisor(sessions, queue, object(), _FakeRuntime(tmp_path))
    await supervisor.reconcile_startup()
    with sessions() as db:
        run = db.get(Run, run_id)
        assert run.status == "interrupted" and run.resume_count == 0
    assert "run_resumed" not in [e.event_type for e in _events(sessions, run_id)]
