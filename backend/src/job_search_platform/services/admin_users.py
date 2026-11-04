"""Admin view of accounts: metadata and counts only (spec D5), plus suspend, enable, reset link and delete (D6)."""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, tuple_

from job_search_platform.db.models import CV, OwnerSession, Project, Run, User
from job_search_platform.services import admin_audit
from job_search_platform.services.accounts import Accounts, admin_listed, suspend_user
from job_search_platform.services.errors import ServiceError

PAGE = 50
WINDOWS = {"1m": timedelta(minutes=1), "5m": timedelta(minutes=5), "10m": timedelta(minutes=10),
           "15m": timedelta(minutes=15), "30m": timedelta(minutes=30), "1h": timedelta(hours=1),
           "4h": timedelta(hours=4), "10h": timedelta(hours=10), "7d": timedelta(days=7),
           "30d": timedelta(days=30), "90d": timedelta(days=90), "all": None}


def short_id(user_id: UUID) -> str:
    """u_8f3a…c21: enough to tell users apart on pages that must not show an email."""
    return f"u_{user_id.hex[:4]}…{user_id.hex[-3:]}"


def _status(user: User) -> str:
    return "deleting" if user.deletion_requested_at else "suspended" if user.disabled_at else "active"


def _item(user: User, last_seen: datetime | None, runs: int) -> dict:
    return {"id": user.id, "short_id": short_id(user.id), "email": user.email, "status": _status(user),
            "email_verified": user.email_verified_at is not None, "is_admin": admin_listed(user),
            "created_at": user.created_at, "last_seen_at": last_seen, "runs_in_range": runs}


def _runs_in_range(since: datetime | None):
    query = select(Project.user_id.label("user_id"), func.count(Run.id).label("n")).join(
        Run, Run.project_id == Project.id).group_by(Project.user_id)
    return (query.where(Run.created_at >= since) if since else query).subquery()


def list_users(db, q: str | None = None, status: str | None = None, range_: str | None = None,
               cursor: str | None = None, limit: int = PAGE) -> dict:
    window = WINDOWS[range_ or "7d"]
    seen = select(OwnerSession.user_id.label("user_id"), func.max(OwnerSession.last_seen_at).label("at")).group_by(
        OwnerSession.user_id).subquery()
    runs = _runs_in_range(datetime.now(timezone.utc) - window if window else None)
    query = (select(User, seen.c.at, func.coalesce(runs.c.n, 0))
             .outerjoin(seen, seen.c.user_id == User.id).outerjoin(runs, runs.c.user_id == User.id)
             .order_by(User.created_at.desc(), User.id.desc()).limit(limit + 1))
    if q and q.strip():
        query = query.where(User.email.contains(q.strip().lower(), autoescape=True))
    if status == "deleting":
        query = query.where(User.deletion_requested_at.is_not(None))
    elif status == "suspended":
        query = query.where(User.disabled_at.is_not(None), User.deletion_requested_at.is_(None))
    elif status == "active":
        query = query.where(User.disabled_at.is_(None), User.deletion_requested_at.is_(None))
    if cursor:
        query = query.where(tuple_(User.created_at, User.id) < tuple_(*admin_audit._decode(cursor)))
    rows = db.execute(query).all()
    page = rows[:limit]
    last = page[-1][0] if len(rows) > limit else None
    nxt = base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.id}".encode()).decode() if last else None
    return {"items": [_item(u, at, n) for u, at, n in page], "next_cursor": nxt}


def _user(db, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise ServiceError("not_found")
    return user


def detail(db, user_id: UUID) -> dict:
    user = _user(db, user_id)
    last_seen = db.scalar(select(func.max(OwnerSession.last_seen_at)).where(OwnerSession.user_id == user_id))
    runs = db.scalar(select(func.count(Run.id)).join(Project, Project.id == Run.project_id).where(Project.user_id == user_id))
    cvs = db.scalar(select(func.count(CV.id)).join(Project, Project.id == CV.project_id).where(
        Project.user_id == user_id, CV.removed_at.is_(None)))
    projects = db.scalar(select(func.count(Project.id)).where(Project.user_id == user_id))
    return {"user": _item(user, last_seen, runs), "project_count": projects, "cv_count": cvs, "run_count": runs}


def _target(db, actor_id: UUID, user_id: UUID) -> User:
    user = _user(db, user_id)
    if user.id == actor_id or admin_listed(user):
        raise ServiceError("admin_target_forbidden")
    return user


def suspend(db, actor_id: UUID, user_id: UUID) -> dict:
    user = _target(db, actor_id, user_id)
    suspend_user(db, user, datetime.now(timezone.utc))
    admin_audit.record(db, actor_id, "user.suspend", "user", user_id)
    return detail(db, user_id)


def enable(db, actor_id: UUID, user_id: UUID) -> dict:
    user = _target(db, actor_id, user_id)
    if user.deletion_requested_at:
        raise ServiceError("account_deleting")  # the purge cycle will erase it; do not let it back in
    user.disabled_at = None
    admin_audit.record(db, actor_id, "user.enable", "user", user_id)
    return detail(db, user_id)


def reset_password(sessions, accounts: Accounts, actor_id: UUID, user_id: UUID) -> None:
    """Emails the owner a reset link through the normal flow; the token never leaves the mail."""
    with sessions.begin() as db:
        mail = accounts.send_reset_link(db, _target(db, actor_id, user_id))
        admin_audit.record(db, actor_id, "user.reset_password", "user", user_id)
    accounts._send(*mail)


def delete(sessions, accounts: Accounts, actor_id: UUID, user_id: UUID, confirm_email: str) -> None:
    with sessions.begin() as db:
        user = _target(db, actor_id, user_id)
        if confirm_email.strip().lower() != user.email.lower():
            raise ServiceError("confirmation_mismatch")
        accounts.mark_deleted(db, user_id, datetime.now(timezone.utc))
        admin_audit.record(db, actor_id, "user.delete", "user", user_id)
