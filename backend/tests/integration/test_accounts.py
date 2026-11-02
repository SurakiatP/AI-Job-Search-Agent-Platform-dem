import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import grant, project, user
from job_search_platform.db.models import OwnerSession, RateLimitEvent, User, UserToken
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import passwords
from job_search_platform.services.accounts import MESSAGES, Accounts
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerSessions

PW = "long-enough-pw"
ORIGIN = "https://app.example.test"


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


@pytest.fixture
def mailer():
    return MemoryMailer()


@pytest.fixture
def accounts(migrated_engine, mailer):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    owner_sessions = OwnerSessions(sessions, public_origin=ORIGIN)
    return Accounts(sessions, owner_sessions, mailer, public_origin=ORIGIN)


def token_of(mail) -> str:
    link = re.search(r"https?://\S+", mail.text).group(0)
    return parse_qs(urlsplit(link).query)["token"][0]


def signed_up(accounts, mailer, email="alice@example.test", ip="1.1.1.1"):
    accounts.signup(email, PW, "en", ip)
    accounts.verify_email(token_of(mailer.sent[-1]))


def test_signup_verify_login_flow(accounts, mailer, db_session):
    assert accounts.signup(" Alice@Example.test ", PW, "en", "1.1.1.1") is None
    assert len(mailer.sent) == 1
    mail = mailer.sent[-1]
    assert mail.to == "alice@example.test"
    assert mail.subject == MESSAGES["en"]["verify"][0]
    assert PW not in mail.text and mail.text.count(ORIGIN + "/verify-email?token=") == 1
    token = token_of(mail)
    row = db_session.scalar(select(User).where(User.email == "alice@example.test"))
    assert row is not None and row.email_verified_at is None and row.password_hash != PW
    accounts.verify_email(token)
    db_session.refresh(row)
    assert row.email_verified_at is not None
    with pytest.raises(ServiceError) as err:
        accounts.verify_email(token)
    assert err.value.code == "invalid_token"
    exchange = accounts.login("ALICE@example.test", PW, "1.1.1.1")
    assert exchange.actor.user_id == row.id


def test_duplicate_signup_sends_exists_mail_and_same_result(accounts, mailer, db_session):
    signed_up(accounts, mailer)
    before = len(mailer.sent)
    assert accounts.signup("alice@example.test", "another-long-pw", "th", "1.1.1.1") is None
    assert len(mailer.sent) == before + 1
    assert mailer.sent[-1].to == "alice@example.test"
    assert mailer.sent[-1].subject == MESSAGES["en"]["exists"][0]  # the existing account's locale
    assert db_session.scalar(select(func.count()).select_from(User)) == 1
    accounts.login("alice@example.test", PW, "1.1.1.1")  # password was not replaced


def test_login_failures_are_uniform(accounts, mailer, db_session, monkeypatch):
    signed_up(accounts, mailer)
    signed_up(accounts, mailer, "bob@example.test")
    db_session.execute(update(User).where(User.email == "bob@example.test").values(disabled_at=datetime.now(timezone.utc)))
    db_session.commit()
    dummy = []
    real = passwords.verify_dummy
    monkeypatch.setattr("job_search_platform.services.accounts.verify_dummy",
                        lambda pw: (dummy.append(1), real(pw))[1])
    for email, pw in (("nobody@example.test", PW), ("alice@example.test", "wrong-password"), ("bob@example.test", PW)):
        with pytest.raises(ServiceError) as err:
            accounts.login(email, pw, "1.1.1.1")
        assert err.value.code == "invalid_credentials"
    assert len(dummy) >= 1  # the unknown email ran the dummy hash


def test_token_expiry_and_supersede(accounts, mailer, db_session):
    signed_up(accounts, mailer)
    accounts.forgot_password("alice@example.test")
    accounts.forgot_password("alice@example.test")
    first, second = token_of(mailer.sent[-2]), token_of(mailer.sent[-1])
    assert first != second
    with pytest.raises(ServiceError) as err:
        accounts.reset_password(first, "brand-new-password")
    assert err.value.code == "invalid_token"
    accounts.reset_password(second, "brand-new-password")
    accounts.login("alice@example.test", "brand-new-password", "1.1.1.1")
    accounts.forgot_password("alice@example.test")
    stale = token_of(mailer.sent[-1])
    db_session.execute(update(UserToken).where(UserToken.used_at.is_(None))
                       .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    db_session.commit()
    with pytest.raises(ServiceError) as err:
        accounts.reset_password(stale, "yet-another-password")
    assert err.value.code == "invalid_token"


def test_reset_revokes_all_sessions(accounts, mailer, db_session):
    signed_up(accounts, mailer)
    one = accounts.login("alice@example.test", PW, "1.1.1.1")
    accounts.login("alice@example.test", PW, "1.1.1.1")
    accounts.forgot_password("alice@example.test")
    accounts.reset_password(token_of(mailer.sent[-1]), "brand-new-password")
    live = db_session.scalar(select(func.count()).select_from(OwnerSession).where(
        OwnerSession.user_id == one.actor.user_id, OwnerSession.revoked_at.is_(None)))
    assert live == 0
    with pytest.raises(ServiceError):
        accounts.login("alice@example.test", PW, "1.1.1.1")  # old password gone


def test_weak_password_on_signup_and_reset(accounts, mailer, db_session):
    with pytest.raises(ServiceError) as err:
        accounts.signup("alice@example.test", "short", "en", "1.1.1.1")
    assert err.value.code == "weak_password" and mailer.sent == []
    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    signed_up(accounts, mailer)
    accounts.forgot_password("alice@example.test")
    token = token_of(mailer.sent[-1])
    with pytest.raises(ServiceError) as err:
        accounts.reset_password(token, "short")
    assert err.value.code == "weak_password"
    accounts.reset_password(token, "brand-new-password")  # a weak attempt does not burn the token


def test_resend_noop_when_verified(accounts, mailer, db_session):
    accounts.signup("alice@example.test", PW, "en", "1.1.1.1")
    uid = db_session.scalar(select(User.id).where(User.email == "alice@example.test"))
    accounts.resend_verification(uid)
    assert len(mailer.sent) == 2
    accounts.verify_email(token_of(mailer.sent[-1]))
    accounts.resend_verification(uid)
    assert len(mailer.sent) == 2


def test_agents_lists_only_own_grants(accounts, db_session):
    alice, bob = user(db_session), user(db_session)
    pa, pb = project(db_session, "Alice project", owner=alice), project(db_session, "Bob project", owner=bob)
    _, ga = grant(db_session, pa.id)
    grant(db_session, pb.id)
    db_session.commit()
    rows = accounts.agents(alice.user_id)
    assert [row["id"] for row in rows] == [ga.id]
    assert rows[0]["project_id"] == pa.id and rows[0]["project_name"] == "Alice project"
    assert rows[0]["capabilities"] == ["results:read"]
    assert abs(datetime.now(timezone.utc) - rows[0]["created_at"]) < timedelta(minutes=1)


def test_forgot_password_normalizes_email(accounts, mailer):
    signed_up(accounts, mailer)
    sent = len(mailer.sent)
    accounts.forgot_password("  Alice@Example.TEST ")
    assert len(mailer.sent) == sent + 1 and mailer.sent[-1].to == "alice@example.test"


def test_failed_logins_from_one_ip_do_not_lock_the_owner_out_elsewhere(accounts, mailer):
    signed_up(accounts, mailer)
    for _ in range(10):
        with pytest.raises(ServiceError) as err:
            accounts.login("alice@example.test", "wrong-password", "9.9.9.9")
        assert err.value.code == "invalid_credentials"
    with pytest.raises(ServiceError) as err:
        accounts.login("alice@example.test", "wrong-password", "9.9.9.9")
    assert err.value.code == "rate_limited"  # the attacker's own IP is stopped
    assert accounts.login("alice@example.test", PW, "2.2.2.2").actor.user_id  # the owner, elsewhere, is not


def test_successful_logins_are_not_counted(accounts, mailer, db_session):
    signed_up(accounts, mailer)
    for _ in range(15):  # more than any failed-login limit
        assert accounts.login("alice@example.test", PW, "1.1.1.1").actor.user_id
    assert db_session.scalar(select(func.count()).select_from(RateLimitEvent).where(
        RateLimitEvent.bucket.like("login%"))) == 0


def test_parallel_wrong_logins_cannot_exceed_the_limit(accounts, mailer):
    from concurrent.futures import ThreadPoolExecutor
    signed_up(accounts, mailer)

    def attempt(_):
        try:
            accounts.login("alice@example.test", "wrong-password", "9.9.9.9")
        except ServiceError as err:
            return err.code
    with ThreadPoolExecutor(14) as pool:
        codes = list(pool.map(attempt, range(14)))
    assert codes.count("invalid_credentials") == 10 and codes.count("rate_limited") == 4


def test_login_email_any_backstop_blocks_even_the_right_password(accounts, mailer):
    signed_up(accounts, mailer)
    for n in range(30):  # one failure each from 30 IPs
        with pytest.raises(ServiceError):
            accounts.login("alice@example.test", "wrong-password", f"10.0.0.{n}")
    with pytest.raises(ServiceError) as err:
        accounts.login("alice@example.test", PW, "10.0.1.1")
    assert err.value.code == "rate_limited"


def test_forgot_password_ip_limit_is_100_per_hour(accounts):
    for n in range(100):
        accounts.forgot_password(f"user{n}@example.test", "9.9.9.9")
    with pytest.raises(ServiceError) as err:
        accounts.forgot_password("user100@example.test", "9.9.9.9")
    assert err.value.code == "rate_limited"
    accounts.forgot_password("user100@example.test", "8.8.8.8")


def test_forgot_password_email_any_limit_spans_ips(accounts, mailer):
    signed_up(accounts, mailer)
    for n in range(15):
        accounts.forgot_password("alice@example.test", f"10.0.0.{n}")
    with pytest.raises(ServiceError) as err:
        accounts.forgot_password("alice@example.test", "10.0.9.9")
    assert err.value.code == "rate_limited"


def test_forgot_password_limit_is_per_email_and_ip(accounts, mailer):
    signed_up(accounts, mailer)
    for _ in range(3):
        accounts.forgot_password("alice@example.test", "9.9.9.9")
    sent = len(mailer.sent)
    with pytest.raises(ServiceError) as err:
        accounts.forgot_password("alice@example.test", "9.9.9.9")
    assert err.value.code == "rate_limited"
    accounts.forgot_password("alice@example.test", "2.2.2.2")
    assert len(mailer.sent) == sent + 1



def test_forgot_password_rejection_keeps_earlier_buckets_untouched(accounts, mailer):
    signed_up(accounts, mailer)
    for n in range(15):  # fill forgot_email_any from other IPs
        accounts.forgot_password("alice@example.test", f"10.0.0.{n}")
    def counts():
        with accounts.sessions() as db:
            return {b: db.scalar(select(func.count()).select_from(RateLimitEvent).where(RateLimitEvent.bucket == b))
                    for b in ("forgot_ip", "forgot_email")}
    before = counts()
    with pytest.raises(ServiceError) as err:
        accounts.forgot_password("alice@example.test", "7.7.7.7")
    assert err.value.code == "rate_limited" and counts() == before


def test_login_rejection_keeps_earlier_buckets_untouched(accounts, mailer):
    signed_up(accounts, mailer)
    for n in range(30):  # fill login_email_any from other IPs
        with pytest.raises(ServiceError):
            accounts.login("alice@example.test", "wrong-password", f"10.0.{n}.1")
    def counts():
        with accounts.sessions() as db:
            return {b: db.scalar(select(func.count()).select_from(RateLimitEvent).where(RateLimitEvent.bucket == b))
                    for b in ("login_ip", "login_email")}
    before = counts()
    with pytest.raises(ServiceError) as err:
        accounts.login("alice@example.test", "wrong-password", "7.7.7.7")
    assert err.value.code == "rate_limited" and counts() == before


RESOURCE = "http://127.0.0.1:8766/mcp"
CB = "http://127.0.0.1:33418/callback"


async def _oauth_request(oauth) -> str:
    import base64
    import hashlib
    from mcp.server.auth.provider import AuthorizationParams
    from mcp.shared.auth import OAuthClientInformationFull
    from pydantic import AnyUrl
    client = OAuthClientInformationFull(client_id="dcr-acc", client_name="Synthetic", redirect_uris=[AnyUrl(CB)],
                                        token_endpoint_auth_method="none", grant_types=["authorization_code", "refresh_token"],
                                        response_types=["code"])
    await oauth.register_client(client)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(b"v" * 64).digest()).decode().rstrip("=")
    url = await oauth.authorize(client, AuthorizationParams(
        state="st", scopes=["results:read"], code_challenge=challenge, redirect_uri=AnyUrl(CB),
        redirect_uri_provided_explicitly=True, resource=RESOURCE))
    return client, parse_qs(urlsplit(url).query)["request"][0]


def _oauth(factory):
    from job_search_platform.services.oauth import OAuth
    return OAuth(factory, issuer="http://127.0.0.1:8766", resource=RESOURCE, consent_url="http://127.0.0.1:8765/consent")


@pytest.mark.asyncio
async def test_reset_revokes_agent_grants_and_oauth_tokens(accounts, mailer, migrated_engine):
    from job_search_platform.services.contracts import GrantIssueRequest
    from job_search_platform.services.grants import Grants
    signed_up(accounts, mailer)
    owner_actor = accounts.login("alice@example.test", PW, "1.1.1.1").actor
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        p = project(db, owner=owner_actor)
    svc = Grants(factory)
    issued = await svc.issue(owner_actor, p.id, GrantIssueRequest(
        capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc) + timedelta(days=30)))
    await svc.authenticate(issued.token)
    oauth = _oauth(factory)
    oclient, handle = await _oauth_request(oauth)
    redirect = oauth.approve(owner_actor, handle, p.id, frozenset({"results:read"}),
                             datetime.now(timezone.utc) + timedelta(days=30))
    code = await oauth.load_authorization_code(oclient, parse_qs(urlsplit(redirect).query)["code"][0])
    pair = await oauth.exchange_authorization_code(oclient, code)
    assert await oauth.load_access_token(pair.access_token) is not None
    accounts.forgot_password("alice@example.test", "1.1.1.1")
    accounts.reset_password(token_of(mailer.sent[-1]), "brand-new-password")
    with pytest.raises(ServiceError, match="unauthorized"):
        await svc.authenticate(issued.token)
    assert await oauth.load_access_token(pair.access_token) is None  # issued before the reset
    assert await oauth.load_refresh_token(oclient, pair.refresh_token) is None


@pytest.mark.asyncio
async def test_grant_expiry_is_capped_at_ninety_days(migrated_engine):
    from helpers import owner
    from job_search_platform.services.contracts import GrantIssueRequest
    from job_search_platform.services.grants import Grants
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
    svc = Grants(factory)
    with pytest.raises(ServiceError, match="invalid_grant"):
        await svc.issue(actor, p.id, GrantIssueRequest(
            capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc) + timedelta(days=91)))
    await svc.issue(actor, p.id, GrantIssueRequest(
        capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc) + timedelta(days=89)))
    oauth = _oauth(factory)
    _, handle = await _oauth_request(oauth)
    with pytest.raises(ServiceError, match="invalid_grant"):  # the consent path has the same cap
        oauth.approve(actor, handle, p.id, frozenset({"results:read"}), datetime.now(timezone.utc) + timedelta(days=91))


@pytest.mark.asyncio
async def test_grant_cap_allows_a_little_client_clock_slack(migrated_engine):
    from helpers import owner
    from job_search_platform.services.contracts import GrantIssueRequest
    from job_search_platform.services.grants import Grants
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
    ahead = datetime.now(timezone.utc) + timedelta(days=90, minutes=1)  # consent page clock a minute fast
    await Grants(factory).issue(actor, p.id, GrantIssueRequest(capabilities=frozenset({"results:read"}), expires_at=ahead))
    oauth = _oauth(factory)
    _, handle = await _oauth_request(oauth)
    oauth.approve(actor, handle, p.id, frozenset({"results:read"}), datetime.now(timezone.utc) + timedelta(days=90, minutes=1))
