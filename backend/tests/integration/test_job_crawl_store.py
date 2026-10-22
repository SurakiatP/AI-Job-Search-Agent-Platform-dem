"""WP5 part 3 store helpers (spec 2026-10-15): crawled sources, seen/miss passes, tombstones, validThrough."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from job_search_platform.db.models import CrawlState, JobIndexDelete, JobPosting, JobPostingTombstone
from job_search_platform.integrations.job_boards import BoardError
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 15, tzinfo=timezone.utc)


def _bkk(i, valid=None, posted="2026-10-14"):
    posting = {"@type": "JobPosting", "title": "Data Engineer", "datePosted": posted,
               "hiringOrganization": {"name": "Acme"}, "jobLocation": {"address": {"addressRegion": "Bangkok"}}}
    if valid:
        posting["validThrough"] = valid
    return map_posting("jobbkk", None, {"id": str(i), "url": f"https://www.jobbkk.com/jobs/detail/1/{i}",
                                        "posting": posting})


def _rows(db):
    return {r.external_id: r for r in db.scalars(select(JobPosting).where(JobPosting.source == "jobbkk"))}


@pytest.mark.integration
def test_crawled_source_valid_through_and_state_round_trip(db_session):
    counts, seen, too_old = job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(1, valid="2026-11-01")], T0)
    db_session.add(CrawlState(source="jobbkk", state={"cursor": 4}, updated_at=T0))
    db_session.flush()
    row = _rows(db_session)["1"]
    assert counts["created"] == 1 and seen == {"1"} and too_old == []
    assert row.valid_through == datetime(2026, 11, 1, 23, 59, 59, tzinfo=timezone(timedelta(hours=7)))
    assert db_session.get(CrawlState, "jobbkk").state == {"cursor": 4}


@pytest.mark.integration
def test_upsert_postings_updates_existing_row_without_existing_map(db_session):
    job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(1)], T0)
    changed = dict(_bkk(1), title="Senior Data Engineer", content_hash="changed")
    counts, _, _ = job_store.upsert_postings(db_session, "jobbkk", None, [changed], T0 + timedelta(hours=1))
    assert counts == {"created": 0, "updated": 1, "skipped_old": 0, "skipped_dup": 0}
    assert _rows(db_session)["1"].title == "Senior Data Engineer"


@pytest.mark.integration
def test_retire_deletes_passed_valid_through_with_tombstone(db_session):
    job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(1, valid="2026-10-10"), _bkk(2, valid="2026-12-01")], T0)
    assert job_store.retire(db_session, T0) == 1
    assert set(_rows(db_session)) == {"2"}
    assert db_session.scalar(select(JobPostingTombstone.external_id)) == "1"
    assert db_session.scalar(select(JobIndexDelete.posting_id)) is not None


@pytest.mark.integration
def test_touch_seen_marks_stored_and_tombstoned(db_session):
    job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(1)], T0)
    _rows(db_session)["1"].missed_runs = 1
    job_store.tombstone_ids(db_session, "jobbkk", ["9", "9"], T0)
    later = T0 + timedelta(hours=1)
    stored, tombstoned = job_store.touch_seen(db_session, "jobbkk", {"1", "9", "5"}, later)
    db_session.expire_all()
    assert stored == {"1"} and tombstoned == {"9"}
    row = _rows(db_session)["1"]
    assert row.last_seen_at == later and row.missed_runs == 0
    assert db_session.get(JobPostingTombstone, ("jobbkk", "9")).last_seen_at == later


@pytest.mark.integration
def test_miss_unseen_deletes_after_two_passes_without_tombstone(db_session):
    job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(i) for i in (1, 2, 3)], T0)
    for h in (1, 2):
        now = T0 + timedelta(hours=h)
        job_store.touch_seen(db_session, "jobbkk", {"1", "2"}, now)
        deleted = job_store.miss_unseen(db_session, "jobbkk", now, now)
    db_session.expire_all()
    assert deleted == 1 and set(_rows(db_session)) == {"1", "2"}
    assert db_session.scalar(select(JobPostingTombstone)) is None
    assert db_session.scalar(select(JobIndexDelete.posting_id)) is not None


@pytest.mark.integration
def test_miss_unseen_shrink_guard_changes_nothing(db_session):
    job_store.upsert_postings(db_session, "jobbkk", None, [_bkk(i) for i in range(20)], T0)
    now = T0 + timedelta(hours=1)
    job_store.touch_seen(db_session, "jobbkk", {str(i) for i in range(5)}, now)
    with pytest.raises(BoardError, match="suspicious_shrink"):
        job_store.miss_unseen(db_session, "jobbkk", now, now)
    assert all(r.missed_runs == 0 for r in _rows(db_session).values())
    with pytest.raises(BoardError):  # nothing seen at all while rows are stored
        job_store.miss_unseen(db_session, "jobbkk", now + timedelta(hours=1), now + timedelta(hours=1))
