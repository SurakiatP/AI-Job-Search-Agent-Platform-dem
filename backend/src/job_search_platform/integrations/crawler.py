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
