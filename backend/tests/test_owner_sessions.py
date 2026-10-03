import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import OwnerLaunchNonce, OwnerSession
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerSessions

ORIGIN = "http://127.0.0.1:8000"
HOST = "127.0.0.1:8000"


def service(engine):
    return OwnerSessions(sessionmaker(engine, expire_on_commit=False),
                         allowed_origins={ORIGIN}, allowed_hosts={HOST})


async def test_nonce_cookie_csrf_and_single_use_are_persisted(migrated_engine):
    sessions = service(migrated_engine)
    launch = await sessions.create_launch_nonce(ORIGIN)
    exchange = await sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST)
    assert launch.nonce not in repr(launch)
    assert exchange.session_cookie not in repr(exchange)
    assert await sessions.authenticate(exchange.session_cookie, host=HOST) == exchange.actor
    assert await sessions.validate_write(exchange.session_cookie, exchange.csrf_token,
                                         origin=ORIGIN, host=HOST) == exchange.actor
    with pytest.raises(ServiceError, match="invalid_launch"):
        await sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST)
    with sessionmaker(migrated_engine)() as db:
        assert db.scalar(select(OwnerLaunchNonce)).consumed_at is not None
        row = db.scalar(select(OwnerSession))
        assert row.session_hash != exchange.session_cookie.encode()
        assert row.csrf_hash != exchange.csrf_token.encode()


async def test_nonce_concurrent_consumption_has_one_winner(migrated_engine):
    sessions = service(migrated_engine)
    launch = await sessions.create_launch_nonce(ORIGIN)
    outcomes = await asyncio.gather(*[
        sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST) for _ in range(2)
    ], return_exceptions=True)
    assert sum(not isinstance(v, Exception) for v in outcomes) == 1
    assert sum(isinstance(v, ServiceError) and v.code == "invalid_launch" for v in outcomes) == 1


@pytest.mark.parametrize("origin,host", [(None, HOST), ("http://evil.test", HOST),
                                        (ORIGIN, "evil.test"), (ORIGIN, None)])
async def test_untrusted_origin_or_host_cannot_bootstrap(migrated_engine, origin, host):
    sessions = service(migrated_engine)
    launch = await sessions.create_launch_nonce(ORIGIN)
    with pytest.raises(ServiceError):
        await sessions.exchange(launch.nonce, origin=origin, host=host)
    await sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST)


async def test_expiry_revocation_and_csrf_fail_closed(migrated_engine):
    sessions = service(migrated_engine)
    launch = await sessions.create_launch_nonce(ORIGIN)
    exchange = await sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST)
    with pytest.raises(ServiceError, match="invalid_csrf"):
        await sessions.validate_write(exchange.session_cookie, None, origin=ORIGIN, host=HOST)
    with pytest.raises(ServiceError, match="invalid_csrf"):
        await sessions.validate_write(exchange.session_cookie, "synthetic-wrong-csrf",
                                      origin=ORIGIN, host=HOST)
    with sessionmaker(migrated_engine).begin() as db:
        db.execute(update(OwnerSession).values(revoked_at=datetime.now(timezone.utc)))
    with pytest.raises(ServiceError, match="unauthorized"):
        await sessions.authenticate(exchange.session_cookie, host=HOST)
    launch = await sessions.create_launch_nonce(ORIGIN)
    with sessionmaker(migrated_engine).begin() as db:
        db.execute(update(OwnerLaunchNonce).values(expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)))
    with pytest.raises(ServiceError, match="invalid_launch"):
        await sessions.exchange(launch.nonce, origin=ORIGIN, host=HOST)


def test_remote_origin_configuration_is_rejected(migrated_engine):
    with pytest.raises(ServiceError, match="invalid_owner_origin"):
        OwnerSessions(sessionmaker(migrated_engine), allowed_origins={"https://evil.test"},
                      allowed_hosts={"evil.test"})


async def test_page_reload_can_restore_csrf_without_nonce_reuse(migrated_engine):
    first = service(migrated_engine)
    launch = await first.create_launch_nonce(ORIGIN)
    exchange = await first.exchange(launch.nonce, origin=ORIGIN, host=HOST)
    restarted = service(migrated_engine)
    restored = await restarted.current(exchange.session_cookie, origin=ORIGIN, host=HOST)
    assert restored.csrf_token == exchange.csrf_token
    assert restored.actor == exchange.actor
    await restarted.validate_write(exchange.session_cookie, restored.csrf_token, origin=ORIGIN, host=HOST)
    with pytest.raises(ServiceError):
        await restarted.current(exchange.session_cookie, origin="http://evil.test", host=HOST)
