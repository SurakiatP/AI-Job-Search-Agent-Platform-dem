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
    "login_ip": (10, 900),
    "login_email": (10, 900),
    "resend_email": (3, 3600),
    "otp_attempt": (5, 600),  # wrong or right: at most 5 tries per 10 minutes for one account and purpose
    "otp_send": (3, 3600),
    "forgot_email": (3, 3600),
    "digest_preview": (5, 3600),
    "telegram_link": (5, 3600),
    "digest_unsubscribe_ip": (30, 3600),
    "oauth_register_ip": (20, 3600),
    "oauth_authorize_ip": (60, 3600),
}
RETENTION = timedelta(hours=24)


def hit(db: Session, bucket: str, key: str, *, now: datetime | None = None) -> None:
    """Record one hit or raise rate_limited. Callers commit; rejected hits are not recorded."""
    limit, window = LIMITS[bucket]
    now = now or datetime.now(timezone.utc)
    key_hash = hashlib.sha256(key.encode()).digest()
    # Serialise concurrent hits on the same bucket/key until the transaction ends.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": bucket + key_hash.hex()})
    count, oldest = db.execute(
        select(func.count(), func.min(RateLimitEvent.created_at)).where(
            RateLimitEvent.bucket == bucket, RateLimitEvent.key_hash == key_hash,
            RateLimitEvent.created_at > now - timedelta(seconds=window))).one()
    if count >= limit:
        retry_after = max(1, int(window - (now - oldest).total_seconds()))
        raise ServiceError("rate_limited", retryable=True, fields={"retry_after": str(retry_after)})
    db.add(RateLimitEvent(bucket=bucket, key_hash=key_hash, created_at=now))
    db.flush()


def prune(db: Session, *, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    return db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < now - RETENTION)).rowcount
