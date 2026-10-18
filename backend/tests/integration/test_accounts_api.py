from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from job_search_platform.api.dependencies import Services
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.main import create_app
from job_search_platform.services import passwords
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.owner_sessions import OwnerSessions

PW = "long-enough-pw"


class _Stub:
    async def start(self): return None
    async def close(self): return None
    async def reconcile_pending(self): return None


def make_client(engine, origin):
    sessions = sessionmaker(engine, expire_on_commit=False)
    owner_sessions = OwnerSessions(sessions, public_origin=origin)
    mailer = MemoryMailer()
    services = Services(sessions=sessions, owner_sessions=owner_sessions, files=_Stub(), documents=None, runs=None,
                        grants=None, settings=None, approvals=None, supervisor=_Stub(), runtime=_Stub(),
                        queue=None, accounts=Accounts(sessions, owner_sessions, mailer, public_origin=origin),
                        mailer=mailer)
    host = origin.split("://")[1]
    return TestClient(create_app(services), base_url=origin), mailer, host


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


@pytest.fixture
def ctx(migrated_engine):
    client, mailer, _ = make_client(migrated_engine, "http://127.0.0.1:8765")
    with client:
        yield SimpleNamespace(client=client, mailer=mailer, origin="http://127.0.0.1:8765")


def verified_login(ctx, email="alice@example.test"):
    ctx.client.post("/api/v1/auth/signup", json={"email": email, "password": PW, "locale": "en"})
    import re
    from urllib.parse import parse_qs, urlsplit
    link = re.search(r"https?://\S+", ctx.mailer.sent[-1].text).group(0)
    token = parse_qs(urlsplit(link).query)["token"][0]
    assert ctx.client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 204
    return ctx.client.post("/api/v1/auth/login", json={"email": email, "password": PW})


def test_signup_is_identical_for_new_and_existing_email(ctx):
    body = {"email": "alice@example.test", "password": PW, "locale": "en"}
    first = ctx.client.post("/api/v1/auth/signup", json=body)
    second = ctx.client.post("/api/v1/auth/signup", json=body)
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json() == {"status": "check_email"}


def test_sixth_signup_from_one_ip_is_rate_limited(ctx):
    for index in range(5):
        assert ctx.client.post("/api/v1/auth/signup", json={
            "email": f"u{index}@example.test", "password": PW, "locale": "en"}).status_code == 202
    sixth = ctx.client.post("/api/v1/auth/signup", json={"email": "u6@example.test", "password": PW, "locale": "en"})
    assert sixth.status_code == 429 and sixth.json()["code"] == "rate_limited"
    assert int(sixth.json()["fields"]["retry_after"]) > 0


def test_login_cookie_flags_and_session_restore(ctx):
    response = verified_login(ctx)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "jsp_owner_session=" in cookie and "httponly" in cookie and "samesite=strict" in cookie
    assert "secure" not in cookie.replace("samesite", "")
    assert response.json()["user"]["email"] == "alice@example.test" and response.json()["csrf_token"]
    restored = ctx.client.post("/api/v1/auth/session", headers={"Origin": ctx.origin})
    assert restored.status_code == 200
    assert restored.json()["authenticated"] is True and restored.json()["user"]["email_verified"] is True
    assert ctx.client.get("/api/v1/account").json()["email"] == "alice@example.test"
    assert ctx.client.get("/api/v1/account/agents").json() == []
    ctx.client.cookies.clear()
    assert ctx.client.post("/api/v1/auth/session").status_code == 401


def test_login_cookie_is_secure_for_https_origin(migrated_engine):
    client, mailer, _ = make_client(migrated_engine, "https://example.test")
    with client:
        ctx = SimpleNamespace(client=client, mailer=mailer)
        response = verified_login(ctx)
        assert response.status_code == 200
        assert "secure" in response.headers["set-cookie"].lower().replace("samesite", "")


def _code(ctx):
    import re
    return re.search(r"\b(\d{6})\b", ctx.mailer.sent[-1].text).group(1)


def test_delete_account_requires_matching_email_password_and_emailed_code(ctx):
    csrf = verified_login(ctx).json()["csrf_token"]
    headers = {"Origin": ctx.origin, "X-CSRF-Token": csrf}
    sent = ctx.client.post("/api/v1/account/delete-code", headers=headers)
    assert sent.status_code == 202 and sent.json() == {"status": "check_email"}
    code = _code(ctx)
    assert ctx.mailer.sent[-1].to == "alice@example.test"
    delete = lambda **body: ctx.client.request("DELETE", "/api/v1/account", headers=headers, json=body)
    mismatch = delete(password=PW, confirm_email="other@example.test", code=code)
    assert mismatch.status_code == 422 and mismatch.json()["code"] == "confirmation_mismatch"
    wrong = delete(password="wrong-password", confirm_email="alice@example.test", code=code)
    assert wrong.status_code == 401 and wrong.json()["code"] == "invalid_credentials"
    no_code = ctx.client.request("DELETE", "/api/v1/account", headers=headers, json={"password": PW, "confirm_email": "alice@example.test"})
    assert no_code.status_code == 422  # the code is required
    bad = delete(password=PW, confirm_email="alice@example.test", code="000000" if code != "000000" else "111111")
    assert bad.status_code == 400 and bad.json()["code"] == "invalid_code"
    ok = delete(password=PW, confirm_email="alice@example.test", code=code)
    assert ok.status_code == 204
    assert ctx.client.get("/api/v1/account").status_code == 401


def test_deletion_code_is_single_use_and_a_new_code_replaces_the_old_one(ctx):
    csrf = verified_login(ctx).json()["csrf_token"]
    headers = {"Origin": ctx.origin, "X-CSRF-Token": csrf}
    ctx.client.post("/api/v1/account/delete-code", headers=headers)
    first = _code(ctx)
    ctx.client.post("/api/v1/account/delete-code", headers=headers)
    second = _code(ctx)
    body = {"password": PW, "confirm_email": "alice@example.test"}
    if first != second:
        stale = ctx.client.request("DELETE", "/api/v1/account", headers=headers, json={**body, "code": first})
        assert stale.status_code == 400 and stale.json()["code"] == "invalid_code"


def test_signup_code_verifies_the_email_and_is_limited_to_five_tries(ctx):
    ctx.client.post("/api/v1/auth/signup", json={"email": "bob@example.test", "password": PW, "locale": "th"})
    mail = ctx.mailer.sent[-1]
    code = _code(ctx)
    assert "bob@example.test" == mail.to and code in mail.text
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(4):
        r = ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "bob@example.test", "code": wrong})
        assert r.status_code == 400 and r.json()["code"] == "invalid_code"
    last = ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "bob@example.test", "code": code})
    assert last.status_code == 204  # the fifth try is still allowed
    login = ctx.client.post("/api/v1/auth/login", json={"email": "bob@example.test", "password": PW})
    assert login.status_code == 200 and login.json()["user"]["email_verified"] is True


def test_code_guessing_is_blocked_after_five_tries_even_with_the_right_code(ctx):
    ctx.client.post("/api/v1/auth/signup", json={"email": "carol@example.test", "password": PW, "locale": "en"})
    code = _code(ctx)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "carol@example.test", "code": wrong}).status_code == 400
    blocked = ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "carol@example.test", "code": code})
    assert blocked.status_code == 429 and blocked.json()["code"] == "rate_limited"


def test_code_for_an_unknown_email_looks_like_a_wrong_code(ctx):
    r = ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "nobody@example.test", "code": "123456"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_code"
    assert ctx.client.post("/api/v1/auth/verify-email/code", json={"email": "nobody@example.test", "code": "12345"}).status_code == 422


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    from test_rest_api import api_context as _fx
    yield from _fx.__wrapped__(migrated_engine, tmp_path)


@pytest.mark.integration
def test_agents_show_oauth_client_host(api_context):
    from datetime import datetime, timedelta, timezone
    from uuid import UUID
    from test_rest_api import _owner, _write_headers
    from job_search_platform.db.models import Grant, OAuthClient
    svc = api_context.client.app.state.services
    svc.accounts = Accounts(api_context.sessions, svc.owner_sessions, MemoryMailer(), public_origin="http://127.0.0.1:8765")
    csrf = _owner(api_context)
    project = api_context.client.post("/api/v1/projects", json={"name": "P"}, headers=_write_headers(csrf)).json()
    with api_context.sessions.begin() as db:
        db.add(OAuthClient(client_id="https://client.example.test/c.json", kind="cimd", client_info={}))
        db.flush()
        db.add(Grant(project_id=UUID(project["id"]), oauth_client_id="https://client.example.test/c.json",
                     capabilities=["results:read"], expires_at=datetime.now(timezone.utc) + timedelta(days=1), label="Synthetic"))
    agents = api_context.client.get("/api/v1/account/agents").json()
    assert [a["client_id_host"] for a in agents] == ["client.example.test"]


@pytest.mark.integration
def test_is_admin_comes_only_from_admin_emails(ctx, monkeypatch):
    first = verified_login(ctx)
    assert first.json()["user"]["is_admin"] is False
    assert ctx.client.get("/api/v1/gateway").status_code == 403
    monkeypatch.setenv("ADMIN_EMAILS", "somebody-else@example.test")
    assert ctx.client.get("/api/v1/account").json()["is_admin"] is False
    monkeypatch.setenv("ADMIN_EMAILS", "Other@example.test, ALICE@example.test")
    assert ctx.client.get("/api/v1/account").json()["is_admin"] is True
    assert ctx.client.get("/api/v1/gateway").status_code == 200
