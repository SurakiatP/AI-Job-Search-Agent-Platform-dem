"""FR-P06 webhooks and FR-P04 A2A push: signing, URL safety, the delivery outbox and its sender.

Rows are enqueued in the caller's transaction (run events, digests) and sent by the supervisor's delivery loop.
Signing keys (endpoint secrets, A2A tokens) are never logged or returned after creation.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from sqlalchemy import select

from job_search_platform.db.models import A2APushConfig, Grant, WebhookDelivery, WebhookEndpoint
from job_search_platform.services.a2a_state import context_id, task_state
from job_search_platform.services.errors import ServiceError

logger = logging.getLogger("jsp.webhooks")

WEBHOOK_EVENTS = ("run.waiting_approval", "run.needs_input", "run.completed", "run.failed", "run.cancelled", "digest.ready")
RUN_EVENT_MAP = {"run_waiting_approval": "run.waiting_approval", "run_needs_input": "run.needs_input",
                 "run_completed": "run.completed", "run_failed": "run.failed", "run_cancelled": "run.cancelled"}
# A run event that changes the task's state, mapped to the run status it means.
A2A_EVENT_STATUS = {"run_queued": "queued", "run_started": "running", "run_resumed": "running",
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


def enqueue_for_run_event(db, run, event_type: str, now: datetime) -> int:
    """Queue A2A push and owner webhook deliveries for one run event, in the caller's transaction."""
    count = 0
    status = A2A_EVENT_STATUS.get(event_type)
    if status is not None:
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
