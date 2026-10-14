"""FR-J05 saved searches: per-project job-search filters with a scheduled email digest.

Owner REST routes call the sync methods through asyncio.to_thread; the supervisor's housekeeping step
calls housekeeping(). Agents never reach this module (owner-only resource "saved_search").
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Project, ProjectPreference, SavedSearch, User
from job_search_platform.services import job_sources, rate_limits
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor, DigestStatusView, SavedSearchCreate, SavedSearchListView, SavedSearchUpdate, SavedSearchView,
)
from job_search_platform.services.errors import ServiceError

logger = logging.getLogger("jsp.digests")

BANGKOK = ZoneInfo("Asia/Bangkok")
SEND_HOUR = 8
MAX_PER_PROJECT = 10


def next_slot(now: datetime, frequency: str) -> datetime:
    """The next 08:00 Asia/Bangkok strictly after ``now`` (weekly: Monday), returned in UTC."""
    local = now.astimezone(BANGKOK)
    slot = local.replace(hour=SEND_HOUR, minute=0, second=0, microsecond=0)
    step = timedelta(days=7 if frequency == "weekly" else 1)
    if frequency == "weekly":
        slot += timedelta(days=(0 - slot.weekday()) % 7)
    while slot <= local:
        slot += step
    return slot.astimezone(timezone.utc)


def _new_token() -> tuple[str, bytes]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).digest()


def _view(row: SavedSearch) -> SavedSearchView:
    return SavedSearchView(id=row.id, name=row.name, filters=row.filters, frequency=row.frequency,
                           digest_enabled=row.digest_enabled, next_run_at=row.next_run_at,
                           last_sent_at=row.last_sent_at, created_at=row.created_at)


class SavedSearches:
    def __init__(self, sessions, mailer, *, public_origin: str, search=None):
        self.sessions = sessions
        self.mailer = mailer
        self.public_origin = public_origin.rstrip("/")
        self.search = search or job_sources.search_jobs

    @staticmethod
    def _row(db, project_id: UUID, saved_search_id: UUID) -> SavedSearch:
        row = db.scalar(select(SavedSearch).where(SavedSearch.project_id == project_id,
                                                  SavedSearch.id == saved_search_id).with_for_update())
        if row is None:
            raise ServiceError("not_found")
        return row

    @staticmethod
    def _gates(db, project_id: UUID) -> tuple[User | None, bool]:
        """The project owner and whether project notifications are on (default on)."""
        found = db.execute(select(User, ProjectPreference.values).join(Project, Project.user_id == User.id)
                           .outerjoin(ProjectPreference, ProjectPreference.project_id == Project.id)
                           .where(Project.id == project_id)).first()
        if found is None:
            return None, False
        account, values = found
        return account, (values or {}).get("notifications_enabled", True) is not False

    def list(self, actor: Actor, project_id: UUID) -> SavedSearchListView:
        with self.sessions() as db:
            authorize(db, actor, project_id, "read", "saved_search")
            rows = db.scalars(select(SavedSearch).where(SavedSearch.project_id == project_id)
                              .order_by(SavedSearch.created_at, SavedSearch.id)).all()
            account, notifications = self._gates(db, project_id)
            status = DigestStatusView(email_verified=bool(account and account.email_verified_at),
                                      notifications_enabled=notifications)
            return SavedSearchListView(items=tuple(_view(r) for r in rows), status=status)

    def create(self, actor: Actor, project_id: UUID, body: SavedSearchCreate, *, now: datetime | None = None) -> SavedSearchView:
        now = now or datetime.now(timezone.utc)
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                db.execute(select(Project.id).where(Project.id == project_id).with_for_update())  # serialise the cap
                count = db.scalar(select(func.count()).select_from(SavedSearch).where(SavedSearch.project_id == project_id))
                if count >= MAX_PER_PROJECT:
                    raise ServiceError("saved_search_limit")
                _, digest = _new_token()
                row = SavedSearch(project_id=project_id, name=body.name, filters=body.filters.model_dump(mode="json"),
                                  frequency=body.frequency, unsubscribe_token_hash=digest,
                                  next_run_at=next_slot(now, body.frequency), created_at=now)
                db.add(row)
                db.flush()
                return _view(row)
        except IntegrityError:
            raise ServiceError("saved_search_name_taken") from None

    def update(self, actor: Actor, project_id: UUID, saved_search_id: UUID, body: SavedSearchUpdate,
               *, now: datetime | None = None) -> SavedSearchView:
        now = now or datetime.now(timezone.utc)
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                row = self._row(db, project_id, saved_search_id)
                reschedule = False
                if body.name is not None:
                    row.name = body.name
                if body.frequency is not None and body.frequency != row.frequency:
                    row.frequency, reschedule = body.frequency, True
                if body.digest_enabled is not None and body.digest_enabled != row.digest_enabled:
                    row.digest_enabled = body.digest_enabled
                    reschedule = reschedule or body.digest_enabled  # never fire at once for a stale slot
                if reschedule:
                    row.next_run_at = next_slot(now, row.frequency)
                db.flush()
                return _view(row)
        except IntegrityError:
            raise ServiceError("saved_search_name_taken") from None

    def delete(self, actor: Actor, project_id: UUID, saved_search_id: UUID) -> None:
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "saved_search")
            db.delete(self._row(db, project_id, saved_search_id))

    def unsubscribe(self, token: str, ip: str) -> None:
        with self.sessions.begin() as db:
            rate_limits.hit(db, "digest_unsubscribe_ip", ip)
        with self.sessions.begin() as db:
            row = db.scalar(select(SavedSearch).where(
                SavedSearch.unsubscribe_token_hash == hashlib.sha256(token.encode()).digest()).with_for_update())
            if row is None:
                raise ServiceError("invalid_token")
            row.digest_enabled = False
