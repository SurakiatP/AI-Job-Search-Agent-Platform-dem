"""In-app notifications: written in the transaction of the run event or digest that causes them."""
from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from job_search_platform.db.models import CVRevision, InterviewSet, JobRevision, Notification, Project, Run

RETENTION = timedelta(days=30)
MAX_PER_USER = 200
KINDS = {"run_completed", "run_failed", "run_needs_input", "run_waiting_approval"}
# completed/failed only for these; needs_input and waiting_approval for any operation.
OUTCOME_OPERATIONS = {"evaluate_job", "draft_documents", "tailor_cv", "apply_prepare", "extract_experience", "profile_cv",
                      "draft_follow_up", "interview_generate", "interview_report"}


def _view(row: Notification) -> dict:
    return {"id": row.id, "project_id": row.project_id, "kind": row.kind, "run_id": row.run_id, "data": row.data,
            "created_at": row.created_at, "read_at": row.read_at}


def _insert(db: Session, user_id: UUID, project_id: UUID, kind: str, run_id: UUID | None, data: dict, now: datetime) -> None:
    stmt = pg_insert(Notification).values(id=uuid4(), user_id=user_id, project_id=project_id, kind=kind, run_id=run_id,
                                          data=data, created_at=now)
    if run_id is not None:
        stmt = stmt.on_conflict_do_nothing(index_elements=["run_id", "kind"], index_where=Notification.run_id.is_not(None))
    db.execute(stmt)
    keep = select(Notification.id).where(Notification.user_id == user_id).order_by(
        Notification.created_at.desc(), Notification.id).limit(MAX_PER_USER)
    db.execute(delete(Notification).where(Notification.user_id == user_id, Notification.id.not_in(keep)))


def record_run_event(db: Session, run: Run, event_type: str, now: datetime) -> None:
    kind = event_type if event_type in KINDS else None
    if kind is None:
        return
    if kind in ("run_completed", "run_failed") and run.operation not in OUTCOME_OPERATIONS:
        return
    user_id = db.scalar(select(Project.user_id).where(Project.id == run.project_id))
    if user_id is None:  # legacy single-owner mode
        return
    data: dict = {"operation": run.operation}
    if run.session_id is not None:
        data["session_id"] = str(run.session_id)
    if run.job_revision_id is not None:
        job = db.scalar(select(JobRevision).where(JobRevision.id == run.job_revision_id))
        data["job_revision_id"] = str(run.job_revision_id)
        if job is not None:
            data["job_title"], data["job_company"] = job.title, job.company
    cv_id = db.scalar(select(CVRevision.cv_id).where(CVRevision.id == run.cv_revision_id))
    if cv_id is not None:
        data["cv_id"] = str(cv_id)
    if run.operation in ("interview_generate", "interview_report"):
        practice = db.scalar(select(InterviewSet.id).where(InterviewSet.run_id == run.id))
        if practice is not None:
            data["practice_set_id"] = str(practice)
    _insert(db, user_id, run.project_id, kind, run.id, data, now)


def record_digest(db: Session, project_id: UUID, saved_search_id: UUID, name: str, count: int, now: datetime) -> None:
    user_id = db.scalar(select(Project.user_id).where(Project.id == project_id))
    if user_id is None or count < 1:
        return
    _insert(db, user_id, project_id, "digest_ready", None,
            {"saved_search_id": str(saved_search_id), "saved_search_name": name, "count": count}, now)


def unread_count(db: Session, user_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0


def list_for_user(db: Session, user_id: UUID, limit: int = 30) -> dict:
    rows = db.scalars(select(Notification).where(Notification.user_id == user_id).order_by(
        Notification.created_at.desc(), Notification.id).limit(limit)).all()
    return {"items": [_view(row) for row in rows], "unread_count": unread_count(db, user_id)}


def mark_read(db: Session, user_id: UUID, ids: list[UUID] | None, now: datetime) -> dict:
    """ids=None marks all. Ids of other users match nothing."""
    stmt = update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    if ids is not None:
        stmt = stmt.where(Notification.id.in_(ids))
    db.execute(stmt.values(read_at=now))
    return {"unread_count": unread_count(db, user_id)}


def prune(db: Session, now: datetime) -> int:
    return db.execute(delete(Notification).where(Notification.created_at < now - RETENTION)).rowcount
