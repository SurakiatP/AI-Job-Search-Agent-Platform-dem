"""FR-P06 delivery: signature, retry/backoff, dead-letter, SSRF at send, leases, concurrency, prune. Synthetic data only."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
import uvicorn
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from helpers import owner, project
from job_search_platform.db.models import WebhookDelivery, WebhookEndpoint
from job_search_platform.services import webhooks as wh
from job_search_platform.workers.supervisor import WorkerSupervisor

UTC = timezone.utc
SECRET = "s" * 43


class Receiver:
    """Local HTTP receiver: records requests, answers with a scripted status per path."""
    def __init__(self):
        self.calls: list[dict] = []
        self.script: dict[str, list[int]] = {}
        self.delay: dict[str, float] = {}

    async def handle(self, request: Request) -> Response:
        path = request.url.path
        await asyncio.sleep(self.delay.get(path, 0))
        self.calls.append({"path": path, "headers": dict(request.headers), "body": await request.body()})
        codes = self.script.get(path) or [200]
        code = codes.pop(0) if len(codes) > 1 else codes[0]
        headers = {"location": "/redirected"} if 300 <= code < 400 else None
        return Response(status_code=code, headers=headers)


@pytest.fixture
async def receiver(unused_tcp_port, monkeypatch):
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    rec = Receiver()
    app = Starlette(routes=[Route("/{path:path}", rec.handle, methods=["POST"])])
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=unused_tcp_port, log_level="error"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    rec.base = f"http://127.0.0.1:{unused_tcp_port}"
    yield rec
    server.should_exit = True
    await task


@pytest.fixture
def setup(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        pid = project(db, owner=owner(db)).id
    return sessions, pid


def _endpoint(sessions, pid, url, enabled=True):
    with sessions.begin() as db:
        row = WebhookEndpoint(project_id=pid, url=url, events=["run.completed"], secret=SECRET, enabled=enabled)
        db.add(row)
        db.flush()
        return row.id


def _queue(sessions, pid, endpoint_id, now, payload=None):
    with sessions.begin() as db:
        row = WebhookDelivery(project_id=pid, endpoint_id=endpoint_id, event_type="run.completed",
                              payload=payload or {"type": "run.completed"}, next_attempt_at=now, created_at=now)
        db.add(row)
        db.flush()
        return row.id


def _row(sessions, delivery_id):
    with sessions() as db:
        return db.get(WebhookDelivery, delivery_id)


NOW = datetime(2026, 10, 15, 1, 0, tzinfo=UTC)


@pytest.mark.integration
async def test_signed_delivery(receiver, setup):
    sessions, pid = setup
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/ok"), NOW)
    assert await wh.Webhooks(sessions, rand=lambda: 0.0).deliver_due(NOW) == 1
    (call,) = receiver.calls
    t, v1 = (part.split("=", 1)[1] for part in call["headers"]["x-jsp-signature"].split(","))
    assert v1 == hmac.new(SECRET.encode(), f"{t}.".encode() + call["body"], hashlib.sha256).hexdigest()
    assert call["headers"]["x-jsp-event"] == "run.completed" and call["headers"]["x-jsp-delivery"] == str(did)
    assert json.loads(call["body"]) == {"type": "run.completed"}
    row = _row(sessions, did)
    assert row.status == "delivered" and row.attempts == 1 and row.last_status_code == 200


@pytest.mark.integration
async def test_retry_then_success_and_dead_after_budget(receiver, setup):
    sessions, pid = setup
    service = wh.Webhooks(sessions, rand=lambda: 0.0)
    receiver.script["/flaky"] = [500, 200]
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/flaky"), NOW)
    await service.deliver_due(NOW)
    row = _row(sessions, did)
    assert row.status == "pending" and row.attempts == 1 and row.next_attempt_at == NOW + timedelta(minutes=1)
    await service.deliver_due(NOW + timedelta(minutes=1))
    assert _row(sessions, did).status == "delivered"

    receiver.script["/down"] = [503]
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/down"), NOW)
    when = NOW
    for _ in range(wh.MAX_ATTEMPTS):
        await service.deliver_due(when)
        when = _row(sessions, did).next_attempt_at
    row = _row(sessions, did)
    assert row.status == "dead" and row.attempts == wh.MAX_ATTEMPTS and row.last_status_code == 503


@pytest.mark.integration
@pytest.mark.parametrize("code", [404, 410, 302])
async def test_non_retryable_is_dead_and_redirects_not_followed(receiver, setup, code):
    sessions, pid = setup
    receiver.script["/no"] = [code]
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/no"), NOW)
    await wh.Webhooks(sessions).deliver_due(NOW)
    assert _row(sessions, did).status == "dead"
    assert [c["path"] for c in receiver.calls] == ["/no"]


@pytest.mark.integration
async def test_timeout_is_retryable_and_does_not_block_batch(receiver, setup):
    sessions, pid = setup
    receiver.delay["/slow"] = 2.0
    slow = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/slow"), NOW)
    fast = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/fast"), NOW)
    started = asyncio.get_running_loop().time()
    await wh.Webhooks(sessions, timeout=0.5, rand=lambda: 0.0).deliver_due(NOW)
    assert asyncio.get_running_loop().time() - started < 1.9
    assert _row(sessions, fast).status == "delivered"
    row = _row(sessions, slow)
    assert row.status == "pending" and row.attempts == 1 and row.last_error == "timeout"


@pytest.mark.integration
async def test_blocked_url_at_send_and_disabled_endpoint_are_dead(receiver, setup, monkeypatch):
    sessions, pid = setup
    blocked = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/blocked"), NOW)
    disabled = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/off", enabled=False), NOW)
    monkeypatch.delenv("WEBHOOK_ALLOW_PRIVATE")
    await wh.Webhooks(sessions).deliver_due(NOW)
    assert (_row(sessions, blocked).status, _row(sessions, blocked).last_error) == ("dead", "blocked_url")
    assert (_row(sessions, disabled).status, _row(sessions, disabled).last_error) == ("dead", "endpoint_disabled")
    assert receiver.calls == []


@pytest.mark.integration
async def test_oversized_payload_is_dead(receiver, setup):
    sessions, pid = setup
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/big"), NOW, payload={"x": "y" * (wh.MAX_BODY + 1)})
    await wh.Webhooks(sessions).deliver_due(NOW)
    assert (_row(sessions, did).status, _row(sessions, did).last_error) == ("dead", "payload_too_large")
    assert receiver.calls == []


@pytest.mark.integration
async def test_claim_leases_rows(receiver, setup):
    sessions, pid = setup
    did = _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/ok"), NOW)
    service = wh.Webhooks(sessions)
    claimed = service._claim(NOW)
    assert [c["id"] for c in claimed] == [did]
    assert _row(sessions, did).next_attempt_at == NOW + wh.LEASE
    assert service._claim(NOW + timedelta(minutes=1)) == []


@pytest.mark.integration
async def test_concurrent_deliver_due_sends_once(receiver, setup):
    sessions, pid = setup
    receiver.delay["/once"] = 0.3
    _queue(sessions, pid, _endpoint(sessions, pid, f"{receiver.base}/once"), NOW)
    service = wh.Webhooks(sessions)
    await asyncio.gather(service.deliver_due(NOW), service.deliver_due(NOW))
    assert len(receiver.calls) == 1


@pytest.mark.integration
def test_prune_keeps_pending_and_recent(setup):
    sessions, pid = setup
    endpoint = _endpoint(sessions, pid, "https://hooks.example.test/x")
    old, recent, pending = (_queue(sessions, pid, endpoint, NOW - timedelta(days=d)) for d in (31, 1, 40))
    with sessions.begin() as db:
        db.execute(update(WebhookDelivery).where(WebhookDelivery.id.in_([old, recent])).values(status="delivered"))
    assert wh.Webhooks(sessions).prune(NOW) == 1
    with sessions() as db:
        assert set(db.scalars(select(WebhookDelivery.id))) == {recent, pending}


@pytest.mark.integration
async def test_supervisor_runs_delivery_loop(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    calls = []

    async def deliveries():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")  # a failure must not stop the loop
        return 0
    supervisor = WorkerSupervisor(sessions, None, None, None, deliveries=deliveries, deliveries_interval=0.05)
    task = asyncio.create_task(supervisor._delivery_loop())
    await asyncio.sleep(0.3)
    supervisor._closing.set()
    await asyncio.wait_for(task, 1)
    assert len(calls) >= 2
