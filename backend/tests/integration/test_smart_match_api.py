"""Smart match API: Jev scores, bands, highlights, hidden filters and the start-run route."""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from job_search_platform.db.models import CVRevision, JobMatchScore, Run
from job_search_platform.integrations.jev import JEV_MODEL
from job_search_platform.services import job_sources, smart_match
from test_paired_sessions import _project, _upload  # noqa: F401
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

PREFIX = "/api/v1/projects"
SLUGS = ["a", "b", "c", "d", "e"]


def _raw(slug, title="Dev", company="Other", description="Python and SQL"):
    return {"public_slug": slug, "title": title, "company": company, "description": description,
            "skills": [], "reality": {"class": "fresh", "age_days": 1}, "url": f"https://jobs.example.com/{slug}"}


def _serve(monkeypatch, raws):
    job_sources._cache.clear()
    seen = []
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: (seen.append(url), {"data": raws, "meta": {"total": len(raws)}})[1])
    return seen


def _profile(api_context, revision_id, **extra):
    with api_context.sessions.begin() as db:
        db.get(CVRevision, UUID(revision_id)).skill_profile = {"skills": ["Python", "SQL"], "method": "keyword_dictionary_v1", **extra}


def _setup(api_context, **extra):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    rev = _upload(api_context, csrf, pid).json()["latest_revision"]["id"]
    _profile(api_context, rev, **extra)
    return csrf, pid, rev


def _score(api_context, pid, rev, raw, fit, *, stale=False):
    item = {"title": raw["title"], "description_markdown": raw["description"]}
    digest = "0" * 64 if stale else smart_match.content_hash(item)
    with api_context.sessions.begin() as db:
        db.add(JobMatchScore(project_id=UUID(pid), cv_revision_id=UUID(rev), job_slug=raw["public_slug"], content_hash=digest,
                             model=JEV_MODEL, fit_percent=fit, uncertain=False,
                             details={"band": 4, "seniority": "mid", "hard_blocker": False, "skills_evidenced": ["Python"],
                                      "must_missing": ["SQL"], "nice_missing": ["Docker"]}))


def _url(pid, rev, extra=""):
    return f"{PREFIX}/{pid}/job-search/match?cv_revision_id={rev}{extra}"


@pytest.mark.integration
def test_unavailable_without_gateway_key_keeps_keyword_order(api_context, monkeypatch, no_gateway_key):
    raws = [_raw("a", description="Kitchen"), _raw("b", description="Python and SQL")]
    _serve(monkeypatch, raws)
    csrf, pid, rev = _setup(api_context)
    body = api_context.client.get(_url(pid, rev, "&q=dev")).json()
    assert body["ai"] == {"status": "unavailable", "categories": None, "scored": 0}
    assert [i["slug"] for i in body["items"]] == ["b", "a"]
    assert all(i["ai_match"] is None for i in body["items"])
    assert body["items"][0]["highlight"]["matched"] == {"Python": "Python", "SQL": "SQL"}
    assert body["items"][0]["highlight"]["missing"] == {}
    run = api_context.client.post(f"{PREFIX}/{pid}/job-search/match/runs", json={"cv_revision_id": rev, "q": "dev"},
                                  headers=_write_headers(csrf))
    assert run.status_code == 409 and run.json()["code"] == "gateway_unconfigured"


@pytest.mark.integration
def test_ai_status_missing_partial_ready_and_stale_hash_ignored(api_context, monkeypatch):
    raws = [_raw(s) for s in SLUGS]
    _serve(monkeypatch, raws)
    csrf, pid, rev = _setup(api_context)
    client = api_context.client
    body = client.get(_url(pid, rev, "&q=dev")).json()
    assert body["ai"] == {"status": "missing", "categories": None, "scored": 0}
    _score(api_context, pid, rev, raws[3], 40)
    _score(api_context, pid, rev, raws[1], 80)
    _score(api_context, pid, rev, raws[4], 99, stale=True)
    body = client.get(_url(pid, rev, "&q=dev")).json()
    assert body["ai"]["status"] == "partial" and body["ai"]["scored"] == 2
    assert [i["slug"] for i in body["items"][:2]] == ["b", "d"]
    first = body["items"][0]["ai_match"]
    assert first["fit_percent"] == 80 and first["band"] == 4 and first["must_missing"] == ["SQL"] and first["nice_missing"] == ["Docker"]
    assert set(body["items"][0]["highlight"]["missing"]) == {"SQL", "Docker"}
    assert all(i["ai_match"] is None for i in body["items"][2:])
    for raw, fit in ((raws[0], 10), (raws[2], 20), (raws[4], 30)):
        _score(api_context, pid, rev, raw, fit)
    assert client.get(_url(pid, rev, "&q=dev")).json()["ai"] == {"status": "ready", "categories": None, "scored": 5}


@pytest.mark.integration
def test_auto_mode_without_categories_falls_back_to_keyword_pool(api_context, monkeypatch):
    seen = _serve(monkeypatch, [_raw("a")])
    csrf, pid, rev = _setup(api_context)
    body = api_context.client.get(_url(pid, rev)).json()
    assert [i["slug"] for i in body["items"]] == ["a"]  # keyword pool, not an empty list
    assert body["ai"] == {"status": "missing", "categories": None, "scored": 0}
    assert seen
    _profile(api_context, rev, categories=["it"], categories_model=JEV_MODEL)
    body = api_context.client.get(_url(pid, rev)).json()
    assert any("category=it" in u for u in seen)
    assert body["ai"]["categories"] == ["it"] and [i["slug"] for i in body["items"]] == ["a"]


@pytest.mark.integration
def test_hide_company_job_unhide_and_authorization(api_context, monkeypatch):
    raws = [_raw("a", company="Acme Co"), _raw("b", company="acme co"), _raw("c", company="Beta")]
    _serve(monkeypatch, raws)
    csrf, pid, rev = _setup(api_context)
    client, headers = api_context.client, _write_headers(csrf)
    url = f"{PREFIX}/{pid}/job-search/hidden"
    first = client.post(url, headers=headers, json={"kind": "company", "value": "Acme  Co", "label": "Acme Co"})
    assert first.status_code == 201 and first.json()["kind"] == "company" and first.json()["label"] == "Acme Co"
    again = client.post(url, headers=headers, json={"kind": "company", "value": "Acme  Co", "label": "Acme Co"})
    assert again.status_code == 201 and again.json()["id"] == first.json()["id"]
    from job_search_platform.db.models import JobSearchHidden
    with api_context.sessions() as db:
        assert db.scalar(select(JobSearchHidden.value).where(JobSearchHidden.id == UUID(first.json()["id"]))) == "acme co"
    body = client.get(_url(pid, rev, "&q=dev")).json()
    assert [i["slug"] for i in body["items"]] == ["c"] and body["hidden_count"] == 2
    assert [r["id"] for r in client.get(url).json()["items"]] == [first.json()["id"]]
    job = client.post(url, headers=headers, json={"kind": "job", "value": "c", "label": "Dev at Beta"}).json()
    assert client.get(_url(pid, rev, "&q=dev")).json()["items"] == []

    assert client.post(url, headers=headers, json={"kind": "other", "value": "x", "label": "x"}).status_code == 422
    other = _project(api_context, csrf, "Other")
    assert client.delete(f"{url}/{first.json()['id']}".replace(pid, other), headers=headers).status_code == 404

    token = client.post(f"{PREFIX}/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    saved = dict(client.cookies)
    client.cookies.clear()
    try:
        bearer = {"Authorization": f"Bearer {token}"}
        assert client.get(url, headers=bearer).status_code in {401, 403}
        assert client.post(url, headers=bearer, json={"kind": "job", "value": "z", "label": "z"}).status_code in {401, 403}
        assert client.delete(f"{url}/{job['id']}", headers=bearer).status_code in {401, 403}
        assert client.post(f"{url}/../match/runs", headers=bearer, json={"cv_revision_id": rev}).status_code in {401, 403, 404, 405}
    finally:
        client.cookies.update(saved)

    assert client.delete(f"{url}/{first.json()['id']}", headers=headers).status_code == 204
    body = client.get(_url(pid, rev, "&q=dev")).json()
    assert [i["slug"] for i in body["items"]] == ["a", "b"] and body["hidden_count"] == 1


@pytest.mark.integration
def test_start_run_is_idempotent_hidden_from_list_and_key_removal(api_context, monkeypatch, tmp_path):
    raws = [_raw(s) for s in SLUGS]
    _serve(monkeypatch, raws)
    csrf, pid, rev = _setup(api_context)
    client, headers = api_context.client, _write_headers(csrf)
    body = {"cv_revision_id": rev, "q": "dev"}
    first = client.post(f"{PREFIX}/{pid}/job-search/match/runs", json=body, headers=headers)
    second = client.post(f"{PREFIX}/{pid}/job-search/match/runs", json=body, headers=headers)
    assert first.status_code == 202 and second.status_code == 202, first.text
    assert first.json()["id"] == second.json()["id"] and first.json()["operation"] == "match_jobs"
    assert client.get(f"{PREFIX}/{pid}/runs").json() == []
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Run).where(Run.operation == "match_jobs")) == 1
    _score(api_context, pid, rev, raws[0], 70)
    assert client.get(_url(pid, rev, "&q=dev")).json()["ai"]["status"] == "partial"
    monkeypatch.delenv("LITELLM_API_KEY")
    monkeypatch.setenv("CORE02_PRIVATE_DIR", str(tmp_path))
    switched = client.get(_url(pid, rev, "&q=dev")).json()
    assert switched["ai"]["status"] == "unavailable" and all(i["ai_match"] is None for i in switched["items"])
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(JobMatchScore)) == 1


@pytest.mark.integration
def test_highlight_surfaces_are_plain_posting_strings(api_context, monkeypatch):
    _serve(monkeypatch, [_raw("a", description="<script>alert(1)</script> We use React (JS) and Python daily")])
    csrf, pid, rev = _setup(api_context)
    item = api_context.client.get(_url(pid, rev, "&q=dev")).json()["items"][0]
    surfaces = [*item["highlight"]["matched"].values(), *item["highlight"]["missing"].values()]
    assert surfaces and all(isinstance(s, str) and "<" not in s and ">" not in s for s in surfaces)
    assert item["highlight"]["matched"]["Python"] == "Python"
    text = smart_match.job_text(item)
    assert all(s in text for s in surfaces)


@pytest.mark.integration
def test_empty_pool_is_ready_and_different_filters_leave_one_queued_run(api_context, monkeypatch):
    _serve(monkeypatch, [])
    csrf, pid, rev = _setup(api_context)
    client, headers = api_context.client, _write_headers(csrf)
    assert client.get(_url(pid, rev, "&q=nothing")).json()["ai"] == {"status": "ready", "categories": None, "scored": 0}
    for q in ("one", "two", "three"):
        assert client.post(f"{PREFIX}/{pid}/job-search/match/runs", json={"cv_revision_id": rev, "q": q}, headers=headers).status_code == 202
    with api_context.sessions() as db:
        statuses = sorted(db.scalars(select(Run.status).where(Run.operation == "match_jobs")))
    assert statuses == ["cancelled", "cancelled", "queued"]


@pytest.mark.integration
def test_run_request_validates_and_stores_filters_and_public_route_needs_no_cookie(api_context, monkeypatch):
    _serve(monkeypatch, [])
    csrf, pid, rev = _setup(api_context)
    client, headers = api_context.client, _write_headers(csrf)
    url = f"{PREFIX}/{pid}/job-search/match/runs"
    for bad in ({"seniority": ["boss"]}, {"employment_type": ["x"]}, {"company_type": ["bank"]}, {"skills": ["Py"]},
                {"skills": list("abcdef")}, {"posting_language": "en"}, {"salary_min": 0}, {"salary_min": 1_000_001}):
        assert client.post(url, json={"cv_revision_id": rev, **bad}, headers=headers).status_code == 422, bad
    body = {"cv_revision_id": rev, "q": "dev", "seniority": ["junior", "intern"], "skills": ["sql", "python"],
            "posting_language": "th", "salary_min": 25000}
    run = client.post(url, json=body, headers=headers)
    assert run.status_code == 202, run.text
    again = client.post(url, json={**body, "seniority": ["intern", "junior"], "skills": ["python", "sql"]}, headers=headers)
    assert again.json()["id"] == run.json()["id"]  # equal filter sets dedup
    with api_context.sessions() as db:
        snap = db.scalar(select(Run.input_snapshot).where(Run.id == UUID(run.json()["id"])))
    assert snap["seniority"] == ["intern", "junior"] and snap["skills"] == ["python", "sql"]
    assert snap["posting_language"] == "th" and snap["salary_min"] == 25000 and snap["employment_type"] == []
    seen = _serve(monkeypatch, [_raw("a")])
    ok = client.get(_url(pid, rev, "&q=dev&seniority=junior&company_type=startup&salary_min=15000"))
    assert ok.status_code == 200 and "seniority=junior" in seen[0] and "company_type=startup" in seen[0]
    client.cookies.clear()
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: {"data": [], "meta": {"total": 4}} if "/agent/jobs/search" in url
                        else {"data": {"total": 9, "facets": {"category": {"it": 9}, "posting_language": {"th": 3}}}})
    job_sources._cache.clear()
    public = client.get("/api/v1/public/job-stats")
    assert public.status_code == 200 and public.json() == {"total": 9, "new_7d": 4, "thai_postings": 3,
                                                             "categories": [{"value": "it", "count": 9}]}
    assert client.get(f"{PREFIX}/{pid}/job-search/facets").status_code == 401


@pytest.mark.integration
def test_scores_and_categories_under_another_decision_model_are_not_reused(api_context, monkeypatch):
    raws = [_raw("a")]
    _serve(monkeypatch, raws)
    csrf, pid, rev = _setup(api_context, categories=["it"], categories_model=JEV_MODEL)
    _score(api_context, pid, rev, raws[0], 70)
    assert api_context.client.get(_url(pid, rev, "&q=dev")).json()["ai"]["scored"] == 1
    monkeypatch.setenv("AI_DECISION_MODEL", "other/decision-model")
    body = api_context.client.get(_url(pid, rev)).json()
    assert body["ai"]["scored"] == 0 and body["ai"]["categories"] is None
