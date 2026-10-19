from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from job_search_platform.api import rest
from job_search_platform.api.dependencies import get_services, owner_actor
from job_search_platform.integrations.meili import MeiliError
from job_search_platform.services import job_sources
from job_search_platform.services.errors import ServiceError

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
NOW_TS = int(NOW.timestamp())
DAY = 86400
HIT = {
    "slug": "fe-1", "title": "Frontend", "company": "Acme", "location": "Bangkok", "cities": ["Bangkok"],
    "work_mode": "remote", "skills": [f"s{i}" for i in range(12)], "category": "frontend",
    "posted_at": "2026-10-05T12:00:00+00:00", "posted_ts": NOW_TS - 10 * DAY, "reality_stale": False,
    "source_url": "https://jobs.example.com/a?id=1&utm_source=freehire.me&UTM_medium=x",
    "description_markdown": "x" * 60000,
}


@pytest.fixture(autouse=True)
def clear_cache():
    job_sources._cache.clear()


def result(*hits, total=None):
    return {"hits": list(hits), "estimatedTotalHits": len(hits) if total is None else total}


def serve(monkeypatch, responder=None):
    calls = []

    def fake(payload):
        calls.append(payload)
        return responder(payload) if responder else result(HIT)

    monkeypatch.setattr(job_sources, "_search", fake)
    return calls


def test_filter_for_every_parameter():
    f = job_sources.build_filter(cities=["Bangkok", "Chon Buri"], work_mode="remote", posted_within_days=7,
                                 category="backend", seniority=["senior"], employment_type=["full_time"],
                                 company_type=["product"], skills=["python", "go"], posting_language="th",
                                 salary_min=50000, company="Acme", now=NOW)
    assert f == ['(province IN ["TH-10", "TH-20"] OR cities IN ["Bangkok", "Chon Buri"])', 'work_mode = "remote"', f"posted_ts >= {NOW_TS - 7 * 86400}",
                 'category = "backend"', 'seniority IN ["senior"]', 'employment_type IN ["full_time"]',
                 'company_type IN ["product"]', 'skills IN ["python", "go"]', 'posting_language = "th"',
                 "salary_thb_month_min >= 50000", 'company = "Acme"']
    assert job_sources.build_filter(now=NOW) == []
    assert job_sources.build_filter(cities=["กรุงเทพฯ"], now=NOW) == ['(province IN ["TH-10"] OR cities IN ["กรุงเทพฯ"])']
    assert job_sources.build_filter(cities=["Bengaluru"], now=NOW) == ['cities IN ["Bengaluru"]']
    assert job_sources.build_filter(company='A"cme', now=NOW) == ['company = "A\\"cme"']


def test_empty_query_sorts_newest_first(monkeypatch):
    calls = serve(monkeypatch)
    job_sources.search_jobs(q="  ", now=NOW)
    job_sources.search_jobs(q=None, category="x", now=NOW)
    job_sources.search_jobs(q=" react ", now=NOW)
    assert calls[0]["sort"] == ["posted_ts:desc"] and calls[0]["q"] == ""
    assert calls[1]["sort"] == ["posted_ts:desc"] and calls[1]["filter"] == ['category = "x"']
    assert calls[2]["q"] == "react" and "sort" not in calls[2]
    assert "reality_stale" in calls[0]["attributesToRetrieve"] and "posted_ts" in calls[0]["attributesToRetrieve"]


def test_hit_maps_to_current_item_shape_and_stale_rule():
    item = job_sources.hit_to_item(HIT, NOW)
    assert set(item) == {"slug", "title", "company", "location", "cities", "work_mode", "skills", "category",
                         "posted_at", "age_days", "stale", "ghost_signals", "source_url", "description_markdown"}
    assert item["slug"] == "fe-1" and item["category"] == "frontend" and item["age_days"] == 10 and item["stale"] is False
    assert len(item["skills"]) == 8 and len(item["description_markdown"]) == 50000
    assert item["source_url"] == "https://jobs.example.com/a?id=1"
    assert job_sources.hit_to_item({**HIT, "posted_ts": NOW_TS - 61 * DAY}, NOW)["stale"] is True
    assert job_sources.hit_to_item({**HIT, "posted_ts": NOW_TS - 60 * DAY}, NOW)["stale"] is False
    assert job_sources.hit_to_item({**HIT, "reality_stale": True}, NOW)["stale"] is True
    assert item["ghost_signals"] == []
    assert job_sources.hit_to_item({**HIT, "posted_ts": NOW_TS - 61 * DAY}, NOW)["ghost_signals"] == ["old"]
    assert job_sources.hit_to_item({**HIT, "reality_stale": True}, NOW)["ghost_signals"] == ["source_flagged"]
    both = job_sources.hit_to_item({**HIT, "posted_ts": NOW_TS - 70 * DAY, "missed_runs": 1}, NOW)
    assert both["ghost_signals"] == ["old", "unlisted"] and both["stale"] is True
    assert job_sources.hit_to_item({**HIT, "missed_runs": 0}, NOW)["stale"] is False
    bare = job_sources.hit_to_item({"slug": "b", "title": "T", "source_url": "javascript:alert(1)"}, NOW)
    assert bare["source_url"] is None and bare["age_days"] is None and bare["stale"] is False
    assert bare["category"] is None and bare["description_markdown"] == ""
    assert job_sources.hit_to_item({**HIT, "source_url": "ftp://x/y"}, NOW)["source_url"] is None


def test_meili_down_is_job_source_unavailable(monkeypatch):
    def boom(_payload):
        raise ServiceError("job_source_unavailable", retryable=True)

    class Client:
        def search(self, index, payload):
            raise MeiliError("status_503")

    monkeypatch.setattr(job_sources.meili, "client", lambda: Client())
    with pytest.raises(ServiceError) as err:
        job_sources.search_jobs(now=NOW)
    assert err.value.code == "job_source_unavailable" and err.value.retryable is True
    monkeypatch.setattr(job_sources, "_search", boom)
    with pytest.raises(ServiceError):
        job_sources.job_facets(now=NOW)


def test_search_caches_and_passes_offset_limit_and_estimated_total(monkeypatch):
    calls = serve(monkeypatch, lambda p: result(HIT, total=79))
    kw = dict(q=" react ", cities=["Bangkok"], work_mode="remote", posted_within_days=7, category="frontend",
              limit=5, offset=10, now=NOW)
    out = job_sources.search_jobs(**kw)
    assert job_sources.search_jobs(**kw) == out and len(calls) == 1
    assert out["total"] == 79 and out["limit"] == 5 and out["offset"] == 10 and out["items"][0]["slug"] == "fe-1"
    assert calls[0]["limit"] == 5 and calls[0]["offset"] == 10


def test_cache_is_bounded(monkeypatch):
    serve(monkeypatch, lambda p: result())
    for i in range(job_sources.CACHE_MAX_ENTRIES + 10):
        job_sources.search_jobs(q=str(i), now=NOW)
    assert len(job_sources._cache) == job_sources.CACHE_MAX_ENTRIES


def facet_dist():
    dist = {"category": {f"c{i}": i for i in range(20)}, "province": {"TH-10": 50, "TH-20": 9, "TH-50": 20, "XX-99": 99, "TH-11": True}}
    return dist | {"seniority": {"junior": 2, "intern": 5}, "employment_type": {"full_time": 3},
                   "company_type": {"startup": 1}, "skills": {f"k{i}": i for i in range(30)},
                   "posting_language": {"th": 77, "en": 5}}


def test_facets_shape_counts_and_new_7d(monkeypatch):
    calls = serve(monkeypatch, lambda p: result(total=42) if p["limit"] == 1
                  else {"hits": [], "estimatedTotalHits": 9, "facetDistribution": facet_dist()})
    out = job_sources.job_facets(now=NOW)
    assert out["total"] == 9 and len(out["categories"]) == 12
    assert out["categories"][0] == {"value": "c19", "count": 19}
    assert out["cities"] == [{"value": "Bangkok", "name_th": "กรุงเทพมหานคร", "count": 50},
                             {"value": "Chiang Mai", "name_th": "เชียงใหม่", "count": 20},
                             {"value": "Chon Buri", "name_th": "ชลบุรี", "count": 9}]  # no foreign place, no bool count
    assert out["seniority"] == [{"value": "intern", "count": 5}, {"value": "junior", "count": 2}]
    assert out["employment_type"] == [{"value": "full_time", "count": 3}] and out["company_type"][0]["value"] == "startup"
    assert len(out["skills"]) == 20 and out["thai_postings"] == 77 and out["new_7d"] == 42
    assert calls[0] == {"q": "", "limit": 0, "facets": ["category", "province", "seniority", "employment_type",
                                                          "company_type", "skills", "posting_language"]}
    assert calls[1]["filter"] == [f"posted_ts >= {NOW_TS - 7 * DAY}"] and calls[1]["limit"] == 1
    job_sources._cache.clear()
    serve(monkeypatch, lambda p: result(total=0) if p["limit"] == 1
          else {"estimatedTotalHits": 1, "facetDistribution": {"category": {"a": 1}}})
    missing = job_sources.job_facets(now=NOW)
    assert missing["cities"] == [] and missing["skills"] == [] and missing["thai_postings"] == 0 and missing["new_7d"] == 0
    job_sources._cache.clear()

    def degraded_source(p):
        if p["limit"] == 1:
            raise MeiliError("down")
        return {"estimatedTotalHits": 1, "facetDistribution": {"category": {"a": 1}}}

    class Client:
        def search(self, index, payload):
            return degraded_source(payload)

    monkeypatch.undo()
    monkeypatch.setattr(job_sources.meili, "client", lambda: Client())
    degraded = job_sources.job_facets(now=NOW)
    assert degraded["total"] == 1 and degraded["new_7d"] is None


def test_facets_are_cached(monkeypatch):
    calls = serve(monkeypatch, lambda p: result(total=3) if p["limit"] == 1
                  else {"estimatedTotalHits": 9, "facetDistribution": facet_dist()})
    job_sources.job_facets(now=NOW)
    job_sources.job_facets(now=NOW)
    assert len(calls) == 2


def test_advanced_filters_reach_the_filter_expression(monkeypatch):
    calls = serve(monkeypatch)
    job_sources.search_jobs(seniority=["intern", "junior"], employment_type=["internship"], company_type=["startup", "agency"],
                            skills=["python", "c++"], posting_language="th", salary_min=25000, now=NOW)
    assert calls[0]["filter"] == ['seniority IN ["intern", "junior"]', 'employment_type IN ["internship"]',
                                  'company_type IN ["startup", "agency"]', 'skills IN ["python", "c++"]',
                                  'posting_language = "th"', "salary_thb_month_min >= 25000"]
    job_sources.search_jobs(now=NOW)
    assert calls[1]["filter"] == []


def test_parse_choices():
    assert job_sources.parse_choices("junior, intern,junior", "seniority") == ["intern", "junior"]
    assert job_sources.parse_choices("", "seniority") == [] and job_sources.parse_choices("boss", "seniority") is None
    assert job_sources.parse_choices("contract,x", "employment_type") is None
    assert job_sources.parse_choices("python,c#,node.js", "skills") == ["c#", "node.js", "python"]
    assert job_sources.parse_choices("Python", "skills") is None and job_sources.parse_choices("a,b,c,d,e,f", "skills") is None


@pytest.mark.parametrize("payload", [{}, {"hits": "x"}, {"estimatedTotalHits": 3}])
def test_malformed_upstream_is_unavailable(monkeypatch, payload):
    serve(monkeypatch, lambda p: payload)
    with pytest.raises(ServiceError) as err:
        job_sources.search_jobs(now=NOW)
    assert err.value.code == "job_source_unavailable" and err.value.retryable is True


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
    serve(monkeypatch)
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
    seen = serve(monkeypatch)
    ok = client.get(f"/projects/{uuid4()}/job-search?seniority=junior,intern&skills=python&posting_language=th&salary_min=15000&employment_type=&q=")
    assert ok.status_code == 200
    f = " ".join(seen[0]["filter"])
    for part in ('seniority IN ["intern", "junior"]', 'skills IN ["python"]', 'posting_language = "th"',
                 "salary_thb_month_min >= 15000"):
        assert part in f
    assert "employment_type" not in f
    seen.clear()
    assert client.get(f"/projects/{uuid4()}/job-search?posting_language=&salary_min=&q=").status_code == 200
    assert "posting_language" not in " ".join(seen[0]["filter"]) and "salary" not in " ".join(seen[0]["filter"])


def test_company_filter_reaches_search(client, monkeypatch):
    seen = serve(monkeypatch)
    assert client.get(f"/projects/{uuid4()}/job-search?company=%20Acme%20&q=").status_code == 200
    assert 'company = "Acme"' in seen[0]["filter"]
    seen.clear()
    assert client.get(f"/projects/{uuid4()}/job-search?company=%20&q=").status_code == 200
    assert "company" not in " ".join(seen[0]["filter"])
    assert client.get(f"/projects/{uuid4()}/job-search?company=" + "x" * 301).status_code == 422


def test_public_job_stats_needs_no_auth_and_returns_four_keys(monkeypatch):
    dist = {"category": {f"c{i}": i for i in range(12)}, "posting_language": {"th": 7}, "skills": {"x": 1}}
    serve(monkeypatch, lambda p: result(total=5) if p["limit"] == 1
          else {"estimatedTotalHits": 100, "facetDistribution": dist})
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

    def down(_payload):
        raise ServiceError("job_source_unavailable", retryable=True)

    monkeypatch.setattr(job_sources, "_search", down)
    gone = TestClient(app).get("/public/job-stats")
    assert gone.status_code == 502 and gone.json()["code"] == "job_source_unavailable"


def test_routes_ok_and_upstream_error_is_502(client, monkeypatch):
    pid = uuid4()
    ok = client.get(f"/projects/{pid}/job-search?q=react&cities=Bangkok&work_mode=remote&limit=1")
    assert ok.status_code == 200 and ok.json()["items"][0]["slug"] == "fe-1"

    def down(payload):
        raise ServiceError("job_source_unavailable", retryable=True)

    job_sources._cache.clear()
    monkeypatch.setattr(job_sources, "_search", down)
    down_resp = client.get(f"/projects/{pid}/job-search")
    assert down_resp.status_code == 502
    assert down_resp.json()["code"] == "job_source_unavailable" and down_resp.json()["retryable"] is True


def test_match_skills_dedupe_and_strip_before_counting():
    from job_search_platform.services.contracts import MatchRunRequest
    req = MatchRunRequest(cv_revision_id=uuid4(), skills=["a", "a", "a", "a", "a", "a", "b", "python\n"])
    assert req.skills == ["a", "b", "python"]
    with pytest.raises(ValueError):
        MatchRunRequest(cv_revision_id=uuid4(), skills=list("abcdef"))
