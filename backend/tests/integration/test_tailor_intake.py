"""tailor_cv intake: capability, autopilot default, owner-only interactive, live-document reuse."""

import asyncio

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, session
from job_search_platform.db.models import ConversationSession, Document, DocumentRevision, Run
from job_search_platform.services.contracts import RunRequest
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns
from job_search_platform.services.runs import RunService


def _ctx(db, capabilities=("cv:tailor", "results:read")):
    local_owner = owner(db)
    p = project(db)
    actor, _ = grant(db, p.id, capabilities=capabilities)
    cv, job = revisions(db, p.id)
    provider_config(db, p.id)
    db.commit()
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    return factory, local_owner, actor, p, cv, job


def _job_input(key="tailor-1"):
    return ProtocolJobInput.model_validate({
        "job": {"title": "Synthetic analyst", "description": "Synthetic SQL posting"},
        "output_language": "en", "idempotency_key": key})


def _request(session_id, cv, job, key, **extra):
    return RunRequest(session_id=session_id, operation="tailor_cv", cv_revision_id=cv.id,
                      job_revision_id=job.id, output_language="en", idempotency_key=key, **extra)


def test_grant_with_capability_queues_autopilot_run(db_session):
    factory, _, actor, *_ = _ctx(db_session)
    view = asyncio.run(ProtocolRuns(factory).submit(actor, "tailor_cv", _job_input()))
    assert view.operation == "tailor_cv" and view.status == "queued"
    assert db_session.get(Run, view.id).input_snapshot["tailor_mode"] == "autopilot"


def test_grant_without_capability_is_forbidden(db_session):
    factory, _, actor, *_ = _ctx(db_session, capabilities=("jobs:evaluate",))
    with pytest.raises(ServiceError) as error:
        asyncio.run(ProtocolRuns(factory).submit(actor, "tailor_cv", _job_input()))
    assert error.value.code == "forbidden"


def test_grant_cannot_request_interactive(db_session):
    factory, _, actor, p, cv, job = _ctx(db_session)
    chat = session(db_session, p.id)
    db_session.commit()
    with pytest.raises(ServiceError) as error:
        asyncio.run(RunService(factory).submit(actor, p.id, _request(chat.id, cv, job, "g1", tailor_mode="interactive")))
    assert error.value.code == "forbidden"


def test_owner_interactive_is_accepted(db_session):
    factory, local_owner, _, p, cv, job = _ctx(db_session)
    chat = session(db_session, p.id)
    db_session.commit()
    view = asyncio.run(RunService(factory).submit(local_owner, p.id, _request(chat.id, cv, job, "o1", tailor_mode="interactive")))
    assert db_session.get(Run, view.id).input_snapshot["tailor_mode"] == "interactive"


def test_second_tailor_run_reuses_live_cv_document(db_session):
    factory, local_owner, _, p, cv, job = _ctx(db_session)
    paired = ConversationSession(project_id=p.id, title="Paired", cv_revision_id=cv.id, job_revision_id=job.id)
    db_session.add(paired)
    db_session.commit()
    first = asyncio.run(RunService(factory).submit(local_owner, p.id, _request(paired.id, cv, job, "r1")))
    assert "document_id" not in db_session.get(Run, first.id).input_snapshot
    document = Document(project_id=p.id, document_type="cv", title="Tailored CV")
    db_session.add(document)
    db_session.flush()
    db_session.add(DocumentRevision(project_id=p.id, document_id=document.id, revision=1,
                                    source_job_revision_id=job.id, content_markdown="# Tailored"))
    db_session.commit()
    second = asyncio.run(RunService(factory).submit(local_owner, p.id, _request(paired.id, cv, job, "r2")))
    snapshot = db_session.get(Run, second.id).input_snapshot
    assert snapshot["document_id"] == str(document.id) and snapshot["previous_draft"] == "# Tailored"


def test_tailor_mode_rejected_on_other_operations():
    with pytest.raises(ValidationError, match="tailor_mode_requires_tailor_cv"):
        RunRequest(session_id="00000000-0000-0000-0000-000000000001", operation="evaluate_job",
                   output_language="en", idempotency_key="k", tailor_mode="autopilot")


def test_result_payload_hidden_without_results_read(db_session):
    factory, _, actor, p, *_ = _ctx(db_session, capabilities=("cv:tailor",))
    view = asyncio.run(ProtocolRuns(factory).submit(actor, "tailor_cv", _job_input("leak")))
    run = db_session.get(Run, view.id)
    run.result_payload = {"kind": "tailor", "proposals": [{"text": "SECRET CV TEXT"}]}
    db_session.commit()
    replay = asyncio.run(ProtocolRuns(factory).submit(actor, "tailor_cv", _job_input("leak")))
    cancelled = asyncio.run(RunService(factory).cancel(actor, p.id, view.id))
    assert replay.result_payload is None and cancelled.result_payload is None
