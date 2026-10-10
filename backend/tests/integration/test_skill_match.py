"""CV skill profile + job-search match: endpoints, ordering, isolation and migration 0013."""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from job_search_platform.db.models import CVRevision, Run
from job_search_platform.services import job_sources
from test_paired_sessions import _project, _upload  # noqa: F401
from test_rest_api import ROOT_FOR_MIGRATIONS, _owner, _write_headers, api_context  # noqa: F401

PREFIX = "/api/v1/projects"


def _raw(slug, title, description, age):
    return {"public_slug": slug, "title": title, "company": "Acme", "description": description,
            "skills": [], "reality": {"class": "fresh", "age_days": age}, "url": f"https://jobs.example.com/{slug}"}


JOBS = [
    {"data": [
        _raw("none", "Cook", "Kitchen work", 0),
        _raw("half", "Dev", "React and Docker", 1),
        _raw("old-full", "Dev", "Python and SQL", 9),
        _raw("new-full", "Dev", "Python and SQL", 2),
        _raw("few", "Dev", "Only Python", 0),
    ], "meta": {"total": 5}},
]


@pytest.fixture
def source(monkeypatch):
    job_sources._cache.clear()
    seen = []
    monkeypatch.setattr(job_sources, "fetch_json", lambda url: (seen.append(url), JOBS[0])[1])
    return seen


def _set_profile(api_context, revision_id, skills):
    with api_context.sessions.begin() as db:
        db.get(CVRevision, UUID(revision_id)).skill_profile = {"skills": skills, "method": "keyword_dictionary_v1"}


@pytest.mark.integration
def test_match_sorting_null_last_and_missing_profile(api_context, source):
    client, csrf = api_context.client, _owner(api_context)
    pid = _project(api_context, csrf)
    cv = _upload(api_context, csrf, pid).json()
    rev = cv["latest_revision"]["id"]
    assert cv["latest_revision"]["skill_profile_ready"] is False and cv["latest_revision"]["skill_count"] is None
    url = f"{PREFIX}/{pid}/job-search/match?cv_revision_id={rev}&q=dev&pool=100"
    missing = client.get(url)
    assert missing.status_code == 409 and missing.json()["code"] == "cv_profile_missing"

    _set_profile(api_context, rev, ["Python", "SQL"])
    listed = client.get(f"{PREFIX}/{pid}/cvs").json()[0]["latest_revision"]
    assert listed["skill_profile_ready"] is True and listed["skill_count"] == 2
    body = client.get(url).json()
    assert [i["slug"] for i in body["items"]] == ["new-full", "old-full", "half", "none", "few"]
    first, half = body["items"][0], body["items"][2]
    assert first["match"] == {"score_percent": 100, "matched": ["Python", "SQL"], "missing": [], "required_count": 2}
    assert half["match"]["score_percent"] == 0 and half["match"]["missing"] == ["React", "Docker"]
    assert body["items"][3]["match"] is None and body["items"][4]["match"] is None
    assert (body["total"], body["offset"], body["pool"]) == (5, 0, 100)
    assert "limit=100" in source[-1] and "q=dev" in source[-1]
    assert client.get(url + "&offset=100").json()["offset"] == 100 and "offset=100" in source[-1]


@pytest.mark.integration
def test_match_is_project_scoped_owner_only_and_reports_source_errors(api_context, source, monkeypatch):
    client, csrf = api_context.client, _owner(api_context)
    pid, other = _project(api_context, csrf, "A"), _project(api_context, csrf, "B")
    rev = _upload(api_context, csrf, pid).json()["latest_revision"]["id"]
    _set_profile(api_context, rev, ["Python"])
    assert client.get(f"{PREFIX}/{other}/job-search/match?cv_revision_id={rev}").status_code == 404
    assert client.get(f"{PREFIX}/{pid}/job-search/match?cv_revision_id={uuid4()}").status_code == 404
    assert client.get(f"{PREFIX}/{pid}/job-search/match?cv_revision_id={rev}&pool=101").status_code == 422

    token = client.post(f"{PREFIX}/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["results:read"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    saved = dict(client.cookies)
    client.cookies.clear()
    try:
        grant = client.get(f"{PREFIX}/{pid}/job-search/match?cv_revision_id={rev}", headers={"Authorization": f"Bearer {token}"})
        assert grant.status_code in {401, 403}
        assert client.post(f"{PREFIX}/{pid}/cvs/{uuid4()}/profile", headers={"Authorization": f"Bearer {token}"}).status_code in {401, 403}
    finally:
        client.cookies.update(saved)

    cv_id = client.get(f"{PREFIX}/{pid}/cvs").json()[0]["id"]
    assert client.delete(f"{PREFIX}/{pid}/cvs/{cv_id}", headers=_write_headers(csrf)).status_code == 204
    assert client.get(f"{PREFIX}/{pid}/job-search/match?cv_revision_id={rev}").status_code == 404

    pid2 = _project(api_context, csrf, "C")
    rev2 = _upload(api_context, csrf, pid2).json()["latest_revision"]["id"]
    _set_profile(api_context, rev2, ["Python"])
    job_sources._cache.clear()

    def down(_url):
        raise job_sources.ServiceError("job_source_unavailable", retryable=True)

    monkeypatch.setattr(job_sources, "fetch_json", down)
    res = client.get(f"{PREFIX}/{pid2}/job-search/match?cv_revision_id={rev2}")
    assert res.status_code == 502 and res.json()["code"] == "job_source_unavailable"


@pytest.mark.integration
def test_profile_endpoint_queues_hidden_non_llm_run_once(api_context, source):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    cv = _upload(api_context, csrf, pid).json()
    queued = client.post(f"{PREFIX}/{pid}/cvs/{cv['id']}/profile", headers=headers)
    assert queued.status_code == 202, queued.text
    run = queued.json()
    assert run["operation"] == "profile_cv" and run["status"] == "queued" and run["session_id"] is None
    # A second request while one is active returns the same run; the run is hidden from the list.
    assert client.post(f"{PREFIX}/{pid}/cvs/{cv['id']}/profile", headers=headers).json()["id"] == run["id"]
    assert client.get(f"{PREFIX}/{pid}/runs/{run['id']}").status_code == 200
    assert client.get(f"{PREFIX}/{pid}/runs").json() == []
    with api_context.sessions() as db:
        row = db.get(Run, UUID(run["id"]))
        assert row.provider_configuration_id is None and row.job_revision_id is None and row.session_id is None
    _set_profile(api_context, cv["latest_revision"]["id"], ["Python"])
    ready = client.post(f"{PREFIX}/{pid}/cvs/{cv['id']}/profile", headers=headers)
    assert ready.status_code == 200 and ready.json() == {"status": "ready"}
    assert client.post(f"{PREFIX}/{pid}/cvs/{uuid4()}/profile", headers=headers).status_code == 404


def test_migration_0013_up_down_and_context_constraint(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))

    def migrate(fn, target):
        with postgres_engine.begin() as connection:
            config.attributes["connection"] = connection
            fn(config, target)

    migrate(command.upgrade, "head")
    with postgres_engine.begin() as c:
        cols = {r[0]: r[1] for r in c.execute(text(
            "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='runs' "
            "AND column_name IN ('session_id','job_revision_id','provider_configuration_id')"))}
        assert set(cols.values()) == {"YES"}
        assert c.execute(text("SELECT 1 FROM information_schema.columns WHERE table_name='cv_revisions' "
                              "AND column_name='skill_profile'")).first()
        names = {r[0] for r in c.execute(text("SELECT conname FROM pg_constraint WHERE conrelid='runs'::regclass"))}
        assert {"ck_runs_operation", "ck_runs_context_required"} <= names
    migrate(command.downgrade, "0012_global_provider_config")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT 1 FROM information_schema.columns WHERE table_name='cv_revisions' "
                              "AND column_name='skill_profile'")).first() is None
        assert c.execute(text("SELECT is_nullable FROM information_schema.columns WHERE table_name='runs' "
                              "AND column_name='session_id'")).scalar() == "NO"
    migrate(command.upgrade, "head")
