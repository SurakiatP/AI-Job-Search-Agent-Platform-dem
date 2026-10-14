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


def test_delete_account_requires_matching_email_and_password(ctx):
    csrf = verified_login(ctx).json()["csrf_token"]
    headers = {"Origin": ctx.origin, "X-CSRF-Token": csrf}
    mismatch = ctx.client.request("DELETE", "/api/v1/account", headers=headers,
                                  json={"password": PW, "confirm_email": "other@example.test"})
    assert mismatch.status_code == 422 and mismatch.json()["code"] == "confirmation_mismatch"
    wrong = ctx.client.request("DELETE", "/api/v1/account", headers=headers,
                               json={"password": "wrong-password", "confirm_email": "alice@example.test"})
    assert wrong.status_code == 401 and wrong.json()["code"] == "invalid_credentials"
    ok = ctx.client.request("DELETE", "/api/v1/account", headers=headers,
                            json={"password": PW, "confirm_email": "alice@example.test"})
    assert ok.status_code == 204
    assert ctx.client.get("/api/v1/account").status_code == 401
