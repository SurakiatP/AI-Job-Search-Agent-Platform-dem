"""Atomic, project-bound intake shared by the external protocol adapters."""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, session
from job_search_platform.db.models import ConversationSession, JobRevision, JobSubmission, Message, Run
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns


def _context(db, *, cv=True, provider=True):
    local_owner = owner(db)
    p = project(db)
    actor, token = grant(db, p.id, capabilities=("jobs:evaluate", "documents:draft", "results:read"))
    private_chat = session(db, p.id, "Private owner conversation")
    db.add(Message(project_id=p.id, session_id=private_chat.id, role="user", content="SYNTHETIC_OWNER_HISTORY_ONLY"))
    job = revisions(db, p.id)[1] if cv else None
    if provider:
        provider_config(db, p.id)
    db.commit()
    return ProtocolRuns(sessionmaker(bind=db.get_bind(), expire_on_commit=False)), actor, token, p, private_chat, job, local_owner


def _input(key="protocol-intent", **changes):
    payload = {
        "job": {"title": "Synthetic analyst", "description": "Synthetic SQL and analysis posting", "company": "Synthetic company"},
        "output_language": "th",
        "idempotency_key": key,
    }
    payload.update(changes)
    return ProtocolJobInput.model_validate(payload)


def _counts(db):
    return tuple(db.scalar(select(func.count()).select_from(model)) for model in (ConversationSession, JobRevision, JobSubmission, Run))


def test_inline_replay_uses_one_job_run_and_private_grant_session(db_session):
    service, actor, _, p, private_chat, _, _ = _context(db_session)
    before = _counts(db_session)
    first = asyncio.run(service.submit(actor, "evaluate_job", _input()))
    replay = asyncio.run(service.submit(actor, "evaluate_job", _input()))
    assert first.id == replay.id
    assert first.output_language == "th"
    assert _counts(db_session) == tuple(value + 1 for value in before)
    stored = db_session.get(Run, first.id)
    assert stored.project_id == p.id
    assert stored.session_id != private_chat.id
    assert "SYNTHETIC_OWNER_HISTORY_ONLY" not in json.dumps(stored.input_snapshot)


@pytest.mark.parametrize("change", ["job", "language"])
def test_reused_key_with_changed_intent_is_conflict_without_new_rows(db_session, change):
    service, actor, *_ = _context(db_session)
    first = asyncio.run(service.submit(actor, "evaluate_job", _input()))
    before = _counts(db_session)
    request = _input(job={"title": "Different synthetic job", "description": "Different posting"}) if change == "job" else _input(output_language="en")
    with pytest.raises(ServiceError) as error:
        asyncio.run(service.submit(actor, "evaluate_job", request))
    assert error.value.code == "idempotency_conflict"
    assert _counts(db_session) == before
    assert db_session.get(Run, first.id).output_language == "th"


@pytest.mark.parametrize("missing", ["cv", "provider"])
def test_failed_admission_rolls_back_job_reservation_and_session(db_session, missing):
    service, actor, *_ = _context(db_session, cv=missing != "cv", provider=missing != "provider")
    before = _counts(db_session)
    with pytest.raises(ServiceError):
        asyncio.run(service.submit(actor, "evaluate_job", _input()))
    assert _counts(db_session) == before


def test_concurrent_replay_creates_one_durable_intent(db_session):
    service, actor, *_ = _context(db_session)
    before = _counts(db_session)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(asyncio.run, service.submit(actor, "evaluate_job", _input())) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert results[0].id == results[1].id
    assert _counts(db_session) == tuple(value + 1 for value in before)


def test_other_grant_gets_separate_session_and_foreign_job_is_denied(db_session):
    service, first_actor, _, p, private_chat, _, _ = _context(db_session)
    second_actor, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    other = project(db_session, "Other synthetic project")
    _, foreign_job = revisions(db_session, other.id)
    db_session.commit()
    first = asyncio.run(service.submit(first_actor, "evaluate_job", _input()))
    second = asyncio.run(service.submit(second_actor, "evaluate_job", _input()))
    sessions = {db_session.get(Run, result.id).session_id for result in (first, second)}
    assert len(sessions) == 2 and private_chat.id not in sessions
    before = _counts(db_session)
    with pytest.raises(ServiceError):
        asyncio.run(service.submit(first_actor, "evaluate_job", _input("foreign", job=None, job_revision_id=foreign_job.id)))
    assert _counts(db_session) == before


def test_revoked_and_owner_actors_cannot_use_grant_intake(db_session):
    service, actor, token, _, _, _, local_owner = _context(db_session)
    token.revoked_at = datetime.now(timezone.utc)
    db_session.commit()
    before = _counts(db_session)
    for denied in (actor, local_owner):
        with pytest.raises(ServiceError):
            asyncio.run(service.submit(denied, "evaluate_job", _input()))
    assert _counts(db_session) == before


def test_protocol_input_cannot_select_project_session_or_credentials():
    for field in ("project_id", "session_id", "provider", "api_key"):
        with pytest.raises(ValidationError):
            _input(**{field: "synthetic-extra-sentinel"})
    with pytest.raises(ValidationError):
        _input(job=None)
    with pytest.raises(ValidationError):
        _input(job_revision_id="17d87cae-ed0c-4a74-b814-0e105c9f959a")


def test_removed_job_revision_cannot_start_protocol_runs_but_inline_replay_still_works(db_session):
    service, actor, _, p, _, job, _ = _context(db_session)
    first = asyncio.run(service.submit(actor, "evaluate_job", _input()))
    job.removed_at = datetime.now(timezone.utc)
    db_session.commit()
    before = _counts(db_session)
    for operation in ("evaluate_job", "draft_documents"):
        with pytest.raises(ServiceError) as error:
            asyncio.run(service.submit(actor, operation, ProtocolJobInput.model_validate({
                "job_revision_id": str(job.id), "output_language": "en", "idempotency_key": f"removed-{operation}"})))
        assert error.value.code == "job_removed"
    assert _counts(db_session) == before
    assert asyncio.run(service.submit(actor, "evaluate_job", _input())).id == first.id
