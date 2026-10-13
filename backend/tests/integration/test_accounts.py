import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import grant, project, user
from job_search_platform.db.models import OwnerSession, User, UserToken
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
