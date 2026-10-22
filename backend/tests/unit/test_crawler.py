"""WP5 part 3 crawler transport and parsers (ADR-016). Synthetic pages only, no network."""
from __future__ import annotations

import json
import time

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


@pytest.mark.parametrize("kind", [["JobPosting"], "schema:JobPosting", ["Thing", "https://schema.org/JobPosting"]])
def test_job_posting_accepts_list_and_prefixed_type(kind):
    assert crawler.job_posting(_ld({"@type": kind, "title": "Synthetic Role"}))["title"] == "Synthetic Role"
    assert crawler.job_posting(_ld({"@type": ["Organization"]})) is None


def test_parsers_are_linear_on_unterminated_markup():
    for page in ("<script " * 50000, "<script type='application/ld+json'>" * 20000,
                 'self.__next_f.push([1,"' * 20000, "<loc>" * 50000):
        start = time.perf_counter()
        assert crawler.job_posting(page) is None
        assert crawler.jobpost_list(page) is None
        crawler.sitemap_locs(page)
        assert time.perf_counter() - start < 1


def test_over_nested_json_is_an_unparseable_block():
    deep = "[" * 100000
    page = f'<script type="application/ld+json">{deep}</script>' + _ld({"@type": "JobPosting", "title": "Synthetic Role"})
    assert crawler.job_posting(page)["title"] == "Synthetic Role"
    assert crawler.job_posting(f'<script type="application/ld+json">{deep}</script>') is None
    assert crawler.jobpost_list(_rsc('5:{"jobpost_list":' + deep)) is None
