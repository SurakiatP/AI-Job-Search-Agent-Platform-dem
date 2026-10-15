"""WP5 part 3: hourly crawl of JobTopGun and JobBKK into the job store (spec 2026-10-15-thai-board-crawler, ADR-016).

Work is committed as it goes, so a stop (cap, 429, crash) keeps what was fetched. Stored postings are never re-fetched.
"""
from __future__ import annotations

import itertools
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.dialects.postgresql import insert as pg_insert

from job_search_platform.db.models import CrawlState
from job_search_platform.integrations import crawler, job_boards
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

MAX_DETAILS = 130  # JobTopGun detail pages per run
COMMIT_EVERY = 10
JTG = "https://www.jobtopgun.com"
_JTG_ID = re.compile(r"^j(\d+)-(\d+)$")
HEAD_PAGES = 3  # JobBKK pages read every run, so new postings appear within the hour
AGE_MARGIN = timedelta(days=1)  # JobBKK listing timestamps are skewed by hours
BANGKOK = timezone(timedelta(hours=7))
BKK = "https://www.jobbkk.com"
_BKK_LIST = BKK + "/jobs/lists/{}/" + quote("หางาน,ทั้งหมด,ทุกจังหวัด,ทั้งหมด.html", safe=",.")
_DIGITS = re.compile(r"^\d{1,12}$")


def crawl_site(sessions, site: str, *, clock, sleep=time.sleep, monotonic=time.monotonic,
               transport=crawler.http_transport, budget_seconds: float = crawler.SITE_BUDGET_SECONDS,
               max_requests: int = crawler.MAX_REQUESTS) -> dict:
    """One site, one run; returns its per_board entry. A cap ends the site normally; other stops are failures."""
    client = crawler.PoliteClient(crawler.HOSTS[site], transport=transport, clock=monotonic, sleep=sleep,
                                  max_requests=max_requests, budget_seconds=budget_seconds)
    counts = {"fetched": 0, "created": 0, "deleted": 0}
    try:
        client.start()
        (_jobtopgun if site == "jobtopgun" else _jobbkk)(sessions, client, clock, counts)
        result = {"state": "ok"}
    except crawler.CrawlStop as stop:
        result = {"state": "ok"} if stop.reason == "cap" else {"state": "failed", "error": stop.reason[:80]}
    except job_boards.BoardError as exc:  # suspicious_shrink: no misses were counted
        result = {"state": "failed", "error": str(exc)[:80]}
    return {**result, "requests": client.requests, "blocked": client.blocked, **counts}


def _load_state(sessions, source: str) -> dict:
    with sessions() as db:
        row = db.get(CrawlState, source)
        return dict(row.state) if row else {}


def _save_state(db, source: str, state: dict, now: datetime) -> None:
    db.execute(pg_insert(CrawlState).values(source=source, state=state, updated_at=now)
               .on_conflict_do_update(index_elements=["source"], set_={"state": state, "updated_at": now}))


def _classify(source: str, external_id: str, url: str, page: str, now: datetime) -> tuple[str, dict | None]:
    """('store', row) for a live posting from the last 90 days, ('old', None) past 90 days, ('gone', None) otherwise."""
    posting = crawler.job_posting(page)
    row = map_posting(source, None, {"id": external_id, "url": url, "posting": posting}) if posting else None
    if row is None:
        return "gone", None
    posted = job_store.parse_ts(row["posted_at"])
    if posted is not None and posted < now - job_store.MAX_AGE:
        return "old", None
    until = job_store.parse_ts(row.get("valid_through"))
    if until is not None and until < now:
        return "gone", None
    return "store", row


def _flush(sessions, source: str, batch: list, now: datetime, counts: dict, state: dict) -> None:
    """Commit fetched details together with crawl progress."""
    with sessions.begin() as db:
        job_store.tombstone_ids(db, source, [ext for ext, kind, _ in batch if kind != "store"], now)
        upserted, _, _ = job_store.upsert_postings(
            db, source, None, [row for _, kind, row in batch if kind == "store"], now)
        counts["created"] += upserted["created"]
        _save_state(db, source, state, now)
    batch.clear()


def _jobtopgun(sessions, client, clock, counts) -> None:
    """Sitemap snapshot every run, then up to MAX_DETAILS unseen ids, each company's newest first (spec, JobTopGun)."""
    index = client.get(f"{JTG}/sitemap.xml")
    if index is None:
        raise crawler.CrawlStop("sitemap_blocked")
    snapshot, complete = set(), True
    for url in crawler.job_sitemaps(crawler.sitemap_locs(index)):
        page = client.get(url)
        if page is None:
            complete = False
            continue
        snapshot |= crawler.jobtopgun_ids(crawler.sitemap_locs(page))
    now = clock()
    with sessions.begin() as db:
        stored, tombstoned = job_store.touch_seen(db, "jobtopgun", snapshot, now)
        if complete:
            counts["deleted"] += job_store.miss_unseen(db, "jobtopgun", now, now)
    floors = {int(k): v for k, v in _load_state(sessions, "jobtopgun").get("floors", {}).items()}
    by_company: dict[int, list[int]] = {}
    for external_id in snapshot - stored - tombstoned:
        company, n = (int(x) for x in _JTG_ID.match(external_id).groups())
        if n > floors.get(company, -1):
            by_company.setdefault(company, []).append(n)
    queue = sorted((rank, -company, company, n) for company, ns in by_company.items()
                   for rank, n in enumerate(sorted(ns, reverse=True)))
    batch: list = []

    def progress():
        return {"floors": {str(c): n for c, n in floors.items()}}

    try:
        for _, _, company, n in queue:
            if counts["fetched"] >= MAX_DETAILS:
                break
            if n <= floors.get(company, -1):
                continue  # an older-than-90-days posting of this company was found earlier in this run
            external_id = f"j{company}-{n}"
            url = f"{JTG}/th/jobs/{external_id}"
            page = client.get(url)
            if page is None:
                continue  # robots.txt disallows it: blocked is not gone
            counts["fetched"] += 1
            kind, row = _classify("jobtopgun", external_id, url, page, clock())
            if kind == "old":
                floors[company] = max(n, floors.get(company, -1))
            batch.append((external_id, kind, row))
            if len(batch) >= COMMIT_EVERY:
                _flush(sessions, "jobtopgun", batch, clock(), counts, progress())
    finally:
        _flush(sessions, "jobtopgun", batch, clock(), counts, progress())


def _bkk_time(value) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=BANGKOK)
    except (TypeError, ValueError):
        return None


def _jobbkk(sessions, client, clock, counts) -> None:
    """Head pages every run, then the sweep from its cursor until a page of only >91-day-old updates (spec, JobBKK)."""
    saved = _load_state(sessions, "jobbkk")
    state = {"cursor": saved.get("cursor", HEAD_PAGES + 1),
             "sweep_started_at": saved.get("sweep_started_at") or clock().isoformat()}
    for number in itertools.chain(range(1, HEAD_PAGES + 1), itertools.count(state["cursor"])):
        page = client.get(_BKK_LIST.format(number))
        items = crawler.jobpost_list(page) if page is not None else None
        if items is None:
            raise crawler.CrawlStop("listing_unreadable")  # blocked or markup changed: never an empty listing
        cutoff = clock() - job_store.MAX_AGE - AGE_MARGIN
        sweeping = number > HEAD_PAGES
        if sweeping and all((t := _bkk_time(i.get("updated_at"))) is not None and t < cutoff for i in items):
            _finish_sweep(sessions, job_store.parse_ts(state["sweep_started_at"]), clock(), counts)
            return
        done = dict(state, cursor=number + 1) if sweeping else state
        _bkk_page(sessions, client, items, clock, counts, cutoff, state, done)
        state = done


def _bkk_page(sessions, client, items, clock, counts, cutoff, state, done) -> None:
    """One listing page: mark listed ids seen, fetch details of new ones; a stop keeps the page as the cursor."""
    listed = {}
    for item in items:
        job, company = str(item.get("jobpost_id", "")), str(item.get("company_id", ""))
        if _DIGITS.match(job) and _DIGITS.match(company):
            listed.setdefault(job, (company, item))
    with sessions.begin() as db:
        stored, tombstoned = job_store.touch_seen(db, "jobbkk", set(listed), clock())
    batch: list = []
    try:
        for job, (company, item) in listed.items():
            created = _bkk_time(item.get("created_at"))
            if job in stored or job in tombstoned or created is None or created < cutoff:
                continue
            url = f"{BKK}/jobs/detail/{company}/{job}"
            page = client.get(url)
            if page is None:
                continue  # robots.txt disallows it: blocked is not gone
            counts["fetched"] += 1
            batch.append((job, *_classify("jobbkk", job, url, page, clock())))
    except crawler.CrawlStop:
        _flush(sessions, "jobbkk", batch, clock(), counts, state)  # page unfinished: read it again next run
        raise
    _flush(sessions, "jobbkk", batch, clock(), counts, done)


def _finish_sweep(sessions, started: datetime, now: datetime, counts: dict) -> None:
    """A finished sweep has seen every live posting: count misses, then start the next sweep."""
    fresh = {"cursor": HEAD_PAGES + 1, "sweep_started_at": now.isoformat()}
    try:
        with sessions.begin() as db:
            counts["deleted"] += job_store.miss_unseen(db, "jobbkk", started, now)
            _save_state(db, "jobbkk", fresh, now)
    except job_boards.BoardError:
        with sessions.begin() as db:  # shrink guard: no misses counted, but the next sweep still starts
            _save_state(db, "jobbkk", fresh, now)
        raise
