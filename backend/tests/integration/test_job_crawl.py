"""WP5 part 3 crawl routines (spec 2026-10-15) against fake sites. Synthetic pages only."""
from __future__ import annotations

import itertools
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import CrawlState, JobIndexDelete, JobPosting, JobPostingTombstone
from job_search_platform.services import job_crawl

T0 = datetime(2026, 10, 15, 3, 0, tzinfo=timezone.utc)
JTG = "https://www.jobtopgun.com"
ROBOTS = "User-agent: *\nDisallow: /api/\n"


class Site:
    """Fake transport for both hosts: url -> str body or (status, headers, body bytes); unknown URLs 404."""

    def __init__(self, pages):
        self.pages, self.requested = dict(pages), []

    def __call__(self, url):
        self.requested.append(url)
        page = self.pages.get(url, (404, {}, b""))
        return page if isinstance(page, tuple) else (200, {}, page.encode())


def posting_page(days_ago=1, valid_days=30, title="Data Engineer"):
    posting = {"@context": "https://schema.org", "@type": "JobPosting", "title": title,
               "datePosted": (T0 - timedelta(days=days_ago)).date().isoformat(),
               "validThrough": (T0 + timedelta(days=valid_days)).date().isoformat(),
               "hiringOrganization": {"name": "Acme Co., Ltd."},
               "jobLocation": {"address": {"addressLocality": "Pathum Wan", "addressRegion": "Bangkok"}},
               "description": "<p>Build pipelines</p>", "employmentType": "FULL_TIME"}
    return f'<html><script type="application/ld+json">{json.dumps(posting)}</script></html>'


SOFT_404 = "<html><title>Job Details - JOBTOPGUN</title></html>"


def jtg_site(ids_by_sitemap, details, robots=ROBOTS):
    pages = {f"{JTG}/robots.txt": robots, f"{JTG}/sitemap.xml": "<sitemapindex>" + "".join(
        f"<sitemap><loc>{JTG}/sitemaps/jobs-snapshot/sitemap/{n}.xml</loc></sitemap>" for n in ids_by_sitemap)
        + f"<sitemap><loc>{JTG}/sitemaps/locations/sitemap.xml</loc></sitemap></sitemapindex>"}
    for n, ids in ids_by_sitemap.items():
        pages[f"{JTG}/sitemaps/jobs-snapshot/sitemap/{n}.xml"] = "<urlset>" + "".join(
            f"<url><loc>{JTG}/th/jobs/{i}</loc></url><url><loc>{JTG}/en/jobs/{i}</loc></url>" for i in ids) + "</urlset>"
    pages.update({f"{JTG}/th/jobs/{i}": body for i, body in details.items()})
    return Site(pages)


def crawl(sessions, site, transport, at=T0, clock=None, **kw):
    return job_crawl.crawl_site(sessions, site, clock=clock or (lambda: at), sleep=lambda s: None,
                                monotonic=lambda: 0.0, transport=transport, **kw)


def ticking(start=T0):
    """A clock that moves one second per call, so a sweep's end is after every touch in it (a frozen clock is not)."""
    ticks = itertools.count()
    return lambda: start + timedelta(seconds=next(ticks))


def stored(sessions, source="jobtopgun"):
    with sessions() as db:
        return {r.external_id: r for r in db.scalars(select(JobPosting).where(JobPosting.source == source))}


def tombstones(sessions, source="jobtopgun"):
    with sessions() as db:
        return set(db.scalars(select(JobPostingTombstone.external_id).where(JobPostingTombstone.source == source)))


@pytest.fixture
def sessions(migrated_engine):
    return sessionmaker(migrated_engine, expire_on_commit=False)


@pytest.mark.integration
def test_jobtopgun_stores_fresh_tombstones_gone_and_floor_stops_company(sessions):
    site = jtg_site({0: ["j5-1", "j5-2", "j5-3", "j6-1"]},
                    {"j5-3": posting_page(), "j5-2": posting_page(days_ago=100), "j5-1": posting_page(),
                     "j6-1": SOFT_404})
    result = crawl(sessions, "jobtopgun", site)
    assert result["state"] == "ok" and result["created"] == 1 and result["fetched"] == 3
    assert set(stored(sessions)) == {"j5-3"} and tombstones(sessions) == {"j5-2", "j6-1"}
    assert f"{JTG}/th/jobs/j5-1" not in site.requested  # below company 5's floor
    with sessions() as db:
        assert db.get(CrawlState, "jobtopgun").state == {"floors": {"5": 2}}
    row = stored(sessions)["j5-3"]
    assert row.slug == "jtg-j5-3" and row.valid_through is not None and row.cities == ["Bangkok"]


@pytest.mark.integration
def test_jobtopgun_round_robin_newest_first(sessions):
    site = jtg_site({0: ["j5-1", "j5-2", "j9-1"]}, {i: posting_page() for i in ("j5-1", "j5-2", "j9-1")})
    crawl(sessions, "jobtopgun", site)
    details = [u.rsplit("/", 1)[1] for u in site.requested if "/th/jobs/" in u]
    assert details == ["j9-1", "j5-2", "j5-1"]


@pytest.mark.integration
def test_jobtopgun_detail_cap(sessions, monkeypatch):
    monkeypatch.setattr(job_crawl, "MAX_DETAILS", 2)
    site = jtg_site({0: ["j1-1", "j2-1", "j3-1"]}, {i: posting_page() for i in ("j1-1", "j2-1", "j3-1")})
    result = crawl(sessions, "jobtopgun", site)
    assert result["fetched"] == 2 and len(stored(sessions)) == 2


@pytest.mark.integration
def test_jobtopgun_gone_from_two_complete_snapshots_is_deleted(sessions):
    pages = {i: posting_page() for i in ("j1-1", "j2-1", "j3-1")}
    crawl(sessions, "jobtopgun", jtg_site({0: ["j1-1", "j2-1", "j3-1"]}, pages))
    for h in (1, 2):
        crawl(sessions, "jobtopgun", jtg_site({0: ["j1-1", "j2-1"]}, pages), at=T0 + timedelta(hours=h))
    assert set(stored(sessions)) == {"j1-1", "j2-1"} and tombstones(sessions) == set()
    with sessions() as db:
        assert db.scalar(select(JobIndexDelete.posting_id)) is not None


@pytest.mark.integration
def test_jobtopgun_incomplete_snapshot_counts_no_misses(sessions):
    pages = {i: posting_page() for i in ("j1-1", "j2-1")}
    crawl(sessions, "jobtopgun", jtg_site({0: ["j1-1"], 1: ["j2-1"]}, pages))
    blocked = ROBOTS + "Disallow: /sitemaps/jobs-snapshot/sitemap/1.xml\n"
    for h in (1, 2):
        result = crawl(sessions, "jobtopgun", jtg_site({0: ["j1-1"], 1: ["j2-1"]}, pages, robots=blocked),
                       at=T0 + timedelta(hours=h))
    assert result["state"] == "ok" and result["blocked"] == 1
    assert set(stored(sessions)) == {"j1-1", "j2-1"} and stored(sessions)["j2-1"].missed_runs == 0


@pytest.mark.integration
def test_jobtopgun_shrink_guard_fails_site_and_deletes_nothing(sessions):
    ids = [f"j{i}-1" for i in range(1, 21)]
    crawl(sessions, "jobtopgun", jtg_site({0: ids}, {i: posting_page() for i in ids}))
    result = crawl(sessions, "jobtopgun", jtg_site({0: ids[:5]}, {}), at=T0 + timedelta(hours=1))
    assert result == {**result, "state": "failed", "error": "suspicious_shrink"}
    assert len(stored(sessions)) == 20


@pytest.mark.integration
def test_jobtopgun_expired_valid_through_is_tombstoned_and_not_refetched(sessions):
    site = jtg_site({0: ["j1-1"]}, {"j1-1": posting_page(valid_days=-1)})
    crawl(sessions, "jobtopgun", site)
    assert stored(sessions) == {} and tombstones(sessions) == {"j1-1"}
    again = jtg_site({0: ["j1-1"]}, {"j1-1": posting_page()})
    crawl(sessions, "jobtopgun", again, at=T0 + timedelta(hours=1))
    assert f"{JTG}/th/jobs/j1-1" not in again.requested


@pytest.mark.integration
def test_jobtopgun_429_keeps_details_fetched_before_it(sessions):
    site = jtg_site({0: ["j9-1", "j5-1"]}, {"j9-1": posting_page(), "j5-1": (429, {}, b"")})
    result = crawl(sessions, "jobtopgun", site)
    assert result["state"] == "failed" and result["error"] == "http_429"
    assert set(stored(sessions)) == {"j9-1"}


@pytest.mark.integration
def test_jobtopgun_robots_blocking_details_requests_none_and_tombstones_none(sessions):
    site = jtg_site({0: ["j1-1", "j2-1"]}, {}, robots=ROBOTS + "Disallow: /th/jobs/\n")
    result = crawl(sessions, "jobtopgun", site)
    assert result["state"] == "ok" and result["blocked"] == 2 and result["fetched"] == 0
    assert not [u for u in site.requested if "/th/jobs/" in u] and tombstones(sessions) == set()


@pytest.mark.integration
def test_robots_unavailable_fails_site_without_other_requests(sessions):
    site = Site({})
    result = crawl(sessions, "jobtopgun", site)
    assert result["state"] == "failed" and result["error"] == "robots_unavailable"
    assert site.requested == [f"{JTG}/robots.txt"]


BKK = "https://www.jobbkk.com"
BKK_ROBOTS = "User-agent: *\nDisallow: /jobs/apply/\n"


def bkk_list_url(n):
    return job_crawl._BKK_LIST.format(n)


def item(job, created_days=1, updated_days=0, company=7):
    def stamp(days):
        return (T0 - timedelta(days=days)).astimezone(job_crawl.BANGKOK).strftime("%Y-%m-%d %H:%M:%S")
    return {"jobpost_id": job, "company_id": company, "created_at": stamp(created_days),
            "updated_at": stamp(updated_days)}


def rsc_page(items):
    payload = json.dumps({"jobpost_list": items}, separators=(",", ":"))
    return f"<script>self.__next_f.push([1,{json.dumps('5:' + payload)}])</script>"


OLD_PAGE = [item(900, created_days=200, updated_days=120)]


def bkk_site(listing, details=None, robots=BKK_ROBOTS):
    """listing: page number -> items; details: job id -> page (default: a fresh posting)."""
    pages = {f"{BKK}/robots.txt": robots}
    pages.update({bkk_list_url(n): rsc_page(items) for n, items in listing.items()})
    for items in listing.values():
        for i in items:
            pages.setdefault(f"{BKK}/jobs/detail/{i['company_id']}/{i['jobpost_id']}", posting_page())
    pages.update({f"{BKK}/jobs/detail/7/{job}": body for job, body in (details or {}).items()})
    return Site(pages)


def bkk_state(sessions):
    with sessions() as db:
        row = db.get(CrawlState, "jobbkk")
        return row.state if row else None


@pytest.mark.integration
def test_jobbkk_head_pages_and_sweep_finish_at_all_old_page(sessions):
    site = bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 4: [item(4), item(5, created_days=95)], 5: OLD_PAGE})
    result = crawl(sessions, "jobbkk", site)
    assert result["state"] == "ok" and set(stored(sessions, "jobbkk")) == {"1", "2", "3", "4"}
    assert f"{BKK}/jobs/detail/7/5" not in site.requested and f"{BKK}/jobs/detail/7/900" not in site.requested
    assert bkk_list_url(6) not in site.requested
    assert bkk_state(sessions) == {"cursor": 4, "sweep_started_at": T0.isoformat()}
    assert stored(sessions, "jobbkk")["4"].slug == "bkk-4"


@pytest.mark.integration
def test_jobbkk_cursor_resumes_and_head_pages_reread(sessions):
    listing = {1: [item(1)], 2: [item(2)], 3: [item(3)], 4: [item(4)], 5: [item(5)], 6: OLD_PAGE}
    first = bkk_site(listing)
    crawl(sessions, "jobbkk", first, max_requests=9)  # robots, 3 heads + 3 details, page 4 + detail -> cap at page 5
    assert bkk_state(sessions)["cursor"] == 5 and set(stored(sessions, "jobbkk")) == {"1", "2", "3", "4"}
    second = bkk_site(listing)
    result = crawl(sessions, "jobbkk", second, at=T0 + timedelta(hours=1))
    lists = [u for u in second.requested if "/jobs/lists/" in u]
    assert lists == [bkk_list_url(n) for n in (1, 2, 3, 5, 6)] and result["state"] == "ok"
    assert set(stored(sessions, "jobbkk")) == {"1", "2", "3", "4", "5"}
    assert bkk_state(sessions)["cursor"] == 4


@pytest.mark.integration
def test_jobbkk_unreadable_head_page_fails_and_deletes_nothing(sessions):
    crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 4: OLD_PAGE}), clock=ticking())
    before = bkk_state(sessions)
    broken = bkk_site({1: [item(1)]})
    broken.pages[bkk_list_url(2)] = "<html>redesigned</html>"
    result = crawl(sessions, "jobbkk", broken, at=T0 + timedelta(hours=1))
    assert result["state"] == "failed" and result["error"] == "listing_unreadable"
    assert set(stored(sessions, "jobbkk")) == {"1", "2", "3"} and bkk_state(sessions) == before


@pytest.mark.integration
def test_jobbkk_unreadable_sweep_page_fails_and_deletes_nothing(sessions):
    good = {1: [item(1)], 2: [item(2)], 3: [item(3)]}
    crawl(sessions, "jobbkk", bkk_site({**good, 4: OLD_PAGE}), clock=ticking())
    before = bkk_state(sessions)
    broken = bkk_site(good)
    broken.pages[bkk_list_url(4)] = "<html>redesigned</html>"
    for h in (1, 2):
        result = crawl(sessions, "jobbkk", broken, at=T0 + timedelta(hours=h))
        assert result["state"] == "failed" and result["error"] == "listing_unreadable"
    rows = stored(sessions, "jobbkk")
    assert set(rows) == {"1", "2", "3"} and {r.missed_runs for r in rows.values()} == {0}
    assert bkk_state(sessions) == before


@pytest.mark.integration
def test_jobbkk_head_pages_never_move_saved_cursor(sessions):
    with sessions.begin() as db:
        db.add(CrawlState(source="jobbkk", state={"cursor": 6, "sweep_started_at": T0.isoformat()}, updated_at=T0))
    site = bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 6: OLD_PAGE})
    result = crawl(sessions, "jobbkk", site, at=T0 + timedelta(hours=1), max_requests=4)  # robots, 3 head pages
    assert result["state"] == "ok" and bkk_list_url(6) not in site.requested
    assert bkk_state(sessions)["cursor"] == 6


@pytest.mark.integration
def test_jobbkk_missing_from_two_finished_sweeps_is_deleted(sessions):
    crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 4: OLD_PAGE}), clock=ticking())
    thinner = {1: [item(1)], 2: [item(2)], 3: [], 4: OLD_PAGE}
    crawl(sessions, "jobbkk", bkk_site(thinner), at=T0 + timedelta(hours=1), clock=ticking(T0 + timedelta(hours=1)))
    assert stored(sessions, "jobbkk")["3"].missed_runs == 1
    crawl(sessions, "jobbkk", bkk_site(thinner), at=T0 + timedelta(hours=2), clock=ticking(T0 + timedelta(hours=2)))
    assert set(stored(sessions, "jobbkk")) == {"1", "2"} and tombstones(sessions, "jobbkk") == set()


@pytest.mark.integration
def test_jobbkk_stored_posting_listed_with_old_created_at_is_not_missed(sessions):
    crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [], 3: [], 4: OLD_PAGE}), clock=ticking())
    aged = {1: [item(1, created_days=200, updated_days=0)], 2: [], 3: [], 4: OLD_PAGE}
    for h in (1, 2):
        at = T0 + timedelta(hours=h)
        crawl(sessions, "jobbkk", bkk_site(aged), at=at, clock=ticking(at))
    row = stored(sessions, "jobbkk")["1"]
    assert row.missed_runs == 0


@pytest.mark.integration
def test_jobbkk_shrink_guard_fails_but_restarts_sweep(sessions):
    many = {1: [item(i) for i in range(1, 21)], 2: [], 3: [], 4: OLD_PAGE}
    crawl(sessions, "jobbkk", bkk_site(many), clock=ticking())
    few = {1: [item(i) for i in range(1, 6)], 2: [], 3: [], 4: OLD_PAGE}
    later = T0 + timedelta(hours=1)
    result = crawl(sessions, "jobbkk", bkk_site(few), at=later)
    assert result["state"] == "failed" and result["error"] == "suspicious_shrink"
    assert len(stored(sessions, "jobbkk")) == 20
    assert bkk_state(sessions) == {"cursor": 4, "sweep_started_at": later.isoformat()}


@pytest.mark.integration
def test_jobbkk_429_mid_page_keeps_details_and_cursor(sessions):
    listing = {1: [], 2: [], 3: [], 4: [item(1), item(2)], 5: OLD_PAGE}
    site = bkk_site(listing, details={2: (429, {}, b"")})
    result = crawl(sessions, "jobbkk", site)
    assert result["state"] == "failed" and result["error"] == "http_429"
    assert set(stored(sessions, "jobbkk")) == {"1"} and bkk_state(sessions)["cursor"] == 4


@pytest.mark.integration
def test_jobbkk_same_id_on_two_pages_fetched_once(sessions):
    site = bkk_site({1: [item(1), item(1)], 2: [], 3: [], 4: [item(1)], 5: OLD_PAGE})
    crawl(sessions, "jobbkk", site)
    assert site.requested.count(f"{BKK}/jobs/detail/7/1") == 1


@pytest.mark.integration
def test_jobbkk_soft_404_is_tombstoned_and_skipped_next_sweep(sessions):
    listing = {1: [item(1)], 2: [], 3: [], 4: OLD_PAGE}
    crawl(sessions, "jobbkk", bkk_site(listing, details={1: "<html>not found</html>"}))
    assert tombstones(sessions, "jobbkk") == {"1"}
    again = bkk_site(listing)
    crawl(sessions, "jobbkk", again, at=T0 + timedelta(hours=1))
    assert f"{BKK}/jobs/detail/7/1" not in again.requested
