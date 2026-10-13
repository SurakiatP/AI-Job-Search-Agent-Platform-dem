"""Verification gate, daily run quota and per-user queue fairness on real PostgreSQL."""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, run_request, session
from job_search_platform.db.models import Run, User
from job_search_platform.services.approvals import budget_day_start
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import GrantIssueRequest
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.grants import Grants
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue


def _factory(db):
    return sessionmaker(bind=db.get_bind(), expire_on_commit=False)


def _ready(db, actor):
    p = project(db, owner=actor)
    chat = session(db, p.id)
    _, job = revisions(db, p.id)
    provider_config(db, p.id)
    db.commit()
    return p, chat, job


def _submit(service, actor, p, chat, job, key):
    return asyncio.run(service.submit(actor, p.id, run_request(chat.id, job.id, key=key)))


def _code(error):
    return error.value.code


def test_unverified_user_cannot_submit(db_session):
    actor = owner(db_session, verified=False)
    p, chat, job = _ready(db_session, actor)
    with pytest.raises(ServiceError) as error:
        _submit(RunService(_factory(db_session)), actor, p, chat, job, "k")
    assert _code(error) == "email_unverified"


async def test_unverified_user_cannot_issue_grant(db_session):
    actor = owner(db_session, verified=False)
    p = project(db_session, owner=actor)
    db_session.commit()
    with pytest.raises(ServiceError) as error:
        await Grants(_factory(db_session)).issue(actor, p.id, GrantIssueRequest(
            capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    assert _code(error) == "email_unverified"


def test_existing_grant_stops_working_when_owner_becomes_unverified(db_session):
    actor = owner(db_session)
    p, chat, job = _ready(db_session, actor)
    creator, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    db_session.commit()
    factory = _factory(db_session)
    with factory.begin() as db:
        db.execute(update(User).where(User.id == actor.user_id).values(email_verified_at=None))
    with pytest.raises(ServiceError) as error:
        _submit(RunService(factory), creator, p, chat, job, "k")
    assert _code(error) == "email_unverified"


def test_quota_blocks_third_run_and_reports_next_bangkok_midnight(db_session, monkeypatch):
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "2")
    actor = owner(db_session)
    p, chat, job = _ready(db_session, actor)
    service = RunService(_factory(db_session))
    _submit(service, actor, p, chat, job, "a")
    _submit(service, actor, p, chat, job, "b")
    with pytest.raises(ServiceError) as error:
        _submit(service, actor, p, chat, job, "c")
    assert _code(error) == "quota_exceeded"
    assert error.value.fields["reset_at"] == (budget_day_start(datetime.now(timezone.utc)) + timedelta(days=1)).isoformat()
    assert error.value.fields["reset_at"].endswith("+00:00")


def test_runs_before_the_bangkok_day_start_do_not_count(db_session, monkeypatch):
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "2")
    actor = owner(db_session)
    p, chat, job = _ready(db_session, actor)
    factory = _factory(db_session)
    service = RunService(factory)
    first = _submit(service, actor, p, chat, job, "a")
    _submit(service, actor, p, chat, job, "b")
    with factory.begin() as db:
        db.execute(update(Run).where(Run.id == first.id)
                   .values(created_at=budget_day_start(datetime.now(timezone.utc)) - timedelta(seconds=1)))
    _submit(service, actor, p, chat, job, "c")


def test_quota_is_per_user_not_per_project(db_session, monkeypatch):
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "1")
    actor = owner(db_session)
    first = _ready(db_session, actor)
    second = _ready(db_session, actor)
    other = owner(db_session)
    third = _ready(db_session, other)
    service = RunService(_factory(db_session))
    _submit(service, actor, *first, "a")
    with pytest.raises(ServiceError) as error:
        _submit(service, actor, *second, "b")
    assert _code(error) == "quota_exceeded"
    _submit(service, other, *third, "c")


def test_concurrent_submits_cannot_exceed_the_quota(migrated_engine, monkeypatch):
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "2")
    factory = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        targets = []
        for _ in range(2):  # two projects of one user: only the user row serializes them
            p = project(db, owner=actor)
            chat = session(db, p.id)
            _, job = revisions(db, p.id)
            targets.append((p, chat, job))
        provider_config(db)
    _submit(RunService(factory), actor, *targets[0], "existing")
    barrier = Barrier(2)

    def attempt(index):
        service = RunService(factory)
        barrier.wait()
        try:
            _submit(service, actor, *targets[index], f"race-{index}")
            return "ok"
        except ServiceError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = sorted(pool.map(attempt, (0, 1)))
    assert outcomes == ["ok", "quota_exceeded"]
    with factory() as db:
        assert len(db.scalars(select(Run)).all()) == 2


def test_disabled_owner_makes_grant_unauthorized(db_session):
    actor = owner(db_session)
    p = project(db_session, owner=actor)
    creator, _ = grant(db_session, p.id)
    authorize(db_session, creator, p.id, "results:read", "run")
    db_session.execute(update(User).where(User.id == actor.user_id).values(disabled_at=datetime.now(timezone.utc)))
    with pytest.raises(ServiceError) as error:
        authorize(db_session, creator, p.id, "results:read", "run")
    assert _code(error) == "unauthorized"


def test_one_running_run_per_user_lets_another_user_through(db_session):
    factory = _factory(db_session)
    alice, bob = owner(db_session), owner(db_session)
    a1, a2, b1 = (_ready(db_session, who) for who in (alice, alice, bob))
    service, queue = RunService(factory), PostgresRunQueue(factory)
    first = _submit(service, alice, *a1, "a1")
    assert queue.claim_next("w").id == first.id
    _submit(service, alice, *a2, "a2")
    bob_run = _submit(service, bob, *b1, "b1")
    assert queue.claim_next("w").id == bob_run.id
    with factory.begin() as db:  # free the global slot so only the per-user cap can refuse A2
        db.get(Run, bob_run.id).status = "completed"
    assert queue.claim_next("w") is None
