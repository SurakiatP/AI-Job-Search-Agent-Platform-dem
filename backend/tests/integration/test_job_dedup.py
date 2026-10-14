"""WP5 cross-source dedup (spec D8) and purge (D9). Synthetic postings only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from job_search_platform.db.models import JobPosting
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _fh(slug, url, title="Backend Engineer", company="Acme Co., Ltd.", posted="2026-10-01T00:00:00Z"):
    return map_posting("freehire", None, {"public_slug": slug, "title": title, "company": company, "url": url,
                                           "location": "Bangkok, Thailand", "posted_at": posted})


def _gh(i, url, title="Backend Engineer", company="Acme", location="Bangkok, Thailand", posted="2026-10-02T00:00:00Z"):
    return map_posting("greenhouse", "acme", {"id": i, "title": title, "company_name": company, "absolute_url": url,
                                               "location": {"name": location}, "first_published": posted})


def _lv(i, title, company="ACME PUBLIC COMPANY LIMITED", location="Bangkok", posted_ms=1_790_899_200_000):  # 2026-10-02
    return map_posting("lever", "acme", {"id": i, "text": title, "hostedUrl": f"https://jobs.lever.co/acme/{i}",
                                          "categories": {"location": location}, "createdAt": posted_ms,
                                          "company": company})


def _canon(db, slug):
    row = db.scalar(select(JobPosting).where(JobPosting.slug == slug))
    return row.canonical_id or row.id


def _ingest(db, at, freehire=(), greenhouse=(), lever=()):
    job_store.apply_board(db, "freehire", None, list(freehire), at)
    job_store.apply_board(db, "greenhouse", "acme", list(greenhouse), at)
    job_store.apply_board(db, "lever", "acme", list(lever), at)
    return job_store.recompute_clusters(db, at)


@pytest.mark.integration
def test_same_url_across_sources_merges(db_session):
    merged = _ingest(db_session, T0, freehire=[_fh("fh-1", "https://Boards.Greenhouse.io/acme/jobs/1/?utm_source=x")],
                     greenhouse=[_gh(1, "https://boards.greenhouse.io/acme/jobs/1")])
    assert merged == 1 and _canon(db_session, "fh-1") == _canon(db_session, "gh-acme-1")


@pytest.mark.integration
def test_thai_and_english_title_same_company_province_merge(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", title="Software Engineer")],
            lever=[_lv("a", "โปรแกรมเมอร์")])
    assert _canon(db_session, "gh-acme-1") == _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_31_days_apart_stays_separate(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", posted="2026-08-01T00:00:00Z")],
            lever=[_lv("a", "Backend Engineer", posted_ms=1_788_220_800_000)])  # 2026-09-01, 31 days later
    assert _canon(db_session, "gh-acme-1") != _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_different_province_stays_separate(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", location="Chiang Mai")], lever=[_lv("a", "Backend Engineer")])
    assert _canon(db_session, "gh-acme-1") != _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_transitive_across_three_sources(db_session):
    _ingest(db_session, T0, freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")],
            lever=[_lv("a", "Backend Engineer")])
    assert len({_canon(db_session, s) for s in ("fh-1", "gh-acme-1", "lv-acme-a")}) == 1


@pytest.mark.integration
def test_canonical_is_earliest_seen_and_stable(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1")], T0)
    job_store.recompute_clusters(db_session, T0)
    _ingest(db_session, T0 + timedelta(hours=1), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    gh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "gh-acme-1"))
    assert gh.canonical_id is None and _canon(db_session, "fh-1") == gh.id
    _ingest(db_session, T0 + timedelta(hours=2), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    assert gh.canonical_id is None


@pytest.mark.integration
def test_canonical_close_promotes_open_member(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1")], T0)
    _ingest(db_session, T0 + timedelta(hours=1), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    for h in (2, 3):
        _ingest(db_session, T0 + timedelta(hours=h), freehire=[_fh("fh-1", "https://g/1")])
    fh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "fh-1"))
    assert fh.canonical_id is None and fh.closed_at is None and fh.index_dirty is True


@pytest.mark.integration
def test_purge_clears_description_after_90_days_only(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1"), _gh(2, "https://g/2")], T0)
    for row in db_session.scalars(select(JobPosting)):
        row.closed_at = T0 - (timedelta(days=91) if row.external_id == "1" else timedelta(days=89))
    assert job_store.purge_descriptions(db_session, T0) == 1
    rows = {r.external_id: r for r in db_session.scalars(select(JobPosting))}
    assert rows["1"].description_markdown is None and rows["2"].description_markdown is not None


@pytest.mark.integration
def test_closed_member_loses_canonical_and_is_marked_dirty(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1")], T0)
    _ingest(db_session, T0 + timedelta(hours=1), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    fh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "fh-1"))
    assert fh.canonical_id is not None
    for h in (2, 3):  # freehire stops listing fh-1: closes after two misses
        job_store.apply_board(db_session, "freehire", None, [], T0 + timedelta(hours=h))
    assert fh.closed_at is not None and fh.canonical_id is not None
    fh.index_dirty = False
    job_store.recompute_clusters(db_session, T0 + timedelta(hours=3))
    assert fh.canonical_id is None and fh.index_dirty is True


@pytest.mark.integration
def test_null_province_never_merges_on_match_key(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", location="Atlantis")],
            lever=[_lv("a", "Backend Engineer", location="Atlantis")])
    assert _canon(db_session, "gh-acme-1") != _canon(db_session, "lv-acme-a")


@pytest.mark.integration
@pytest.mark.parametrize("posted, merges", [("2026-09-02T00:00:00Z", True), ("2026-09-01T23:59:59Z", False)])
def test_dedup_window_boundary(db_session, posted, merges):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", posted=posted)], lever=[_lv("a", "Backend Engineer")])
    assert (_canon(db_session, "gh-acme-1") == _canon(db_session, "lv-acme-a")) is merges
