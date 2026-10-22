"""WP5 retention (spec D6, D9 as amended 2026-10-14): delete, 90-day age limit, tombstones. Synthetic rows only."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import IngestRun, JobIndexDelete, JobPosting, JobPostingTombstone
from job_search_platform.integrations.job_boards import BoardError
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _gh(i, posted=None, url=None):
    raw = {"id": i, "title": "Engineer", "absolute_url": url or f"https://g/{i}",
           "location": {"name": "Bangkok, Thailand"}}
    if posted:
        raw["first_published"] = posted.isoformat()
    return map_posting("greenhouse", "acme", raw)


def _fh(slug, url):
    return map_posting("freehire", None, {"public_slug": slug, "title": "Engineer", "company": "Acme", "url": url,
                                           "location": "Bangkok, Thailand"})


def _rows(db):
    return {r.external_id: r for r in db.scalars(select(JobPosting))}


@pytest.mark.integration
def test_missing_twice_deletes_row_and_queues_index_delete(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1), _gh(2)], T0)
    gone = _rows(db_session)["2"].id
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=1))
    assert set(_rows(db_session)) == {"1", "2"} and _rows(db_session)["2"].missed_runs == 1
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=2))
    assert counts["deleted"] == 1 and set(_rows(db_session)) == {"1"}
    queued = db_session.scalars(select(JobIndexDelete)).all()
    assert [q.posting_id for q in queued] == [gone] and queued[0].deleted_at == T0 + timedelta(hours=2)
    assert db_session.scalars(select(JobPostingTombstone)).all() == []  # the source removed it, no tombstone


@pytest.mark.integration
def test_failed_board_never_deletes(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)

    def run(plan, at):
        def fetch(source, board, **_):
            if isinstance(plan, Exception):
                raise plan
            return plan
        return job_store.run_ingest(sessions, boards={"greenhouse": ["acme"]}, sources=("greenhouse",),
                                    fetch=fetch, clock=lambda: at, sleep=lambda s: None)

    run([{"id": 1, "title": "Engineer", "absolute_url": "https://g/1", "location": {"name": "Bangkok"}}], T0)
    for h in (1, 2):
        run(BoardError("timeout"), T0 + timedelta(hours=h))
    with sessions() as db:
        assert [r.external_id for r in db.scalars(select(JobPosting))] == ["1"]
        assert db.scalars(select(JobIndexDelete)).all() == []
        db.query(JobPosting).delete()
        db.query(IngestRun).delete()
        db.commit()


@pytest.mark.integration
def test_posting_older_than_90_days_is_never_inserted(db_session):
    counts = job_store.apply_board(db_session, "greenhouse", "acme",
                                   [_gh(1, posted=T0 - timedelta(days=91))], T0)
    assert counts["skipped_old"] == 1 and counts["created"] == 0 and _rows(db_session) == {}


@pytest.mark.integration
def test_existing_row_now_too_old_is_deleted_with_tombstone(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, posted=T0 - timedelta(days=89))], T0)
    pid = _rows(db_session)["1"].id
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, posted=T0 - timedelta(days=89))],
                                   T0 + timedelta(days=2))
    assert counts["skipped_old"] == 1 and counts["deleted"] == 1 and _rows(db_session) == {}
    tomb = db_session.scalars(select(JobPostingTombstone)).one()
    assert (tomb.source, tomb.external_id) == ("greenhouse", "1")
    assert db_session.scalars(select(JobIndexDelete)).one().posting_id == pid


@pytest.mark.integration
def test_future_posted_at_is_stored_and_survives_retire(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, posted=T0 + timedelta(days=1))], T0)
    assert set(_rows(db_session)) == {"1"}
    assert job_store.retire(db_session, T0) == 0 and set(_rows(db_session)) == {"1"}


@pytest.mark.integration
def test_retire_deletes_aged_rows_and_writes_tombstone(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1), _gh(2)], T0 - timedelta(days=91))
    rows = _rows(db_session)
    rows["2"].first_seen_at = T0 - timedelta(days=89)
    old = rows["1"].id
    assert job_store.retire(db_session, T0) == 1
    assert set(_rows(db_session)) == {"2"}
    tomb = db_session.scalars(select(JobPostingTombstone)).one()
    assert (tomb.source, tomb.external_id, tomb.deleted_at) == ("greenhouse", "1", T0)
    assert db_session.scalars(select(JobIndexDelete)).one().posting_id == old


@pytest.mark.integration
def test_retire_prefers_posted_at_over_first_seen(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, posted=T0 - timedelta(days=89))], T0 - timedelta(days=200))
    assert job_store.retire(db_session, T0) == 0


@pytest.mark.integration
def test_tombstone_blocks_reinsert_and_refreshes_last_seen(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 - timedelta(days=91))
    job_store.retire(db_session, T0)
    later = T0 + timedelta(hours=1)
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], later)
    assert counts["created"] == 0 and _rows(db_session) == {}
    assert db_session.scalars(select(JobPostingTombstone)).one().last_seen_at == later


@pytest.mark.integration
def test_prune_drops_unseen_and_expired_tombstones_and_old_runs(db_session):
    def tomb(ext, seen_days, deleted_days):
        db_session.add(JobPostingTombstone(source="greenhouse", external_id=ext, deleted_at=T0 - timedelta(days=deleted_days),
                                           last_seen_at=T0 - timedelta(days=seen_days)))

    tomb("unseen", 8, 20)
    tomb("expired", 1, 181)
    tomb("kept", 1, 10)
    for name, days in (("old", 91), ("new", 89)):
        db_session.add(IngestRun(id=uuid.uuid4(), started_at=T0 - timedelta(days=days), status="ok", per_board={"n": name}))
    for name, days in (("stuck", 2), ("live", 0)):  # SIGKILLed run left 'running'
        db_session.add(IngestRun(id=uuid.uuid4(), started_at=T0 - timedelta(days=days), status="running", per_board={"n": name}))
    db_session.flush()
    job_store.prune(db_session, T0)
    assert [t.external_id for t in db_session.scalars(select(JobPostingTombstone))] == ["kept"]
    assert [r.per_board["n"] for r in db_session.scalars(select(IngestRun))
            if r.per_board["n"] != "live"] == ["new"]
    assert {r.per_board["n"] for r in db_session.scalars(select(IngestRun))} == {"new", "live"}


@pytest.mark.integration
def test_deleting_canonical_promotes_member_and_marks_it_dirty(db_session):
    url = "https://g/1"
    _other = map_posting("greenhouse", "acme", {"id": 99, "title": "Zz Other", "absolute_url": "https://zz/99",
                                                "location": {"name": "Bangkok, Thailand"}})  # keeps the board non-empty
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, url=url), _other], T0)
    job_store.apply_board(db_session, "freehire", None, [_fh("fh-1", url)], T0 + timedelta(minutes=1))
    job_store.recompute_clusters(db_session, T0 + timedelta(minutes=1))
    fh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "fh-1"))
    assert fh.canonical_id is not None
    for h in (1, 2):
        job_store.apply_board(db_session, "freehire", None, [_fh("fh-1", url)], T0 + timedelta(hours=h))
        job_store.apply_board(db_session, "greenhouse", "acme", [_other], T0 + timedelta(hours=h))
    fh.index_dirty = False
    job_store.recompute_clusters(db_session, T0 + timedelta(hours=2))
    assert fh.canonical_id is None and fh.index_dirty is True
