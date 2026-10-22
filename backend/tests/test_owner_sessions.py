import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.orm import sessionmaker

from helpers import user
from job_search_platform.db.models import OwnerSession, User
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerSessions

ORIGIN = "http://127.0.0.1:8000"
HOST = "127.0.0.1:8000"


def make_user(engine):
    with sessionmaker(engine).begin() as db:
        actor = user(db)
        db.execute(delete(OwnerSession))  # only sessions created by the service under test remain
        return actor.user_id


def service(engine, origin=ORIGIN, **kwargs):
    return OwnerSessions(sessionmaker(engine, expire_on_commit=False), public_origin=origin, **kwargs)


def set_session(engine, **values):
    with sessionmaker(engine).begin() as db:
        db.execute(update(OwnerSession).values(**values))


async def test_create_then_authenticate_returns_user_actor(migrated_engine):
    uid = make_user(migrated_engine)
    sessions = service(migrated_engine)
    exchange = await asyncio.to_thread(sessions.create, uid)
    assert exchange.actor.kind == "user" and exchange.actor.user_id == uid
    assert exchange.session_cookie not in repr(exchange)
    assert await sessions.authenticate(exchange.session_cookie, host=HOST) == exchange.actor
    assert await sessions.validate_write(exchange.session_cookie, exchange.csrf_token,
                                         origin=ORIGIN, host=HOST) == exchange.actor
    with sessionmaker(migrated_engine)() as db:
        row = db.scalars(select(OwnerSession).where(OwnerSession.user_id == uid)).one()
        assert row.session_hash != exchange.session_cookie.encode()


async def test_idle_session_is_rejected(migrated_engine):
    sessions = service(migrated_engine)
    exchange = sessions.create(make_user(migrated_engine))
    set_session(migrated_engine, last_seen_at=datetime.now(timezone.utc) - timedelta(days=8))
    with pytest.raises(ServiceError, match="unauthorized"):
        await sessions.authenticate(exchange.session_cookie, host=HOST)


async def test_session_past_absolute_expiry_is_rejected(migrated_engine):
    sessions = service(migrated_engine)
    exchange = sessions.create(make_user(migrated_engine))
    set_session(migrated_engine, expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    with pytest.raises(ServiceError, match="unauthorized"):
        await sessions.authenticate(exchange.session_cookie, host=HOST)


async def test_disabled_user_session_is_rejected(migrated_engine):
    uid = make_user(migrated_engine)
    sessions = service(migrated_engine)
    exchange = sessions.create(uid)
    with sessionmaker(migrated_engine).begin() as db:
        db.get(User, uid).disabled_at = datetime.now(timezone.utc)
    with pytest.raises(ServiceError, match="unauthorized"):
        await sessions.authenticate(exchange.session_cookie, host=HOST)


async def test_last_seen_refreshes_only_after_one_hour(migrated_engine):
    sessions = service(migrated_engine)
    exchange = sessions.create(make_user(migrated_engine))
    recent = datetime.now(timezone.utc) - timedelta(minutes=30)
    set_session(migrated_engine, last_seen_at=recent)
    await sessions.authenticate(exchange.session_cookie, host=HOST)
    with sessionmaker(migrated_engine)() as db:
        assert db.scalar(select(OwnerSession.last_seen_at)) == recent
    stale = datetime.now(timezone.utc) - timedelta(hours=2)
    set_session(migrated_engine, last_seen_at=stale)
    await sessions.authenticate(exchange.session_cookie, host=HOST)
    with sessionmaker(migrated_engine)() as db:
        assert db.scalar(select(OwnerSession.last_seen_at)) > stale + timedelta(hours=1)


async def test_wrong_csrf_is_rejected(migrated_engine):
    sessions = service(migrated_engine)
    exchange = sessions.create(make_user(migrated_engine))
    for bad in (None, "synthetic-wrong-csrf"):
        with pytest.raises(ServiceError, match="invalid_csrf"):
            await sessions.validate_write(exchange.session_cookie, bad, origin=ORIGIN, host=HOST)


@pytest.mark.parametrize("origin,host", [(None, HOST), ("http://evil.test", HOST),
                                        (ORIGIN, "evil.test"), (ORIGIN, None)])
async def test_untrusted_origin_or_host_is_rejected(migrated_engine, origin, host):
    sessions = service(migrated_engine)
    exchange = sessions.create(make_user(migrated_engine))
    with pytest.raises(ServiceError):
        await sessions.validate_write(exchange.session_cookie, exchange.csrf_token, origin=origin, host=host)


def test_revoke_and_revoke_all_are_per_user(migrated_engine):
    alice, bob = make_user(migrated_engine), make_user(migrated_engine)
    sessions = service(migrated_engine)
    a1, a2, b1 = sessions.create(alice), sessions.create(alice), sessions.create(bob)
    sessions.revoke(a1.session_cookie)
    with sessionmaker(migrated_engine).begin() as db:
        sessions.revoke_all(db, alice, datetime.now(timezone.utc))
    for cookie in (a1.session_cookie, a2.session_cookie):
        with pytest.raises(ServiceError, match="unauthorized"):
            sessions._authenticate(cookie, None)
    assert sessions._authenticate(b1.session_cookie, None).user_id == bob


def test_secure_cookies_follow_public_origin(migrated_engine):
    assert service(migrated_engine, "https://example.test").secure_cookies is True
    assert service(migrated_engine, "http://127.0.0.1:8000").secure_cookies is False


async def test_page_reload_can_restore_csrf(migrated_engine):
    exchange = service(migrated_engine).create(make_user(migrated_engine))
    restored = await service(migrated_engine).current(exchange.session_cookie, origin=ORIGIN, host=HOST)
    assert restored.csrf_token == exchange.csrf_token and restored.actor == exchange.actor
    with pytest.raises(ServiceError):
        await service(migrated_engine).current(exchange.session_cookie, origin="http://evil.test", host=HOST)
