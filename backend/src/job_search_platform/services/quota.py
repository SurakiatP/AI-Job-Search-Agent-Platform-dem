"""Owner verification gate and per-user daily run quota."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from job_search_platform.db.models import Project, Run, User
from job_search_platform.services.errors import ServiceError


def require_verified_owner(db: Session, project_id: UUID) -> UUID:
    """Lock the project's owner row; reject unverified or disabled owners."""
    user = db.scalar(select(User).join(Project, Project.user_id == User.id)
                     .where(Project.id == project_id).with_for_update(of=User))
    if user is None:
        raise ServiceError("not_found")
    if user.disabled_at is not None:
        raise ServiceError("unauthorized")
    if user.email_verified_at is None:
        raise ServiceError("email_unverified")
    return user.id


# CR-IVP-01: interview practice runs have their own daily quota and never use the main one.
PRACTICE_OPERATIONS = ("interview_generate", "interview_grade", "interview_report")


def enforce_run_gates(db: Session, project_id: UUID, *, now: datetime | None = None, practice: bool = False) -> None:
    """Verification gate, then the owner's daily quota; the user-row lock serializes the count."""
    from job_search_platform.services.approvals import budget_day_start  # approvals imports runs, which imports this

    now = now or datetime.now(timezone.utc)
    user_id = require_verified_owner(db, project_id)
    start = budget_day_start(now)
    kind = Run.operation.in_(PRACTICE_OPERATIONS)
    used = db.scalar(select(func.count()).select_from(Run).join(Project, Project.id == Run.project_id)
                     .where(Project.user_id == user_id, Run.created_at >= start, kind if practice else ~kind)) or 0
    name, default = ("USER_DAILY_PRACTICE_QUOTA", "60") if practice else ("USER_DAILY_RUN_QUOTA", "30")
    if used >= int(os.environ.get(name, default)):
        raise ServiceError("quota_exceeded", fields={"reset_at": (start + timedelta(days=1)).isoformat()})
