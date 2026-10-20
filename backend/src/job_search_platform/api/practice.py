"""Interview practice routes (CR-IVP-01). Owner only; grants and other projects get 404/403."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import delete, func, select

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.db.models import (PRACTICE_SECTIONS, ConversationSession, InterviewAttempt, InterviewQuestion,
                                           InterviewSet, Project, Run)
from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.services import practice as pr
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.quota import enforce_run_gates
from job_search_platform.services.runs import MAX_QUEUED_PER_PROJECT, actor_scope, append_event

router = APIRouter()
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SectionChoice(_Body):
    id: Literal[PRACTICE_SECTIONS]  # type: ignore[valid-type]
    count: int = Field(ge=1, le=pr.MAX_PER_SECTION)


class SetCreate(_Body):
    name: Name | None = None
    level: Literal["entry", "mid", "senior"] = "mid"
    output_language: Literal["th", "en"] = "th"
    sections: list[SectionChoice] = Field(min_length=1, max_length=len(PRACTICE_SECTIONS))

    @field_validator("sections")
    @classmethod
    def check_sections(cls, value: list[SectionChoice]) -> list[SectionChoice]:
        if len({s.id for s in value}) != len(value):
            raise ValueError("duplicate_section")
        if sum(s.count for s in value) > pr.MAX_PER_SET:
            raise ValueError("too_many_questions")
        return value


class SetUpdate(_Body):
    name: Name


class QuestionUpdate(_Body):
    ready: bool | None = None
    card_rating: Literal["know", "learning"] | None = None


class AttemptCreate(_Body):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


def _owner(actor) -> None:
    if actor.kind != "user":
        raise ServiceError("forbidden")


def _session(db, project_id: UUID, session_id: UUID) -> ConversationSession:
    row = db.scalar(select(ConversationSession).where(
        ConversationSession.project_id == project_id, ConversationSession.id == session_id,
        ConversationSession.removed_at.is_(None)))
    if row is None:
        raise ServiceError("not_found")
    return row


def _set(db, project_id: UUID, set_id: UUID, *, deleted: bool = False, lock: bool = False) -> InterviewSet:
    query = select(InterviewSet).where(InterviewSet.project_id == project_id, InterviewSet.id == set_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None or (row.deleted_at is not None) != deleted:
        raise ServiceError("not_found")
    _session(db, project_id, row.session_id)  # a trashed session hides its sets
    return row


def _question(db, project_id: UUID, question_id: UUID) -> InterviewQuestion:
    row = db.scalar(select(InterviewQuestion).where(InterviewQuestion.project_id == project_id,
                                                    InterviewQuestion.id == question_id).with_for_update())
    if row is None:
        raise ServiceError("not_found")
    _set(db, project_id, row.set_id)
    return row


def _queue_run(db, actor, project_id: UUID, session: ConversationSession, row: InterviewSet, language: str) -> None:
    """Queue interview_generate for the set. The caller holds the project lock."""
    if (db.scalar(select(func.count()).select_from(Run).where(Run.project_id == project_id, Run.status == "queued")) or 0) >= MAX_QUEUED_PER_PROJECT:
        raise ServiceError("queue_full", retryable=True)
    gateway = GatewaySettings.from_env()
    if not gateway.api_key:
        raise ServiceError("gateway_unconfigured")
    enforce_run_gates(db, project_id, practice=True)
    now, key = datetime.now(timezone.utc), uuid4().hex
    run = Run(project_id=project_id, actor_scope=actor_scope(actor), idempotency_key=key,
              request_digest=hashlib.sha256(json.dumps({"interview_generate": str(row.id), "key": key}).encode()).hexdigest(),
              operation="interview_generate", session_id=session.id, cv_revision_id=session.cv_revision_id,
              job_revision_id=session.job_revision_id, input_snapshot={"set_id": str(row.id)},
              config_snapshot=gateway.snapshot(), output_language=language, status="queued", created_at=now)
    db.add(run)
    db.flush()
    append_event(db, run, "run_queued", {"status": "queued"}, now=now)
    row.run_id = run.id


def _lock_project(db, project_id: UUID) -> None:
    if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
        raise ServiceError("not_found")


@router.get("/projects/{project_id}/sessions/{session_id}/practice-sets")
async def list_sets(project_id: UUID, session_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "session")
        _session(db, project_id, session_id)
        rows = db.scalars(select(InterviewSet).where(
            InterviewSet.project_id == project_id, InterviewSet.session_id == session_id, InterviewSet.deleted_at.is_(None))
            .order_by(InterviewSet.created_at.desc(), InterviewSet.id)).all()
        return [pr.set_view(db, row) for row in rows]


@router.post("/projects/{project_id}/sessions/{session_id}/practice-sets", status_code=201)
async def create_set(project_id: UUID, session_id: UUID, body: SetCreate, actor=Depends(write_actor),
                     services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        _lock_project(db, project_id)
        session = _session(db, project_id, session_id)
        if session.cv_revision_id is None:
            raise ServiceError("session_pair_required")
        live = db.scalar(select(func.count()).select_from(InterviewSet).where(
            InterviewSet.project_id == project_id, InterviewSet.session_id == session_id,
            InterviewSet.deleted_at.is_(None))) or 0
        if live >= pr.MAX_SETS_PER_SESSION:
            raise ServiceError("practice_set_limit")
        row = InterviewSet(project_id=project_id, session_id=session_id, name=body.name or f"ชุดซ้อม {live + 1}",
                           level=body.level, sections=[s.model_dump() for s in body.sections], reverse_questions=[])
        db.add(row)
        db.flush()
        _queue_run(db, actor, project_id, session, row, body.output_language)
        return pr.set_view(db, row)


@router.get("/projects/{project_id}/practice-sets/{set_id}")
async def get_set(project_id: UUID, set_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "session")
        row = _set(db, project_id, set_id)
        questions = db.scalars(select(InterviewQuestion).where(InterviewQuestion.set_id == row.id)
                               .order_by(InterviewQuestion.position)).all()
        attempts: dict[UUID, list[InterviewAttempt]] = {}
        if questions:
            for attempt in db.scalars(select(InterviewAttempt).where(
                    InterviewAttempt.question_id.in_([q.id for q in questions]))
                    .order_by(InterviewAttempt.created_at.desc(), InterviewAttempt.id.desc())):
                attempts.setdefault(attempt.question_id, []).append(attempt)
        return {**pr.set_view(db, row), "reverse_questions": row.reverse_questions,
                "questions": [pr.question_view(q, attempts.get(q.id, [])) for q in questions]}


@router.patch("/projects/{project_id}/practice-sets/{set_id}")
async def rename_set(project_id: UUID, set_id: UUID, body: SetUpdate, actor=Depends(write_actor),
                     services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        row = _set(db, project_id, set_id, lock=True)
        row.name = body.name
        db.flush()
        return pr.set_view(db, row)


@router.delete("/projects/{project_id}/practice-sets/{set_id}", status_code=204)
async def delete_set(project_id: UUID, set_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Hide the set (undo with restore). Owner decision 2026-10-20: practice sets do not go to the project trash."""
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        _set(db, project_id, set_id, lock=True).deleted_at = datetime.now(timezone.utc)
    return Response(status_code=204)


@router.post("/projects/{project_id}/practice-sets/{set_id}/restore")
async def restore_set(project_id: UUID, set_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        row = _set(db, project_id, set_id, deleted=True, lock=True)
        row.deleted_at = None
        db.flush()
        return pr.set_view(db, row)


@router.post("/projects/{project_id}/practice-sets/{set_id}/retry")
async def retry_set(project_id: UUID, set_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Generate the questions again after a failed run."""
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        _lock_project(db, project_id)
        row = _set(db, project_id, set_id, lock=True)
        if pr.status(db, row) != "failed":
            raise ServiceError("practice_set_busy")
        language = db.scalar(select(Run.output_language).where(Run.id == row.run_id)) if row.run_id else None
        _queue_run(db, actor, project_id, _session(db, project_id, row.session_id), row, language or "th")
        return pr.set_view(db, row)


@router.patch("/projects/{project_id}/practice-questions/{question_id}")
async def update_question(project_id: UUID, question_id: UUID, body: QuestionUpdate, actor=Depends(write_actor),
                          services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        row = _question(db, project_id, question_id)
        if body.ready is not None:
            row.ready = body.ready
        if "card_rating" in body.model_fields_set:
            row.card_rating = body.card_rating
        db.flush()
        return pr.question_view(row, [])


@router.post("/projects/{project_id}/practice-questions/{question_id}/attempts", status_code=201)
async def add_attempt(project_id: UUID, question_id: UUID, body: AttemptCreate, actor=Depends(write_actor),
                      services: Services = Depends(get_services)):
    _owner(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        row = _question(db, project_id, question_id)
        attempt = InterviewAttempt(question_id=row.id, project_id=project_id, answer=body.answer,
                                   created_at=func.clock_timestamp())
        db.add(attempt)
        db.flush()
        keep = select(InterviewAttempt.id).where(InterviewAttempt.question_id == row.id).order_by(
            InterviewAttempt.created_at.desc(), InterviewAttempt.id.desc()).limit(pr.MAX_ATTEMPTS)
        db.execute(delete(InterviewAttempt).where(InterviewAttempt.question_id == row.id, InterviewAttempt.id.not_in(keep)))
        db.refresh(attempt)
        return {"id": attempt.id, "answer": attempt.answer, "feedback": None, "created_at": attempt.created_at}
