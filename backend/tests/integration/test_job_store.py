"""WP5 store upsert and close rule (spec D6). Synthetic rows only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from job_search_platform.db.models import JobPosting
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _gh(i, title="Engineer"):
    return map_posting("greenhouse", "acme", {"id": i, "title": title, "absolute_url": f"https://g/{i}",
                                               "location": {"name": "Bangkok, Thailand"}})


def _row(db, i):
    return db.scalar(select(JobPosting).where(JobPosting.external_id == str(i)))


@pytest.mark.integration
def test_new_posting_created_then_seen_unchanged(db_session):
    assert job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)["created"] == 1
    row = _row(db_session, 1)
    row.index_dirty = False
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=1))
    assert counts == {"fetched": 1, "created": 0, "updated": 0, "closed": 0}
    assert row.last_seen_at == T0 + timedelta(hours=1) and row.index_dirty is False


@pytest.mark.integration
def test_changed_content_updates_and_marks_dirty(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    _row(db_session, 1).index_dirty = False
    assert job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "Senior Engineer")], T0)["updated"] == 1
    assert _row(db_session, 1).title == "Senior Engineer" and _row(db_session, 1).index_dirty is True


@pytest.mark.integration
def test_closes_after_two_missed_fetches(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1), _gh(2)], T0)
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=1))
    assert _row(db_session, 2).closed_at is None and _row(db_session, 2).missed_runs == 1
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=2))
    assert counts["closed"] == 1 and _row(db_session, 2).closed_at == T0 + timedelta(hours=2)


@pytest.mark.integration
def test_reappearing_posting_reopens(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    for h in (1, 2):
        job_store.apply_board(db_session, "greenhouse", "acme", [], T0 + timedelta(hours=h))
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=3))
    row = _row(db_session, 1)
    assert row.closed_at is None and row.missed_runs == 0 and row.first_seen_at == T0 and row.slug == "gh-acme-1"


@pytest.mark.integration
def test_other_boards_untouched(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    other = map_posting("greenhouse", "beta", {"id": 9, "title": "X", "absolute_url": "https://g/9",
                                                "location": {"name": "Bangkok"}})
    for h in (1, 2):
        job_store.apply_board(db_session, "greenhouse", "beta", [other], T0 + timedelta(hours=h))
    assert _row(db_session, 1).closed_at is None and _row(db_session, 1).missed_runs == 0


@pytest.mark.integration
def test_garbage_posted_at_stored_as_none(db_session):
    row = dict(_gh(1), posted_at="not-a-date")
    job_store.apply_board(db_session, "greenhouse", "acme", [row], T0)
    assert _row(db_session, 1).posted_at is None


@pytest.mark.integration
def test_naive_posted_at_treated_as_utc(db_session):
    row = dict(_gh(1), posted_at="2026-10-01T10:00:00")
    job_store.apply_board(db_session, "greenhouse", "acme", [row], T0)
    assert _row(db_session, 1).posted_at == datetime(2026, 10, 1, 10, tzinfo=timezone.utc)


@pytest.mark.integration
def test_duplicate_external_id_in_rows_last_wins(db_session):
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1), _gh(1, "Senior Engineer")], T0)
    rows = db_session.scalars(select(JobPosting).where(JobPosting.external_id == "1")).all()
    assert len(rows) == 1 and rows[0].title == "Senior Engineer" and counts["created"] == 1
