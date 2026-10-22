"""User sessions bound to APP_PUBLIC_ORIGIN, with persisted state and CSRF."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import secrets
from urllib.parse import urlsplit

from uuid import UUID

from sqlalchemy import select, update

from job_search_platform.db.models import OwnerSession, User
from job_search_platform.services.contracts import Actor
from job_search_platform.services.errors import ServiceError

COOKIE_NAME = "jsp_owner_session"
CSRF_HEADER = "X-CSRF-Token"


def token_hash(value: str) -> bytes:
    if not isinstance(value, str) or re.fullmatch(r"[A-Za-z0-9_-]{16,256}", value) is None:
        raise ServiceError("unauthorized")
    return hashlib.sha256(value.encode("utf-8")).digest()


def csrf_for_cookie(cookie: str) -> str:
    return hmac.new(cookie.encode("utf-8"), b"AI Job Search Agent Platform CSRF v1", hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class OwnerExchange:
    actor: Actor
    session_cookie: str = field(repr=False)
    csrf_token: str = field(repr=False)
    expires_at: datetime


REFRESH_AFTER = timedelta(hours=1)


class OwnerSessions:
    def __init__(self, sessions, *, public_origin: str, idle_ttl: timedelta = timedelta(days=7),
                 absolute_ttl: timedelta = timedelta(days=30), extra_origins: frozenset[str] = frozenset()):
        self.sessions = sessions
        parsed = urlsplit(public_origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ServiceError("invalid_owner_origin")
        self.public_origin = public_origin
        self.origins = frozenset({public_origin}) | frozenset(extra_origins)
        self.hosts = frozenset({parsed.netloc}) | frozenset(urlsplit(o).netloc for o in extra_origins)
        self.idle_ttl, self.absolute_ttl = idle_ttl, absolute_ttl

    @property
    def secure_cookies(self) -> bool:
        return self.public_origin.startswith("https://")

    def _check(self, *, origin=None, host=None, require_origin=True):
        if host not in self.hosts or (require_origin and origin not in self.origins):
            raise ServiceError("invalid_origin")
        if origin is not None and origin not in self.origins:
            raise ServiceError("invalid_origin")

    def create(self, user_id: UUID) -> OwnerExchange:
        """Insert a session for ``user_id``; synchronous, callers use ``asyncio.to_thread``."""
        now = datetime.now(timezone.utc)
        cookie = secrets.token_urlsafe(32)
        csrf = csrf_for_cookie(cookie)
        expiry = now + self.absolute_ttl
        with self.sessions.begin() as db:
            row = OwnerSession(user_id=user_id, session_hash=token_hash(cookie), csrf_hash=token_hash(csrf),
                               expires_at=expiry, last_seen_at=now)
            db.add(row)
            db.flush()
            actor = Actor("user", row.id, None, None, frozenset(), user_id)
        return OwnerExchange(actor, cookie, csrf, expiry)

    def revoke(self, cookie: str) -> None:
        with self.sessions.begin() as db:
            row = db.scalar(select(OwnerSession).where(OwnerSession.session_hash == token_hash(cookie)))
            if row is not None and row.revoked_at is None:
                row.revoked_at = datetime.now(timezone.utc)

    @staticmethod
    def revoke_all(db, user_id: UUID, now: datetime) -> None:
        db.execute(update(OwnerSession).where(
            OwnerSession.user_id == user_id, OwnerSession.revoked_at.is_(None),
        ).values(revoked_at=now))

    async def authenticate(self, cookie: str, *, host: str, origin: str | None = None) -> Actor:
        self._check(origin=origin, host=host, require_origin=False)
        return await asyncio.to_thread(self._authenticate, cookie, None)

    async def validate_write(self, cookie: str, csrf: str, *, origin: str, host: str) -> Actor:
        self._check(origin=origin, host=host)
        if not isinstance(csrf, str) or not csrf:
            raise ServiceError("invalid_csrf")
        return await asyncio.to_thread(self._authenticate, cookie, csrf)

    async def current(self, cookie: str, *, origin: str, host: str) -> OwnerExchange:
        """Recover the existing session after a reload, without rotating other tabs."""
        self._check(origin=origin, host=host)
        def current():
            token_hash(cookie)
            actor = self._authenticate(cookie, csrf_for_cookie(cookie))
            with self.sessions() as db:
                row = db.get(OwnerSession, actor.owner_session_id)
                return OwnerExchange(actor, cookie, csrf_for_cookie(cookie), row.expires_at)
        return await asyncio.to_thread(current)

    def _authenticate(self, cookie: str, csrf: str | None):
        now = datetime.now(timezone.utc)
        digest = token_hash(cookie)
        with self.sessions.begin() as db:
            row = db.scalar(select(OwnerSession).where(OwnerSession.session_hash == digest))
            if (row is None or row.revoked_at is not None or row.expires_at <= now
                    or row.last_seen_at + self.idle_ttl <= now):
                raise ServiceError("unauthorized")
            disabled = db.scalar(select(User.disabled_at).where(User.id == row.user_id))
            if disabled is not None:
                raise ServiceError("unauthorized")
            if csrf is not None:
                try:
                    csrf_digest = token_hash(csrf)
                except ServiceError:
                    raise ServiceError("invalid_csrf") from None
                if not hmac.compare_digest(row.csrf_hash, csrf_digest):
                    raise ServiceError("invalid_csrf")
            if now - row.last_seen_at > REFRESH_AFTER:
                row.last_seen_at = now
            return Actor("user", row.id, None, None, frozenset(), row.user_id)
