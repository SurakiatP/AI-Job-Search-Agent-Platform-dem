"""apply_prepare, apply_submit (owner approval) and draft_follow_up, with a fake runtime. Synthetic data only."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from alembic import command
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import grant as make_grant, project as make_project, provider_config, revisions, session as make_session
from job_search_platform.db.models import Approval, Run, RunEvent
from job_search_platform.services.contracts import ApplyPrepareInput, ApplySubmitInput, ProtocolJobInput
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolRuns
from test_cv_tailoring import _Runtime, _execute_next, _run, _setup
from test_draft_kinds_manual_edit import _FakeRuntime, _execute_next as _execute_draft
from test_paired_sessions import PREFIX
from test_rest_api import _write_headers, api_context  # noqa: F401
from test_smart_match_migration import _migrate

QUESTIONS = [
    {"id": "why", "label": "Why do you want this job?", "required": True, "kind": "text"},
    {"id": "auth", "label": "Authorised to work in Thailand?", "required": True, "kind": "boolean"},
    {"id": "level", "label": "Seniority", "required": False, "kind": "choice", "choices": ["junior", "senior"]},
]


class _PackRuntime(_Runtime):
    """Replies to the single submit with the scripted answers."""

    async def events(self, project_id):
        answers = self.script.pop(0) if self.script else []
        yield SimpleNamespace(kind="result", result=json.dumps({"answers": answers}))


def _ans(question_id, answer, *ids):
    return {"question_id": question_id, "answer": answer, "evidence_ids": list(ids)}


def _good(facts):
    return [_ans("why", "Packaged services with Docker", facts["docker"]), _ans("auth", True, facts["py"]),
            _ans("level", "senior", facts["py"])]


def _post(ctx, csrf, pid, session, operation, key, **extra):
    return ctx.client.post(f"{PREFIX}/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": session["id"], "operation": operation, "output_language": "en", "idempotency_key": key, **extra})


def _prepare(ctx, csrf, pid, session, key="p1", questions=QUESTIONS):
    return _post(ctx, csrf, pid, session, "apply_prepare", key, questions=questions)


def _ready_pack(ctx):
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [_good(facts)])
    run_id = _prepare(ctx, csrf, pid, session).json()["id"]
    _execute_next(ctx, runtime)
    return csrf, pid, session, facts, runtime, run_id


def _status(ctx, pid, session):
    return ctx.client.get(f"{PREFIX}/{pid}/jobs/{session['job_revision_id']}/application-status").json()["application_status"]


def _approvals(ctx, pid):
    return ctx.client.get(f"{PREFIX}/{pid}/approvals").json()


def _decide(ctx, csrf, pid, approval_id, decision):
    return ctx.client.post(f"{PREFIX}/{pid}/approvals/{approval_id}/decision", headers=_write_headers(csrf),
                           json={"decision": decision})


def _actor(ctx, pid, *capabilities):
    with ctx.sessions.begin() as db:
        return make_grant(db, UUID(pid), capabilities=capabilities)[0]


def _grant_view(ctx, actor, pid, run_id):
    return asyncio.run(ctx.client.app.state.services.runs.get(actor, UUID(pid), UUID(str(run_id))))


@pytest.mark.integration
def test_prepare_ready_pack_cites_evidence_and_events_hold_no_answers(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, run_id = _ready_pack(ctx)
    run = _run(ctx, run_id)
    assert run.status == "completed" and run.operation == "apply_prepare"
    assert run.result_payload == {
        "kind": "apply_pack", "state": "ready", "missing_required": [],
        "answers": [{"question_id": "why", "answer": "Packaged services with Docker", "evidence_ids": [facts["docker"]]},
                    {"question_id": "auth", "answer": True, "evidence_ids": [facts["py"]]},
                    {"question_id": "level", "answer": "senior", "evidence_ids": [facts["py"]]}]}
    (_, prompt, kwargs), = runtime.submits
    assert kwargs["operation"] == "apply_prepare" and "Why do you want this job?" in prompt
    with ctx.sessions() as db:
        events = json.dumps(list(db.scalars(select(RunEvent.public_data).where(RunEvent.run_id == UUID(run_id)))))
    assert "Docker" not in events and "senior" not in events


@pytest.mark.integration
def test_prepare_parks_when_a_required_answer_is_unanswerable(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [[_ans("why", None), _ans("auth", True, facts["py"])]])
    run_id = _prepare(ctx, csrf, pid, session).json()["id"]
    _execute_next(ctx, runtime)
    run = _run(ctx, run_id)
    assert run.status == "completed"
    assert run.result_payload["state"] == "parked" and run.result_payload["missing_required"] == ["why"]
    assert run.result_payload["answers"][0] == {"question_id": "why", "answer": None, "evidence_ids": [],
                                               "reason": "not_answerable"}
    # A parked pack cannot be submitted.
    assert _post(ctx, csrf, pid, session, "apply_submit", "s1").json()["code"] == "apply_pack_required"


@pytest.mark.integration
def test_unsupported_number_and_bad_option_are_nulled(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _PackRuntime(ctx.tmp_path / "ws", [[
        _ans("why", "Cut Docker costs by 90%", facts["docker"]),
        _ans("auth", "yes", facts["py"]), _ans("level", "principal", facts["py"])]])
    run_id = _prepare(ctx, csrf, pid, session).json()["id"]
    _execute_next(ctx, runtime)
    payload = _run(ctx, run_id).result_payload
    assert [a["answer"] for a in payload["answers"]] == [None, None, None]
    assert [a["reason"] for a in payload["answers"]] == ["unsupported_claim", "invalid_answer", "invalid_answer"]
    assert payload["state"] == "parked" and payload["missing_required"] == ["why", "auth"]


@pytest.mark.integration
def test_duplicate_active_prepare_is_busy_but_refresh_after_completion_is_allowed(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, _ = _ready_pack(ctx)
    runtime.script = [_good(facts)]
    first = _prepare(ctx, csrf, pid, session, "p2")
    assert first.status_code == 202, first.text
    busy = _prepare(ctx, csrf, pid, session, "p3")
    assert busy.status_code == 409 and busy.json()["code"] == "document_busy"
    assert _prepare(ctx, csrf, pid, session, "p4", questions=QUESTIONS[:1]).json()["code"] == "document_busy"
    _execute_next(ctx, runtime)
    assert _prepare(ctx, csrf, pid, session, "p5").status_code == 202


@pytest.mark.integration
def test_prepare_questions_are_validated_and_part_of_idempotency(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    bad = [[], [{**QUESTIONS[0], "kind": "choice"}], [QUESTIONS[0], QUESTIONS[0]],
           [{**QUESTIONS[2], "choices": None}], [{**QUESTIONS[0], "id": ""}]]
    for questions in bad:
        assert _prepare(ctx, csrf, pid, session, "bad", questions=questions).status_code == 422
    assert _post(ctx, csrf, pid, session, "draft_documents", "bad", questions=QUESTIONS).status_code == 422
    assert _post(ctx, csrf, pid, session, "apply_prepare", "bad").status_code == 422
    first = _prepare(ctx, csrf, pid, session, "same")
    assert _prepare(ctx, csrf, pid, session, "same").json()["id"] == first.json()["id"]
    assert _prepare(ctx, csrf, pid, session, "same", questions=QUESTIONS[:1]).json()["code"] == "idempotency_conflict"


@pytest.mark.integration
def test_submit_needs_a_ready_pack(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    refused = _post(ctx, csrf, pid, session, "apply_submit", "s0")
    assert refused.status_code == 409 and refused.json()["code"] == "apply_pack_required"


@pytest.mark.integration
def test_submit_waits_for_owner_then_approve_records_applied_and_completes(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    submit = _post(ctx, csrf, pid, session, "apply_submit", "s1")
    assert submit.status_code == 202, submit.text
    submit_id = submit.json()["id"]
    assert _post(ctx, csrf, pid, session, "apply_submit", "s2").json()["code"] == "document_busy"
    _execute_next(ctx, runtime)
    assert _run(ctx, submit_id).status == "waiting_approval"
    (approval,) = _approvals(ctx, pid)
    assert approval["action"] == "submit_application" and approval["target_run_id"] == pack_id
    assert approval["run_id"] == submit_id and approval["consumed_at"] is None
    assert _status(ctx, pid, session) == "saved"

    decided = _decide(ctx, csrf, pid, approval["id"], "approve")
    assert decided.status_code == 200, decided.text
    assert decided.json()["decision"] == "approve" and decided.json()["applied_at"] is not None
    run = _run(ctx, submit_id)
    assert run.status == "completed" and run.result_payload["pack_run_id"] == pack_id
    assert _status(ctx, pid, session) == "applied"
    with ctx.sessions() as db:
        types = list(db.scalars(select(RunEvent.event_type).where(RunEvent.run_id == UUID(submit_id)).order_by(RunEvent.sequence)))
    assert "application_recorded" in types and types[-1] == "run_completed"
    # One use: a replay returns the same decision, the opposite one is refused.
    assert _decide(ctx, csrf, pid, approval["id"], "approve").status_code == 200
    assert _decide(ctx, csrf, pid, approval["id"], "reject").json()["code"] == "approval_consumed"
    # Already applied: no new submit.
    again = _post(ctx, csrf, pid, session, "apply_submit", "s3")
    assert again.status_code == 409 and again.json()["code"] == "already_applied"


@pytest.mark.integration
def test_pending_submit_approval_does_not_freeze_the_project_queue(api_context):
    from job_search_platform.workers.queue import PostgresRunQueue
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    submit_id = _post(ctx, csrf, pid, session, "apply_submit", "s1").json()["id"]
    _execute_next(ctx, runtime)
    assert _run(ctx, submit_id).status == "waiting_approval"
    other = _post(ctx, csrf, pid, session, "draft_documents", "d1", draft_kind="cover_letter")
    assert other.status_code == 202, other.text
    claimed = PostgresRunQueue(ctx.sessions).claim_next("w")
    assert claimed is not None and str(claimed.id) == other.json()["id"]
    # An apply_submit queued behind an active run is claimable too (it holds no sandbox).
    (approval,) = _approvals(ctx, pid)
    assert _decide(ctx, csrf, pid, approval["id"], "approve").status_code == 200
    assert _run(ctx, submit_id).status == "completed"


@pytest.mark.integration
def test_denied_submit_cancels_the_run_and_leaves_the_job_saved(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    submit_id = _post(ctx, csrf, pid, session, "apply_submit", "s1").json()["id"]
    _execute_next(ctx, runtime)
    (approval,) = _approvals(ctx, pid)
    assert _decide(ctx, csrf, pid, approval["id"], "reject").json()["decision"] == "reject"
    assert _run(ctx, submit_id).status == "cancelled"
    assert _status(ctx, pid, session) == "saved"
    # The pack is still usable: a new submit asks again.
    assert _post(ctx, csrf, pid, session, "apply_submit", "s2").status_code == 202


@pytest.mark.integration
def test_stale_pack_voids_the_approval(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    _post(ctx, csrf, pid, session, "apply_submit", "s1")
    _execute_next(ctx, runtime)
    (approval,) = _approvals(ctx, pid)
    ctx.client.patch(f"{PREFIX}/{pid}/jobs/{session['job_revision_id']}/application-status",
                     headers=_write_headers(csrf), json={"application_status": "applied"})
    assert _decide(ctx, csrf, pid, approval["id"], "approve").json()["code"] == "approval_stale"


@pytest.mark.integration
def test_grant_scopes_cannot_approve_request_the_action_or_read_the_pack(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    protocol = ProtocolRuns(ctx.sessions)
    job_id = UUID(session["job_revision_id"])
    prepare = ApplyPrepareInput(job_revision_id=job_id, output_language="en", idempotency_key="g1", questions=QUESTIONS)
    drafter = _actor(ctx, pid, "documents:draft", "results:read")
    for operation, request in (("apply_prepare", prepare),
                               ("apply_submit", ApplySubmitInput(job_revision_id=job_id, idempotency_key="g2"))):
        with pytest.raises(ServiceError) as denied:
            asyncio.run(protocol.submit(drafter, operation, request))
        assert denied.value.code == "forbidden"
    applier = _actor(ctx, pid, "applications:apply")
    run = asyncio.run(protocol.submit(applier, "apply_prepare", prepare))
    assert run.operation == "apply_prepare"
    _execute_next(ctx, _PackRuntime(ctx.tmp_path / "ws", [_good(facts)]))
    assert _run(ctx, run.id).status == "completed"
    # Without results:read the pack is hidden (the replayed intake view is the grant's only view of it) and
    # the run cannot be read; with results:read it can.
    replay = asyncio.run(protocol.submit(applier, "apply_prepare", prepare))
    assert replay.id == run.id and replay.status == "completed" and replay.result_payload is None
    with pytest.raises(ServiceError) as hidden:
        _grant_view(ctx, applier, pid, run.id)
    assert hidden.value.code == "forbidden"
    reader = _actor(ctx, pid, "applications:apply", "results:read")
    assert _grant_view(ctx, reader, pid, run.id).result_payload["state"] == "ready"
    owner_view = ctx.client.get(f"{PREFIX}/{pid}/runs/{run.id}").json()
    assert owner_view["result_payload"]["state"] == "ready"
    # An agent submit creates the approval request but can neither approve nor request it directly.
    submit = asyncio.run(protocol.submit(applier, "apply_submit", ApplySubmitInput(job_revision_id=job_id, idempotency_key="g3")))
    _execute_next(ctx, _PackRuntime(ctx.tmp_path / "ws", []))
    (approval,) = _approvals(ctx, pid)
    assert approval["run_id"] == str(submit.id)
    services = ctx.client.app.state.services
    with pytest.raises(ServiceError) as forbidden:
        services.approvals.resolve(applier, UUID(pid), UUID(approval["id"]), "approve")
    assert forbidden.value.code == "forbidden"
    assert _status(ctx, pid, session) == "saved"


@pytest.mark.integration
def test_grant_with_results_read_sees_its_own_pack(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    reader = _actor(ctx, pid, "applications:apply", "results:read")
    request = ApplyPrepareInput(job_revision_id=UUID(session["job_revision_id"]), output_language="en",
                                idempotency_key="r1", questions=QUESTIONS)
    run = asyncio.run(ProtocolRuns(ctx.sessions).submit(reader, "apply_prepare", request))
    _execute_next(ctx, _PackRuntime(ctx.tmp_path / "ws", [_good(facts)]))
    assert _grant_view(ctx, reader, pid, run.id).result_payload["state"] == "ready"


@pytest.mark.integration
def test_follow_up_refused_until_applied_then_drafts_a_follow_up_document(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, _ = _ready_pack(ctx)
    refused = _post(ctx, csrf, pid, session, "draft_follow_up", "f1")
    assert refused.status_code == 409 and refused.json()["code"] == "application_not_applied"
    assert _post(ctx, csrf, pid, session, "draft_documents", "f1b", draft_kind="follow_up").json()["code"] == "application_not_applied"
    drafter = _actor(ctx, pid, "documents:draft")
    request = ProtocolJobInput(job_revision_id=UUID(session["job_revision_id"]), output_language="en", idempotency_key="f2")
    with pytest.raises(ServiceError) as not_applied:
        asyncio.run(ProtocolRuns(ctx.sessions).submit(drafter, "draft_follow_up", request))
    assert not_applied.value.code == "application_not_applied"

    ctx.client.patch(f"{PREFIX}/{pid}/jobs/{session['job_revision_id']}/application-status",
                     headers=_write_headers(csrf), json={"application_status": "applied"})
    run_id = _post(ctx, csrf, pid, session, "draft_follow_up", "f3")
    assert run_id.status_code == 202, run_id.text
    assert run_id.json()["operation"] == "draft_follow_up"
    fake = _FakeRuntime(ctx.tmp_path / "ws", "cover_letter")  # the model's declared type is overridden
    _execute_draft(ctx, fake)
    (prompt, kwargs), = fake.submits
    assert kwargs["operation"] == "draft_documents" and "follow-up" in prompt and "Nothing is sent" in prompt
    docs = ctx.client.get(f"{PREFIX}/{pid}/documents").json()
    assert [d["document_type"] for d in docs] == ["follow_up"]
    # A grant may now request it too, and gets a document of its own.
    granted = asyncio.run(ProtocolRuns(ctx.sessions).submit(drafter, "draft_follow_up", request))
    assert granted.operation == "draft_follow_up"


@pytest.mark.integration
def test_migration_0017_upgrades_a_database_that_already_has_runs(postgres_engine):
    _migrate(postgres_engine, command.upgrade, "0016_run_result_payload")
    factory = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    with factory() as db:
        p = make_project(db)
        old_cv, _ = revisions(db, p.id)
        db.add(Run(project_id=p.id, actor_scope="owner", idempotency_key="old", request_digest="d" * 64,
                   operation="profile_cv", cv_revision_id=old_cv.id, input_snapshot={}, config_snapshot={}, output_language="en",
                   status="completed"))
        db.commit()
    _migrate(postgres_engine, command.upgrade, "head")
    with factory() as db:
        assert db.scalar(select(Run.operation).where(Run.idempotency_key == "old")) == "profile_cv"
        p = make_project(db, "second")
        cv, job = revisions(db, p.id)
        chat, config = make_session(db, p.id), provider_config(db)
        for index, operation in enumerate(("apply_prepare", "apply_submit", "draft_follow_up")):
            db.add(Run(project_id=p.id, actor_scope="owner", idempotency_key=f"new{index}", request_digest="d" * 64,
                       operation=operation, session_id=chat.id, cv_revision_id=cv.id, job_revision_id=job.id,
                       provider_configuration_id=config.id, input_snapshot={}, config_snapshot={},
                       output_language="en", status="completed"))
        db.commit()
    with pytest.raises(RuntimeError, match="downgrade_blocked"):
        _migrate(postgres_engine, command.downgrade, "0016_run_result_payload")


def _promote_setup(ctx):
    from test_rest_api import _owner, _removal_project, _seed_completed_run, _seed_document
    from job_search_platform.db.models import CVRevision
    csrf = _owner(ctx)
    pid, sid = _removal_project(ctx, csrf)
    _seed_completed_run(ctx, pid, sid)
    seeded = _seed_document(ctx, pid, "tailored.pdf")
    with ctx.sessions() as db:
        cv_id = db.scalar(select(CVRevision.id).where(CVRevision.project_id == UUID(pid)))
    return csrf, pid, sid, seeded, cv_id


@pytest.mark.integration
def test_owner_promotes_cv_directly_even_while_another_run_is_active(api_context):
    from job_search_platform.db.models import CVRevision
    ctx = api_context
    csrf, pid, sid, seeded, cv_id = _promote_setup(ctx)
    with ctx.sessions.begin() as db:
        done = db.scalar(select(Run).where(Run.project_id == UUID(pid)))
        db.add(Run(project_id=done.project_id, actor_scope="owner", idempotency_key="active", request_digest="c" * 64,
                   session_id=done.session_id, operation="draft_documents", cv_revision_id=done.cv_revision_id,
                   job_revision_id=done.job_revision_id, provider_configuration_id=done.provider_configuration_id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="running"))
    body = {"revision_id": str(seeded.revision), "expected_cv_revision_id": str(cv_id)}
    done = ctx.client.post(f"/api/v1/projects/{pid}/cv/promote", headers=_write_headers(csrf), json=body)
    assert done.status_code == 200, done.text
    with ctx.sessions() as db:
        assert db.scalar(select(CVRevision.id).where(CVRevision.project_id == UUID(pid), CVRevision.file_id == seeded.file)) is not None
    # The CV moved on: the same expected revision is now stale.
    stale = ctx.client.post(f"/api/v1/projects/{pid}/cv/promote", headers=_write_headers(csrf), json=body)
    assert stale.status_code == 409 and stale.json()["code"] == "approval_stale"


@pytest.mark.integration
def test_promote_is_owner_only_and_approval_post_needs_a_run(api_context):
    ctx = api_context
    csrf, pid, sid, seeded, cv_id = _promote_setup(ctx)
    token = ctx.client.post(f"/api/v1/projects/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["documents:draft"], "expires_at": "2099-01-01T00:00:00+00:00"}).json()["token"]
    body = {"revision_id": str(seeded.revision), "expected_cv_revision_id": str(cv_id)}
    saved = dict(ctx.client.cookies)
    ctx.client.cookies.clear()
    denied = ctx.client.post(f"/api/v1/projects/{pid}/cv/promote", headers={"Authorization": f"Bearer {token}"}, json=body)
    ctx.client.cookies.update(saved)
    assert denied.status_code in (401, 403)  # like every owner write, a bearer grant never passes CSRF auth
    with pytest.raises(ServiceError) as forbidden:  # and the service itself refuses a grant actor
        ctx.client.app.state.services.approvals.promote_cv_direct(
            _actor(ctx, pid, "documents:draft"), UUID(pid), seeded.revision, cv_id)
    assert forbidden.value.code == "forbidden"
    asked = ctx.client.post(f"/api/v1/projects/{pid}/approvals", headers=_write_headers(csrf), json={"action": "promote_cv", **body})
    assert asked.status_code == 409 and asked.json()["code"] == "approval_requires_run"
