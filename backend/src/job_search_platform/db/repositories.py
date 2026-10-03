"""Small transactional repository operations used by later service layers."""
from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from typing import Iterator
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import (
    CVRevision, ConversationSession, JobRevision, JobSubmission, Project,
    ProjectPreference, Run,
)
from job_search_platform.services.contracts import RunRequest
from job_search_platform.services.errors import ServiceError


class Repositories:
    """Repository facade; callers own one explicit transaction per operation."""

    def __init__(self, sessions: sessionmaker[Session]):
        self.sessions = sessions

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        with self.sessions.begin() as db:
            yield db

    @staticmethod
    def project(db: Session, project_id: UUID) -> Project:
        value = db.get(Project, project_id)
        if value is None:
            raise ServiceError("not_found")
        return value

    @staticmethod
    def session(db: Session, project_id: UUID, session_id: UUID) -> ConversationSession:
        value = db.scalar(select(ConversationSession).where(
            ConversationSession.project_id == project_id,
            ConversationSession.id == session_id,
        ))
        if value is None:
            raise ServiceError("not_found")
        return value

    @staticmethod
    def current_cv_revision(db: Session, project_id: UUID) -> CVRevision:
        value = db.scalar(select(CVRevision).where(CVRevision.project_id == project_id)
                          .order_by(CVRevision.revision.desc()).limit(1).with_for_update())
        if value is None:
            raise ServiceError("cv_required")
        return value

    @staticmethod
    def job_revision(db: Session, project_id: UUID, revision_id: UUID) -> JobRevision:
        value = db.scalar(select(JobRevision).where(
            JobRevision.project_id == project_id, JobRevision.id == revision_id,
        ))
        if value is None:
            raise ServiceError("not_found")
        return value

    @staticmethod
    def preferences(db: Session, project_id: UUID) -> ProjectPreference | None:
        return db.get(ProjectPreference, project_id)

    @staticmethod
    def find_idempotent_run(db: Session, project_id: UUID, actor_scope: str,
                            key: str, digest: str) -> Run | None:
        value = db.scalar(select(Run).where(
            Run.project_id == project_id,
            Run.actor_scope == actor_scope,
            Run.idempotency_key == key,
        ))
        if value is not None and value.request_digest != digest:
            raise ServiceError("idempotency_conflict")
        return value

    @staticmethod
    def request_digest(request: RunRequest, *, resolved_cv_revision_id: UUID) -> str:
        canonical = {
            "session_id": str(request.session_id),
            "operation": request.operation,
            "cv_revision_id": str(resolved_cv_revision_id),
            "job_revision_id": str(request.job_revision_id),
            "output_language": request.output_language,
            "retry_of_id": str(request.retry_of_id) if request.retry_of_id else None,
        }
        payload = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def resolve_job_submission(db: Session, *, project_id: UUID, actor_scope: str,
                               idempotency_key: str, title: str, description: str,
                               company: str | None = None, source_url: str | None = None,
                               content_file_id: UUID | None = None) -> JobRevision:
        """Return the first job revision for this identical inline submission.

        The digest uses canonical input text, while only its hash and the
        revision reference are persisted in the reservation. The reservation,
        revision and link must be committed in the same transaction.
        """
        digest = supplied_job_digest(title=title, description=description,
                                     company=company, source_url=source_url)
        stmt = pg_insert(JobSubmission).values(
            project_id=project_id, actor_scope=actor_scope,
            idempotency_key=idempotency_key, payload_digest=digest,
        ).on_conflict_do_nothing(constraint="uq_job_submission_idempotency")
        db.execute(stmt)
        reservation = db.scalar(select(JobSubmission).where(
            JobSubmission.project_id == project_id,
            JobSubmission.actor_scope == actor_scope,
            JobSubmission.idempotency_key == idempotency_key,
        ).with_for_update())
        if reservation is None:
            raise ServiceError("not_found")
        if reservation.payload_digest != digest:
            raise ServiceError("idempotency_conflict")
        if reservation.revision_id is not None:
            revision = db.scalar(select(JobRevision).where(
                JobRevision.project_id == project_id,
                JobRevision.id == reservation.revision_id,
            ))
            if revision is None:
                raise ServiceError("not_found")
            return revision

        project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
        if project is None:
            raise ServiceError("not_found")
        next_revision = (db.scalar(select(func.coalesce(func.max(JobRevision.revision), 0) + 1)
                                   .where(JobRevision.project_id == project_id)) or 1)
        revision = JobRevision(project_id=project_id, revision=next_revision,
                               title=title, description=description, company=company, source_url=source_url,
                               content_file_id=content_file_id)
        db.add(revision)
        db.flush()
        reservation.revision_id = revision.id
        db.flush()
        return revision


def supplied_job_digest(*, title: str, description: str,
                         company: str | None = None,
                         source_url: str | None = None) -> str:
    canonical = {"title": title, "description": description,
                 "company": company, "source_url": source_url}
    payload = json.dumps(canonical, sort_keys=True, ensure_ascii=False,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
