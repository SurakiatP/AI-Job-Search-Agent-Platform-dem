# Thai Board Crawler (WP5 part 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an hourly, robots.txt-bound crawl of JobTopGun and JobBKK to `ingest run`, storing their last-90-day postings in the part-1 job store so they're searchable through the part-2 index.

**Architecture:**
- `integrations/crawler.py` is the transport layer and has no database code. It holds `PoliteClient` (Protego robots.txt checks, delay, caps, redirect checks) and the page parsers: sitemap `<loc>`, JSON-LD JobPosting, and the JobBKK RSC `jobpost_list`.
- `services/job_crawl.py` holds the two site routines and their progress. Progress is kept in the new `crawl_state` table.
- Writes go through new shared helpers in `services/job_store.py`.
- `run_ingest` runs the crawl phase after the ATS boards, under the existing advisory lock. The part-2 index sync then runs unchanged.

**Tech Stack:** Python 3.12, stdlib `urllib`, Protego 0.7.0 (new), SQLAlchemy 2, Alembic, PostgreSQL 17, pytest.

**Spec:** `docs/superpowers/specs/2026-10-15-thai-board-crawler-design.md` (decisions C1–C9). ADR: `docs/adr/ADR-016-thai-board-crawling.md`.

## Global Constraints

- Run every shell command with the `rtk` prefix, from the worktree `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/crawler`, on branch `feat/thai-board-crawler`.
- Code and docs are in English. The one exception is `docs/demo/tor-roadmap.md`, which is in Thai.
- Hosts are allowlisted: `www.jobtopgun.com` and `www.jobbkk.com`, HTTPS only.
- robots.txt:
  - re-read at the start of every run for each site; any non-200 response skips the site with error `robots_unavailable`;
  - every URL and every redirect hop is checked with `Protego.can_fetch(url, "job-search-platform")` before it is requested.
- Delay: at least 3 s between requests to a host, or the robots `Crawl-delay` when that is larger.
- Caps:
  - 300 requests per site per run; robots.txt and every redirect hop count;
  - 15 minutes per site;
  - 50 minutes for the whole run (the ATS phase keeps its own 20 minutes);
  - at most 3 redirect hops.
- HTTP 429 or 503 stops the site for this run (`http_429`, `http_503`).
- User-Agent is `job_boards.USER_AGENT`.
- Transport: `ProxyHandler({})`, 8 s timeout, 4 MiB body cap, and no `Accept-Encoding` header.
- Kill switch: the `"crawl"` list in `backend/src/job_search_platform/data/job_boards.json`. A missing key means no crawling.
- Store only postings from the last 90 days (`job_store.MAX_AGE`). JobBKK listing timestamps get 1 extra day of margin.
- JobTopGun: at most 130 detail pages per run. JobBKK: read head pages 1–3 on every run, then continue the sweep from `cursor`, which starts at 4.
- Delete or tombstone a posting in these cases:
  - no JobPosting on its detail page: tombstone;
  - `datePosted` older than 90 days: tombstone;
  - `validThrough` has passed: tombstone;
  - missing from 2 complete discovery passes: delete, no tombstone;
  - older than 90 days: `retire`.
- Stored postings are never fetched again (C9).
- Contact details that appear in a posting are kept as written. Nothing is fetched from outside the posting.
- Tests:
  - use synthetic data only, with no real postings, companies or phone numbers;
  - unit tests make no network calls;
  - Postgres tests are marked `@pytest.mark.integration`.
- Never run `scripts/local_infra.py start` without `.env`.
- Never touch the owner database `jobsearch_platform_core02` or the live Meilisearch index `jobs`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Test commands, run from the worktree root (`CORE02_PRIVATE_DIR` must be set for integration tests):
  - unit: `rtk uv run --locked --project backend pytest backend/tests/unit -q`
  - integration file: `rtk uv run --locked --project backend pytest backend/tests/integration/<file> -q`

## Review Focus

These cases come from the spec but no task's tests cover them yet. Each has a test added to the task that owns the code:
1. **JobBKK listing markup changes** (the page has no `jobpost_list`). The site must fail with `listing_unreadable`. It must never be read as an empty listing that ends a sweep and deletes postings. Test in Task 5.
2. **`ingest_jobs.py discover` rewrites `job_boards.json`.** It must keep the `"crawl"` key. Losing it would silently switch crawling off. Test in Task 6.
3. **A stop mid-run** (429, cap, timeout). Detail pages fetched before the stop are kept. JobBKK keeps the unfinished page as its cursor. Tests in Tasks 4 and 5.
4. **robots.txt starts disallowing detail pages.** The run makes zero detail requests and writes no tombstones: a blocked page is not a gone posting. Test in Task 4.
5. **The same JobBKK id appears on two pages in one run** (head and sweep pages, or an unstable order). Its detail page is fetched once. Test in Task 5.

---

### Task 1: Protego dependency, `PoliteClient` and page parsers

**Files:**
- Modify: `backend/pyproject.toml`, `backend/uv.lock`, `requirements.txt`, `docs/engineering/dependencies.md`
- Create: `backend/src/job_search_platform/integrations/crawler.py`
- Test: `backend/tests/unit/test_crawler.py`

**Interfaces:**
- Consumes: `job_boards.USER_AGENT`, `job_boards._NoRedirect` (existing).
- Produces, in `integrations/crawler.py`:
  - constants `SITES = ("jobtopgun", "jobbkk")`, `HOSTS: dict[str, str]`, `ROBOTS_AGENT = "job-search-platform"`, `MIN_DELAY = 3.0`, `MAX_REQUESTS = 300`, `SITE_BUDGET_SECONDS = 900`, `MAX_BYTES = 4 MiB`, `MAX_HOPS = 3`;
  - `class CrawlStop(Exception)` with `.reason: str`. Reason `"cap"` is a normal end; any other reason is a failure;
  - `http_transport(url) -> tuple[int, dict[str, str], bytes]`, with header names lower-cased;
  - `class PoliteClient(host, *, transport=http_transport, clock=time.monotonic, sleep=time.sleep, max_requests=MAX_REQUESTS, budget_seconds=SITE_BUDGET_SECONDS)` with `.start() -> None`, `.get(url) -> str | None` (None means robots.txt disallowed it), and `.requests`, `.blocked`;
  - parsers `sitemap_locs(xml) -> list[str]`, `job_sitemaps(locs) -> list[str]`, `jobtopgun_ids(locs) -> set[str]`, `job_posting(page) -> dict | None` and `jobpost_list(page) -> list[dict] | None`.

- [ ] **Step 1: Add Protego**

```bash
rtk uv add --project backend "protego==0.7.0"
rtk uv export --locked --project backend --no-dev --no-emit-project --format requirements-txt > requirements.txt
```

Check that `backend/pyproject.toml` lists `"protego==0.7.0"` in `dependencies`, in alphabetical order.

- [ ] **Step 2: Audit it**

```bash
rtk uv export --locked --project backend --all-groups --no-emit-project --format requirements-txt -o "$TMPDIR/jsp-req.txt"
rtk uv run --locked --project backend pip-audit --strict --disable-pip -r "$TMPDIR/jsp-req.txt"
```

Expected: `No known vulnerabilities found`. If anything is found, stop and report BLOCKED.

Append this to `docs/engineering/dependencies.md`, using the real audit date and time:

```markdown
## Protego (2026-10-15)

- `protego==0.7.0` (BSD-3-Clause, pure Python, no dependencies). robots.txt parser for the WP5 part-3 crawler (ADR-016). Chosen over stdlib `urllib.robotparser`, which ignores `*` and `$` wildcards.
- `pip-audit --strict` over the exported all-groups requirements (<date time UTC>): 0 advisories.
```

- [ ] **Step 3: Write the failing tests** in `backend/tests/unit/test_crawler.py`

```python
"""WP5 part 3 crawler transport and parsers (ADR-016). Synthetic pages only, no network."""
from __future__ import annotations

import json

import pytest

from job_search_platform.integrations import crawler
from job_search_platform.integrations.crawler import CrawlStop, PoliteClient

HOST = "www.jobbkk.com"
ROOT = f"https://{HOST}"


class Site:
    """Fake transport: url -> body str, or (status, headers, body bytes). Unknown URLs are 404."""

    def __init__(self, pages, robots="User-agent: *\nDisallow: /private/\n"):
        self.pages = {f"{ROOT}/robots.txt": robots, **pages} if robots is not None else dict(pages)
        self.requested = []

    def __call__(self, url):
        self.requested.append(url)
        page = self.pages.get(url, (404, {}, b""))
        return page if isinstance(page, tuple) else (200, {}, page.encode())


class Clock:
    def __init__(self):
        self.now, self.sleeps = 0.0, []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def _client(site, **kw):
    clock = Clock()
    client = PoliteClient(HOST, transport=site, clock=clock, sleep=clock.sleep, **kw)
    client.start()
    return client, clock


def test_disallowed_url_is_never_requested():
    site = Site({f"{ROOT}/jobs": "ok"})
    client, _ = _client(site)
    assert client.get(f"{ROOT}/private/x") is None
    assert client.blocked == 1 and f"{ROOT}/private/x" not in site.requested
    assert client.get(f"{ROOT}/jobs") == "ok"


def test_wildcard_rules_are_honoured():
    site = Site({f"{ROOT}/jobs": "ok"}, robots="User-agent: *\nDisallow: /*?\n")
    client, _ = _client(site)
    assert client.get(f"{ROOT}/jobs?page=2") is None
    assert client.get(f"{ROOT}/jobs") == "ok"


def test_robots_not_200_skips_site():
    site = Site({}, robots=None)
    with pytest.raises(CrawlStop) as stop:
        _client(site)
    assert stop.value.reason == "robots_unavailable"


def test_delay_is_three_seconds_or_crawl_delay():
    site = Site({f"{ROOT}/a": "a", f"{ROOT}/b": "b"})
    client, clock = _client(site)
    client.get(f"{ROOT}/a")
    client.get(f"{ROOT}/b")
    assert clock.sleeps == [3.0, 3.0]
    slow = Site({f"{ROOT}/a": "a"}, robots="User-agent: *\nCrawl-delay: 7\n")
    client, clock = _client(slow)
    client.get(f"{ROOT}/a")
    assert clock.sleeps == [7.0]


def test_request_cap_counts_robots_and_ends_normally():
    site = Site({f"{ROOT}/a": "a"})
    client, _ = _client(site, max_requests=2)
    client.get(f"{ROOT}/a")
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/a")
    assert stop.value.reason == "cap" and client.requests == 2


def test_time_budget_ends_normally():
    site = Site({f"{ROOT}/a": "a"})
    client, _ = _client(site, budget_seconds=5)
    client.get(f"{ROOT}/a")  # sleeps 3 s -> t=3
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/a")  # sleeps to t=6 -> past budget, not sent
    assert stop.value.reason == "cap" and client.requests == 2


@pytest.mark.parametrize("status", [429, 503])
def test_throttle_status_stops_site(status):
    site = Site({f"{ROOT}/a": (status, {}, b"")})
    client, _ = _client(site)
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/a")
    assert stop.value.reason == f"http_{status}"


def test_other_status_stops_site():
    client, _ = _client(Site({}))
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/missing")
    assert stop.value.reason == "status_404"


def test_redirect_followed_when_allowed():
    site = Site({f"{ROOT}/old": (301, {"location": "/new"}, b""), f"{ROOT}/new": "moved"})
    client, _ = _client(site)
    assert client.get(f"{ROOT}/old") == "moved" and client.requests == 3


@pytest.mark.parametrize("target", ["https://evil.test/x", "/private/x", "http://www.jobbkk.com/x"])
def test_redirect_off_host_or_disallowed_is_blocked(target):
    site = Site({f"{ROOT}/old": (302, {"location": target}, b"")})
    client, _ = _client(site)
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/old")
    assert stop.value.reason == "redirect_blocked"
    assert all(not u.endswith("/x") for u in site.requested)


def test_redirect_loop_stops_after_three_hops():
    site = Site({f"{ROOT}/a": (302, {"location": "/b"}, b""), f"{ROOT}/b": (302, {"location": "/a"}, b"")})
    client, _ = _client(site)
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/a")
    assert stop.value.reason == "redirect_blocked" and client.requests == 1 + 4


def test_off_host_url_is_refused():
    client, _ = _client(Site({}))
    with pytest.raises(CrawlStop) as stop:
        client.get("https://www.jobtopgun.com/th/jobs/j1-1")
    assert stop.value.reason == "off_host"


def test_body_cap(monkeypatch):
    client, _ = _client(Site({f"{ROOT}/big": "x" * 11}))
    monkeypatch.setattr(crawler, "MAX_BYTES", 10)  # after start: robots.txt is capped too
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/big")
    assert stop.value.reason == "too_large"


def test_network_error_stops_site():
    def broken(url):
        if url.endswith("robots.txt"):
            return 200, {}, b"User-agent: *\n"
        raise TimeoutError("slow")
    client, _ = _client(broken)
    with pytest.raises(CrawlStop) as stop:
        client.get(f"{ROOT}/a")
    assert stop.value.reason == "TimeoutError"


def test_sitemap_parsers():
    index = ('<sitemapindex><sitemap><loc>https://www.jobtopgun.com/sitemaps/jobs-snapshot/sitemap/0.xml</loc></sitemap>'
             '<sitemap><loc>https://www.jobtopgun.com/sitemaps/locations/sitemap.xml</loc></sitemap>'
             '<sitemap><loc>https://evil.test/sitemaps/jobs-snapshot/sitemap/1.xml</loc></sitemap></sitemapindex>')
    assert crawler.job_sitemaps(crawler.sitemap_locs(index)) == [
        "https://www.jobtopgun.com/sitemaps/jobs-snapshot/sitemap/0.xml"]
    urls = ('<urlset><url><loc>https://www.jobtopgun.com/th/jobs/j12-254</loc></url>'
            '<url><loc>https://www.jobtopgun.com/en/jobs/j12-254</loc></url>'
            '<url><loc>https://www.jobtopgun.com/th/jobs/j12-255?x=1&amp;y=2</loc></url>'
            '<url><loc>https://www.jobtopgun.com/th/jobs/../admin</loc></url>'
            '<url><loc>https://www.jobtopgun.com/th/jobs/j7-1</loc></url></urlset>')
    assert crawler.jobtopgun_ids(crawler.sitemap_locs(urls)) == {"j12-254", "j7-1"}


def _ld(obj):
    return f'<script type="application/ld+json">{json.dumps(obj)}</script>'


def test_job_posting_found_among_blocks():
    page = ("<html>" + _ld({"@type": "BreadcrumbList"}) + '<script type="application/ld+json">{bad</script>'
            + _ld({"@graph": [{"@type": "Organization"}, {"@type": "JobPosting", "title": "Synthetic Role"}]})
            + "</html>")
    assert crawler.job_posting(page)["title"] == "Synthetic Role"
    assert crawler.job_posting("<html><title>Job Details</title></html>") is None


def _rsc(*chunks):
    return "".join(f"<script>self.__next_f.push([1,{json.dumps(c)}])</script>" for c in chunks)


def test_jobpost_list_from_split_rsc_chunks():
    payload = json.dumps({"x": 1, "jobpost_list": [{"jobpost_id": 1, "company_id": 2}, "junk"]}, separators=(",", ":"))
    page = _rsc("0:[]\n", "5:" + payload[:20], payload[20:])
    assert crawler.jobpost_list(page) == [{"jobpost_id": 1, "company_id": 2}]
    spaced = _rsc('5:{"jobpost_list": []}')
    assert crawler.jobpost_list(spaced) == []
    assert crawler.jobpost_list("<html>no list</html>") is None
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_crawler.py -q`
Expected: collection error, `No module named 'job_search_platform.integrations.crawler'`.

- [ ] **Step 5: Implement** `backend/src/job_search_platform/integrations/crawler.py`

```python
"""WP5 part 3 crawler transport (ADR-016): a robots.txt-bound polite HTTP client and page parsers. No database.

Every URL and every redirect hop is checked with Protego before it is requested; hosts are a fixed allowlist.
"""
from __future__ import annotations

import html
import json
import re
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from protego import Protego

from job_search_platform.integrations.job_boards import USER_AGENT, _NoRedirect

SITES = ("jobtopgun", "jobbkk")
HOSTS = {"jobtopgun": "www.jobtopgun.com", "jobbkk": "www.jobbkk.com"}
ROBOTS_AGENT = "job-search-platform"
MIN_DELAY = 3.0
MAX_REQUESTS = 300
SITE_BUDGET_SECONDS = 15 * 60
MAX_BYTES = 4 * 1024 * 1024
MAX_HOPS = 3
TIMEOUT_SECONDS = 8
_REDIRECT = (301, 302, 303, 307, 308)
_LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")
_JOB_SITEMAP = re.compile(r"^https://www\.jobtopgun\.com/sitemaps/jobs-snapshot/sitemap/\d{1,6}\.xml$")
_JTG_JOB = re.compile(r"^https://www\.jobtopgun\.com/th/jobs/(j\d{1,12}-\d{1,12})$")
_LD = re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)
_PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_JOBPOST_LIST = re.compile(r'"jobpost_list":\s*')


class CrawlStop(Exception):
    """Ends a site's run. Reason 'cap' (request or time budget) is a normal end; any other reason is a failure."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def http_transport(url: str) -> tuple[int, dict[str, str], bytes]:
    request = Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
    try:
        with build_opener(_NoRedirect(), ProxyHandler({})).open(request, timeout=TIMEOUT_SECONDS) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            return response.status, headers, response.read(MAX_BYTES + 1)
    except HTTPError as exc:  # 3xx (never followed here), 4xx, 5xx
        return exc.code, {k.lower(): v for k, v in (exc.headers or {}).items()}, b""


class PoliteClient:
    """One site, one run: robots.txt read at start, >= MIN_DELAY between requests, request and time caps."""

    def __init__(self, host: str, *, transport=http_transport, clock=time.monotonic, sleep=time.sleep,
                 max_requests: int = MAX_REQUESTS, budget_seconds: float = SITE_BUDGET_SECONDS):
        self.host, self.transport, self.clock, self.sleep = host, transport, clock, sleep
        self.max_requests, self.deadline = max_requests, clock() + budget_seconds
        self.requests = self.blocked = 0
        self.delay = MIN_DELAY
        self.robots = None
        self._last = None

    def start(self) -> None:
        status, _, body = self._fetch(f"https://{self.host}/robots.txt")
        if status != 200:
            raise CrawlStop("robots_unavailable")
        self.robots = Protego.parse(body.decode("utf-8", "replace"))
        self.delay = max(MIN_DELAY, float(self.robots.crawl_delay(ROBOTS_AGENT) or 0))

    def get(self, url: str) -> str | None:
        """Body of a 200 page, or None when robots.txt disallows the URL (never requested, counted as blocked)."""
        for hop in range(MAX_HOPS + 1):
            parts = urlsplit(url)
            if parts.scheme != "https" or parts.netloc != self.host:
                raise CrawlStop("redirect_blocked" if hop else "off_host")
            if not self.robots.can_fetch(url, ROBOTS_AGENT):
                if hop:
                    raise CrawlStop("redirect_blocked")
                self.blocked += 1
                return None
            status, headers, body = self._fetch(url)
            if status in _REDIRECT:
                url = urljoin(url, headers.get("location", ""))
                continue
            if status != 200:
                raise CrawlStop(f"status_{status}")
            return body.decode("utf-8", "replace")
        raise CrawlStop("redirect_blocked")

    def _fetch(self, url: str) -> tuple[int, dict[str, str], bytes]:
        if self.requests >= self.max_requests:
            raise CrawlStop("cap")
        if self._last is not None:
            wait = self._last + self.delay - self.clock()
            if wait > 0:
                self.sleep(wait)
        if self.clock() >= self.deadline:
            raise CrawlStop("cap")
        self.requests += 1
        try:
            status, headers, body = self.transport(url)
        except Exception as exc:  # network error or timeout: stop the site, keep the work done
            raise CrawlStop(type(exc).__name__) from None
        finally:
            self._last = self.clock()
        if status in (429, 503):
            raise CrawlStop(f"http_{status}")
        if len(body) > MAX_BYTES:
            raise CrawlStop("too_large")
        return status, headers, body


def sitemap_locs(xml: str) -> list[str]:
    """<loc> values by regex: no XML parser, so no entity expansion from untrusted input."""
    return [html.unescape(loc) for loc in _LOC.findall(xml)]


def job_sitemaps(locs: list[str]) -> list[str]:
    return [loc for loc in locs if _JOB_SITEMAP.match(loc)]


def jobtopgun_ids(locs: list[str]) -> set[str]:
    """Job ids from /th/jobs/ URLs (each job is also listed under /en/)."""
    return {m[1] for loc in locs if (m := _JTG_JOB.match(loc))}


def job_posting(page: str) -> dict | None:
    """The schema.org JobPosting from the page's JSON-LD; None on a soft-404 page."""
    for block in _LD.findall(page):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        items = data.get("@graph", data) if isinstance(data, dict) else data
        for item in items if isinstance(items, list) else [items]:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                return item
    return None


def _chunk(literal: str) -> str:
    try:
        value = json.loads(literal)
    except ValueError:
        return ""
    return value if isinstance(value, str) else ""


def jobpost_list(page: str) -> list[dict] | None:
    """JobBKK listing items from the Next.js RSC chunks; None when the page has no list (blocked or markup changed)."""
    text = "".join(_chunk(literal) for literal in _PUSH.findall(page))
    found = _JOBPOST_LIST.search(text)
    if not found:
        return None
    try:
        items, _ = json.JSONDecoder().raw_decode(text, found.end())
    except ValueError:
        return None
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else None
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_crawler.py backend/tests/unit/test_requirements_export.py -q`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/pyproject.toml backend/uv.lock requirements.txt docs/engineering/dependencies.md backend/src/job_search_platform/integrations/crawler.py backend/tests/unit/test_crawler.py
rtk git commit -m "feat(crawl): robots.txt-bound polite client and page parsers (WP5 part 3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Map crawled JSON-LD postings to store rows

**Files:**
- Modify: `backend/src/job_search_platform/services/job_mapping.py`
- Test: `backend/tests/unit/test_job_mapping.py`

**Interfaces:**
- Consumes: the existing `map_posting(source, board, raw)` pipeline.
- Produces:
  - `job_mapping.CRAWLED = {"jobtopgun": "jtg", "jobbkk": "bkk"}`;
  - `map_posting(source, None, {"id": external_id, "url": url, "posting": <JobPosting dict>})` for `source in CRAWLED`. The row gets slug `jtg-<id>` or `bkk-<id>`;
  - when `validThrough` is present, the row carries `valid_through` as an ISO string; a date-only value becomes `"<date>T23:59:59+07:00"`;
  - rows from the other sources are unchanged: no `valid_through` key, so their `content_hash` stays the same.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/unit/test_job_mapping.py`)

```python
def _ld(**extra):
    posting = {"@type": "JobPosting", "title": "Data Engineer", "datePosted": "2026-10-14",
               "hiringOrganization": {"name": "Acme Co., Ltd."},
               "jobLocation": {"address": {"addressLocality": "Pathum Wan", "addressRegion": "Bangkok"}},
               "description": "<p>Build pipelines. Call 080-000-0000</p>", "employmentType": "FULL_TIME"}
    posting.update(extra)
    return posting


def test_jobtopgun_posting_maps_json_ld():
    row = map_posting("jobtopgun", None, {"id": "j12-254", "url": "https://www.jobtopgun.com/th/jobs/j12-254",
                                          "posting": _ld(validThrough="2026-10-22", employmentType="INTERN",
                                                         responsibilities="<li>Write SQL</li>",
                                                         baseSalary={"currency": "THB", "value": {
                                                             "value": "negotiable", "unitText": "MONTH"}})})
    assert row["slug"] == "jtg-j12-254" and row["external_id"] == "j12-254" and row["board"] is None
    assert row["company"] == "Acme Co., Ltd." and row["location"] == "Pathum Wan, Bangkok"
    assert row["cities"] == ["Bangkok"] and row["employment_type"] == "internship"
    assert row["valid_through"] == "2026-10-22T23:59:59+07:00" and row["posted_at"] == "2026-10-14"
    assert row["salary_min"] is None and row["salary_thb_month_min"] is None
    assert "Responsibilities" in row["description_markdown"] and "080-000-0000" in row["description_markdown"]


def test_jobbkk_posting_maps_numeric_salary_and_location_list():
    row = map_posting("jobbkk", None, {"id": "1331612", "url": "https://www.jobbkk.com/jobs/detail/157154/1331612",
                                       "posting": _ld(jobLocation=[{"address": {"addressRegion": "Bangkok"}}],
                                                      validThrough="2027-04-18T00:00:00+07:00",
                                                      employmentType=["CONTRACTOR"],
                                                      baseSalary={"currency": "THB", "value": {
                                                          "minValue": 16000, "maxValue": 17000, "unitText": "MONTH"}})})
    assert row["slug"] == "bkk-1331612" and row["source_url"].endswith("/157154/1331612")
    assert (row["salary_min"], row["salary_max"], row["salary_thb_month_min"]) == (16000, 17000, 16000)
    assert row["employment_type"] == "contract" and row["valid_through"] == "2027-04-18T00:00:00+07:00"


def test_crawled_posting_without_title_is_rejected():
    assert map_posting("jobbkk", None, {"id": "1", "url": "https://www.jobbkk.com/jobs/detail/1/1",
                                        "posting": _ld(title="")}) is None


def test_other_sources_have_no_valid_through_key():
    row = map_posting("greenhouse", "acme", {"id": 1, "title": "Engineer", "absolute_url": "https://g/1",
                                             "location": {"name": "Bangkok"}})
    assert "valid_through" not in row
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_job_mapping.py -q`
Expected: the 3 crawled-source tests FAIL (KeyError or wrong values). `test_other_sources_have_no_valid_through_key` passes already; it guards against hash churn.

- [ ] **Step 3: Implement** in `job_mapping.py`

Add `"contractor": "contract"` to `_EMPLOYMENT`. Add these module constants and helpers after `_PERIOD`:

```python
CRAWLED = {"jobtopgun": "jtg", "jobbkk": "bkk"}  # spec 2026-10-15 (ADR-016): schema.org JobPosting from JSON-LD
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SECTIONS = (("responsibilities", "Responsibilities"), ("qualifications", "Qualifications"), ("jobBenefits", "Benefits"))


def _first(value):
    return value[0] if isinstance(value, list) and value else value


def _until(value):
    """schema.org validThrough; a bare date means the end of that day in Bangkok."""
    if not isinstance(value, str) or not value:
        return None
    return f"{value}T23:59:59+07:00" if _DATE_ONLY.match(value) else value
```

In `_fields`, add this branch before the SmartRecruiters fallback (the `detail = _dict(raw.get("detail"))` line):

```python
    if source in CRAWLED:
        ld = _dict(raw.get("posting"))
        ext = _text(raw.get("id"), 200)
        address = _dict(_dict(_first(ld.get("jobLocation"))).get("address"))
        pay = _dict(ld.get("baseSalary"))
        amount = _dict(pay.get("value"))
        body = (ld["description"] if isinstance(ld.get("description"), str) else "") + "".join(
            f"<h3>{label}</h3>{ld[key]}" for key, label in _SECTIONS if isinstance(ld.get(key), str) and ld[key])
        return dict(external_id=ext, slug=f"{CRAWLED[source]}-{ext}"[:SLUG_MAX], title=ld.get("title"),
                    company=_dict(ld.get("hiringOrganization")).get("name"),
                    location=", ".join(v for v in (address.get("addressLocality"), address.get("addressRegion"))
                                       if isinstance(v, str) and v),
                    url=raw.get("url"), description=body, html=True, posted_at=ld.get("datePosted"),
                    employment_type=_first(ld.get("employmentType")),
                    salary=(amount.get("minValue", amount.get("value")), amount.get("maxValue", amount.get("value")),
                            pay.get("currency"), amount.get("unitText")),
                    valid_through=_until(ld.get("validThrough")))
```

In `map_posting`, just before the `row["content_hash"] = ...` line:

```python
    if f.get("valid_through"):  # only crawled sources carry it; other rows keep their content_hash
        row["valid_through"] = f["valid_through"]
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_job_mapping.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_mapping.py backend/tests/unit/test_job_mapping.py
rtk git commit -m "feat(crawl): map JobTopGun and JobBKK JSON-LD postings to store rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store support — migration 0029, shared upsert, seen/miss/tombstone helpers, `validThrough` retirement

**Files:**
- Create: `backend/migrations/versions/0029_job_crawl.py`
- Modify: `backend/src/job_search_platform/db/models.py`, `backend/src/job_search_platform/services/job_store.py`
- Test (new): `backend/tests/integration/test_job_crawl_store.py`
- Test (existing, must stay green): `test_job_store.py`, `test_job_dedup.py`, `test_job_retention.py`, `test_ingest_run.py`, `test_job_store_schema.py`

**Interfaces:**
- Consumes: Task 2 rows (an optional `valid_through` ISO string).
- Produces, in `db/models.py`:
  - `JOB_POSTING_SOURCES` gains `"jobtopgun"` and `"jobbkk"`;
  - `JobPosting.valid_through: datetime | None`;
  - `CrawlState(source: str PK, state: dict, updated_at: datetime)`.
- Produces, in `services/job_store.py`:
  - `parse_ts(value) -> datetime | None`, renamed from `_parse_ts`;
  - `upsert_postings(db, source, board, rows, now, existing=None) -> tuple[dict, set[str], list[uuid.UUID]]`. It returns `(counts{created, updated, skipped_old, skipped_dup}, seen external_ids, ids of stored rows now too old)`. When `existing` is None, it loads the stored rows of `source` that match the incoming ids;
  - `touch_seen(db, source, external_ids: set[str], now) -> tuple[set[str], set[str]]` returns `(stored ids, tombstoned ids)` among the given ids. Stored ones get `last_seen_at=now, missed_runs=0`; tombstones get `last_seen_at=now`;
  - `miss_unseen(db, source, since, now) -> int`: postings of `source` with `last_seen_at < since` get `missed_runs += 1`, and those at `DELETE_AFTER_MISSES` are deleted without a tombstone. It returns the number deleted. Before changing anything, it raises `job_boards.BoardError("suspicious_shrink")` under the part-1 guard;
  - `tombstone_ids(db, source, external_ids, now) -> None` upserts tombstones and refreshes `last_seen_at` on conflict;
  - `retire` also deletes postings whose `valid_through < now`, with a tombstone.

- [ ] **Step 1: Migration** `backend/migrations/versions/0029_job_crawl.py`

```python
"""WP5 part 3 crawler (spec 2026-10-15, ADR-016): JobTopGun and JobBKK sources, validThrough, crawl progress."""

from alembic import op

revision = "0029_job_crawl"
down_revision = "0028_job_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE job_postings DROP CONSTRAINT ck_job_postings_source")
    op.execute("ALTER TABLE job_postings ADD CONSTRAINT ck_job_postings_source CHECK (source IN "
               "('freehire','greenhouse','lever','smartrecruiters','jobtopgun','jobbkk'))")
    op.execute("ALTER TABLE job_postings ADD COLUMN valid_through timestamptz")
    op.execute("""CREATE TABLE crawl_state (
        source varchar(20) PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL)""")


def downgrade() -> None:
    op.execute("DROP TABLE crawl_state")
    op.execute("DELETE FROM job_postings WHERE source IN ('jobtopgun','jobbkk')")  # run `reindex` after a downgrade
    op.execute("DELETE FROM job_posting_tombstones WHERE source IN ('jobtopgun','jobbkk')")
    op.execute("ALTER TABLE job_postings DROP COLUMN valid_through")
    op.execute("ALTER TABLE job_postings DROP CONSTRAINT ck_job_postings_source")
    op.execute("ALTER TABLE job_postings ADD CONSTRAINT ck_job_postings_source CHECK (source IN "
               "('freehire','greenhouse','lever','smartrecruiters'))")
```

In `db/models.py`:
- set `JOB_POSTING_SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters", "jobtopgun", "jobbkk")`;
- add `valid_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))` after `posted_at` in `JobPosting`;
- add this class after `JobIndexDelete`, with `from sqlalchemy.dialects.postgresql import JSONB` among the imports:

```python
class CrawlState(Base):
    """Per-site crawler progress: JobTopGun company floors, JobBKK sweep cursor (spec 2026-10-15)."""
    __tablename__ = "crawl_state"
    source: Mapped[str] = mapped_column(String(20), primary_key=True)
    state: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

- [ ] **Step 2: Write the failing tests** `backend/tests/integration/test_job_crawl_store.py`

```python
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
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl_store.py -q`
Expected: FAIL. `upsert_postings`, `touch_seen`, `tombstone_ids` and `miss_unseen` do not exist yet; Step 1 already added `CrawlState`.

- [ ] **Step 4: Implement** in `services/job_store.py`

1. Rename `_parse_ts` to `parse_ts` and update its one call site.
2. Add these after `SHRINK_RATIO`:

```python
CHUNK = 5000  # ids per IN (...) query; psycopg caps a statement at 65,535 parameters


def _chunks(values) -> list[list]:
    values = list(values)
    return [values[i:i + CHUNK] for i in range(0, len(values), CHUNK)]
```

3. Replace `apply_board` with the two functions below. The loop body moves unchanged into `upsert_postings`. The only change is that `other_board` and `tombstoned` are now limited to the incoming ids.

```python
def upsert_postings(db: Session, source: str, board: str | None, rows: list[dict], now: datetime,
                    existing: dict[str, JobPosting] | None = None) -> tuple[dict, set[str], list[uuid.UUID]]:
    """Upsert half of apply_board, shared with the crawler: (counts, external_ids seen, stored rows now too old).
    `existing` defaults to this source's stored rows with the incoming ids."""
    rows = list({r["external_id"]: r for r in rows}.values())  # last duplicate wins
    ids = [r["external_id"] for r in rows]
    if existing is None:
        existing = {p.external_id: p for chunk in _chunks(ids) for p in db.scalars(select(JobPosting).where(
            JobPosting.source == source, JobPosting.external_id.in_(chunk)))}
    other_board, tombstoned = set(), set()
    for chunk in _chunks(ids):
        other_board |= set(db.scalars(select(JobPosting.external_id).where(
            JobPosting.source == source, JobPosting.board.is_distinct_from(board), JobPosting.external_id.in_(chunk))))
        tombstoned |= set(db.scalars(select(JobPostingTombstone.external_id).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk))))
    counts = {"created": 0, "updated": 0, "skipped_old": 0, "skipped_dup": 0}
    seen, too_old = set(), []
    for values in rows:
        values = dict(values, posted_at=parse_ts(values.get("posted_at")))
        if "valid_through" in values:
            values["valid_through"] = parse_ts(values["valid_through"])
        external_id = values["external_id"]
        seen.add(external_id)
        row = existing.get(external_id)
        if values["posted_at"] is not None and values["posted_at"] < now - MAX_AGE:
            counts["skipped_old"] += 1
            if row is not None:
                too_old.append(row.id)
            continue
        if external_id in tombstoned:
            db.execute(update(JobPostingTombstone).where(
                JobPostingTombstone.source == source, JobPostingTombstone.external_id == external_id)
                .values(last_seen_at=now))
            continue
        if row is None and external_id in other_board:  # same source id already stored under another board
            counts["skipped_dup"] += 1
            continue
        if row is None:
            db.add(JobPosting(id=uuid.uuid4(), first_seen_at=now, last_seen_at=now, updated_at=now,
                              index_dirty=True, **values))
            counts["created"] += 1
            continue
        row.last_seen_at, row.missed_runs = now, 0
        if row.content_hash != values["content_hash"]:
            for key, value in values.items():
                setattr(row, key, value)
            row.index_dirty, row.updated_at = True, now
            counts["updated"] += 1
    db.flush()
    return counts, seen, too_old


def apply_board(db: Session, source: str, board: str | None, rows: list[dict], now: datetime) -> dict:
    """One successfully fetched board: upsert what was seen, count a miss for what was not, delete after two."""
    rows = list({r["external_id"]: r for r in rows}.values())  # last duplicate wins
    existing = {p.external_id: p for p in db.scalars(select(JobPosting).where(
        JobPosting.source == source, JobPosting.board.is_(None) if board is None else JobPosting.board == board))}
    if existing and (not rows or (len(existing) >= SHRINK_MIN_STORED and len(rows) < len(existing) * SHRINK_RATIO)):
        raise job_boards.BoardError("suspicious_shrink")  # likely a truncated fetch: keep rows, count no misses
    upserted, seen, too_old = upsert_postings(db, source, board, rows, now, existing)
    counts = {"fetched": len(rows), **upserted, "deleted": 0}
    missing = []
    for external_id, row in existing.items():
        if external_id in seen:
            continue
        row.missed_runs += 1
        if row.missed_runs >= DELETE_AFTER_MISSES:
            missing.append(row.id)
    db.flush()
    counts["deleted"] = (delete_postings(db, too_old, now, tombstone=True)  # tombstoned so the source copy stays out
                         + delete_postings(db, missing, now, tombstone=False))
    db.flush()
    return counts
```

4. Add the crawler helpers after `apply_board`:

```python
def touch_seen(db: Session, source: str, external_ids: set[str], now: datetime) -> tuple[set[str], set[str]]:
    """Crawler discovery: mark listed postings and tombstones seen; returns (stored ids, tombstoned ids) among them."""
    stored, tombstoned = set(), set()
    for chunk in _chunks(sorted(external_ids)):
        stored |= set(db.scalars(select(JobPosting.external_id).where(
            JobPosting.source == source, JobPosting.external_id.in_(chunk))))
        tombstoned |= set(db.scalars(select(JobPostingTombstone.external_id).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk))))
    for chunk in _chunks(sorted(stored)):
        db.execute(update(JobPosting).where(JobPosting.source == source, JobPosting.external_id.in_(chunk))
                   .values(last_seen_at=now, missed_runs=0))
    for chunk in _chunks(sorted(tombstoned)):
        db.execute(update(JobPostingTombstone).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk)).values(last_seen_at=now))
    return stored, tombstoned


def miss_unseen(db: Session, source: str, since: datetime, now: datetime) -> int:
    """A complete crawler discovery pass: a miss for postings not seen since `since`, delete at two (spec C7)."""
    of_source = JobPosting.source == source
    stored = db.scalar(select(func.count()).select_from(JobPosting).where(of_source))
    seen = db.scalar(select(func.count()).select_from(JobPosting).where(of_source, JobPosting.last_seen_at >= since))
    if stored and (not seen or (stored >= SHRINK_MIN_STORED and seen < stored * SHRINK_RATIO)):
        raise job_boards.BoardError("suspicious_shrink")  # likely a broken listing: count no misses
    db.execute(update(JobPosting).where(of_source, JobPosting.last_seen_at < since)
               .values(missed_runs=JobPosting.missed_runs + 1))
    ids = list(db.scalars(select(JobPosting.id).where(of_source, JobPosting.missed_runs >= DELETE_AFTER_MISSES)))
    return delete_postings(db, ids, now, tombstone=False)


def tombstone_ids(db: Session, source: str, external_ids: list[str], now: datetime) -> None:
    """Crawler: a detail page with no live posting (removed, expired, older than 90 days) is not fetched again."""
    ids = sorted(set(external_ids))  # one row per key: ON CONFLICT DO UPDATE cannot touch a row twice
    if ids:
        db.execute(pg_insert(JobPostingTombstone).values(
            [{"source": source, "external_id": e, "deleted_at": now, "last_seen_at": now} for e in ids])
            .on_conflict_do_update(index_elements=["source", "external_id"], set_={"last_seen_at": now}))
```

5. Change `retire` and its docstring:

```python
def retire(db: Session, now: datetime) -> int:
    """Delete postings older than MAX_AGE (posted_at, else first_seen_at) or past validThrough; tombstone them."""
    ids = list(db.scalars(select(JobPosting.id).where(or_(
        func.coalesce(JobPosting.posted_at, JobPosting.first_seen_at) < now - MAX_AGE,
        JobPosting.valid_through < now))))
    return delete_postings(db, ids, now, tombstone=True)
```

Set the module docstring to: `"""WP5 job store: upsert per board, delete rule, retention, dedup clusters, crawler passes (spec D6, D8, D9; part 3)."""`

- [ ] **Step 5: Run the new and existing store tests**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl_store.py backend/tests/integration/test_job_store.py backend/tests/integration/test_job_dedup.py backend/tests/integration/test_job_retention.py backend/tests/integration/test_ingest_run.py backend/tests/integration/test_job_store_schema.py backend/tests/integration/test_job_index.py backend/tests/unit -q`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/migrations/versions/0029_job_crawl.py backend/src/job_search_platform/db/models.py backend/src/job_search_platform/services/job_store.py backend/tests/integration/test_job_crawl_store.py
rtk git commit -m "feat(crawl): store support for crawled sources, discovery passes, validThrough retirement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `job_crawl.crawl_site` and the JobTopGun routine

**Files:**
- Create: `backend/src/job_search_platform/services/job_crawl.py`
- Test (new): `backend/tests/integration/test_job_crawl.py`

**Interfaces:**
- Consumes:
  - Task 1: `crawler.PoliteClient`, `CrawlStop`, `HOSTS`, `http_transport`, `SITE_BUDGET_SECONDS`, `MAX_REQUESTS`, `sitemap_locs`, `job_sitemaps`, `jobtopgun_ids`, `job_posting`;
  - Task 2: `map_posting` for the crawled sources;
  - Task 3: `job_store.parse_ts`, `MAX_AGE`, `upsert_postings`, `touch_seen`, `miss_unseen`, `tombstone_ids`, and `CrawlState`.
- Produces:
  - `job_crawl.crawl_site(sessions, site, *, clock, sleep=time.sleep, monotonic=time.monotonic, transport=crawler.http_transport, budget_seconds=crawler.SITE_BUDGET_SECONDS, max_requests=crawler.MAX_REQUESTS) -> dict`. It returns `{"state": "ok"|"failed", ["error": str], "requests", "blocked", "fetched", "created", "deleted"}`;
  - `MAX_DETAILS = 130` and `COMMIT_EVERY = 10`;
  - the JobBKK hook `_jobbkk`, defined in Task 5. In this task, `crawl_site` dispatches `"jobbkk"` to `_jobbkk`, which raises `NotImplementedError`; Task 5 replaces it.

- [ ] **Step 1: Write the failing tests** `backend/tests/integration/test_job_crawl.py`

```python
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl.py -q`
Expected: collection error, `No module named 'job_search_platform.services.job_crawl'`.

- [ ] **Step 3: Implement** `backend/src/job_search_platform/services/job_crawl.py`

```python
"""WP5 part 3: hourly crawl of JobTopGun and JobBKK into the job store (spec 2026-10-15-thai-board-crawler, ADR-016).

Work is committed as it goes, so a stop (cap, 429, crash) keeps what was fetched. Stored postings are never re-fetched.
"""
from __future__ import annotations

import re
import time
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from job_search_platform.db.models import CrawlState
from job_search_platform.integrations import crawler, job_boards
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

MAX_DETAILS = 130  # JobTopGun detail pages per run
COMMIT_EVERY = 10
JTG = "https://www.jobtopgun.com"
_JTG_ID = re.compile(r"^j(\d+)-(\d+)$")


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


def _jobbkk(sessions, client, clock, counts) -> None:
    raise NotImplementedError("Task 5")
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_crawl.py backend/tests/integration/test_job_crawl.py
rtk git commit -m "feat(crawl): JobTopGun sitemap crawl with company floors and detail cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The JobBKK routine (head pages, resumable sweep, per-sweep misses)

**Files:**
- Modify: `backend/src/job_search_platform/services/job_crawl.py` (replaces the `_jobbkk` placeholder)
- Test: `backend/tests/integration/test_job_crawl.py` (append)

**Interfaces:**
- Consumes: everything from Task 4, plus `crawler.jobpost_list`.
- Produces:
  - `HEAD_PAGES = 3`, `AGE_MARGIN = timedelta(days=1)`, `BANGKOK = timezone(timedelta(hours=7))`;
  - the `crawl_state` row for `"jobbkk"`: `{"cursor": int, "sweep_started_at": iso str}`.

- [ ] **Step 1: Write the failing tests** (append to `test_job_crawl.py`)

```python
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
def test_jobbkk_unreadable_listing_fails_and_deletes_nothing(sessions):
    crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 4: OLD_PAGE}))
    broken = bkk_site({1: [item(1)]})
    broken.pages[bkk_list_url(2)] = "<html>redesigned</html>"
    for h in (1, 2, 3):
        result = crawl(sessions, "jobbkk", broken, at=T0 + timedelta(hours=h))
    assert result["state"] == "failed" and result["error"] == "listing_unreadable"
    assert set(stored(sessions, "jobbkk")) == {"1", "2", "3"}


@pytest.mark.integration
def test_jobbkk_missing_from_two_finished_sweeps_is_deleted(sessions):
    crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [item(2)], 3: [item(3)], 4: OLD_PAGE}), clock=ticking())
    for h in (1, 2):
        crawl(sessions, "jobbkk", bkk_site({1: [item(1)], 2: [item(2)], 3: [], 4: OLD_PAGE}),
              at=T0 + timedelta(hours=h))
    assert set(stored(sessions, "jobbkk")) == {"1", "2"} and tombstones(sessions, "jobbkk") == set()


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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl.py -q -k jobbkk`
Expected: FAIL with `AttributeError: ... has no attribute '_BKK_LIST'` (or `BANGKOK`).

- [ ] **Step 3: Implement.** In `job_crawl.py`, add `import itertools`, `from datetime import datetime, timedelta, timezone` and `from urllib.parse import quote`. Add these constants after `_JTG_ID`:

```python
HEAD_PAGES = 3  # JobBKK pages read every run, so new postings appear within the hour
AGE_MARGIN = timedelta(days=1)  # JobBKK listing timestamps are skewed by hours
BANGKOK = timezone(timedelta(hours=7))
BKK = "https://www.jobbkk.com"
_BKK_LIST = BKK + "/jobs/lists/{}/" + quote("หางาน,ทั้งหมด,ทุกจังหวัด,ทั้งหมด.html", safe=",.")
_DIGITS = re.compile(r"^\d{1,12}$")
```

Replace the `_jobbkk` placeholder with:

```python
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
```

The same id can appear on two pages in one run. That works because each page's `_flush` commits before the next page's `touch_seen`, so the id is already stored.

- [ ] **Step 4: Run the whole crawl test file and confirm it passes**

Run: `rtk uv run --locked --project backend pytest backend/tests/integration/test_job_crawl.py -q`
Expected: all PASS, including the JobTopGun tests from Task 4.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_crawl.py backend/tests/integration/test_job_crawl.py
rtk git commit -m "feat(crawl): JobBKK listing sweep with head pages, resumable cursor and per-sweep misses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Run wiring, kill switch and CLI

**Files:**
- Modify: `backend/src/job_search_platform/services/job_store.py` (`run_ingest`, plus the new `load_crawl_sites` and `write_boards`)
- Modify: `scripts/ingest_jobs.py`
- Modify: `backend/src/job_search_platform/data/job_boards.json` (add `"crawl"`)
- Test (new): `backend/tests/unit/test_crawl_switch.py`
- Test: `backend/tests/integration/test_ingest_run.py` (append)

**Interfaces:**
- Consumes: Task 1 `crawler.SITES` and `SITE_BUDGET_SECONDS`; Task 4/5 `job_crawl.crawl_site`.
- Produces:
  - `job_store.RUN_TOTAL = timedelta(minutes=50)`;
  - `run_ingest(..., crawl_sites=(), crawl=None)`. For each site it calls `crawl(sessions, site, clock=clock, sleep=sleep, budget_seconds=...)` and records `per_board["crawl:<site>"]`;
  - `job_store.load_crawl_sites(path=None) -> list[str]`;
  - `job_store.write_boards(boards, path=None) -> None`;
  - CLI: `ingest_jobs.py run --source` accepts `jobtopgun` and `jobbkk`.

- [ ] **Step 1: Write the failing unit tests** `backend/tests/unit/test_crawl_switch.py`

```python
"""ADR-016 kill switch: the "crawl" list in job_boards.json."""
from __future__ import annotations

import json

from job_search_platform.services import job_store


def _file(tmp_path, data):
    path = tmp_path / "job_boards.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_missing_or_bad_crawl_key_means_no_crawling(tmp_path):
    assert job_store.load_crawl_sites(_file(tmp_path, {"greenhouse": []})) == []
    assert job_store.load_crawl_sites(_file(tmp_path, {"crawl": "jobbkk"})) == []


def test_only_known_sites_in_fixed_order(tmp_path):
    path = _file(tmp_path, {"crawl": ["jobbkk", "jobsdb", "jobtopgun"]})
    assert job_store.load_crawl_sites(path) == ["jobtopgun", "jobbkk"]


def test_write_boards_keeps_the_crawl_key(tmp_path):
    path = _file(tmp_path, {"crawl": ["jobbkk"], "greenhouse": ["old"], "lever": [], "smartrecruiters": []})
    job_store.write_boards({"greenhouse": ["new"], "lever": ["x"], "smartrecruiters": []}, path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["crawl"] == ["jobbkk"] and data["greenhouse"] == ["new"] and data["lever"] == ["x"]


def test_committed_file_enables_both_sites():
    assert job_store.load_crawl_sites() == ["jobtopgun", "jobbkk"]
```

- [ ] **Step 2: Write the failing integration tests** (append to `backend/tests/integration/test_ingest_run.py`)

```python
import functools
import json as _json

from job_search_platform.services import job_crawl


def _crawl_result(**counts):
    return {"state": "ok", "requests": 1, "blocked": 0, "fetched": 0, "created": 0, "deleted": 0, **counts}


@pytest.mark.integration
def test_crawl_phase_failure_isolated_and_counted(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    calls = []

    def crawl(sessions_, site, **kw):
        calls.append((site, kw["budget_seconds"]))
        if site == "jobtopgun":
            return {**_crawl_result(), "state": "failed", "error": "http_503"}
        return _crawl_result(fetched=4, created=3)

    run = job_store.run_ingest(sessions, boards={"greenhouse": ["a"]}, sources=("greenhouse",),
                               fetch=Fetch({("greenhouse", "a"): [_raw(1)]}), clock=lambda: T0,
                               sleep=lambda s: None, crawl_sites=["jobtopgun", "jobbkk"], crawl=crawl)
    assert run.status == "partial" and run.created == 1 + 3
    assert run.per_board["crawl:jobtopgun"]["error"] == "http_503"
    assert run.per_board["crawl:jobbkk"]["state"] == "ok"
    assert calls == [("jobtopgun", 900), ("jobbkk", 900)]


@pytest.mark.integration
def test_crawl_exception_does_not_abort_run(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)

    def crawl(sessions_, site, **kw):
        raise RuntimeError("bug")

    run = job_store.run_ingest(sessions, boards={}, sources=(), clock=lambda: T0, sleep=lambda s: None,
                               crawl_sites=["jobbkk"], crawl=crawl)
    assert run.status == "failed" and run.per_board["crawl:jobbkk"] == {"state": "failed", "error": "RuntimeError"}


@pytest.mark.integration
def test_crawl_site_skipped_past_run_total(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    times = iter([T0] + [T0 + timedelta(minutes=51)] * 10)
    run = job_store.run_ingest(sessions, boards={}, sources=(), clock=lambda: next(times), sleep=lambda s: None,
                               crawl_sites=["jobbkk"], crawl=lambda *a, **k: pytest.fail("must not crawl"))
    assert run.per_board["crawl:jobbkk"] == {"state": "skipped"}


@pytest.mark.integration
def test_same_job_on_both_boards_collapses_to_one_canonical(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    posting = {"@context": "https://schema.org", "@type": "JobPosting", "title": "Data Engineer",
               "datePosted": (T0 - timedelta(days=1)).date().isoformat(),
               "hiringOrganization": {"name": "Acme Co., Ltd."},
               "jobLocation": {"address": {"addressRegion": "Bangkok"}}, "description": "<p>Synthetic</p>"}
    detail = f'<script type="application/ld+json">{_json.dumps(posting)}</script>'
    stamp = (T0 - timedelta(days=1)).astimezone(job_crawl.BANGKOK).strftime("%Y-%m-%d %H:%M:%S")
    old = (T0 - timedelta(days=200)).astimezone(job_crawl.BANGKOK).strftime("%Y-%m-%d %H:%M:%S")

    def rsc(items):
        return ("<script>self.__next_f.push([1,"
                + _json.dumps("5:" + _json.dumps({"jobpost_list": items}, separators=(",", ":"))) + "])</script>")

    jtg, bkk = "https://www.jobtopgun.com", "https://www.jobbkk.com"
    pages = {
        f"{jtg}/robots.txt": "User-agent: *\n", f"{bkk}/robots.txt": "User-agent: *\n",
        f"{jtg}/sitemap.xml": f"<sitemapindex><sitemap><loc>{jtg}/sitemaps/jobs-snapshot/sitemap/0.xml</loc></sitemap></sitemapindex>",
        f"{jtg}/sitemaps/jobs-snapshot/sitemap/0.xml": f"<urlset><url><loc>{jtg}/th/jobs/j1-1</loc></url></urlset>",
        f"{jtg}/th/jobs/j1-1": detail, f"{bkk}/jobs/detail/7/11": detail,
        job_crawl._BKK_LIST.format(1): rsc([{"jobpost_id": 11, "company_id": 7, "created_at": stamp, "updated_at": stamp}]),
        job_crawl._BKK_LIST.format(2): rsc([]), job_crawl._BKK_LIST.format(3): rsc([]),
        job_crawl._BKK_LIST.format(4): rsc([{"jobpost_id": 1, "company_id": 7, "created_at": old, "updated_at": old}]),
    }

    def transport(url):
        return (200, {}, pages[url].encode()) if url in pages else (404, {}, b"")

    crawl = functools.partial(job_crawl.crawl_site, transport=transport, monotonic=lambda: 0.0)
    run = job_store.run_ingest(sessions, boards={}, sources=(), clock=lambda: T0, sleep=lambda s: None,
                               crawl_sites=["jobtopgun", "jobbkk"], crawl=crawl)
    assert run.status == "ok" and run.created == 2 and run.merged == 1
    with sessions() as db:
        canonical = db.scalars(select(JobPosting).where(JobPosting.canonical_id.is_(None))).all()
    assert len(canonical) == 1
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_crawl_switch.py backend/tests/integration/test_ingest_run.py -q`
Expected: FAIL. `load_crawl_sites` and `write_boards` are missing, and `run_ingest` does not accept `crawl_sites` or `crawl`.

- [ ] **Step 4: Implement**

In `job_store.py`, add `import os` and `from job_search_platform.integrations import crawler`. After `RUN_DEADLINE`, add:

```python
RUN_TOTAL = timedelta(minutes=50)  # ATS boards (RUN_DEADLINE) plus the crawl phase (spec C4)


def load_crawl_sites(path: Path | None = None) -> list[str]:
    """Kill switch (ADR-016): only sites named in the "crawl" list are contacted; a missing key means none."""
    names = json.loads((path or BOARDS_FILE).read_text(encoding="utf-8")).get("crawl")
    return [site for site in crawler.SITES if isinstance(names, list) and site in names]


def write_boards(boards: dict[str, list[str]], path: Path | None = None) -> None:
    """Replace the ATS lists atomically; every other key (the "crawl" kill switch) stays as the operator wrote it."""
    path = path or BOARDS_FILE
    data = {**json.loads(path.read_text(encoding="utf-8")), **boards}
    tmp = path.with_suffix(".json.tmp")  # same directory: os.replace is atomic
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)
```

Change the `run_ingest` signature to:

```python
def run_ingest(sessions, *, boards, sources=job_boards.SOURCES, fetch=job_boards.fetch_board,
               clock=lambda: datetime.now(timezone.utc), sleep=time.sleep, index=None,
               crawl_sites=(), crawl=None) -> IngestRun:
```

Insert the crawl phase right after the ATS `for source, board in targets:` loop and before `now = clock()`:

```python
            for site in crawl_sites if crawl else ():  # spec C4: sites one after another, after the ATS boards
                key = f"crawl:{site}"
                remaining = (started + RUN_TOTAL - clock()).total_seconds()
                if remaining <= 0:
                    per_board[key] = {"state": "skipped"}
                    continue
                try:
                    per_board[key] = crawl(sessions, site, clock=clock, sleep=sleep,
                                           budget_seconds=min(crawler.SITE_BUDGET_SECONDS, remaining))
                except Exception as exc:  # a crawler bug must not abort the run
                    per_board[key] = {"state": "failed", "error": type(exc).__name__}
                    _log.exception("ingest_crawl_failed", extra={"route": key})
                    continue
                for name in ("fetched", "created", "deleted"):
                    totals[name] += per_board[key].get(name, 0)
```

In `scripts/ingest_jobs.py`:
- change the integrations import to `from job_search_platform.integrations import crawler, job_boards, meili  # noqa: E402`;
- change the services import to `from job_search_platform.services import job_crawl, job_index, job_store  # noqa: E402`;
- in `run`:

```python
def run(args) -> int:
    sources = tuple(s for s in job_boards.SOURCES if not args.source or s == args.source)
    sites = [s for s in job_store.load_crawl_sites() if not args.source or s == args.source]
    try:
        index = (meili.client(), config.meili_index())
    except RuntimeError:
        logging.getLogger(__name__).warning("index_unconfigured")
        index = None
    result = job_store.run_ingest(_sessions(), boards=job_store.load_boards(), sources=sources, index=index,
                                  crawl_sites=sites, crawl=job_crawl.crawl_site)
```

  The rest of `run` (the `print` and the return) stays unchanged;
- in `discover`, replace the three `tmp`/`os.replace` lines with `job_store.write_boards(merged)`. Drop `import os` if nothing else uses it;
- in `main`, use `one.add_argument("--source", choices=job_boards.SOURCES + crawler.SITES)`.

In `job_boards.json`, add the top-level key `"crawl": ["jobbkk", "jobtopgun"]`. Keep the file sorted with indent 1: the new key goes first, before `"greenhouse"`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit backend/tests/integration/test_ingest_run.py backend/tests/integration/test_job_crawl.py -q && rtk uv run --locked --project backend python scripts/ingest_jobs.py run --help`
Expected: all PASS. The help text lists `jobtopgun` and `jobbkk` among the `--source` choices.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_store.py scripts/ingest_jobs.py backend/src/job_search_platform/data/job_boards.json backend/tests/unit/test_crawl_switch.py backend/tests/integration/test_ingest_run.py
rtk git commit -m "feat(crawl): crawl phase in ingest run, kill switch, CLI sources (WP5 part 3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/engineering/local-operation.md`, `backend/AGENTS.md`, `docs/superpowers/specs/2026-10-14-thai-job-sources-design.md`, `docs/demo/tor-roadmap.md`

- [ ] **Step 1: Write the docs**

1. `docs/engineering/local-operation.md`: in the "Hourly job ingest" section, add a subsection `### Crawled boards (JobTopGun, JobBKK)` covering:
   - the crawl runs after the ATS boards in the same `ingest run`, under ADR-016;
   - each site gets up to 15 minutes and 300 requests, and the whole run gets up to 50 minutes;
   - robots.txt is re-read every run;
   - the kill switch: remove a site from the `"crawl"` list in `backend/src/job_search_platform/data/job_boards.json`, and it gets no requests from the next run;
   - `run --source jobtopgun` or `run --source jobbkk` crawls one site only;
   - `per_board` keys are `crawl:jobtopgun` and `crawl:jobbkk`, with `state`, `error`, `requests`, `blocked`, `fetched`, `created` and `deleted`;
   - the first fill takes days. JobTopGun fetches about 80–130 new detail pages an hour. JobBKK's first sweep takes several days, after which later sweeps take a few runs;
   - progress lives in the table `crawl_state`; deleting a site's row restarts it from scratch.
2. `backend/AGENTS.md`:
   - in the `services/` bullet, add `job_crawl.py` (JobTopGun sitemap crawl, JobBKK listing sweep, `crawl_state` progress);
   - in the `integrations/` bullet, add `crawler.py` (`PoliteClient`: Protego robots.txt, ≥3 s delay, 300 requests/15 min caps; JSON-LD, sitemap and RSC parsers);
   - change the latest migration to `0029_job_crawl.py`;
   - in the Job ingest command line, mention `--source jobtopgun|jobbkk` and the `"crawl"` kill switch.
3. `docs/superpowers/specs/2026-10-14-thai-job-sources-design.md`, row D1: append ` Amended 2026-10-15: JobTopGun and JobBKK are crawled under ADR-016 (client accepts the ToS risk); see 2026-10-15-thai-board-crawler-design.md.`
4. `docs/demo/tor-roadmap.md`: replace the line near line 58 about ATS boards counting as "Thai job sources" with Thai text saying:
   - since 2026-10-15 the system also pulls jobs from JobTopGun and JobBKK every hour, because the client accepts the ToS risk (ADR-016);
   - it follows robots.txt strictly and keeps only postings from the last 90 days;
   - JobsDB is deferred, and JobThai waits for written permission.
   
   Keep the surrounding format.

- [ ] **Step 2: Check**

Run: `rtk grep -n "0029_job_crawl\|job_crawl.py\|crawler.py" backend/AGENTS.md && rtk grep -n "ADR-016" docs/engineering/local-operation.md docs/superpowers/specs/2026-10-14-thai-job-sources-design.md docs/demo/tor-roadmap.md`
Expected: matches in every file.

- [ ] **Step 3: Commit**

```bash
rtk git add docs/engineering/local-operation.md backend/AGENTS.md docs/superpowers/specs/2026-10-14-thai-job-sources-design.md docs/demo/tor-roadmap.md
rtk git commit -m "docs(crawl): crawl operation, kill switch, AGENTS.md, roadmap (WP5 part 3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 (controller only, after the final review): full suite and live smoke

These steps are not dispatched to an implementer.

- [ ] **Step 1: Full suite.** Run `rtk uv run --locked --project backend pytest backend/tests -q` with `CORE02_PRIVATE_DIR` set. Expected: all PASS except the 2 known baseline failures (`test_application_startup` built-frontend restore, and the `test_storage_infrastructure` restart proof).
- [ ] **Step 2: Live smoke on throwaway storage.**
  - Create a throwaway database `jsp_smoke_<hex>` and migrate it to head.
  - From a scratchpad script, call `job_crawl.crawl_site(sessions, site, clock=..., max_requests=20)` once for each site. Never use `jobsearch_platform_core02` or the live index `jobs`.
  - Check the robots result first: the script's first action prints `client.robots.can_fetch(...)` for the sitemap, listing and detail URL shapes, and must stop if any is False.
  - Record requests, blocked, fetched and created, plus a sample row's title, company and province.
  - Drop the database afterwards.
- [ ] **Step 3: Record the results** in the Hub `WORKING_LOG.md` and the SDD ledger.
