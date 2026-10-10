from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from job_search_platform.api import rest
from job_search_platform.api.dependencies import get_services, owner_actor
from job_search_platform.services import job_sources
from job_search_platform.services.errors import ServiceError

RAW = {
    "public_slug": "fe-1", "title": "Frontend", "company": "Acme", "location": "Bangkok",
    "cities": ["Bangkok"], "work_mode": "remote", "skills": [f"s{i}" for i in range(12)],
    "posted_at": "2026-09-01T00:00:00Z", "description": "x" * 60000,
    "url": "https://jobs.example.com/a?id=1&utm_source=freehire.me&UTM_medium=x",
    "enrichment": {"category": "frontend"}, "reality": {"class": "stale", "age_days": 23},
}


@pytest.fixture(autouse=True)
def clear_cache():
    job_sources._cache.clear()


def page(*rows, total=None):
    return {"data": list(rows), "meta": {"total": len(rows) if total is None else total}}


def test_item_mapping():
    item = job_sources.map_item(RAW)
    assert item["slug"] == "fe-1" and item["category"] == "frontend"
    assert item["age_days"] == 23 and item["stale"] is True
    assert len(item["skills"]) == 8 and len(item["description_markdown"]) == 50000
    assert item["source_url"] == "https://jobs.example.com/a?id=1"


def test_fresh_missing_reality_and_unsafe_url():
    fresh = job_sources.map_item({**RAW, "reality": {"class": "fresh", "age_days": 2}})
    assert fresh["stale"] is False and fresh["age_days"] == 2
    bare = job_sources.map_item({"public_slug": "b", "title": "T", "url": "javascript:alert(1)"})
    assert bare["source_url"] is None and bare["age_days"] is None and bare["stale"] is False
    assert bare["category"] is None and bare["description_markdown"] == ""
    assert job_sources.map_item({**RAW, "url": "ftp://x/y"})["source_url"] is None


def test_search_sends_whitelisted_params_and_caches():
    calls = []

    def fetch(url):
        calls.append(url)
        return page(RAW, total=79)

    kw = dict(q=" react ", cities=["Bangkok"], work_mode="remote", posted_within_days=7,
              category="frontend", limit=5, offset=10, fetch=fetch)
    result = job_sources.search_jobs(**kw)
    assert job_sources.search_jobs(**kw) == result
    assert len(calls) == 1
    assert result["total"] == 79 and result["limit"] == 5 and result["offset"] == 10
    for part in ("countries=TH", "description_format=markdown", "q=react", "cities=Bangkok",
                 "work_mode=remote", "posted_within_days=7", "category=frontend", "limit=5", "offset=10"):
        assert part in calls[0]


def test_cache_is_bounded():
    for i in range(job_sources.CACHE_MAX_ENTRIES + 10):
        job_sources.search_jobs(q=str(i), fetch=lambda url: page())
    assert len(job_sources._cache) == job_sources.CACHE_MAX_ENTRIES


def test_facets_top_n():
    facets = {"category": {f"c{i}": i for i in range(20)}, "cities": {f"t{i}": i for i in range(15)}}
    facets |= {"seniority": {"junior": 2, "intern": 5}, "employment_type": {"full_time": 3},
                "company_type": {"startup": 1}, "skills": {f"k{i}": i for i in range(30)},
                "posting_language": {"th": 77, "en": 5}}

    def fetch(url):
        return page(total=42) if "/agent/jobs/search" in url else {"data": {"total": 9, "facets": facets}}

    out = job_sources.job_facets(fetch=fetch)
    assert out["total"] == 9 and len(out["categories"]) == 12 and len(out["cities"]) == 10
    assert out["categories"][0] == {"value": "c19", "count": 19}
    assert out["seniority"] == [{"value": "intern", "count": 5}, {"value": "junior", "count": 2}]
    assert out["employment_type"] == [{"value": "full_time", "count": 3}] and out["company_type"][0]["value"] == "startup"
    assert len(out["skills"]) == 20 and out["thai_postings"] == 77 and out["new_7d"] == 42
    job_sources._cache.clear()
    missing = job_sources.job_facets(fetch=lambda url: page(total=0) if "/agent/jobs/search" in url
                                     else {"data": {"total": 1, "facets": {"category": {"a": 1}}}})
    job_sources._cache.clear()
    degraded = job_sources.job_facets(fetch=lambda url: (_ for _ in ()).throw(ServiceError("job_source_unavailable", retryable=True))
                                      if "/agent/jobs/search" in url else {"data": {"total": 1, "facets": {"category": {"a": 1}}}})
    assert degraded["total"] == 1 and degraded["new_7d"] is None
    assert missing["cities"] == [] and missing["skills"] == [] and missing["thai_postings"] == 0 and missing["new_7d"] == 0


def test_advanced_filters_map_to_upstream_params():
    calls = []
    job_sources.search_jobs(seniority=["intern", "junior"], employment_type=["internship"], company_type=["startup", "agency"],
                            skills=["python", "c++"], posting_language="th", salary_min=25000,
                            fetch=lambda url: (calls.append(url), page())[1])
    for part in ("seniority=intern%2Cjunior", "employment_type=internship", "company_type=startup%2Cagency",
                 "skills=python%2Cc%2B%2B", "posting_language=th", "salary_min=25000",
                 "salary_currency=thb", "salary_period=month"):
        assert part in calls[0]
    job_sources.search_jobs(fetch=lambda url: (calls.append(url), page())[1])
    assert not any(k in calls[1] for k in ("seniority", "salary", "skills", "posting_language"))


def test_parse_choices():
    assert job_sources.parse_choices("junior, intern,junior", "seniority") == ["intern", "junior"]
    assert job_sources.parse_choices("", "seniority") == [] and job_sources.parse_choices("boss", "seniority") is None
    assert job_sources.parse_choices("contract,x", "employment_type") is None
    assert job_sources.parse_choices("python,c#,node.js", "skills") == ["c#", "node.js", "python"]
    assert job_sources.parse_choices("Python", "skills") is None and job_sources.parse_choices("a,b,c,d,e,f", "skills") is None


@pytest.mark.parametrize("payload", [{}, {"data": "x", "meta": {}}, {"data": []}])
def test_malformed_upstream_is_unavailable(payload):
    with pytest.raises(ServiceError) as err:
        job_sources.search_jobs(fetch=lambda url: payload)
    assert err.value.code == "job_source_unavailable" and err.value.retryable is True


def test_fetch_json_failures_are_safe(monkeypatch):
    class Boom:
        def open(self, *a, **k):
            raise OSError("secret upstream detail")

    monkeypatch.setattr(job_sources, "build_opener", lambda *a: Boom())
    with pytest.raises(ServiceError) as err:
        job_sources.fetch_json("https://freehire.me/x")
    assert err.value.code == "job_source_unavailable" and "secret" not in str(err.value.public_payload())

    class Resp:
        status = 200
        def __init__(self, body): self.body = body
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n): return self.body[:n]

    for body in (b"not json", b"[]", b" " * (job_sources.MAX_BYTES + 1)):
        monkeypatch.setattr(job_sources, "build_opener",
                            lambda *a, body=body: SimpleNamespace(open=lambda *x, **k: Resp(body)))
        with pytest.raises(ServiceError):
            job_sources.fetch_json("https://freehire.me/x")


def test_parse_cities():
    assert job_sources.parse_cities("") == [] and job_sources.parse_cities("A, B") == ["A", "B"]
    assert job_sources.parse_cities(",".join("abcdef")) is None
    assert job_sources.parse_cities("x" * 61) is None


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(rest.router)
    app.add_exception_handler(ServiceError, lambda _r, e: rest._http_error(e))
    app.dependency_overrides[owner_actor] = lambda: SimpleNamespace(kind="owner")
    app.dependency_overrides[get_services] = lambda: SimpleNamespace(sessions=lambda: nullcontext())
    monkeypatch.setattr(rest, "authorize", lambda *a, **k: None)
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: page(RAW))
    return TestClient(app)


@pytest.mark.parametrize("query", [
    "q=" + "x" * 201, "work_mode=remotee", "posted_within_days=0", "posted_within_days=91",
    "category=Bad Slug", "limit=0", "limit=21", "offset=-1", "offset=1001",
    "cities=a,b,c,d,e,f", "cities=" + "x" * 61,
    "seniority=boss", "employment_type=full_time,nope", "company_type=bank", "skills=Python", "skills=a,b,c,d,e,f",
    "skills=-x", "posting_language=en", "salary_min=0", "salary_min=1000001", "salary_min=abc",
])
def test_invalid_params_are_422(client, query):
    assert client.get(f"/projects/{uuid4()}/job-search?{query}").status_code == 422
    if query.split("=")[0] in ("seniority", "employment_type", "company_type", "skills", "posting_language", "salary_min"):
        assert client.get(f"/projects/{uuid4()}/job-search/match?cv_revision_id={uuid4()}&{query}").status_code == 422


def test_filters_reach_upstream_on_search(client, monkeypatch):
    seen = []
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: (seen.append(url), page(RAW))[1])
    ok = client.get(f"/projects/{uuid4()}/job-search?seniority=junior,intern&skills=python&posting_language=th&salary_min=15000&employment_type=&q=")
    assert ok.status_code == 200
    for part in ("seniority=intern%2Cjunior", "skills=python", "posting_language=th", "salary_min=15000"):
        assert part in seen[0]
    assert "employment_type" not in seen[0]
    seen.clear()
    assert client.get(f"/projects/{uuid4()}/job-search?posting_language=&salary_min=&q=").status_code == 200
    assert "posting_language" not in seen[0] and "salary_min" not in seen[0]


def test_public_job_stats_needs_no_auth_and_returns_four_keys(monkeypatch):
    facets = {"category": {f"c{i}": i for i in range(12)}, "posting_language": {"th": 7}, "skills": {"x": 1}}
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: page(total=5) if "/agent/jobs/search" in url
                        else {"data": {"total": 100, "facets": facets}})
    app = FastAPI()  # no dependency overrides: any owner_actor dependency would reject this request
    app.include_router(rest.router)
    app.add_exception_handler(ServiceError, lambda _r, e: rest._http_error(e))
    res = TestClient(app).get("/public/job-stats?q=ignored&project_id=x")
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"total", "new_7d", "thai_postings", "categories"}
    assert body["total"] == 100 and body["new_7d"] == 5 and body["thai_postings"] == 7
    assert [c["value"] for c in body["categories"]] == [f"c{i}" for i in range(11, 3, -1)]
    job_sources._cache.clear()
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: (_ for _ in ()).throw(ServiceError("job_source_unavailable", retryable=True)))
    down = TestClient(app).get("/public/job-stats")
    assert down.status_code == 502 and down.json()["code"] == "job_source_unavailable"


def test_routes_ok_and_upstream_error_is_502(client, monkeypatch):
    pid = uuid4()
    ok = client.get(f"/projects/{pid}/job-search?q=react&cities=Bangkok&work_mode=remote&limit=1")
    assert ok.status_code == 200 and ok.json()["items"][0]["slug"] == "fe-1"

    def down(url):
        raise ServiceError("job_source_unavailable", retryable=True)

    job_sources._cache.clear()
    monkeypatch.setattr(job_sources, "fetch_json", down)
    down_resp = client.get(f"/projects/{pid}/job-search")
    assert down_resp.status_code == 502
    assert down_resp.json()["code"] == "job_source_unavailable" and down_resp.json()["retryable"] is True


def test_match_skills_dedupe_and_strip_before_counting():
    from job_search_platform.services.contracts import MatchRunRequest
    req = MatchRunRequest(cv_revision_id=uuid4(), skills=["a", "a", "a", "a", "a", "a", "b", "python\n"])
    assert req.skills == ["a", "b", "python"]
    with pytest.raises(ValueError):
        MatchRunRequest(cv_revision_id=uuid4(), skills=list("abcdef"))
