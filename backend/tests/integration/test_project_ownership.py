from datetime import datetime, timezone

import pytest

from helpers import grant, project, user
from job_search_platform.db.models import User
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.queue import PostgresRunQueue


def test_user_reaches_only_own_project(db_session):
    alice, bob = user(db_session), user(db_session)
    pa = project(db_session, owner=alice)
    authorize(db_session, alice, pa.id, "read", "project")
    with pytest.raises(ServiceError) as err:
        authorize(db_session, bob, pa.id, "read", "project")
    assert err.value.code == "not_found"


def test_disabled_user_session_rejected(db_session):
    alice = user(db_session)
    pa = project(db_session, owner=alice)
    db_session.get(User, alice.user_id).disabled_at = datetime.now(timezone.utc)
    db_session.flush()
    with pytest.raises(ServiceError) as err:
        authorize(db_session, alice, pa.id, "read", "project")
    assert err.value.code == "unauthorized"


def test_grant_of_disabled_owner_is_unauthorized(db_session):
    alice = user(db_session)
    pa = project(db_session, owner=alice)
    actor, _ = grant(db_session, pa.id)
    assert actor.user_id == alice.user_id
    db_session.get(User, alice.user_id).disabled_at = datetime.now(timezone.utc)
    db_session.flush()
    with pytest.raises(ServiceError) as err:
        authorize(db_session, actor, pa.id, "results:read", "result")
    assert err.value.code == "unauthorized"


def test_legacy_owner_scope_is_not_current(db_session):
    alice = user(db_session)
    pa = project(db_session, owner=alice)
    now = datetime.now(timezone.utc)
    assert PostgresRunQueue._scope_is_current(db_session, "owner", pa.id, now) is False
    assert PostgresRunQueue._scope_is_current(db_session, f"user:{alice.user_id}", pa.id, now) is True
    bob = user(db_session)
    assert PostgresRunQueue._scope_is_current(db_session, f"user:{bob.user_id}", pa.id, now) is False
