"""Cross-connection queue, lease, and execution-budget races on PostgreSQL."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session
from job_search_platform.db.models import Run
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue


def _factory(db_session):
    return sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)


def _submit(service, actor, project_id, request):
    return asyncio.run(service.submit(actor, project_id, request))


def _enqueue(service, actor, db, project_count: int, runs_each: int = 1):
    ids = []
    for number in range(project_count):
        p = project(db, f"Queue race {number}")
        chat = session(db, p.id)
        _, job = revisions(db, p.id)
        provider_config(db, p.id)
        db.commit()
        ids.append(p.id)
        for index in range(runs_each):
            ids.append(_submit(service, actor, p.id, run_request(chat.id, job.id, key=f"{number}-{index}")).id)
    return ids


def test_two_dispatchers_claim_at_most_two_distinct_projects(db_session):
    factory = _factory(db_session)
    service = RunService(factory)
    actor = owner(db_session)
    _enqueue(service, actor, db_session, project_count=3)
    barrier = Barrier(2)
    queues = [PostgresRunQueue(factory), PostgresRunQueue(factory)]

    def claim(queue, name):
        barrier.wait()
        value = queue.claim_next(name)
        return value.id if value else None, value.project_id if value else None

    with ThreadPoolExecutor(max_workers=2) as pool:
        claimed = list(pool.map(lambda item: claim(*item), zip(queues, ("worker-a", "worker-b"))))
    assert all(run_id for run_id, _ in claimed)
    assert len({project_id for _, project_id in claimed}) == 2
    assert PostgresRunQueue(factory).claim_next("worker-c") is None
    with factory.begin() as db:
        active = db.scalars(select(Run.project_id).where(Run.status == "running")).all()
    assert len(set(active)) == 2


def test_same_project_runs_do_not_claim_twice_and_expired_lease_is_never_stolen(db_session):
    factory = _factory(db_session)
    service = RunService(factory)
    actor = owner(db_session)
    p = project(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    _submit(service, actor, p.id, run_request(chat.id, job.id, key="same-project-a"))
    _submit(service, actor, p.id, run_request(chat.id, job.id, key="same-project-b"))
    queue = PostgresRunQueue(factory, lease_seconds=5)
    barrier = Barrier(2)

    def claim(worker):
        barrier.wait()
        value = queue.claim_next(worker)
        return value

    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(claim, ("worker-original", "worker-other")))
    claimed = next((value for value in claims if value is not None), None)
    assert claimed is not None
    assert sum(value is not None for value in claims) == 1
    expired_at = claimed.lease_expires_at
    with pytest.raises(ServiceError, match="lease_lost"):
        queue.heartbeat(claimed.id, claimed.lease_owner, now=expired_at + timedelta(seconds=1))
    with factory.begin() as db:
        still_owned = db.get(Run, claimed.id)
        assert still_owned.status == "running"
        assert still_owned.lease_owner == claimed.lease_owner


def test_tool_call_limit_is_reserved_before_call_and_active_time_is_durable(db_session):
    factory = _factory(db_session)
    service = RunService(factory)
    actor = owner(db_session)
    p = project(db_session, "Tool budget")
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    run = _submit(service, actor, p.id, run_request(chat.id, job.id, key="tool-budget"))
    queue = PostgresRunQueue(factory, lease_seconds=1200)
    claimed = queue.claim_next("budget-worker")
    assert claimed is not None and claimed.id == run.id
    for _ in range(30):
        queue.reserve_tool_call(run.id, "budget-worker")
    with pytest.raises(ServiceError, match="tool_call_limit"):
        queue.reserve_tool_call(run.id, "budget-worker")
    with factory.begin() as db:
        persisted = db.get(Run, run.id)
        assert persisted.status == "failed"
        assert persisted.tool_calls == 30
        assert persisted.active_seconds >= 0

    p2 = project(db_session, "Runtime budget")
    chat2 = session(db_session, p2.id)
    _, job2 = revisions(db_session, p2.id)
    provider_config(db_session, p2.id)
    db_session.commit()
    run2 = _submit(service, actor, p2.id, run_request(chat2.id, job2.id, key="runtime-budget"))
    claimed2 = queue.claim_next("runtime-worker")
    assert claimed2 is not None and claimed2.id == run2.id
    later = claimed2.active_started_at + timedelta(seconds=901)
    queue.heartbeat(run2.id, "runtime-worker", now=later)
    with factory.begin() as db:
        persisted = db.get(Run, run2.id)
        assert persisted.status == "failed"
        assert persisted.active_seconds >= 900
