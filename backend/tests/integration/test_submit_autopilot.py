"""FR-A05: submit autopilot with a daily budget (records applied only; the owner still submits on the company site)."""
from __future__ import annotations

import asyncio

import pytest
from alembic import command
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker
from uuid import UUID, uuid4

from datetime import datetime, timezone

from helpers import grant as make_grant
from helpers import project as make_project
from job_search_platform.db.models import Approval, Run, RunEvent
from job_search_platform.services.contracts import RunRequest
from job_search_platform.workers.queue import PostgresRunQueue
from test_agent_applications import (
    PREFIX, _PackRuntime, _actor, _approvals, _decide, _good, _post, _prepare, _ready_pack, _run, _status,
)
from test_cv_tailoring import _execute_next, _session
from test_durable_runs import _input, _parked
from test_rest_api import _write_headers, api_context  # noqa: F401
from test_smart_match_migration import _migrate


def _limit(ctx, csrf, pid, value):
    return ctx.client.patch(f"{PREFIX}/{pid}/preferences", headers=_write_headers(csrf),
                            json={"submit_autopilot_daily_limit": value})


def _submit(ctx, csrf, pid, session, runtime, key):
    run_id = _post(ctx, csrf, pid, session, "apply_submit", key).json()["id"]
    _execute_next(ctx, runtime)
    return run_id


def _events(ctx, run_id):
    with ctx.sessions() as db:
        return list(db.scalars(select(RunEvent).where(RunEvent.run_id == UUID(run_id)).order_by(RunEvent.sequence)))


@pytest.mark.integration
def test_off_by_default_the_run_waits(api_context):
    ctx = api_context
    csrf, pid, session, _, runtime, _ = _ready_pack(ctx)
    assert ctx.client.get(f"{PREFIX}/{pid}/preferences").json()["submit_autopilot_daily_limit"] is None
    run_id = _submit(ctx, csrf, pid, session, runtime, "s1")
    assert _run(ctx, run_id).status == "waiting_approval"
    assert _approvals(ctx, pid)[0]["decided_by"] is None


@pytest.mark.integration
def test_on_with_ready_pack_auto_approves_and_records_applied(api_context):
    ctx = api_context
    csrf, pid, session, _, runtime, _ = _ready_pack(ctx)
    assert _limit(ctx, csrf, pid, 3).json()["submit_autopilot_daily_limit"] == 3
    run_id = _submit(ctx, csrf, pid, session, runtime, "s1")
    assert _run(ctx, run_id).status == "completed" and _status(ctx, pid, session) == "applied"
    (approval,) = _approvals(ctx, pid)
    assert approval["decided_by"] == "autopilot" and approval["decision"] == "approve"
    events = _events(ctx, run_id)
    assert any(e.event_type == "run_progress" and e.public_data.get("step") == "autopilot_approved" for e in events)
    assert "application_recorded" in [e.event_type for e in events]


@pytest.mark.integration
def test_limit_one_second_submit_same_day_waits(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, _ = _ready_pack(ctx)
    _limit(ctx, csrf, pid, 1)
    assert _run(ctx, _submit(ctx, csrf, pid, session, runtime, "s1")).status == "completed"
    second = _session(ctx, csrf, pid, session["cv_revision_id"], job={
        "title": "SRE", "company": "Other Co", "description": "Needs Python and Docker."}).json()
    ctx.client.post(f"{PREFIX}/{pid}/runs/{second['evaluation_run_id']}/cancel", headers=_write_headers(csrf))
    runtime.script = [_good(facts)]
    _prepare(ctx, csrf, pid, second, "p-second")
    _execute_next(ctx, runtime)
    run_id = _submit(ctx, csrf, pid, second, runtime, "s-second")
    assert _run(ctx, run_id).status == "waiting_approval"
    # Raising the limit does not retroactively approve; the owner decides as usual.
    pending = [a for a in _approvals(ctx, pid) if a["consumed_at"] is None]
    assert _decide(ctx, csrf, pid, pending[0]["id"], "approve").json()["decided_by"] == "owner"


@pytest.mark.integration
def test_pack_completed_via_owner_input_is_auto_approved(api_context):
    ctx = api_context
    csrf, pid, session, facts, run_id = _parked(ctx)
    _limit(ctx, csrf, pid, 2)
    assert _input(ctx, csrf, pid, run_id, {"why": "I like platform work"}).status_code == 200
    submit = _submit(ctx, csrf, pid, session, _PackRuntime(ctx.tmp_path / "ws", []), "s1")
    assert _run(ctx, submit).status == "completed"
    assert _approvals(ctx, pid)[0]["decided_by"] == "autopilot"


@pytest.mark.integration
def test_parked_pack_is_never_submitted(api_context):
    ctx = api_context
    csrf, pid, session, _, _ = _parked(ctx)
    _limit(ctx, csrf, pid, 5)
    assert _post(ctx, csrf, pid, session, "apply_submit", "s1").json()["code"] == "apply_pack_required"
    assert _approvals(ctx, pid) == []


@pytest.mark.integration
def test_revoked_creator_grant_blocks_autopilot(api_context):
    ctx = api_context
    csrf, pid, session, _, _, _ = _ready_pack(ctx)
    _limit(ctx, csrf, pid, 3)
    with ctx.sessions.begin() as db:
        actor, g = make_grant(db, UUID(pid), capabilities=("applications:apply", "results:read"))
    run = asyncio.run(ctx.client.app.state.services.runs.submit(actor, UUID(pid), RunRequest(
        session_id=UUID(session["id"]), operation="apply_submit", cv_revision_id=UUID(session["cv_revision_id"]),
        job_revision_id=UUID(session["job_revision_id"]), output_language="en", idempotency_key="g1")))
    run_id = str(run.id)
    claimed = PostgresRunQueue(ctx.sessions).claim_next("w1")
    assert claimed is not None and str(claimed.id) == run_id
    with ctx.sessions.begin() as db:
        g_row = db.get(type(g), g.id)
        g_row.revoked_at = datetime.now(timezone.utc)
    ctx.client.app.state.services.approvals.request_submission(claimed.id, "w1")
    (approval,) = _approvals(ctx, pid)
    assert approval["decided_by"] is None and approval["consumed_at"] is None
    assert _run(ctx, run_id).status == "waiting_approval"


@pytest.mark.integration
def test_grant_cannot_set_the_limit(api_context):
    ctx = api_context
    csrf, pid, *_ = _ready_pack(ctx)
    token = ctx.client.post(f"{PREFIX}/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["results:read", "applications:apply", "documents:draft"],
        "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    saved = dict(ctx.client.cookies)
    ctx.client.cookies.clear()
    try:
        denied = ctx.client.patch(f"{PREFIX}/{pid}/preferences", headers={"Authorization": f"Bearer {token}"},
                                  json={"submit_autopilot_daily_limit": 5})
    finally:
        ctx.client.cookies.update(saved)
    assert denied.status_code in (401, 403)
    assert ctx.client.get(f"{PREFIX}/{pid}/preferences").json()["submit_autopilot_daily_limit"] is None
    assert _limit(ctx, csrf, pid, 21).status_code == 422 and _limit(ctx, csrf, pid, 0).status_code == 422
    assert _limit(ctx, csrf, pid, None).json()["submit_autopilot_daily_limit"] is None


@pytest.mark.integration
def test_owner_approve_sets_decided_by_owner(api_context):
    ctx = api_context
    csrf, pid, session, _, runtime, _ = _ready_pack(ctx)
    _submit(ctx, csrf, pid, session, runtime, "s1")
    (approval,) = _approvals(ctx, pid)
    assert _decide(ctx, csrf, pid, approval["id"], "approve").json()["decided_by"] == "owner"


@pytest.mark.integration
def test_migration_0020_backfills_owner_on_existing_decisions(postgres_engine):
    _migrate(postgres_engine, command.upgrade, "0019_grant_label")
    factory = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    from helpers import project, revisions, session as make_session, provider_config
    from job_search_platform.db.models import Run
    with factory() as db:
        p = project(db)
        cv, job = revisions(db, p.id)
        chat, config = make_session(db, p.id), provider_config(db)
        runs = []
        for i in range(2):
            run = Run(project_id=p.id, actor_scope="owner", idempotency_key=f"r{i}", request_digest="d" * 64,
                      operation="apply_prepare", session_id=chat.id, cv_revision_id=cv.id, job_revision_id=job.id,
                      provider_configuration_id=config.id, input_snapshot={}, config_snapshot={},
                      output_language="en", status="completed")
            db.add(run)
            runs.append(run)
        db.flush()
        for i, decision in ((0, "approve"), (1, None)):
            db.execute(text("INSERT INTO approvals (id, project_id, run_id, action, target_run_id, change_digest, token_hash, "
                            "expires_at, decision) VALUES (:id, :p, :r, 'submit_application', :t, :d, :h, now(), :dec)"),
                       {"id": uuid4(), "p": p.id, "r": runs[i].id, "t": runs[1 - i].id, "d": "d" * 64,
                        "h": bytes([i + 1]) * 32, "dec": decision})
        db.commit()
    _migrate(postgres_engine, command.upgrade, "head")
    with factory() as db:
        rows = {r[0]: r[1] for r in db.execute(text("SELECT coalesce(decision,'none'), decided_by FROM approvals"))}
        assert rows == {"approve": "owner", "none": None}
    _migrate(postgres_engine, command.downgrade, "0019_grant_label")
