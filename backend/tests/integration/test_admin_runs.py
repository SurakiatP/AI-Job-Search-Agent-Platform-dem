"""Admin AI runs API: list, filters, detail, cancel, retry. Metadata only; both actions audited."""
import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session as make_session
from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import AdminAuditLog, LlmCall, OwnerSession, Run, RunEvent, User
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.main import create_app
from job_search_platform.services import admin_runs, passwords
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.contracts import Actor
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.runs import RunService

pytestmark = pytest.mark.integration
PW = "long-enough-pw"
ORIGIN = "http://127.0.0.1:8765"
SECRET = "SYNTHETIC-PRIVATE-TEXT"


class _Stub:
    async def start(self): return None
    async def close(self): return None
    async def reconcile_pending(self): return None


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    owner_sessions = OwnerSessions(sessions, public_origin=ORIGIN)
    mailer = MemoryMailer()
    services = Services(sessions=sessions, owner_sessions=owner_sessions, files=_Stub(), documents=None,
                        runs=RunService(sessions), grants=None, settings=None, approvals=None, supervisor=_Stub(),
                        runtime=_Stub(), queue=None,
                        accounts=Accounts(sessions, owner_sessions, mailer, public_origin=ORIGIN), mailer=mailer)
    with TestClient(create_app(services), base_url=ORIGIN) as client:
        yield SimpleNamespace(client=client, sessions=sessions)


def add_user(ctx, email, *, admin=False):
    with ctx.sessions.begin() as db:
        row = User(email=email, password_hash=passwords.hash_password(PW), email_verified_at=datetime.now(timezone.utc),
                   is_admin=admin)
        db.add(row)
        db.flush()
        return row.id


def login(ctx, email):
    response = ctx.client.post("/v1/auth/login", json={"email": email, "password": PW})
    assert response.status_code == 200
    return {"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}


def as_admin(ctx):
    add_user(ctx, "admin@example.test", admin=True)
    return login(ctx, "admin@example.test")


def seed(ctx):
    """One owner with a paired project and three runs: A done with 2 calls, B failed without calls, C queued."""
    with ctx.sessions.begin() as db:
        user = owner(db, email="owner@example.test")
        p = project(db, "Synthetic project", owner=user)
        chat = make_session(db, p.id)
        cv, job = revisions(db, p.id)
        provider_config(db)
        now = datetime.now(timezone.utc)
        ids = {}

        def add(name, operation, status, age, snapshot, **extra):
            run = Run(project_id=p.id, actor_scope=f"user:{user.user_id}", idempotency_key=name, request_digest="0" * 64,
                      session_id=chat.id, operation=operation, cv_revision_id=cv.id, job_revision_id=job.id,
                      input_snapshot={"cv_text": SECRET}, config_snapshot=snapshot, output_language="en",
                      status=status, created_at=now - timedelta(minutes=age), **extra)
            db.add(run)
            db.flush()
            ids[name] = run.id
            return run

        a = add("a", "evaluate_job", "completed", 30, {"gateway": {"analyze_model": "snap-a"}},
                result_payload={"answer": SECRET}, finished_at=now - timedelta(minutes=30) + timedelta(seconds=12))
        b = add("b", "draft_documents", "failed", 20, {"gateway": {"analyze_model": "snap-b"}},
                finished_at=now - timedelta(minutes=20) + timedelta(seconds=5))
        add("c", "evaluate_job", "queued", 10, {"gateway": {"analyze_model": "snap-c"}})
        db.add_all([
            LlmCall(run_id=a.id, user_id=user.user_id, operation="evaluate_job", model="m-one", input_tokens=100,
                    output_tokens=20, cached_tokens=10, latency_ms=900, price_source="openrouter", cost_usd=0.5,
                    created_at=now - timedelta(minutes=29)),
            LlmCall(run_id=a.id, user_id=user.user_id, operation="evaluate_job", model="m-two", input_tokens=50,
                    output_tokens=5, cached_tokens=0, latency_ms=400, price_source="manual", cost_usd=0.25,
                    created_at=now - timedelta(minutes=28)),
            RunEvent(project_id=p.id, run_id=a.id, sequence=1, event_type="run_started",
                     public_data={"status": "running", "step": "scan", "message_key": "events.run_started"}),
            RunEvent(project_id=p.id, run_id=a.id, sequence=2, event_type="run_progress",
                     public_data={"status": "running", "message_key": f"{SECRET} free text from the model!"}),
            RunEvent(project_id=p.id, run_id=b.id, sequence=1, event_type="run_failed",
                     public_data={"status": "failed", "message_key": "errors.provider_timeout"}),
        ])
        return SimpleNamespace(ids=ids, user_id=user.user_id, project_id=p.id, chat_id=chat.id, job_id=job.id)


def test_list_aggregates_and_filters(ctx):
    seeded = seed(ctx)
    as_admin(ctx)
    page = ctx.client.get("/v1/admin/runs").json()
    names = {str(v): k for k, v in seeded.ids.items()}
    assert [names[i["id"]] for i in page["items"]] == ["c", "b", "a"]  # newest first
    c, b, a = page["items"]
    assert (a["input_tokens"], a["output_tokens"], a["cached_tokens"]) == (150, 25, 10)
    assert a["cost_usd"] == pytest.approx(0.75) and a["cost_is_manual"] is True
    assert a["model"] == "m-two" and a["duration_seconds"] == pytest.approx(12)
    assert a["user_id"] == str(seeded.user_id) and a["user_short_id"].startswith("u_") and "…" in a["user_short_id"]
    assert a["started_at"] is not None and a["failure_key"] is None
    assert b["cost_usd"] is None and b["cost_is_manual"] is False and b["model"] == "snap-b"  # no calls: snapshot model
    assert b["failure_key"] == "errors.provider_timeout" and b["duration_seconds"] == pytest.approx(5)
    assert c["duration_seconds"] is None and c["failure_key"] is None

    def ids(**params):
        return [names[i["id"]] for i in ctx.client.get("/v1/admin/runs", params=params).json()["items"]]

    assert ids(status="failed") == ["b"]
    assert ids(operation="evaluate_job") == ["c", "a"]
    assert ids(model="m-one") == ["a"]  # any call of the run counts
    assert ids(model="snap-b") == ["b"] and ids(model="snap-a") == []  # snapshot only when the run has no calls
    cut = a["created_at"]
    assert ids(since=cut) == ["c", "b", "a"] and ids(until=cut) == []
    assert ids(since=b["created_at"], until=c["created_at"]) == ["b"]
    assert ctx.client.get("/v1/admin/runs", params={"status": "nope"}).status_code == 422
    assert ctx.client.get("/v1/admin/runs", params={"cursor": "not-a-cursor"}).status_code == 400


def test_cursor_pages_newest_first(ctx):
    seed(ctx)
    with ctx.sessions() as db:
        first = admin_runs.list_runs(db, {}, limit=2)
        assert len(first["items"]) == 2 and first["next_cursor"]
        second = admin_runs.list_runs(db, {}, first["next_cursor"], limit=2)
        assert len(second["items"]) == 1 and second["next_cursor"] is None
        assert len({i["id"] for i in first["items"] + second["items"]}) == 3
    as_admin(ctx)
    assert ctx.client.get("/v1/admin/runs").json()["next_cursor"] is None


def test_responses_carry_no_snapshots_payloads_or_event_text(ctx):
    seeded = seed(ctx)
    as_admin(ctx)
    listing = ctx.client.get("/v1/admin/runs")
    detail = ctx.client.get(f"/v1/admin/runs/{seeded.ids['a']}")
    for response in (listing, detail):
        assert response.status_code == 200
        assert SECRET not in response.text
        assert not {"input_snapshot", "config_snapshot", "result_payload", "evaluation_result"} & set(response.text.split('"'))
    body = detail.json()
    assert set(body) == {"run", "events", "calls"}
    assert [e["event_type"] for e in body["events"]] == ["run_started", "run_progress"]
    assert body["events"][0]["message_key"] == "events.run_started" and body["events"][0]["step"] == "scan"
    assert body["events"][1]["message_key"] is None  # text-shaped keys are dropped
    assert [c["model"] for c in body["calls"]] == ["m-one", "m-two"] and body["calls"][1]["price_source"] == "manual"
    assert ctx.client.get(f"/v1/admin/runs/{uuid4()}").status_code == 404


def test_failure_key_never_free_text(ctx):
    seeded = seed(ctx)
    with ctx.sessions.begin() as db:
        event = db.scalar(select(RunEvent).where(RunEvent.run_id == seeded.ids["b"]))
        event.public_data = {"status": "failed", "message_key": f"{SECRET} boom"}
    as_admin(ctx)
    run = ctx.client.get(f"/v1/admin/runs/{seeded.ids['b']}").json()["run"]
    assert run["failure_key"] == "errors.run_failed"


def audit_rows(ctx, action):
    with ctx.sessions() as db:
        return list(db.scalars(select(AdminAuditLog).where(AdminAuditLog.action == action)))


def test_cancel_queued_and_running_then_refuse_finished(ctx):
    seeded = seed(ctx)
    headers = as_admin(ctx)
    queued = ctx.client.post(f"/v1/admin/runs/{seeded.ids['c']}/cancel", headers=headers)
    assert queued.status_code == 200
    body = queued.json()
    assert body["run"]["status"] == "cancelled" and body["run"]["finished_at"] is not None
    assert body["events"][-1]["event_type"] == "run_cancelled"
    rows = audit_rows(ctx, "run.cancel")
    assert len(rows) == 1 and rows[0].target_id == str(seeded.ids["c"]) and rows[0].target_type == "run"

    with ctx.sessions.begin() as db:
        db.get(Run, seeded.ids["b"]).status = "running"
    running = ctx.client.post(f"/v1/admin/runs/{seeded.ids['b']}/cancel", headers=headers).json()
    assert running["run"]["status"] == "running" and running["events"][-1]["event_type"] == "run_cancel_requested"

    done = ctx.client.post(f"/v1/admin/runs/{seeded.ids['a']}/cancel", headers=headers)
    assert done.status_code in {400, 409} and done.json()["code"] == "run_finished"
    assert len(audit_rows(ctx, "run.cancel")) == 2
    assert ctx.client.post(f"/v1/admin/runs/{uuid4()}/cancel", headers=headers).status_code == 404
    assert ctx.client.post(f"/v1/admin/runs/{seeded.ids['a']}/cancel").status_code == 403  # no CSRF


def test_retry_requeues_with_owner_scope_and_audit_and_refuses_completed(ctx):
    seeded = seed(ctx)
    headers = as_admin(ctx)
    # a real run from the project owner, then failed
    real = asyncio.run(_submit_as_owner(ctx, seeded))
    with ctx.sessions.begin() as db:
        source = db.get(Run, real)
        source.status, source.finished_at = "failed", datetime.now(timezone.utc)
        scope = source.actor_scope
    response = ctx.client.post(f"/v1/admin/runs/{real}/retry", headers=headers)
    assert response.status_code == 200, response.text
    new = response.json()["run"]
    assert new["status"] == "queued" and new["retry_of_id"] == str(real) and new["id"] != str(real)
    with ctx.sessions() as db:
        row = db.get(Run, new["id"])
        assert row.actor_scope == scope and row.idempotency_key == f"admin-retry:{real}"
        assert row.input_snapshot["cv_revision_id"]  # built by the owner path, not copied from the admin
    rows = audit_rows(ctx, "run.retry")
    assert len(rows) == 1 and rows[0].target_id == str(real) and rows[0].detail["new_run_id"] == new["id"]
    assert ctx.client.post(f"/v1/admin/runs/{real}/retry", headers=headers).json()["run"]["id"] == new["id"]  # replay, audited again

    refused = ctx.client.post(f"/v1/admin/runs/{seeded.ids['a']}/retry", headers=headers)  # completed
    assert refused.status_code == 409 and refused.json()["code"] == "retry_not_allowed"
    assert len(audit_rows(ctx, "run.retry")) == 2  # the refused retry wrote nothing
    assert ctx.client.post(f"/v1/admin/runs/{uuid4()}/retry", headers=headers).status_code == 404


async def _submit_as_owner(ctx, seeded):
    now = datetime.now(timezone.utc)
    sid = uuid4()
    with ctx.sessions.begin() as db:
        db.add(OwnerSession(id=sid, user_id=seeded.user_id, session_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                            csrf_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                            expires_at=now + timedelta(hours=1), last_seen_at=now))
    actor = Actor("user", sid, None, None, frozenset(), seeded.user_id)
    view = await RunService(ctx.sessions).submit(actor, seeded.project_id,
                                                  run_request(seeded.chat_id, seeded.job_id, key="owner-run"))
    return view.id


def test_non_admin_gets_403_everywhere(ctx):
    seeded = seed(ctx)
    add_user(ctx, "plain@example.test")
    headers = login(ctx, "plain@example.test")
    rid = seeded.ids["b"]
    assert ctx.client.get("/v1/admin/runs").status_code == 403
    assert ctx.client.get(f"/v1/admin/runs/{rid}").status_code == 403
    assert ctx.client.post(f"/v1/admin/runs/{rid}/cancel", headers=headers).status_code == 403
    assert ctx.client.post(f"/v1/admin/runs/{rid}/retry", headers=headers).status_code == 403
    assert audit_rows(ctx, "run.cancel") == [] and audit_rows(ctx, "run.retry") == []
