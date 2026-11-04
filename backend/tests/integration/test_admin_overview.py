"""Admin Overview, CSV, prefs and Usage: live aggregates over runs, llm_calls and sessions. Metadata only."""
import csv
import io
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from helpers import project, provider_config, revisions, session as make_session
from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import AdminAuditLog, HealthProbe, LlmCall, OwnerSession, Run, User
from job_search_platform.main import create_app
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import health, passwords
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.webhooks import Webhooks

pytestmark = pytest.mark.integration
PW = "long-enough-pw"
ORIGIN = "http://127.0.0.1:8765"
NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


class _Stub:
    image = "sandbox@sha256:" + "0" * 64

    async def start(self): return None
    async def close(self): return None
    async def reconcile_pending(self): return None
    async def ping(self): return None
    object_store = property(lambda self: self)


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(health, "gateway_alive", lambda: None)
    monkeypatch.setattr(health, "image_present", lambda image: None)


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    owner_sessions = OwnerSessions(sessions, public_origin=ORIGIN)
    mailer = MemoryMailer()
    services = Services(sessions=sessions, owner_sessions=owner_sessions, files=_Stub(),
                        documents=None, runs=None, grants=None, settings=None, approvals=None, supervisor=_Stub(),
                        runtime=_Stub(), queue=None, webhooks=Webhooks(sessions),
                        accounts=Accounts(sessions, owner_sessions, mailer, public_origin=ORIGIN), mailer=mailer)
    with TestClient(create_app(services), base_url=ORIGIN) as client:
        yield SimpleNamespace(client=client, sessions=sessions)


def add_user(ctx, email, *, admin=False):
    with ctx.sessions.begin() as db:
        row = User(email=email, password_hash=passwords.hash_password(PW), email_verified_at=NOW(), is_admin=admin)
        db.add(row)
        db.flush()
        return row.id


def login(ctx, email):
    response = ctx.client.post("/v1/auth/login", json={"email": email, "password": PW})
    assert response.status_code == 200, response.text
    return {"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}


@pytest.fixture
def admin(ctx):
    admin_id = add_user(ctx, "admin@example.test", admin=True)
    return SimpleNamespace(id=admin_id, headers=login(ctx, "admin@example.test"))


def add_run(ctx, owner_id, *, status="completed", operation="evaluate_job", ago=timedelta(0), took=timedelta(seconds=10)):
    created = NOW() - ago
    with ctx.sessions.begin() as db:
        proj = project(db, owner=SimpleNamespace(user_id=owner_id))
        cv, job = revisions(db, proj.id)
        row = Run(project_id=proj.id, session_id=make_session(db, proj.id).id, actor_scope=f"user:{owner_id}",
                  idempotency_key=uuid4().hex, request_digest="0" * 64, operation=operation, cv_revision_id=cv.id,
                  job_revision_id=job.id, provider_configuration_id=provider_config(db).id, input_snapshot={"cv": "SECRET CV TEXT"},
                  config_snapshot={}, output_language="en", status=status, created_at=created,
                  finished_at=created + took if status in ("completed", "failed") else None)
        db.add(row)


def add_call(ctx, *, operation="evaluate_job", model="m/a", cost="0.01", source="openrouter", ago=timedelta(0), user_id=None, tokens=(100, 20, 5)):
    with ctx.sessions.begin() as db:
        db.add(LlmCall(operation=operation, model=model, user_id=user_id, input_tokens=tokens[0], output_tokens=tokens[1],
                       cached_tokens=tokens[2], latency_ms=900, price_source=None if cost is None else source,
                       cost_usd=None if cost is None else Decimal(cost), created_at=NOW() - ago))


def test_non_admin_gets_403_on_every_route(ctx):
    add_user(ctx, "plain@example.test")
    headers = login(ctx, "plain@example.test")
    for path in ("/overview", "/overview.csv", "/prefs", "/usage?group_by=task", "/system", "/webhooks",
                 f"/overview/bucket?metric=runs&start={NOW().isoformat()}"):
        assert ctx.client.get("/v1/admin" + path).status_code == 403, path
    assert ctx.client.put("/v1/admin/prefs", headers=headers, json={"widgets": ["trend"], "thb_rate": 35}).status_code == 403
    assert ctx.client.post(f"/v1/admin/webhooks/{uuid4()}/resend", headers=headers).status_code == 403


def test_empty_database_returns_zeros_not_errors(ctx, admin):
    for range_ in ("1m", "30m", "7d", "all"):
        response = ctx.client.get(f"/v1/admin/overview?range={range_}")
        assert response.status_code == 200, (range_, response.text)
        body = response.json()
        assert body["kpis"]["runs"]["value"] == 0 and body["kpis"]["failure_rate"]["value"] == 0
        assert body["kpis"]["cost_usd"] == {"value": 0, "previous": 0 if range_ != "all" else None} and body["kpis"]["cost_has_manual"] is False
        assert sum(p["runs"] for p in body["series"]) == 0 and body["top_tasks"] == [] and body["cost_by_model"] == []
        assert body["speed"] == {"within_30s_ratio": None, "target": 0.9} and body["weekday"] == [0.0] * 7
        assert body["compare"] is (range_ != "all") and (body["previous_series"] == [] if range_ == "all" else len(body["previous_series"]) == len(body["series"]))
    assert body["kpis"]["runs"]["previous"] is None
    for group in ("task", "model", "day", "user"):
        empty = ctx.client.get("/v1/admin/usage", params={"group_by": group, "range": "30d"}).json()
        assert empty["rows"] == [] and empty["totals"]["requests"] == 0 and empty["totals"]["cost_usd"] is None
    assert ctx.client.get("/v1/admin/webhooks").json() == [] and ctx.client.get("/v1/admin/overview/bucket", params={
        "range": "1h", "metric": "runs", "start": NOW().isoformat()}).json()["parts"] == []


def test_overview_aggregates_kpis_series_and_widgets(ctx, admin):
    owner = add_user(ctx, "owner@example.test")
    for _ in range(3):
        add_run(ctx, owner, took=timedelta(seconds=10))
    add_run(ctx, owner, took=timedelta(seconds=50))
    add_run(ctx, owner, status="failed", operation="tailor_cv")
    add_run(ctx, owner, ago=timedelta(days=9))  # previous 7 days
    with ctx.sessions.begin() as db:
        for n in range(2):
            db.add(OwnerSession(user_id=owner, session_hash=bytes([n]) * 32, csrf_hash=b"c" * 32, expires_at=NOW() + timedelta(days=1)))
    add_call(ctx, cost="0.02", model="m/a")
    add_call(ctx, cost="0.03", model="m/b", source="manual")
    add_call(ctx, cost=None, model="m/b")  # before cost tracking: counted, no cost
    body = ctx.client.get("/v1/admin/overview?range=7d").json()
    assert body["bucket_seconds"] == 86400 and len(body["series"]) == 7
    assert body["kpis"]["runs"] == {"value": 5, "previous": 1}
    assert body["kpis"]["failure_rate"] == {"value": 0.2, "previous": 0}
    assert body["kpis"]["active_users"]["value"] == 1  # the owner's two sessions count once; the admin's login does not
    assert sum(p["active_users"] for p in body["series"]) == 1
    assert body["kpis"]["cost_usd"]["value"] == pytest.approx(0.05) and body["kpis"]["cost_has_manual"] is True
    assert sum(p["runs"] for p in body["series"]) == 5 and sum(p["failures"] for p in body["series"]) == 1
    assert sum(p["cost_usd"] for p in body["series"]) == pytest.approx(0.05)
    assert body["speed"]["within_30s_ratio"] == 0.75  # 3 of 4 completed runs finished within 30 s
    tasks = {t["operation"]: t for t in body["top_tasks"]}
    assert tasks["evaluate_job"]["runs"] == 4 and tasks["tailor_cv"]["failure_rate"] == 1
    assert tasks["evaluate_job"]["p50_seconds"] == 10 and tasks["evaluate_job"]["cost_usd"] == pytest.approx(0.05)
    assert [(c["model"], c["calls"], c["has_manual"]) for c in body["cost_by_model"]] == [("m/b", 2, True), ("m/a", 1, False)]
    assert sum(body["weekday"]) > 0 and max(body["weekday"]) <= 5 / 12  # 5 runs spread over one of ~13 same weekdays
    failed = [a for a in body["attention"] if a["kind"] == "failed_runs"]
    assert failed == [{"kind": "failed_runs", "severity": "bad", "title_key": "attention.failed_runs",
                       "params": {"count": 1, "operation": "tailor_cv", "hours": 24},
                       "target": "/admin/runs?status=failed&operation=tailor_cv"}]
    assert body["health"]["components"] == {"postgres": "ok", "object_store": "ok", "llm_gateway": "ok", "sandbox": "ok"}
    assert "SECRET CV TEXT" not in ctx.client.get("/v1/admin/overview?range=7d").text


def test_short_range_buckets_and_previous_window(ctx, admin):
    owner = add_user(ctx, "owner@example.test")
    add_run(ctx, owner, ago=timedelta(seconds=2))
    add_run(ctx, owner, ago=timedelta(seconds=40))  # inside 1 minute, an earlier bucket
    add_run(ctx, owner, ago=timedelta(seconds=75))  # previous minute
    body = ctx.client.get("/v1/admin/overview?range=1m").json()
    assert body["bucket_seconds"] == 5 and len(body["series"]) == len(body["previous_series"]) == 12
    assert body["kpis"]["runs"] == {"value": 2, "previous": 1}
    starts = [datetime.fromisoformat(p["start"]) for p in body["series"]]
    assert all((b - a).total_seconds() == 5 for a, b in zip(starts, starts[1:]))
    assert ctx.client.get("/v1/admin/overview?range=2h").status_code == 422


def test_attention_lists_health_ingest_and_dead_webhooks(ctx, admin):
    from job_search_platform.db.models import IngestRun, Project, WebhookDelivery, WebhookEndpoint
    with ctx.sessions.begin() as db:
        db.add(HealthProbe(checked_at=NOW(), components={"postgres": "ok", "object_store": "ok", "llm_gateway": "down", "sandbox": "ok"}))
        db.add(IngestRun(started_at=NOW() - timedelta(hours=2), finished_at=NOW() - timedelta(hours=1), status="partial", per_board={
            "greenhouse:acme": {"state": "failed", "error": "status_503"}, "lever:b": {"state": "skipped"}, "freehire:-": {"state": "ok", "fetched": 1}}))
        owner = User(email="o@example.test", password_hash="x", email_verified_at=NOW())
        db.add(owner)
        db.flush()
        proj = project(db, owner=SimpleNamespace(user_id=owner.id))
        hook = WebhookEndpoint(project_id=proj.id, url="https://hooks.example.test/secret-path?token=abc", events=["run.completed"], secret="s")
        db.add(hook)
        db.flush()
        db.add(WebhookDelivery(project_id=proj.id, endpoint_id=hook.id, event_type="run.completed", payload={"x": 1}, status="dead", attempts=8))
    attention = {(a["kind"], tuple(sorted(a["params"].items()))): a for a in ctx.client.get("/v1/admin/overview?range=1h").json()["attention"]}
    assert ("health_down", (("component", "llm_gateway"),)) in attention
    assert ("ingest_failed", (("board", "greenhouse:acme"), ("error", "status_503"))) in attention
    assert ("ingest_partial", (("board", "lever:b"),)) in attention
    assert attention[("dead_webhooks", (("count", 1),))]["severity"] == "warn"


def test_bucket_breakdown_per_task(ctx, admin):
    owner = add_user(ctx, "owner@example.test")
    add_run(ctx, owner, operation="evaluate_job", ago=timedelta(seconds=1))
    add_run(ctx, owner, operation="evaluate_job", status="failed", ago=timedelta(seconds=1))
    add_run(ctx, owner, operation="tailor_cv", ago=timedelta(seconds=1))
    add_call(ctx, operation="tailor_cv", cost="0.5", ago=timedelta(seconds=1))
    start = (NOW() - timedelta(seconds=60)).isoformat()
    runs = ctx.client.get("/v1/admin/overview/bucket", params={"range": "1h", "metric": "runs", "start": start}).json()
    assert runs["value"] == 3 and runs["parts"] == [{"operation": "evaluate_job", "value": 2}, {"operation": "tailor_cv", "value": 1}]
    assert datetime.fromisoformat(runs["end"]) - datetime.fromisoformat(runs["start"]) == timedelta(seconds=120)
    wide = {"range": "7d", "start": (NOW() - timedelta(days=1)).isoformat()}
    fail = ctx.client.get("/v1/admin/overview/bucket", params={**wide, "metric": "failure_rate"}).json()
    assert fail["value"] == pytest.approx(1 / 3) and fail["parts"] == [{"operation": "evaluate_job", "value": 0.5}]
    cost = ctx.client.get("/v1/admin/overview/bucket", params={**wide, "metric": "cost_usd"}).json()
    assert cost["value"] == 0.5 and cost["parts"] == [{"operation": "tailor_cv", "value": 0.5}]
    with ctx.sessions.begin() as db:  # the admin's own login session must not count
        db.add(OwnerSession(user_id=owner, session_hash=b"o" * 32, csrf_hash=b"c" * 32, expires_at=NOW() + timedelta(days=1), last_seen_at=NOW() - timedelta(hours=1)))
    users = ctx.client.get("/v1/admin/overview/bucket", params={**wide, "metric": "active_users"}).json()
    assert users["value"] == 1 and {p["operation"] for p in users["parts"]} == {"evaluate_job", "tailor_cv"}


def test_csv_has_bucket_rows_and_no_personal_data(ctx, admin):
    owner = add_user(ctx, "owner@example.test")
    add_run(ctx, owner)
    add_call(ctx, cost="0.25", user_id=owner)
    response = ctx.client.get("/v1/admin/overview.csv?range=7d")
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="overview-7d.csv"'
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["bucket_start", "runs", "failures", "active_users", "cost_usd"] and len(rows) == 8
    assert sum(int(r[1]) for r in rows[1:]) == 1 and sum(float(r[4]) for r in rows[1:]) == pytest.approx(0.25)
    assert "example.test" not in response.text and str(owner) not in response.text


def test_prefs_default_save_and_validation(ctx, admin):
    assert ctx.client.get("/v1/admin/prefs").json() == {"widgets": ["trend", "attention", "weekday", "speed", "tasks"], "thb_rate": 35}
    saved = ctx.client.put("/v1/admin/prefs", headers=admin.headers, json={"widgets": ["trend", "models", "trend"], "thb_rate": 36.5})
    assert saved.status_code == 200 and saved.json() == {"widgets": ["trend", "models"], "thb_rate": 36.5}
    assert ctx.client.get("/v1/admin/prefs").json() == saved.json()
    for bad in ({"widgets": ["nope"], "thb_rate": 35}, {"widgets": ["trend"], "thb_rate": 0}, {"widgets": ["trend"], "thb_rate": -1}):
        assert ctx.client.put("/v1/admin/prefs", headers=admin.headers, json=bad).status_code == 422
    bad = ctx.client.put("/v1/admin/prefs", headers=admin.headers, json={"widgets": ["nope"], "thb_rate": 35}).json()
    assert bad["code"] == "invalid_prefs"
    assert ctx.client.put("/v1/admin/prefs", json={"widgets": ["trend"], "thb_rate": 35}).status_code == 403  # no CSRF
    with ctx.sessions() as db:
        assert db.query(AdminAuditLog).count() == 0  # prefs are not audited


def test_usage_groups_by_task_model_day_and_user(ctx, admin):
    alice, bob = add_user(ctx, "alice@example.test"), add_user(ctx, "bob@example.test")
    add_call(ctx, operation="evaluate_job", model="m/a", cost="0.10", user_id=alice, tokens=(1000, 100, 10))
    add_call(ctx, operation="evaluate_job", model="m/a", cost="0.30", user_id=alice, tokens=(2000, 200, 20))
    add_call(ctx, operation="tailor_cv", model="m/b", cost="0.05", source="manual", user_id=bob)
    add_call(ctx, operation="tailor_cv", model="m/b", cost=None, user_id=bob)
    add_call(ctx, operation="document_ocr", model="m/b", cost="1", ago=timedelta(days=3))
    add_call(ctx, operation="document_ocr", model="m/b", cost="9", ago=timedelta(days=45))  # outside 30d
    task = ctx.client.get("/v1/admin/usage", params={"group_by": "task", "range": "30d"}).json()
    rows = {r["key"]: r for r in task["rows"]}
    assert task["group_by"] == "task" and list(rows) == ["document_ocr", "evaluate_job", "tailor_cv"]
    ev = rows["evaluate_job"]
    assert (ev["requests"], ev["input_tokens"], ev["output_tokens"], ev["cached_tokens"]) == (2, 3000, 300, 30)
    assert ev["cost_usd"] == pytest.approx(0.4) and ev["cost_per_request_usd"] == pytest.approx(0.2) and not ev["has_manual"]
    tc = rows["tailor_cv"]
    assert tc["requests"] == 2 and tc["uncosted_requests"] == 1 and tc["has_manual"] and tc["cost_per_request_usd"] == pytest.approx(0.05)
    assert task["totals"]["requests"] == 5 and task["totals"]["cost_usd"] == pytest.approx(1.45) and task["totals"]["uncosted_requests"] == 1
    assert [r["key"] for r in ctx.client.get("/v1/admin/usage", params={"group_by": "model", "range": "all"}).json()["rows"]] == ["m/b", "m/a"]
    days = ctx.client.get("/v1/admin/usage", params={"group_by": "day", "range": "30d"}).json()["rows"]
    assert len(days) == 2 and days[0]["key"] < days[1]["key"] and days[0]["requests"] == 1 and len(days[0]["key"]) == 10
    users = ctx.client.get("/v1/admin/usage", params={"group_by": "user", "range": "30d"}).json()["rows"]
    assert {r["key"] for r in users} == {f"u_{alice.hex[:4]}…{alice.hex[-3:]}", f"u_{bob.hex[:4]}…{bob.hex[-3:]}", ""}
    assert "alice@example.test" not in str(users)
    assert ctx.client.get("/v1/admin/usage?group_by=nope").status_code == 422
    assert ctx.client.get("/v1/admin/usage").status_code == 422
