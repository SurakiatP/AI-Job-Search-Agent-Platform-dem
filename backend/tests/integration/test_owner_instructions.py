"""Owner task instructions are immutable run inputs and remain private."""
from __future__ import annotations

import asyncio

import pytest
from helpers import grant, owner, project, provider_config, revisions, run_request, session
from job_search_platform.db.models import JobRevision, Message, Run
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.executor import RunExecutor
from sqlalchemy.orm import sessionmaker


def _service(db_session):
    return RunService(sessionmaker(bind=db_session.get_bind(), expire_on_commit=False))


def _submit(service, actor, project_id, request):
    return asyncio.run(service.submit(actor, project_id, request))


def test_owner_instruction_is_frozen_with_run_and_used_by_native_prompt(db_session):
    project_record = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, project_record.id)
    _, job = revisions(db_session, project_record.id)
    provider_config(db_session, project_record.id)
    db_session.commit()

    instruction = "OWNER-INSTRUCTION-SENTINEL: emphasize retention experience."
    request = run_request(chat.id, job.id, key="owner-instruction-frozen").model_copy(
        update={"owner_instructions": instruction}
    )
    service = _service(db_session)
    view = _submit(service, actor, project_record.id, request)

    with service.sessions.begin() as db:
        saved = db.get(Run, view.id)
        assert saved.input_snapshot["owner_instructions"] == instruction
        db.add(Message(project_id=project_record.id, session_id=chat.id, role="user", content="LATER-CHAT-SENTINEL"))
        db.add(
            JobRevision(
                project_id=project_record.id,
                revision=2,
                title="Later synthetic revision",
                description="LATER-JOB-REVISION-SENTINEL",
            )
        )

    prompt, policy = RunExecutor._prompt(saved, "Synthetic candidate CV")
    assert instruction in prompt
    assert "Synthetic job description" in prompt
    assert "LATER-CHAT-SENTINEL" not in prompt
    assert "LATER-JOB-REVISION-SENTINEL" not in prompt
    assert "job text" in policy and "untrusted source material" in policy
    assert "owner-provided task instructions" in policy
    assert "provider, model, tool, permission, approval, or sharing changes" in policy
    assert instruction not in str(view.model_dump(mode="json"))


def test_idempotency_digest_conflicts_on_changed_owner_instruction(db_session):
    project_record = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, project_record.id)
    _, job = revisions(db_session, project_record.id)
    provider_config(db_session, project_record.id)
    db_session.commit()
    service = _service(db_session)

    original = run_request(chat.id, job.id, key="owner-instruction-idempotency").model_copy(
        update={"owner_instructions": "Use a concise tone."}
    )
    first = _submit(service, actor, project_record.id, original)
    with pytest.raises(ServiceError, match="idempotency_conflict") as error:
        _submit(
            service,
            actor,
            project_record.id,
            original.model_copy(update={"owner_instructions": "Use a detailed tone."}),
        )
    assert "Use a concise tone" not in str(error.value)
    assert first.id


def test_retry_reuses_source_instruction_and_rejects_changed_intent(db_session):
    project_record = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, project_record.id)
    _, job = revisions(db_session, project_record.id)
    provider_config(db_session, project_record.id)
    db_session.commit()
    service = _service(db_session)

    instruction = "Keep the evaluation focused on role fit."
    original = _submit(
        service,
        actor,
        project_record.id,
        run_request(chat.id, job.id, key="owner-instruction-retry-source").model_copy(
            update={"owner_instructions": instruction}
        ),
    )
    with service.sessions.begin() as db:
        db.get(Run, original.id).status = "failed"

    retry_base = run_request(chat.id, job.id, key="owner-instruction-retry").model_copy(
        update={"retry_of_id": original.id}
    )
    retry = _submit(service, actor, project_record.id, retry_base)
    with service.sessions.begin() as db:
        saved_retry = db.get(Run, retry.id)
        assert saved_retry.input_snapshot["owner_instructions"] == instruction

    conflicting = retry_base.model_copy(
        update={"idempotency_key": "owner-instruction-retry-conflict", "owner_instructions": "Change the task."}
    )
    with pytest.raises(ServiceError, match="retry_input_mismatch"):
        _submit(service, actor, project_record.id, conflicting)


def test_grants_cannot_submit_or_read_owner_instructions(db_session):
    project_record = project(db_session)
    owner_actor = owner(db_session)
    chat = session(db_session, project_record.id)
    _, job = revisions(db_session, project_record.id)
    provider_config(db_session, project_record.id)
    grant_actor, _ = grant(db_session, project_record.id, capabilities=("jobs:evaluate", "results:read"))
    db_session.commit()
    service = _service(db_session)

    marker = "PRIVATE-OWNER-INSTRUCTION-SENTINEL"
    owner_view = _submit(
        service,
        owner_actor,
        project_record.id,
        run_request(chat.id, job.id, key="owner-private-run").model_copy(
            update={"owner_instructions": marker}
        ),
    )
    with service.sessions.begin() as db:
        db.get(Run, owner_view.id).status = "failed"

    with pytest.raises(ServiceError, match="unauthorized") as error:
        _submit(
            service,
            grant_actor,
            project_record.id,
            run_request(chat.id, job.id, key="grant-owner-instructions").model_copy(
                update={"owner_instructions": marker}
            ),
        )
    assert marker not in str(error.value)
    with pytest.raises(ServiceError, match="forbidden") as retry_error:
        _submit(
            service,
            grant_actor,
            project_record.id,
            run_request(chat.id, job.id, key="grant-retry-owner-instructions").model_copy(
                update={"retry_of_id": owner_view.id}
            ),
        )
    assert marker not in str(retry_error.value)
    with pytest.raises(ServiceError, match="forbidden"):
        with service.sessions.begin() as db:
            authorize(db, grant_actor, project_record.id, "read", "message")

    public_view = asyncio.run(service.get(grant_actor, project_record.id, owner_view.id))
    assert marker not in str(public_view.model_dump(mode="json"))
    grant_events = asyncio.run(_collect_events(service, grant_actor, project_record.id, owner_view.id))
    assert marker not in str(grant_events)


async def _collect_events(service, actor, project_id, run_id):
    return [event async for event in service.events(actor, project_id, run_id, after=0)]
