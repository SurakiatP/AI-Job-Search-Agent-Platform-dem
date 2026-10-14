"""FR-J05 service: schedule, CRUD, caps, gates status, unsubscribe. Synthetic data only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, user
from job_search_platform.db.models import ProjectPreference, SavedSearch
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.contracts import SavedSearchCreate, SavedSearchUpdate
from job_search_platform.services.errors import ServiceError

UTC = timezone.utc
ORIGIN = "http://127.0.0.1:8765"


def _bkk(y, m, d, h, mi=0):
    return datetime(y, m, d, h - 7, mi, tzinfo=UTC) if h >= 7 else datetime(y, m, d - 1, h + 17, mi, tzinfo=UTC)


def test_next_slot_daily_and_weekly():
    # 2026-10-14 is a Wednesday.
    assert ss.next_slot(_bkk(2026, 10, 14, 7, 59), "daily") == _bkk(2026, 10, 14, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 8), "daily") == _bkk(2026, 10, 15, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 10), "weekly") == _bkk(2026, 10, 19, 8)
    assert ss.next_slot(_bkk(2026, 10, 19, 7, 59), "weekly") == _bkk(2026, 10, 19, 8)
    assert ss.next_slot(_bkk(2026, 10, 19, 8), "weekly") == _bkk(2026, 10, 26, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 10), "daily").tzinfo is not None


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        record = project(db, owner=actor)
    return sessions, ss.SavedSearches(sessions, MemoryMailer(), public_origin=ORIGIN), actor, record.id


def _code(call) -> str:
    with pytest.raises(ServiceError) as caught:
        call()
    return caught.value.code


@pytest.mark.integration
def test_crud_and_status(ctx):
    sessions, service, actor, pid = ctx
    now = _bkk(2026, 10, 14, 10)
    created = service.create(actor, pid, SavedSearchCreate(name="Data BKK", filters={"q": "data", "cities": ["Bangkok"]}), now=now)
    assert created.frequency == "daily" and created.digest_enabled and created.next_run_at == _bkk(2026, 10, 15, 8)
    listed = service.list(actor, pid)
    assert [i.name for i in listed.items] == ["Data BKK"]
    assert listed.status.email_verified is True and listed.status.notifications_enabled is True
    weekly = service.update(actor, pid, created.id, SavedSearchUpdate(frequency="weekly"), now=now)
    assert weekly.next_run_at == _bkk(2026, 10, 19, 8)
    renamed = service.update(actor, pid, created.id, SavedSearchUpdate(name="งานข้อมูล"), now=now)
    assert renamed.name == "งานข้อมูล"
    service.delete(actor, pid, created.id)
    assert service.list(actor, pid).items == ()


@pytest.mark.integration
def test_limit_and_duplicate_name(ctx):
    _, service, actor, pid = ctx
    for i in range(10):
        service.create(actor, pid, SavedSearchCreate(name=f"Search {i}"))
    assert _code(lambda: service.create(actor, pid, SavedSearchCreate(name="Eleventh"))) == "saved_search_limit"
    service.delete(actor, pid, service.list(actor, pid).items[0].id)
    assert _code(lambda: service.create(actor, pid, SavedSearchCreate(name="Search 5"))) == "saved_search_name_taken"
    first = service.list(actor, pid).items[0]
    assert _code(lambda: service.update(actor, pid, first.id, SavedSearchUpdate(name="Search 6"))) == "saved_search_name_taken"


@pytest.mark.integration
def test_reenable_recomputes_next_run(ctx):
    sessions, service, actor, pid = ctx
    created = service.create(actor, pid, SavedSearchCreate(name="Paused"), now=_bkk(2026, 9, 1, 10))
    service.update(actor, pid, created.id, SavedSearchUpdate(digest_enabled=False), now=_bkk(2026, 9, 1, 10))
    back = service.update(actor, pid, created.id, SavedSearchUpdate(digest_enabled=True), now=_bkk(2026, 10, 14, 10))
    assert back.next_run_at == _bkk(2026, 10, 15, 8)


@pytest.mark.integration
def test_status_reflects_gates_and_other_user_is_not_found(ctx):
    sessions, service, actor, pid = ctx
    with sessions.begin() as db:
        db.add(ProjectPreference(project_id=pid, values={"notifications_enabled": False}))
        stranger = user(db)
        unverified = user(db, verified=False)
        unverified_project = project(db, "Unverified", owner=unverified).id
    assert service.list(actor, pid).status.notifications_enabled is False
    assert service.list(unverified, unverified_project).status.email_verified is False
    created = service.create(actor, pid, SavedSearchCreate(name="Mine"))
    assert _code(lambda: service.list(stranger, pid)) == "not_found"
    assert _code(lambda: service.delete(stranger, pid, created.id)) == "not_found"
    assert _code(lambda: service.delete(actor, pid, uuid4())) == "not_found"


@pytest.mark.integration
def test_unsubscribe_by_token(ctx):
    sessions, service, actor, pid = ctx
    created = service.create(actor, pid, SavedSearchCreate(name="Tokened"))
    token, digest = ss._new_token()
    with sessions.begin() as db:
        db.get(SavedSearch, created.id).unsubscribe_token_hash = digest
    assert _code(lambda: service.unsubscribe("x" * 43, "203.0.113.1")) == "invalid_token"
    service.unsubscribe(token, "203.0.113.1")
    assert service.list(actor, pid).items[0].digest_enabled is False
    for _ in range(30):  # the 30 allowed hits per hour
        try:
            service.unsubscribe("y" * 43, "203.0.113.9")
        except ServiceError:
            pass
    assert _code(lambda: service.unsubscribe("y" * 43, "203.0.113.9")) == "rate_limited"
