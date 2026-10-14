"""FR-P06 webhooks and FR-P04 A2A push: signing, URL safety, the delivery outbox and its sender.

Rows are enqueued in the caller's transaction (run events, digests) and sent by the supervisor's delivery loop.
Signing keys (endpoint secrets, A2A tokens) are never logged or returned after creation.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
from sqlalchemy import delete, select, update

from job_search_platform.db.models import A2APushConfig, Grant, WebhookDelivery, WebhookEndpoint
from job_search_platform.services.a2a_state import context_id, task_state
from job_search_platform.services.errors import ServiceError

logger = logging.getLogger("jsp.webhooks")

WEBHOOK_EVENTS = ("run.waiting_approval", "run.needs_input", "run.completed", "run.failed", "run.cancelled", "digest.ready")
RUN_EVENT_MAP = {"run_waiting_approval": "run.waiting_approval", "run_needs_input": "run.needs_input",
                 "run_completed": "run.completed", "run_failed": "run.failed", "run_cancelled": "run.cancelled"}
# A run event that changes the task's state, mapped to the run status it means.
A2A_EVENT_STATUS = {"run_queued": "queued", "run_started": "running", "run_resumed": "queued",
                    "run_waiting_approval": "waiting_approval", "run_needs_input": "needs_input",
                    "run_completed": "completed", "run_failed": "failed", "run_cancelled": "cancelled",
                    "run_interrupted": "interrupted"}
BACKOFF_MINUTES = (1, 2, 4, 8, 16, 32, 64, 128)
MAX_ATTEMPTS = len(BACKOFF_MINUTES)


def sign(key: str, timestamp: int, body: bytes) -> str:
    digest = hmac.new(key.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def backoff(attempts: int, rand: float) -> timedelta:
    """Delay before attempt ``attempts + 1``; ``rand`` in [0, 1] adds up to 10% jitter."""
    minutes = BACKOFF_MINUTES[min(attempts, MAX_ATTEMPTS) - 1]
    return timedelta(minutes=minutes * (1 + 0.1 * rand))


def allow_private() -> bool:
    return os.environ.get("WEBHOOK_ALLOW_PRIVATE") == "1"


async def validate_url(url: str) -> None:
    try:
        parts = urlsplit(url)
    except ValueError:
        raise ServiceError("invalid_webhook_url") from None
    if allow_private():
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            raise ServiceError("invalid_webhook_url")
        return
    from a2a.utils.push_url_validator import validate_push_notification_url
    if parts.scheme != "https" or not await validate_push_notification_url(url):
        raise ServiceError("invalid_webhook_url")


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _add(db, *, project_id: UUID, event_type: str, payload_for, now: datetime,
         endpoint_id: UUID | None = None, push_config_id: UUID | None = None) -> None:
    delivery_id = uuid4()
    db.add(WebhookDelivery(id=delivery_id, project_id=project_id, endpoint_id=endpoint_id, push_config_id=push_config_id,
                           event_type=event_type, payload=payload_for(delivery_id), next_attempt_at=now, created_at=now))


def _endpoints(db, project_id: UUID, event: str) -> list[WebhookEndpoint]:
    rows = db.scalars(select(WebhookEndpoint).where(WebhookEndpoint.project_id == project_id, WebhookEndpoint.enabled)).all()
    return [row for row in rows if event in (row.events or [])]


def _envelope(delivery_id: UUID, event: str, now: datetime, data: dict) -> dict:
    return {"id": str(delivery_id), "type": event, "created_at": _iso(now), "data": data}


def enqueue_for_run_event(db, run, event_type: str, now: datetime, reported_status: str | None = None) -> int:
    """Queue A2A push and owner webhook deliveries for one run event, in the caller's transaction."""
    count = 0
    status = A2A_EVENT_STATUS.get(event_type)
    if status is not None:
        status = reported_status or status  # what the caller just set wins, so push matches tasks/get
        state, metadata = task_state(status)
        configs = db.scalars(select(A2APushConfig).join(Grant, Grant.id == A2APushConfig.grant_id).where(
            A2APushConfig.run_id == run.id, Grant.revoked_at.is_(None), Grant.expires_at > now)).all()
        for config in configs:
            update_payload = {"statusUpdate": {"taskId": str(run.id), "contextId": context_id(run.id),
                                               "status": {"state": state, "timestamp": _iso(now)}, "metadata": metadata}}
            _add(db, project_id=run.project_id, event_type=f"a2a.{status}", payload_for=lambda _id, p=update_payload: p,
                 now=now, push_config_id=config.id)
            count += 1
    event = RUN_EVENT_MAP.get(event_type)
    if event is not None:
        data = {"project_id": str(run.project_id), "run_id": str(run.id), "operation": run.operation,
                "status": A2A_EVENT_STATUS[event_type],
                "job_revision_id": str(run.job_revision_id) if run.job_revision_id else None}
        for endpoint in _endpoints(db, run.project_id, event):
            _add(db, project_id=run.project_id, event_type=event, now=now, endpoint_id=endpoint.id,
                 payload_for=lambda delivery_id: _envelope(delivery_id, event, now, data))
            count += 1
    return count


DIGEST_ITEM_KEYS = ("slug", "title", "company", "cities", "age_days", "stale", "source_url")


def enqueue_digest(db, project_id: UUID, saved_search_id: UUID, name: str, items: list[dict], now: datetime) -> int:
    data = {"project_id": str(project_id), "saved_search_id": str(saved_search_id), "name": name,
            "items": [{key: item.get(key) for key in DIGEST_ITEM_KEYS} for item in items]}
    endpoints = _endpoints(db, project_id, "digest.ready")
    for endpoint in endpoints:
        _add(db, project_id=project_id, event_type="digest.ready", now=now, endpoint_id=endpoint.id,
             payload_for=lambda delivery_id: _envelope(delivery_id, "digest.ready", now, data))
    return len(endpoints)


def digest_push_available(db, project_id: UUID) -> bool:
    return bool(_endpoints(db, project_id, "digest.ready"))


LEASE = timedelta(minutes=5)
BATCH = 10
MAX_BODY = 256 * 1024
RETENTION = timedelta(days=30)
RETRYABLE = {408, 429}


def _classify(code: int | None, error: str | None) -> str:
    """'delivered', 'retry' or 'dead' for one HTTP attempt."""
    if error is not None:
        return "retry"
    if 200 <= code < 300:
        return "delivered"
    if code >= 500 or code in RETRYABLE:
        return "retry"
    return "dead"


class Webhooks:
    def __init__(self, sessions, *, timeout: float = 10.0, rand=random.random):
        self.sessions = sessions
        self.timeout = timeout
        self.rand = rand

    def _claim(self, now: datetime) -> list[dict]:
        with self.sessions.begin() as db:
            rows = db.execute(
                select(WebhookDelivery, WebhookEndpoint, A2APushConfig, Grant)
                .outerjoin(WebhookEndpoint, WebhookEndpoint.id == WebhookDelivery.endpoint_id)
                .outerjoin(A2APushConfig, A2APushConfig.id == WebhookDelivery.push_config_id)
                .outerjoin(Grant, Grant.id == A2APushConfig.grant_id)
                .where(WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= now)
                .order_by(WebhookDelivery.next_attempt_at).limit(BATCH)
                .with_for_update(skip_locked=True, of=WebhookDelivery)
            ).all()
            claimed = []
            for delivery, endpoint, config, grant in rows:
                delivery.next_attempt_at = now + LEASE  # lease: a crash mid-send does not re-send at once
                if endpoint is not None:
                    item = {"url": endpoint.url, "key": endpoint.secret, "token": None,
                            "blocked": None if endpoint.enabled else "endpoint_disabled"}
                else:
                    valid = grant is not None and grant.revoked_at is None and grant.expires_at > now
                    item = {"url": config.url, "key": config.token, "token": config.token,
                            "blocked": None if valid else "grant_revoked"}
                claimed.append({"id": delivery.id, "event": delivery.event_type, "payload": delivery.payload,
                                "attempts": delivery.attempts, **item})
            return claimed

    async def _send(self, client: httpx.AsyncClient, item: dict) -> tuple[int | None, str | None]:
        if item["blocked"]:
            return None, item["blocked"]
        body = json.dumps(item["payload"], separators=(",", ":"), ensure_ascii=False).encode()
        if len(body) > MAX_BODY:
            return None, "payload_too_large"
        try:
            await validate_url(item["url"])
        except ServiceError:
            return None, "blocked_url"
        headers = {"Content-Type": "application/json", "User-Agent": "ai-job-search-platform-webhooks/1",
                   "X-JSP-Event": item["event"], "X-JSP-Delivery": str(item["id"]),
                   "X-JSP-Signature": sign(item["key"], int(time.time()), body)}
        if item["token"]:
            headers["X-A2A-Notification-Token"] = item["token"]
        try:
            response = await client.post(item["url"], content=body, headers=headers)
        except httpx.TimeoutException:
            return None, "timeout"
        except httpx.HTTPError as exc:
            return None, type(exc).__name__[:200]
        return response.status_code, None

    def _record(self, item: dict, code: int | None, error: str | None, now: datetime) -> None:
        final_errors = {"endpoint_disabled", "grant_revoked", "blocked_url", "payload_too_large"}
        outcome = "dead" if error in final_errors else _classify(code, error)
        attempts = item["attempts"] + (0 if error in final_errors else 1)
        if outcome == "retry" and attempts >= MAX_ATTEMPTS:
            outcome = "dead"
        values = {"attempts": attempts, "last_status_code": code, "last_error": error}
        if outcome == "delivered":
            values.update(status="delivered", delivered_at=now)
        elif outcome == "dead":
            values.update(status="dead")
        else:
            values.update(next_attempt_at=now + backoff(attempts, self.rand()))
        with self.sessions.begin() as db:
            db.execute(update(WebhookDelivery).where(WebhookDelivery.id == item["id"]).values(**values))

    async def deliver_due(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        claimed = await asyncio.to_thread(self._claim, now)
        if not claimed:
            return 0
        async with httpx.AsyncClient(follow_redirects=False, timeout=self.timeout) as client:
            results = await asyncio.gather(*(self._send(client, item) for item in claimed))
        for item, (code, error) in zip(claimed, results):
            await asyncio.to_thread(self._record, item, code, error, now)
        return len(claimed)

    def prune(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            return db.execute(delete(WebhookDelivery).where(
                WebhookDelivery.status.in_(("delivered", "dead")), WebhookDelivery.created_at < now - RETENTION)).rowcount

    async def prune_async(self) -> int:
        return await asyncio.to_thread(self.prune)
