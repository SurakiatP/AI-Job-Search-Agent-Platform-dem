"""FR-J05 saved searches: per-project job-search filters with a scheduled email digest.

Owner REST routes call the sync methods through asyncio.to_thread; the supervisor's housekeeping step
calls housekeeping(). Agents never reach this module (owner-only resource "saved_search").
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, true
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Project, ProjectPreference, SavedSearch, SavedSearchSeen, User
from job_search_platform.integrations.mailer import Mail
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


DIGEST_DAYS = 7
DIGEST_LIMIT = 20
SEEN_RETENTION = timedelta(days=90)
DUE_BATCH = 20

DIGEST_MESSAGES = {
    "en": {"subject": "{n} new jobs: {name}", "empty_subject": "No new jobs right now: {name}",
           "intro": "New jobs for your saved search “{name}”:", "empty": "There are no new jobs for “{name}” right now.",
           "stale": "possibly stale", "age": "{d} days ago", "today": "today",
           "open": "See all results in the app:", "stop": "Stop this digest:"},
    "th": {"subject": "งานใหม่ {n} ตำแหน่ง: {name}", "empty_subject": "ยังไม่มีงานใหม่: {name}",
           "intro": "งานใหม่สำหรับการค้นหาที่บันทึกไว้ “{name}”:", "empty": "ตอนนี้ยังไม่มีงานใหม่สำหรับ “{name}”",
           "stale": "อาจเป็นประกาศเก่า", "age": "{d} วันก่อน", "today": "วันนี้",
           "open": "ดูผลทั้งหมดในแอป:", "stop": "หยุดรับสรุปนี้:"},
}


def render_digest(locale: str, name: str, items: list[dict], app_link: str, unsubscribe_link: str) -> tuple[str, str]:
    m = DIGEST_MESSAGES.get(locale, DIGEST_MESSAGES["en"])
    lines: list[str] = []
    for number, item in enumerate(items, 1):
        age = item.get("age_days")
        detail = " · ".join(part for part in (
            item.get("company"), ", ".join(item.get("cities") or []) or None,
            (m["today"] if age == 0 else m["age"].format(d=age)) if isinstance(age, int) else None,
            m["stale"] if item.get("stale") else None) if part)
        lines.append(f"{number}. {item['title']}")
        if detail:
            lines.append(f"   {detail}")
        if item.get("source_url"):
            lines.append(f"   {item['source_url']}")
    head = m["intro"].format(name=name) if items else m["empty"].format(name=name)
    subject = m["subject"].format(n=len(items), name=name) if items else m["empty_subject"].format(name=name)
    return subject, "\n".join([head, "", *lines, "", m["open"], app_link, "", m["stop"], unsubscribe_link])


def _query(filters: dict) -> str:
    """Search-page URL query for stored filters (lists comma-joined, empty values dropped)."""
    pairs = []
    for key, value in filters.items():
        text = ",".join(value) if isinstance(value, list) else ("" if value is None else str(value))
        if text:
            pairs.append((key, text))
    return urlencode(pairs)


class _SendFailed(Exception):
    pass


def _deliverable(account: User | None, notifications: bool) -> bool:
    return account is not None and account.email_verified_at is not None and account.disabled_at is None and notifications


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

    def collect(self, db, row: SavedSearch, *, exclude_seen: bool = True) -> list[dict]:
        page = self.search(**row.filters, posted_within_days=DIGEST_DAYS, limit=DIGEST_LIMIT, offset=0)
        seen = set(db.scalars(select(SavedSearchSeen.slug).where(SavedSearchSeen.saved_search_id == row.id))) \
            if exclude_seen else set()
        items, slugs = [], set()
        for item in page["items"]:
            slug = item.get("slug")
            if not slug or slug in seen or slug in slugs:
                continue
            slugs.add(slug)
            items.append(item)
        return items[:DIGEST_LIMIT]

    def _mail(self, account: User, row: SavedSearch, items: list[dict]) -> None:
        """Rotate the unsubscribe token and send; raises _SendFailed when no mail can go out."""
        if self.mailer is None:
            logger.warning("mail_disabled", extra={"kind": "digest"})
            raise _SendFailed
        token, digest = _new_token()
        row.unsubscribe_token_hash = digest
        app_link = f"{self.public_origin}/app/projects/{row.project_id}/search?{_query(row.filters)}"
        subject, text = render_digest(account.locale, row.name, items, app_link,
                                      f"{self.public_origin}/digest/unsubscribe?token={token}")
        try:
            self.mailer.send(Mail(account.email, subject, text))
        except Exception:  # noqa: BLE001 - delivery failure must not record the digest as sent
            logger.warning("digest_send_failed", extra={"saved_search_id": str(row.id)})
            raise _SendFailed from None

    def _run_one(self, now: datetime, done: set) -> tuple[UUID, int] | None:
        row_id = None
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(SavedSearch).where(
                    SavedSearch.digest_enabled, SavedSearch.next_run_at <= now,
                    SavedSearch.id.not_in(done) if done else true(),
                ).order_by(SavedSearch.next_run_at).limit(1).with_for_update(skip_locked=True))
                if row is None:
                    return None
                row_id = row.id
                account, notifications = self._gates(db, row.project_id)
                if not _deliverable(account, notifications):
                    row.next_run_at = next_slot(now, row.frequency)
                    return row_id, 0
                try:
                    items = self.collect(db, row)
                except ServiceError:
                    logger.warning("digest_source_failed", extra={"saved_search_id": str(row_id)})
                    return row_id, 0  # next_run_at unchanged: the next housekeeping tick retries
                if items:
                    self._mail(account, row, items)
                    db.execute(pg_insert(SavedSearchSeen).values(
                        [{"saved_search_id": row_id, "slug": item["slug"], "seen_at": now} for item in items]
                    ).on_conflict_do_nothing())
                    row.last_sent_at = now
                row.next_run_at = next_slot(now, row.frequency)
                return row_id, 1 if items else 0
        except Exception as exc:  # noqa: BLE001 - one poison row must not starve the others
            if not isinstance(exc, _SendFailed):
                logger.warning("digest_failed", extra={"saved_search_id": str(row_id), "error": type(exc).__name__})
            # rolled back: no seen rows, no token change, same next_run_at; None row_id means selection itself failed
            return None if row_id is None else (row_id, 0)

    async def run_due(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        done: set = set()
        sent = 0
        for _ in range(DUE_BATCH):
            result = await asyncio.to_thread(self._run_one, now, done)
            if result is None:
                break
            done.add(result[0])
            sent += result[1]
        return sent

    def preview(self, actor: Actor, project_id: UUID, saved_search_id: UUID) -> None:
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                row = self._row(db, project_id, saved_search_id)
                account, _ = self._gates(db, project_id)
                if account is None or account.email_verified_at is None:
                    raise ServiceError("email_unverified")
                rate_limits.hit(db, "digest_preview", str(actor.user_id))
                self._mail(account, row, self.collect(db, row, exclude_seen=False))
        except _SendFailed:
            raise ServiceError("mail_unavailable", retryable=True) from None

    def prune_seen(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            return db.execute(delete(SavedSearchSeen).where(SavedSearchSeen.seen_at < now - SEEN_RETENTION)).rowcount

    async def housekeeping(self) -> int:
        try:
            return await self.run_due()
        finally:
            await asyncio.to_thread(self.prune_seen)
