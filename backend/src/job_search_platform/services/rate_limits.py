"""Sliding-window rate limits stored in PostgreSQL (shared across processes)."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from job_search_platform.db.models import RateLimitEvent
from job_search_platform.services.errors import ServiceError

# bucket -> (max hits, window seconds)
LIMITS: dict[str, tuple[int, int]] = {
    "signup_ip": (5, 3600),
    "login_ip": (10, 900),  # failed logins per IP
    "login_email": (10, 900),  # failed logins per email and IP, so one IP cannot lock an owner out from other IPs
    # Per-IP keys use request.client.host. Behind a shared proxy address (container deploy) every client looks like
    # one IP, so until SEC-B02 (trusted proxy setting) is done every per-IP bucket (login_ip 10/15 min, forgot_ip
    # 100/h, signup_ip, ...) is effectively site-wide: enough failed logins from anyone lock all logins for 15 min.
    "login_email_any": (30, 900),  # failed logins per email from all IPs: a backstop against wide spraying
    "password_change": (10, 900),  # failed current-password checks per signed-in user; a success takes its hit back
    "resend_email": (3, 3600),
    "otp_attempt": (5, 600),  # wrong or right: at most 5 tries per 10 minutes for one account and purpose
    "otp_send": (3, 3600),
    "forgot_email": (3, 3600),  # per email and IP
    "forgot_email_any": (15, 3600),  # per email from all IPs
    "forgot_ip": (100, 3600),  # loose on purpose: the IP may be a shared proxy (see the note on login_email_any)
    "digest_preview": (5, 3600),
    "telegram_link": (5, 3600),
    "digest_unsubscribe_ip": (30, 3600),
    "oauth_register_ip": (20, 3600),
    "oauth_authorize_ip": (60, 3600),
    "resume_draft_save": (60, 60),  # CV builder autosave, per user
    "resume_preview": (20, 60),
    "resume_theme_write": (60, 3600),  # theme save, import and delete, per user
    "resume_photo": (20, 3600),  # CV photo uploads, per user
    "resume_publish": (20, 3600),  # each publish renders a PDF and stores up to 20 MB, per user
    "cv_upload": (20, 3600),  # each CV upload stores up to 20 MB and starts the parser, per user
}
RETENTION = timedelta(hours=24)


def check(db: Session, bucket: str, key: str, *, now: datetime | None = None) -> bytes:
    """Raise rate_limited when the bucket is full, without recording a hit. Returns the key hash."""
    limit, window = LIMITS[bucket]
    now = now or datetime.now(timezone.utc)
    key_hash = hashlib.sha256(key.encode()).digest()
    # serialise concurrent hits on the same bucket/key until the transaction ends
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": bucket + key_hash.hex()})
    count, oldest = db.execute(
        select(func.count(), func.min(RateLimitEvent.created_at)).where(
            RateLimitEvent.bucket == bucket, RateLimitEvent.key_hash == key_hash,
            RateLimitEvent.created_at > now - timedelta(seconds=window))).one()
    if count >= limit:
        retry_after = max(1, int(window - (now - oldest).total_seconds()))
        raise ServiceError("rate_limited", retryable=True, fields={"retry_after": str(retry_after)})
    return key_hash


def hit(db: Session, bucket: str, key: str, *, now: datetime | None = None) -> int:
    """Record one hit (returns its event id) or raise rate_limited. Callers commit; rejected hits are not recorded."""
    now = now or datetime.now(timezone.utc)
    key_hash = check(db, bucket, key, now=now)
    event = RateLimitEvent(bucket=bucket, key_hash=key_hash, created_at=now)
    db.add(event)
    db.flush()
    return event.id


def prune(db: Session, *, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    return db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < now - RETENTION)).rowcount
