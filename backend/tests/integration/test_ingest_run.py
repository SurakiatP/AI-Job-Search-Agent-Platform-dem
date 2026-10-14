"""WP5 ingest run: per-board isolation, failed boards never close, lock, idempotency. Fake fetchers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import IngestRun, JobPosting
from job_search_platform.integrations.job_boards import BoardError
from job_search_platform.services import job_store
from job_search_platform.services.errors import ServiceError

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _raw(i):
    return {"id": i, "title": "Engineer", "absolute_url": f"https://g/{i}", "location": {"name": "Bangkok"}}


class Fetch:
    def __init__(self, plan):
        self.plan = plan  # {(source, board): list | Exception}

    def __call__(self, source, board, **_):
        result = self.plan.get((source, board), [])
        if isinstance(result, Exception):
            raise result
        return result


def _run(sessions, plan, at, boards=None):
    return job_store.run_ingest(sessions, boards=boards or {"greenhouse": ["a", "b"]}, sources=("greenhouse",),
                                fetch=Fetch(plan), clock=lambda: at, sleep=lambda s: None)


@pytest.mark.integration
def test_board_failure_isolated(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = _run(sessions, {("greenhouse", "a"): BoardError("status_500"), ("greenhouse", "b"): [_raw(1)]}, T0)
    assert run.status == "partial" and run.created == 1
    assert run.per_board["greenhouse:a"]["state"] == "failed" and run.per_board["greenhouse:b"]["state"] == "ok"


@pytest.mark.integration
def test_failed_fetch_never_counts_as_missing(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    _run(sessions, {("greenhouse", "a"): [_raw(1)]}, T0)
    for h in (1, 2):
        _run(sessions, {("greenhouse", "a"): BoardError("timeout")}, T0 + timedelta(hours=h))
    with sessions() as db:
        assert db.scalar(select(JobPosting.closed_at).where(JobPosting.external_id == "1")) is None


@pytest.mark.integration
def test_all_boards_failed_is_failed(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = _run(sessions, {("greenhouse", "a"): BoardError("x"), ("greenhouse", "b"): BoardError("x")}, T0)
    assert run.status == "failed"


@pytest.mark.integration
def test_rerun_with_same_input_is_idempotent(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    plan = {("greenhouse", "a"): [_raw(1), _raw(2)]}
    _run(sessions, plan, T0)
    second = _run(sessions, plan, T0 + timedelta(hours=1))
    assert (second.created, second.updated, second.closed) == (0, 0, 0)


@pytest.mark.integration
def test_second_run_refused_while_locked(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions() as holder:
        holder.execute(text("SELECT pg_advisory_lock(hashtext('ingest'))"))
        with pytest.raises(ServiceError) as caught:
            _run(sessions, {}, T0)
        assert caught.value.code == "ingest_running"
        holder.execute(text("SELECT pg_advisory_unlock(hashtext('ingest'))"))


@pytest.mark.integration
def test_deadline_skips_remaining_boards(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    now = [T0]

    def fetch(source, board, **_):
        if board == "a":
            now[0] = T0 + timedelta(minutes=21)  # board a "took" 21 minutes
        return [_raw(1)]

    run = job_store.run_ingest(sessions, boards={"greenhouse": ["a", "b"]}, sources=("greenhouse",),
                               fetch=fetch, clock=lambda: now[0], sleep=lambda s: None)
    assert run.per_board["greenhouse:a"]["state"] == "ok"
    assert run.per_board["greenhouse:b"]["state"] == "skipped"


@pytest.mark.integration
def test_no_targets_is_ok_with_zero_counts(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = job_store.run_ingest(sessions, boards={}, sources=("greenhouse",), fetch=Fetch({}),
                               clock=lambda: T0, sleep=lambda s: None)
    assert run.status == "ok" and run.per_board == {}
    assert (run.fetched, run.created, run.updated, run.closed) == (0, 0, 0, 0)


@pytest.mark.integration
def test_unexpected_exception_isolated_and_lock_released(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = _run(sessions, {("greenhouse", "a"): ValueError("boom"), ("greenhouse", "b"): [_raw(1)]}, T0)
    assert run.status == "partial"
    assert run.per_board["greenhouse:a"] == {"state": "failed", "error": "ValueError"}
    assert run.per_board["greenhouse:b"]["state"] == "ok"
    _run(sessions, {}, T0 + timedelta(hours=1))  # lock was released


@pytest.mark.integration
def test_apply_board_error_rolls_back_that_board_only(migrated_engine, monkeypatch):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    real = job_store.apply_board

    def flaky(db, source, board, rows, now):
        real(db, source, board, rows, now)  # pending writes must roll back
        if board == "a":
            raise RuntimeError("db down")
        return {"fetched": len(rows), "created": len(rows), "updated": 0, "closed": 0}

    monkeypatch.setattr(job_store, "apply_board", flaky)
    run = _run(sessions, {("greenhouse", "a"): [_raw(1)], ("greenhouse", "b"): [_raw(2)]}, T0)
    assert run.per_board["greenhouse:a"] == {"state": "failed", "error": "RuntimeError"}
    assert run.per_board["greenhouse:b"]["state"] == "ok"
    with sessions() as db:
        assert db.scalars(select(JobPosting.board)).all() == ["b"]


@pytest.mark.integration
def test_final_step_failure_marks_run_failed_and_releases_lock(migrated_engine, monkeypatch):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)

    def boom(db, now):
        raise RuntimeError("cluster fail")

    monkeypatch.setattr(job_store, "recompute_clusters", boom)
    with pytest.raises(RuntimeError):
        _run(sessions, {("greenhouse", "a"): [_raw(1)]}, T0)
    with sessions() as db:
        row = db.scalars(select(IngestRun).order_by(IngestRun.started_at.desc())).first()
        assert row.status == "failed" and row.finished_at is not None
        assert row.per_board["greenhouse:a"]["state"] == "ok" and row.created == 1
    monkeypatch.undo()
    assert _run(sessions, {}, T0 + timedelta(hours=1)).status == "ok"  # lock released
