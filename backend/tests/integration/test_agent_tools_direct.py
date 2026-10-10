"""Direct (no Task) agent skills jobs_search and jobs_fit across REST, MCP and A2A. Synthetic data only."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import pytest
import uvicorn
from a2a.client import ClientCallContext, ClientConfig, create_client
from google.protobuf.json_format import MessageToDict
from mcp.shared.exceptions import MCPError
from sqlalchemy import func, select

from job_search_platform.api.shared import create_shared_app
from job_search_platform.db.models import CVRevisionText, Project, Run
from job_search_platform.services import job_sources

from helpers import revisions
from test_a2a import _message, _start_a2a, _stop_a2a
from test_mcp import _session
from test_rest_api import _owner, _write_headers, api_context as _base_api_context

CV_TEXT = "Skills: Python, Docker, PostgreSQL. Built REST APIs."
JOB_TEXT = "We need Python, Docker, Kubernetes and Redis experience."
RAW = {
    "public_slug": "synthetic-python-dev", "title": "Synthetic Python Dev", "company": "Example Co",
    "location": "Bangkok", "cities": ["Bangkok"], "work_mode": "remote", "posted_at": "2026-10-01",
    "reality": {"age_days": 9, "class": "stale"}, "url": "https://jobs.example.test/1?utm_source=x",
    "description": "# Role\n\nNeed **Python** and [Docker](https://x.test).\n\n- Ship APIs",
}


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _base_api_context.__wrapped__(migrated_engine, tmp_path)


@pytest.fixture(autouse=True)
def fake_source(monkeypatch):
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        return {"items": [job_sources.map_item(RAW)], "total": 1, "limit": kwargs["limit"], "offset": 0}

    monkeypatch.setattr(job_sources, "search_jobs", fake)
    return calls


def _project(api_context):
    csrf = _owner(api_context)
    created = api_context.client.post("/api/v1/projects", json={"name": "Synthetic direct project"},
                                      headers=_write_headers(csrf))
    project_id = UUID(created.json()["id"])
    with api_context.sessions.begin() as db:
        cv, _job = revisions(db, db.get(Project, project_id).id)
        db.add(CVRevisionText(cv_revision_id=cv.id, project_id=project_id, text=CV_TEXT))
    return csrf, project_id


def _grant(api_context, project_id, csrf, capabilities):
    response = api_context.client.post(
        f"/api/v1/projects/{project_id}/grants",
        json={"capabilities": capabilities,
              "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()},
        headers=_write_headers(csrf))
    assert response.status_code == 201, response.text
    return response.json()["token"]


def _as_grant(client, method, url, token, **kwargs):
    saved = dict(client.cookies)
    client.cookies.clear()
    try:
        return client.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs)
    finally:
        client.cookies.update(saved)


def _runs(api_context):
    with api_context.sessions() as db:
        return db.scalar(select(func.count()).select_from(Run))


def test_rest_search_full_description_age_stale_and_text_mode(api_context, fake_source):
    csrf, project_id = _project(api_context)
    token = _grant(api_context, project_id, csrf, ["jobs:search"])
    base = f"/api/v1/projects/{project_id}/agent/jobs/search"
    job = _as_grant(api_context.client, "GET", f"{base}?q=python&limit=30", token).json()["jobs"][0]
    assert job["description_format"] == "markdown" and job["description"] == RAW["description"]
    assert job["posting_age_days"] == 9 and job["stale"] is True
    assert job["source_id"] == "synthetic-python-dev" and job["city"] == "Bangkok"
    assert job["source_url"] == "https://jobs.example.test/1"
    assert fake_source[-1]["limit"] == 30 and fake_source[-1]["q"] == "python"
    text = _as_grant(api_context.client, "GET", f"{base}?description_format=text", token).json()["jobs"][0]
    assert text["description_format"] == "text"
    assert text["description"] == "Role\n\nNeed Python and Docker.\n\n- Ship APIs"
    assert _as_grant(api_context.client, "GET", f"{base}?limit=51", token).status_code == 422
    owner_view = api_context.client.get(base)
    assert owner_view.status_code == 200 and len(owner_view.json()["jobs"]) == 1


def test_rest_fit_is_deterministic_and_creates_no_run(api_context):
    csrf, project_id = _project(api_context)
    token = _grant(api_context, project_id, csrf, ["jobs:evaluate"])
    url = f"/api/v1/projects/{project_id}/agent/jobs/fit"
    body = {"job": {"title": "Synthetic dev", "description": JOB_TEXT}}
    before = _runs(api_context)
    first = _as_grant(api_context.client, "POST", url, token, json=body)
    second = _as_grant(api_context.client, "POST", url, token, json=body)
    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    result = first.json()
    assert result["method"] == "keyword_dictionary_v1"
    assert result["matched"] == ["Python", "Docker"] and result["missing"] == ["Kubernetes", "Redis"]
    assert result["ratio"] == 0.5
    thin = _as_grant(api_context.client, "POST", url, token, json={"job": {"title": "t", "description": "Python"}})
    assert thin.json() == {"method": "keyword_dictionary_v1", "ratio": None, "required": [], "matched": [],
                           "missing": [], "reason": "too_few_skills"}
    both = _as_grant(api_context.client, "POST", url, token,
                     json={**body, "job_revision_id": str(project_id)})
    assert both.status_code == 422
    assert _runs(api_context) == before


def test_rest_capability_denials(api_context):
    csrf, project_id = _project(api_context)
    evaluate_only = _grant(api_context, project_id, csrf, ["jobs:evaluate"])
    search_only = _grant(api_context, project_id, csrf, ["jobs:search"])
    search = f"/api/v1/projects/{project_id}/agent/jobs/search"
    fit = f"/api/v1/projects/{project_id}/agent/jobs/fit"
    body = {"job": {"title": "Synthetic dev", "description": JOB_TEXT}}
    assert _as_grant(api_context.client, "GET", search, evaluate_only).status_code == 403
    assert _as_grant(api_context.client, "POST", fit, search_only, json=body).status_code == 403
    assert _as_grant(api_context.client, "GET", search, "not-a-token").status_code == 401


def test_rest_grant_cannot_use_another_projects_path(api_context):
    csrf, project_id = _project(api_context)
    token = _grant(api_context, project_id, csrf, ["jobs:evaluate", "jobs:search"])
    other = UUID(api_context.client.post("/api/v1/projects", json={"name": "Other"}, headers=_write_headers(csrf)).json()["id"])
    body = {"job": {"title": "Synthetic dev", "description": JOB_TEXT}}
    assert _as_grant(api_context.client, "POST", f"/api/v1/projects/{other}/agent/jobs/fit", token, json=body).status_code == 404
    assert _as_grant(api_context.client, "GET", f"/api/v1/projects/{other}/agent/jobs/search", token).status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_and_a2a_direct_calls(api_context, unused_tcp_port):
    csrf, project_id = await asyncio.to_thread(_project, api_context)
    full = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:search", "jobs:evaluate"])
    search_only = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:search"])
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    before = await asyncio.to_thread(_runs, api_context)
    try:
        async with _session(f"{base_url}/mcp/", full) as session:
            await session.initialize()
            searched = await session.call_tool("jobs_search", {"request": {"q": "python", "description_format": "text"}})
            assert not searched.is_error
            job = searched.structured_content["jobs"][0]
            assert job["description"].startswith("Role") and job["posting_age_days"] == 9
            fitted = await session.call_tool("jobs_fit", {"request": {"job": {"title": "t", "description": JOB_TEXT}}})
            assert not fitted.is_error and fitted.structured_content["ratio"] == 0.5
            invalid = await session.call_tool("jobs_fit", {"request": {}})
            assert invalid.is_error
        async with _session(f"{base_url}/mcp/", search_only) as session:
            await session.initialize()
            with pytest.raises(MCPError, match="forbidden"):
                await session.call_tool("jobs_fit", {"request": {"job": {"title": "t", "description": JOB_TEXT}}})

        http_client = httpx.AsyncClient(headers={"Authorization": f"Bearer {full}", "A2A-Version": "1.0"})
        client = await create_client(base_url, ClientConfig(
            streaming=False, supported_protocol_bindings=["JSONRPC"], httpx_client=http_client))
        events = [e async for e in client.send_message(
            _message("jobs_fit", {"job": {"title": "t", "description": JOB_TEXT}}),
            context=ClientCallContext(service_parameters={"A2A-Version": "1.0"}))]
        assert events and all(e.HasField("message") and not e.HasField("task") for e in events)
        message = events[-1].message
        assert message.role == 2  # ROLE_AGENT
        data = MessageToDict(message.parts[0].data, preserving_proto_field_name=True)
        assert data["matched"] == ["Python", "Docker"] and data["ratio"] == 0.5

        extended = {}
        for label, token in (("search", search_only), ("full", full)):
            response = await httpx.AsyncClient().post(
                f"{base_url}/", json={"jsonrpc": "2.0", "id": 1, "method": "GetExtendedAgentCard", "params": {}},
                headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"})
            extended[label] = [s["id"] for s in response.json()["result"]["skills"]]
        assert extended["search"] == ["jobs_search"]
        assert extended["full"] == ["evaluate_job", "jobs_search", "jobs_fit"]
        weak = await create_client(base_url, ClientConfig(
            streaming=False, supported_protocol_bindings=["JSONRPC"],
            httpx_client=httpx.AsyncClient(headers={"Authorization": f"Bearer {search_only}", "A2A-Version": "1.0"})))
        with pytest.raises(Exception):
            [e async for e in weak.send_message(
                _message("jobs_fit", {"job": {"title": "t", "description": JOB_TEXT}}),
                context=ClientCallContext(service_parameters={"A2A-Version": "1.0"}))]
        assert await asyncio.to_thread(_runs, api_context) == before
    finally:
        await _stop_a2a(server, server_task)
