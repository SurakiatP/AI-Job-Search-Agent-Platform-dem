"""Admin Users API: list, detail, suspend, enable, reset link, delete. Metadata only; every action audited."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import project, provider_config, revisions, session as make_session
from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import AdminAuditLog, OwnerSession, Run, User
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.main import create_app
from job_search_platform.services import passwords
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.owner_sessions import OwnerSessions

pytestmark = pytest.mark.integration
PW = "long-enough-pw"
ORIGIN = "http://127.0.0.1:8765"


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
    services = Services(sessions=sessions, owner_sessions=owner_sessions, files=_Stub(), documents=None, runs=None,
                        grants=None, settings=None, approvals=None, supervisor=_Stub(), runtime=_Stub(), queue=None,
                        accounts=Accounts(sessions, owner_sessions, mailer, public_origin=ORIGIN), mailer=mailer)
    with TestClient(create_app(services), base_url=ORIGIN) as client:
        yield SimpleNamespace(client=client, sessions=sessions, mailer=mailer)


def add_user(ctx, email, *, admin=False, created=None):
    with ctx.sessions.begin() as db:
        row = User(email=email, password_hash=passwords.hash_password(PW), email_verified_at=datetime.now(timezone.utc),
                   is_admin=admin, **({"created_at": created} if created else {}))
        db.add(row)
        db.flush()
        return row.id


def login(ctx, email):
    response = ctx.client.post("/v1/auth/login", json={"email": email, "password": PW})
    assert response.status_code == 200
    return {"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrf_token"]}


def add_run(ctx, owner_id, status="queued", created=None):
    with ctx.sessions.begin() as db:
        proj = project(db, owner=SimpleNamespace(user_id=owner_id))
        cv, job = revisions(db, proj.id)
        db.add(Run(project_id=proj.id, session_id=make_session(db, proj.id).id, actor_scope=f"user:{owner_id}",
                   idempotency_key=uuid4().hex, request_digest="0" * 64, operation="evaluate_job", cv_revision_id=cv.id,
                   job_revision_id=job.id, provider_configuration_id=provider_config(db).id, input_snapshot={},
                   config_snapshot={}, output_language="en", status=status,
                   **({"created_at": created} if created else {})))


def audit(ctx):
    with ctx.sessions() as db:
        return [(r.action, r.target_id, r.detail) for r in db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at))]


def test_non_admin_is_refused_everywhere(ctx):
    add_user(ctx, "plain@example.test")
    target = add_user(ctx, "target@example.test")
    headers = login(ctx, "plain@example.test")
    assert ctx.client.get("/v1/admin/users").status_code == 403
    assert ctx.client.get(f"/v1/admin/users/{target}").status_code == 403
    assert ctx.client.post(f"/v1/admin/users/{target}/suspend", headers=headers).status_code == 403
    assert audit(ctx) == []


def test_list_search_status_range_and_pages(ctx):
    now = datetime.now(timezone.utc)
    add_user(ctx, "admin@example.test", admin=True, created=now)
    alice = add_user(ctx, "alice@example.test", created=now - timedelta(days=1))
    bob = add_user(ctx, "bob@example.test", created=now - timedelta(days=2))
    carol = add_user(ctx, "carol@example.test", created=now - timedelta(days=3))
    with ctx.sessions.begin() as db:
        db.get(User, bob).disabled_at = now
        db.get(User, carol).disabled_at = now
        db.get(User, carol).deletion_requested_at = now
    add_run(ctx, alice)
    add_run(ctx, alice, created=now - timedelta(days=40))
    login(ctx, "admin@example.test")

    items = ctx.client.get("/v1/admin/users").json()["items"]
    assert [i["email"] for i in items] == ["admin@example.test", "alice@example.test", "bob@example.test", "carol@example.test"]
    by_email = {i["email"]: i for i in items}
    assert by_email["admin@example.test"]["is_admin"] and by_email["admin@example.test"]["last_seen_at"]
    assert by_email["alice@example.test"]["last_seen_at"] is None
    assert by_email["alice@example.test"]["short_id"] == f"u_{alice.hex[:4]}…{alice.hex[-3:]}"
    assert [by_email[e]["status"] for e in ("alice@example.test", "bob@example.test", "carol@example.test")] == [
        "active", "suspended", "deleting"]
    assert by_email["alice@example.test"]["runs_in_range"] == 1  # default 7d
    assert ctx.client.get("/v1/admin/users?range=all").json()["items"][1]["runs_in_range"] == 2

    assert [i["email"] for i in ctx.client.get("/v1/admin/users?q=ALI").json()["items"]] == ["alice@example.test"]
    assert ctx.client.get("/v1/admin/users?q=%25").json()["items"] == []
    for status, emails in (("active", {"admin@example.test", "alice@example.test"}), ("suspended", {"bob@example.test"}),
                           ("deleting", {"carol@example.test"})):
        assert {i["email"] for i in ctx.client.get(f"/v1/admin/users?status={status}").json()["items"]} == emails

    from job_search_platform.services import admin_users
    with ctx.sessions() as db:
        first = admin_users.list_users(db, page_size=3)
        second = admin_users.list_users(db, page=1, page_size=3)
        beyond = admin_users.list_users(db, page=5, page_size=3)
    assert len(first["items"]) == 3 and [i["email"] for i in second["items"]] == ["carol@example.test"]
    assert (first["total"], second["total"], second["page"], second["page_size"]) == (4, 4, 1, 3)
    assert beyond["items"] == second["items"] and beyond["page"] == 1  # out of range: last page
    assert ctx.client.get("/v1/admin/users?status=suspended").json()["total"] == 1  # total follows the filters
    assert ctx.client.get("/v1/admin/users?page=-1").status_code == 422
    assert ctx.client.get("/v1/admin/users?page_size=51").status_code == 422
    assert ctx.client.get("/v1/admin/users").json()["page_size"] == 10


def test_detail_counts(ctx):
    add_user(ctx, "admin@example.test", admin=True)
    alice = add_user(ctx, "alice@example.test")
    add_run(ctx, alice)
    add_run(ctx, alice, status="completed")
    login(ctx, "admin@example.test")
    body = ctx.client.get(f"/v1/admin/users/{alice}").json()
    assert body["user"]["email"] == "alice@example.test"
    assert (body["project_count"], body["cv_count"], body["run_count"]) == (2, 2, 2)
    assert ctx.client.get(f"/v1/admin/users/{uuid4()}").status_code == 404


def test_suspend_and_enable(ctx):
    admin = add_user(ctx, "admin@example.test", admin=True)
    alice = add_user(ctx, "alice@example.test")
    ctx.client.post("/v1/auth/login", json={"email": "alice@example.test", "password": PW})  # alice has a live session
    ctx.client.cookies.clear()
    headers = login(ctx, "admin@example.test")

    response = ctx.client.post(f"/v1/admin/users/{alice}/suspend", headers=headers)
    assert response.status_code == 200 and response.json()["user"]["status"] == "suspended"
    with ctx.sessions() as db:
        assert db.get(User, alice).disabled_at is not None
        assert all(s.revoked_at for s in db.scalars(select(OwnerSession).where(OwnerSession.user_id == alice)))
    assert ctx.client.post("/v1/auth/login", json={"email": "alice@example.test", "password": PW}).status_code == 401
    headers = login(ctx, "admin@example.test")

    response = ctx.client.post(f"/v1/admin/users/{alice}/enable", headers=headers)
    assert response.status_code == 200 and response.json()["user"]["status"] == "active"
    login(ctx, "alice@example.test")
    assert [(a, t) for a, t, _ in audit(ctx)] == [("user.suspend", str(alice)), ("user.enable", str(alice))]
    assert "alice" not in str(audit(ctx))
    with ctx.sessions() as db:
        assert db.scalars(select(AdminAuditLog.actor_user_id)).first() == admin


def test_admins_and_self_cannot_be_targets(ctx):
    me = add_user(ctx, "admin@example.test", admin=True)
    other = add_user(ctx, "admin2@example.test", admin=True)
    headers = login(ctx, "admin@example.test")
    for target in (me, other):
        for action, body in (("suspend", None), ("enable", None), ("reset-password", None),
                             ("delete", {"confirm_email": "admin2@example.test"})):
            response = ctx.client.post(f"/v1/admin/users/{target}/{action}", headers=headers, json=body)
            assert response.status_code == 403 and response.json()["code"] == "admin_target_forbidden"
    assert audit(ctx) == []
    with ctx.sessions() as db:
        assert db.get(User, other).disabled_at is None


def test_reset_password_mails_a_link_and_returns_nothing(ctx):
    add_user(ctx, "admin@example.test", admin=True)
    alice = add_user(ctx, "alice@example.test")
    headers = login(ctx, "admin@example.test")
    response = ctx.client.post(f"/v1/admin/users/{alice}/reset-password", headers=headers)
    assert response.status_code == 204 and response.content == b""
    mail = ctx.mailer.sent[-1]
    assert mail.to == "alice@example.test" and "/reset-password?token=" in mail.text
    assert audit(ctx) == [("user.reset_password", str(alice), {})]


def test_delete_needs_the_email_then_starts_the_normal_deletion(ctx):
    add_user(ctx, "admin@example.test", admin=True)
    alice = add_user(ctx, "alice@example.test")
    add_run(ctx, alice, status="queued")
    headers = login(ctx, "admin@example.test")
    url = f"/v1/admin/users/{alice}/delete"

    wrong = ctx.client.post(url, headers=headers, json={"confirm_email": "bob@example.test"})
    assert wrong.status_code == 422 and wrong.json()["code"] == "confirmation_mismatch"
    assert audit(ctx) == []

    assert ctx.client.post(url, headers=headers, json={"confirm_email": " Alice@Example.test "}).status_code == 204
    with ctx.sessions() as db:
        user = db.get(User, alice)
        assert user.deletion_requested_at is not None and user.disabled_at is not None
        assert db.scalar(select(Run.status)) == "cancelled"
    assert ctx.client.get(f"/v1/admin/users/{alice}").json()["user"]["status"] == "deleting"
    assert audit(ctx) == [("user.delete", str(alice), {})]
    assert ctx.client.post(f"/v1/admin/users/{alice}/enable", headers=headers).status_code == 409
