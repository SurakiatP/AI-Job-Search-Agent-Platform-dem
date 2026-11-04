"""Admin System page: probes, ingest history, webhook counts and resend, gateway and tools. Metadata only."""
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from job_search_platform.db.models import (
    AdminAuditLog, HealthProbe, IngestRun, Project, User, WebhookDelivery, WebhookEndpoint,
)
from job_search_platform.services import health
from test_admin_overview import add_user, admin, ctx, fast, login, NOW, _Stub  # noqa: F401 - shared fixtures

pytestmark = pytest.mark.integration
URL = "https://hooks.example.test:8443/secret/path?token=abc123"


def seed_deliveries(ctx):
    with ctx.sessions.begin() as db:
        owner = User(email="owner@example.test", password_hash="x", email_verified_at=NOW())
        db.add(owner)
        db.flush()
        proj = Project(name="Synthetic", user_id=owner.id)
        db.add(proj)
        db.flush()
        hook = WebhookEndpoint(project_id=proj.id, url=URL, events=["run.completed"], secret="topsecret")
        db.add(hook)
        db.flush()
        ids = {}
        for status in ("pending", "delivered", "dead", "dead"):
            row = WebhookDelivery(project_id=proj.id, endpoint_id=hook.id, event_type="run.completed", status=status,
                                  payload={"data": "PRIVATE PAYLOAD"}, attempts=8 if status == "dead" else 1,
                                  last_status_code=500 if status == "dead" else None, last_error="boom" if status == "dead" else None)
            db.add(row)
            db.flush()
            ids.setdefault(status, row.id)
        return owner.id, ids


def test_non_admin_cannot_resend(ctx):
    add_user(ctx, "plain@example.test")
    headers = login(ctx, "plain@example.test")
    assert ctx.client.get("/v1/admin/system").status_code == 403
    assert ctx.client.post(f"/v1/admin/webhooks/{uuid4()}/resend", headers=headers).status_code == 403


def test_system_on_an_empty_database_probes_live(ctx, admin):
    body = ctx.client.get("/v1/admin/system").json()
    assert body["health"]["components"] == {"postgres": "ok", "object_store": "ok", "llm_gateway": "ok", "sandbox": "ok"}
    assert len(body["probes"]) == 120 and {c["status"] for p in body["probes"] for c in p["components"].values()} == {"unknown"} and body["ingest"] == [] and body["webhooks"] == {"pending": 0, "delivered": 0, "dead": 0}
    assert body["gateway"]["configured"] is True and body["gateway"]["reachable"] is False
    assert "sk-test-gateway" not in str(body) and len(body["tools"]["tools"]) == 13


def test_record_probe_writes_timed_row_prunes_after_90_days_and_buckets_old_rows(ctx, admin, monkeypatch):
    old = {"postgres": "ok", "object_store": "ok", "llm_gateway": "down", "sandbox": "ok"}  # rows written before response times
    with ctx.sessions.begin() as db:
        db.add(HealthProbe(checked_at=NOW() - timedelta(days=91), components={"postgres": "ok"}))
        db.add(HealthProbe(checked_at=NOW() - timedelta(minutes=20), components=old))
    components = asyncio.run(health.record_probe(ctx.sessions, _Stub(), _Stub()))
    assert components == {"postgres": "ok", "object_store": "ok", "llm_gateway": "ok", "sandbox": "ok"}
    with ctx.sessions() as db:
        rows = db.query(HealthProbe).order_by(HealthProbe.checked_at).all()
        assert len(rows) == 2  # the 91-day row is gone
        assert rows[-1].components["postgres"]["status"] == "ok" and isinstance(rows[-1].components["postgres"]["ms"], int)
    body = ctx.client.get("/v1/admin/system").json()  # default range 1h: 120 buckets of 30 s
    assert body["range"] == "1h" and body["bucket_seconds"] == 30 and len(body["probes"]) == 120
    assert body["health"]["components"] == components  # newest probe is fresh: no live probe needed
    cells = [p["components"]["llm_gateway"] for p in body["probes"]]
    assert [c["status"] for c in cells].count("down") == 1 and [c["status"] for c in cells].count("ok") == 1
    assert sum(c["checks"] for c in cells) == 2
    assert next(p for p in body["probes"] if p["components"]["llm_gateway"]["status"] == "down")["components"]["llm_gateway"]["ms"] is None  # old row: no timing
    timed = next(p for p in body["probes"] if p["components"]["postgres"]["ms"] is not None)["components"]["postgres"]
    assert timed["failed"] == 0 and timed["checks"] == 1

    def down():
        raise OSError("http://10.9.8.7:4000 refused")
    monkeypatch.setattr(health, "gateway_alive", down)
    probe = asyncio.run(health.record_probe(ctx.sessions, _Stub(), _Stub()))
    assert probe["llm_gateway"] == "down"
    attention = ctx.client.get("/v1/admin/overview?range=1h").json()["attention"]
    assert [a["params"] for a in attention if a["kind"] == "health_down"] == [{"component": "llm_gateway"}]
    assert "10.9.8.7" not in ctx.client.get("/v1/admin/system").text


def test_ingest_history_latest_per_board_and_error_codes(ctx, admin):
    now = NOW()
    with ctx.sessions.begin() as db:
        db.add(IngestRun(started_at=now - timedelta(hours=2), finished_at=now - timedelta(hours=2), status="failed", per_board={
            "greenhouse:acme": {"state": "failed", "error": "status_503"}, "lever:b": {"state": "ok", "fetched": 5, "created": 1}}))
        db.add(IngestRun(started_at=now - timedelta(hours=1), finished_at=now - timedelta(hours=1), status="ok", per_board={
            "greenhouse:acme": {"state": "ok", "fetched": 20, "created": 4}, "lever:b": {"state": "failed", "error": "leaked <b>detail</b> text"},
            "index": {"state": "ok"}}))
        db.add(IngestRun(started_at=now, status="running", per_board={}))
    ingest = ctx.client.get("/v1/admin/system").json()["ingest"]
    by = {(i["board"], i["status"]): i for i in ingest}
    assert by[("greenhouse:acme", "complete")]["jobs_total"] == 20 and by[("greenhouse:acme", "complete")]["jobs_new"] == 4
    assert by[("greenhouse:acme", "failed")]["error_code"] == "status_503"  # an earlier failure stays in the history
    assert by[("lever:b", "failed")]["error_code"] == "error"  # free text never leaves the server
    assert not any(i["board"] == "index" for i in ingest) and "leaked" not in str(ingest)
    assert ingest[0]["at"] >= ingest[-1]["at"]


def test_webhook_list_shows_host_only_and_resend_requeues_with_audit(ctx, admin):
    owner, ids = seed_deliveries(ctx)
    assert ctx.client.get("/v1/admin/system").json()["webhooks"] == {"pending": 1, "delivered": 1, "dead": 2}
    listed = ctx.client.get("/v1/admin/webhooks", params={"status": "dead"})
    assert listed.status_code == 200 and len(listed.json()) == 2
    item = listed.json()[0]
    assert item["host"] == "hooks.example.test" and item["user_short_id"] == f"u_{owner.hex[:4]}…{owner.hex[-3:]}"
    for secret in ("secret/path", "abc123", "topsecret", "PRIVATE PAYLOAD", "owner@example.test", "boom"):
        assert secret not in listed.text
    assert len(ctx.client.get("/v1/admin/webhooks").json()) == 4
    assert ctx.client.get("/v1/admin/webhooks?status=nope").status_code == 422

    dead = ids["dead"]
    before = NOW()
    resent = ctx.client.post(f"/v1/admin/webhooks/{dead}/resend", headers=admin.headers)
    assert resent.status_code == 200, resent.text
    assert resent.json()["status"] == "pending" and resent.json()["attempts"] == 0 and resent.json()["last_status_code"] is None
    with ctx.sessions() as db:
        row = db.get(WebhookDelivery, dead)
        assert row.status == "pending" and row.next_attempt_at >= before - timedelta(seconds=1) and row.last_error is None
        audit = db.scalars(select(AdminAuditLog)).all()
    assert [(a.action, a.target_type, a.target_id, a.actor_user_id, a.detail) for a in audit] == [
        ("webhook.resend", "webhook", str(dead), admin.id, {"event_type": "run.completed"})]
    assert ctx.client.post(f"/v1/admin/webhooks/{ids['pending']}/resend", headers=admin.headers).status_code == 200  # pending: again
    refused = ctx.client.post(f"/v1/admin/webhooks/{ids['delivered']}/resend", headers=admin.headers)
    assert refused.status_code == 409 and refused.json()["code"] == "delivery_not_dead"
    assert ctx.client.post(f"/v1/admin/webhooks/{uuid4()}/resend", headers=admin.headers).status_code == 404
    assert ctx.client.post(f"/v1/admin/webhooks/{dead}/resend").status_code == 403  # no CSRF header
    with ctx.sessions() as db:
        assert db.query(AdminAuditLog).count() == 2  # the refused and missing ones wrote nothing


@pytest.mark.parametrize("range_,size,count", [("1m", 30, 2), ("5m", 30, 10), ("1h", 30, 120), ("4h", 120, 120), ("10h", 300, 120),
                                                ("7d", 3600, 168), ("30d", 21600, 120), ("90d", 86400, 90), ("all", 86400, 90)])
def test_system_probe_buckets_follow_the_range(ctx, admin, range_, size, count):
    body = ctx.client.get("/v1/admin/system", params={"range": range_}).json()
    assert body["bucket_seconds"] == size and len(body["probes"]) == count and body["range"] == range_
    starts = [datetime.fromisoformat(p["checked_at"]).timestamp() for p in body["probes"]]
    assert all(b - a == size for a, b in zip(starts, starts[1:]))
    assert ctx.client.get("/v1/admin/system", params={"range": "2h"}).status_code == 422


def test_probe_bucket_marks_a_failed_check_down_and_keeps_the_slowest_ms(ctx, admin):
    now = NOW()
    at = now - timedelta(seconds=10)
    cell = lambda status, ms: {"status": status, "ms": ms}  # noqa: E731
    with ctx.sessions.begin() as db:
        db.add(HealthProbe(checked_at=at - timedelta(seconds=1), components={k: cell("ok", 20) for k in health.COMPONENTS}))
        db.add(HealthProbe(checked_at=at, components={**{k: cell("ok", 70) for k in health.COMPONENTS}, "sandbox": cell("down", 2000)}))
    with ctx.sessions() as db:
        size, buckets = health.probe_buckets(db, "1m", now)
    got = [b for b in buckets if b["components"]["postgres"]["checks"]]
    assert size == 30 and 1 <= len(got) <= 2
    total = {k: sum(b["components"][k]["checks"] for b in got) for k in ("postgres", "sandbox")}
    assert total == {"postgres": 2, "sandbox": 2}
    sandbox = [b["components"]["sandbox"] for b in got]
    assert any(c["status"] == "down" and c["failed"] == 1 and c["ms"] == 2000 for c in sandbox)
    assert max(b["components"]["postgres"]["ms"] for b in got) == 70
