"""Atomic external-job intake without exposing owner input CRUD or history."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID, uuid5

from pydantic import StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import ConversationSession, Project
from job_search_platform.db.repositories import Repositories
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import Actor, DTO, JobCreate, RunRequest, RunView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService, actor_scope, lock_current_grant


class ProtocolJobInput(DTO):
    job: JobCreate | None = None
    job_revision_id: UUID | None = None
    cv_id: UUID | None = None
    output_language: Literal["th", "en"]
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    @model_validator(mode="after")
    def validate_intent(self):
        if (self.job is None) == (self.job_revision_id is None):
            raise ValueError("exactly_one_job_source_required")
        if not self.idempotency_key.strip():
            raise ValueError("idempotency_key_required")
        if self.job is not None and not self.job.description.strip():
            raise ValueError("job_description_required")
        return self


class ProtocolRuns:
    """Bind project and session from the current grant, then admit one run."""

    def __init__(self, sessions: sessionmaker[Session]):
        self.sessions = sessions
        self.runs = RunService(sessions)

    async def submit(
        self, actor: Actor, operation: Literal["evaluate_job", "draft_documents"],
        request: ProtocolJobInput,
    ) -> RunView:
        if actor.kind != "grant" or actor.project_id is None or actor.grant_id is None:
            raise ServiceError("forbidden")
        if operation not in ("evaluate_job", "draft_documents"):
            raise ServiceError("forbidden")
        return await asyncio.to_thread(self._submit, actor, operation, request)

    def _submit(self, actor: Actor, operation: str, request: ProtocolJobInput) -> RunView:
        project_id = actor.project_id
        scope = actor_scope(actor)
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            # Serialize reservation, session creation and admission in the same
            # Project -> grant -> run order used by the normal run service.
            project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
            if project is None:
                raise ServiceError("not_found")
            authorize(db, actor, project_id, "write", operation)
            lock_current_grant(db, actor, project_id, now)
            grant_session_id = uuid5(project_id, "external-agent:" + scope)
            grant_session = db.get(ConversationSession, grant_session_id)
            if grant_session is None:
                db.add(ConversationSession(id=grant_session_id, project_id=project_id, title="External agent"))
                db.flush()
            elif grant_session.project_id != project_id:
                raise ServiceError("not_found")

            if request.job is not None:
                job = Repositories.resolve_job_submission(
                    db, project_id=project_id, actor_scope=scope,
                    idempotency_key=request.idempotency_key,
                    **request.job.model_dump(),
                )
            else:
                job = Repositories.job_revision(db, project_id, request.job_revision_id)
            run_request = RunRequest(
                session_id=grant_session_id, operation=operation,
                job_revision_id=job.id, cv_id=request.cv_id, output_language=request.output_language,
                idempotency_key=request.idempotency_key,
            )
            # Failure rolls back every newly created row, including reservations.
            return self.runs._submit_in_transaction(
                db, actor, project_id, run_request, now=now, scope=scope,
            )
