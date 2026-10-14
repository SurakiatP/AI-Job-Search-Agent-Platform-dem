"""Source fetchers with an injected get(); no network. Synthetic payloads."""
from __future__ import annotations

import pytest

from job_search_platform.integrations import job_boards as jb


class Fake:
    def __init__(self, pages):
        self.pages, self.urls = pages, []

    def __call__(self, url, max_bytes):
        self.urls.append((url, max_bytes))
        return self.pages.pop(0)


def test_rejects_bad_board_token_before_any_request():
    fake = Fake([])
    with pytest.raises(jb.BoardError):
        jb.fetch_board("greenhouse", "../admin", get=fake, sleep=lambda s: None)
    assert fake.urls == []


@pytest.mark.parametrize("token", [".", ".."])
def test_rejects_dot_tokens(token):
    fake = Fake([])
    assert not jb.valid_board(token)
    with pytest.raises(jb.BoardError):
        jb.fetch_board("lever", token, get=fake, sleep=lambda s: None)
    assert fake.urls == []


def test_greenhouse_filters_thailand_and_uses_large_cap():
    fake = Fake([{"jobs": [
        {"id": 1, "title": "Engineer", "location": {"name": "Bangkok, Thailand"}, "absolute_url": "https://x/1",
         "content": "&lt;p&gt;Hi&lt;/p&gt;", "updated_at": "2026-10-01T00:00:00Z"},
        {"id": 2, "title": "Engineer", "location": {"name": "Singapore"}, "absolute_url": "https://x/2"}]}])
    rows = jb.fetch_board("greenhouse", "acme", get=fake, sleep=lambda s: None)
    assert [r["id"] for r in rows] == [1]
    assert fake.urls == [("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true", 8 * 1024 * 1024)]


def test_lever_pages_until_short_page():
    first = [{"id": f"a{i}", "text": "T", "country": "TH", "hostedUrl": f"https://l/{i}"} for i in range(100)]
    fake = Fake([first, [{"id": "z", "text": "T", "country": "SG", "hostedUrl": "https://l/z"}]])
    rows = jb.fetch_board("lever", "acme", get=fake, sleep=lambda s: None)
    assert len(rows) == 100 and "skip=100" in fake.urls[1][0]


def test_smartrecruiters_uses_country_filter_and_detail_call():
    fake = Fake([{"content": [{"id": "p1", "name": "Analyst", "location": {"country": "th", "city": "Bangkok"}}],
                  "totalFound": 1},
                 {"jobAd": {"sections": {"jobDescription": {"text": "<p>Do</p>"}}}, "postingUrl": "https://s/p1"}])
    rows = jb.fetch_board("smartrecruiters", "Acme1", get=fake, sleep=lambda s: None)
    assert "country=th" in fake.urls[0][0] and rows[0]["detail"]["postingUrl"] == "https://s/p1"


def test_freehire_pages_with_meta_total():
    fake = Fake([{"data": [{"public_slug": "a"}], "meta": {"total": 2}},
                 {"data": [{"public_slug": "b"}], "meta": {"total": 2}}])
    rows = jb.fetch_board("freehire", None, get=fake, sleep=lambda s: None)
    assert [r["public_slug"] for r in rows] == ["a", "b"]
    assert all(u.startswith("https://freehire.me/api/v1/agent/jobs/search?") for u, _ in fake.urls)


def test_freehire_short_read_is_failure():
    fake = Fake([{"data": [{"public_slug": "a"}], "meta": {"total": 3}}, {"data": [], "meta": {"total": 3}}])
    with pytest.raises(jb.BoardError, match="short_read"):
        jb.fetch_board("freehire", None, get=fake, sleep=lambda s: None)


def test_malformed_body_is_failure_not_empty():
    with pytest.raises(jb.BoardError):
        jb.fetch_board("greenhouse", "acme", get=Fake([{"unexpected": True}]), sleep=lambda s: None)


def test_pauses_between_requests_to_same_host():
    pauses = []
    first = [{"id": f"a{i}", "text": "T", "country": "TH", "hostedUrl": "https://l"} for i in range(100)]
    jb.fetch_board("lever", "acme", get=Fake([first, []]), sleep=pauses.append)
    assert pauses == [0.5]


def _sr_page(n):
    return {"content": [{"id": f"p{i}"} for i in range(n)], "totalFound": 10_000}


def test_smartrecruiters_exhausting_pages_is_failure_not_partial(monkeypatch):
    monkeypatch.setattr(jb, "MAX_PAGES", 2)
    fake = Fake([_sr_page(100), _sr_page(100)])
    with pytest.raises(jb.BoardError, match="too_many_pages"):
        jb.fetch_board("smartrecruiters", "Acme1", get=fake, sleep=lambda s: None)


def test_smartrecruiters_too_many_postings_before_any_detail_call(monkeypatch):
    monkeypatch.setattr(jb, "MAX_DETAIL_POSTINGS", 2)
    fake = Fake([{"content": [{"id": f"p{i}"} for i in range(3)], "totalFound": 3}])
    with pytest.raises(jb.BoardError, match="too_many_postings"):
        jb.fetch_board("smartrecruiters", "Acme1", get=fake, sleep=lambda s: None)
    assert len(fake.urls) == 1
