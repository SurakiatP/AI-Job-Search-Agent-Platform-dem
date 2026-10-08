"""Loopback owner bootstrap, with persisted one-use evidence and CSRF."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import ipaddress
import re
import secrets
from urllib.parse import urlsplit

from sqlalchemy import select

from job_search_platform.db.models import OwnerLaunchNonce, OwnerSession
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
class LaunchToken:
    nonce: str = field(repr=False)
    expires_at: datetime


@dataclass(frozen=True)
class OwnerExchange:
    actor: Actor
    session_cookie: str = field(repr=False)
    csrf_token: str = field(repr=False)
    expires_at: datetime


class OwnerSessions:
    def __init__(self, sessions, *, allowed_origins: set[str], allowed_hosts: set[str],
                 launch_ttl: timedelta = timedelta(minutes=5),
                 session_ttl: timedelta = timedelta(hours=8)):
        self.sessions = sessions
        if not allowed_origins or not allowed_hosts:
            raise ServiceError("invalid_owner_origin")
        for origin in allowed_origins:
            try:
                parsed = urlsplit(origin)
                loopback = parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname).is_loopback
                if (not loopback or parsed.scheme not in {"http", "https"} or parsed.username
                        or parsed.password or parsed.path or parsed.query or parsed.fragment
                        or parsed.port is None):
                    raise ValueError
            except (ValueError, TypeError):
                raise ServiceError("invalid_owner_origin") from None
        for host in allowed_hosts:
            try:
                parsed = urlsplit("http://" + host)
                loopback = parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname).is_loopback
                if not loopback or parsed.port is None or parsed.username or parsed.path or parsed.query or parsed.fragment:
                    raise ValueError
            except (ValueError, TypeError):
                raise ServiceError("invalid_owner_origin") from None
        self.origins, self.hosts = frozenset(allowed_origins), frozenset(allowed_hosts)
        self.launch_ttl, self.session_ttl = launch_ttl, session_ttl

    def _check(self, *, origin=None, host=None, require_origin=True):
        if host not in self.hosts or (require_origin and origin not in self.origins):
            raise ServiceError("invalid_origin")
        if origin is not None and origin not in self.origins:
            raise ServiceError("invalid_origin")

    async def create_launch_nonce(self, origin: str) -> LaunchToken:
        if origin not in self.origins:
            raise ServiceError("invalid_owner_origin")
        def create():
            nonce = secrets.token_urlsafe(32)
            expiry = datetime.now(timezone.utc) + self.launch_ttl
            with self.sessions.begin() as db:
                db.add(OwnerLaunchNonce(nonce_hash=token_hash(nonce), origin=origin, expires_at=expiry))
            return LaunchToken(nonce, expiry)
        return await asyncio.to_thread(create)

    async def exchange(self, nonce: str, *, origin: str | None, host: str | None) -> OwnerExchange:
        self._check(origin=origin, host=host)
        def exchange():
            now = datetime.now(timezone.utc)
            try:
                digest = token_hash(nonce)
            except ServiceError:
                raise ServiceError("invalid_launch") from None
            with self.sessions.begin() as db:
                launch = db.scalar(select(OwnerLaunchNonce).where(
                    OwnerLaunchNonce.nonce_hash == digest).with_for_update())
                if (launch is None or launch.consumed_at is not None
                        or launch.expires_at <= now or launch.origin != origin):
                    raise ServiceError("invalid_launch")
                cookie = secrets.token_urlsafe(32)
                csrf = csrf_for_cookie(cookie)
                expiry = now + self.session_ttl
                row = OwnerSession(session_hash=token_hash(cookie), csrf_hash=token_hash(csrf), expires_at=expiry)
                db.add(row)
                db.flush()
                launch.consumed_at = now
                actor = Actor("owner", row.id, None, None, frozenset())
            return OwnerExchange(actor, cookie, csrf, expiry)
        return await asyncio.to_thread(exchange)

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
        with self.sessions() as db:
            row = db.scalar(select(OwnerSession).where(OwnerSession.session_hash == token_hash(cookie)))
            if row is None or row.revoked_at is not None or row.expires_at <= now:
                raise ServiceError("unauthorized")
            if csrf is not None:
                try:
                    digest = token_hash(csrf)
                except ServiceError:
                    raise ServiceError("invalid_csrf") from None
                if not hmac.compare_digest(row.csrf_hash, digest):
                    raise ServiceError("invalid_csrf")
            return Actor("owner", row.id, None, None, frozenset())
