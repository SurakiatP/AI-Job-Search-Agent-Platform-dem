"""One user must never read or change another user's project data."""
from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from a2a.client import A2AClientError, ClientConfig, create_client
from a2a.types import GetTaskRequest
from mcp.shared.exceptions import MCPError
from sqlalchemy import select

from job_search_platform.db.models import Approval, CVRevision, ConversationSession, Project, ResumeDraft, WebhookDelivery
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import job_sources
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.skill_coverage import METHOD as SKILL_METHOD
from helpers import login_cookie, user as make_user
from test_mcp import _session as mcp_session
from test_rest_api import (
    _removal_project, _seed_completed_run, _seed_document, _write_headers,
    api_context as _base_api_context,
)
from test_surface_parity import _issue_grant, _start_shared, _stop_shared

pytestmark = pytest.mark.integration  # needs MinIO and Postgres

BASE = "/api/v1"
ALICE_SESSION_TITLE = "Alice private session"
ALICE_PROJECT_NAME = "Alice private project"


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _base_api_context.__wrapped__(migrated_engine, tmp_path)


@pytest.fixture(autouse=True)
def _accounts(api_context):
    """The shared REST test context predates accounts; add the service the /account routes need."""
    services = api_context.client.app.state.services
    services.accounts = Accounts(services.sessions, services.owner_sessions, MemoryMailer(),
                                 public_origin="http://127.0.0.1:8765")


def _login(context, user_id) -> str:
    cookie, csrf = login_cookie(context.client.app.state.services, user_id)
    context.client.cookies.clear()
    context.client.cookies.set("jsp_owner_session", cookie)
    return csrf


def _alice_state(api_context, project_id: str) -> tuple[str, dict[str, str]]:
    """Alice's project name and every session title, read straight from the database."""
    with api_context.sessions() as db:
        name = db.get(Project, UUID(project_id)).name
        titles = {str(i): t for i, t in db.execute(select(ConversationSession.id, ConversationSession.title)
                                                   .where(ConversationSession.project_id == UUID(project_id)))}
    return name, titles


@pytest.fixture
def world(api_context, monkeypatch):
    """Alice owns a full project; Bob is a second verified user with his own project."""
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    with api_context.sessions.begin() as db:
        alice, bob = make_user(db), make_user(db)
    csrf_alice = _login(api_context, alice.user_id)
    project_id, session_id = _removal_project(api_context, csrf_alice)
    with api_context.sessions.begin() as db:
        db.get(ConversationSession, UUID(session_id)).title = ALICE_SESSION_TITLE
        db.get(Project, UUID(project_id)).name = ALICE_PROJECT_NAME
    run_id = _seed_completed_run(api_context, project_id, session_id, key="iso-run")  # terminal, so the SSE events route ends
    doc = _seed_document(api_context, project_id, "alice.pdf", run_id=run_id)
    job_id = api_context.client.get(f"{BASE}/projects/{project_id}/jobs").json()[0]["id"]
    with api_context.sessions.begin() as db:
        approval = Approval(project_id=UUID(project_id), run_id=run_id, action="delete_document_revision",
                            revision_id=doc.revision, change_digest="c" * 64,
                            token_hash=hashlib.sha256(b"iso").digest(),
                            expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        db.add(approval)
        db.flush()
        approval_id = approval.id
        cv_revision = db.scalar(select(CVRevision).where(CVRevision.project_id == UUID(project_id)))
        cv_revision.skill_profile = {"method": SKILL_METHOD, "skills": ["python"]}  # lets job-search/match run
        cv_id, cv_revision_id = cv_revision.cv_id, cv_revision.id
        # CV builder routes need a draft on Alice's CV and document (an uploaded CV has none).
        for owner in ({"cv_id": cv_id}, {"document_id": doc.document}):
            db.add(ResumeDraft(project_id=UUID(project_id), resume_data={}, template_id="onyx", accent="indigo",
                               document_language="th", **owner))
    alice_grant = _issue_grant(api_context, csrf_alice, UUID(project_id), ["results:read"])
    # Real rows for the remaining path parameters, so no URL falls back to a random id.
    item = api_context.client.post(f"{BASE}/projects/{project_id}/experience", headers=_write_headers(csrf_alice),
                                   json={"kind": "skill", "text": "Alice skill"})
    hidden = api_context.client.post(f"{BASE}/projects/{project_id}/job-search/hidden", headers=_write_headers(csrf_alice),
                                     json={"kind": "job", "value": "alice-job", "label": "Alice job"})
    assert item.status_code == 201 and hidden.status_code == 201, (item.text, hidden.text)
    saved = api_context.client.post(f"{BASE}/projects/{project_id}/saved-searches", headers=_write_headers(csrf_alice),
                                    json={"name": "Alice search", "filters": {"q": "python"}})
    assert saved.status_code == 201, saved.text
    hook = api_context.client.post(f"{BASE}/projects/{project_id}/webhooks", headers=_write_headers(csrf_alice),
                                   json={"url": "http://127.0.0.1:9/alice", "events": ["run.completed"]})
    assert hook.status_code == 201, hook.text
    with api_context.sessions.begin() as db:
        delivery = WebhookDelivery(project_id=UUID(project_id), endpoint_id=UUID(hook.json()["id"]), event_type="ping",
                                   status="dead", payload={})
        db.add(delivery)
        db.flush()
        delivery_id = delivery.id
    state = _alice_state(api_context, project_id)
    assert state == (ALICE_PROJECT_NAME, {session_id: ALICE_SESSION_TITLE})
    csrf_bob = _login(api_context, bob.user_id)
    bob_project, bob_session = _removal_project(api_context, csrf_bob)
    bob_run = _seed_completed_run(api_context, bob_project, bob_session, key="bob-run")
    return SimpleNamespace(
        csrf=csrf_bob, alice=alice, bob=bob, project=project_id, bob_project=UUID(bob_project),
        bob_session=bob_session, bob_run=str(bob_run), alice_csrf=csrf_alice, alice_state=state,
        ids={"project_id": project_id, "session_id": session_id, "cv_id": str(cv_id), "cv_revision_id": str(cv_revision_id), "job_id": job_id,
             "job_revision_id": job_id, "document_id": str(doc.document), "revision_id": str(doc.revision),
             "file_id": str(doc.file), "run_id": str(run_id), "grant_id": alice_grant["id"], "saved_search_id": saved.json()["id"],
             "webhook_id": hook.json()["id"], "delivery_id": str(delivery_id),
             "approval_id": str(approval_id), "item_id": item.json()["id"], "hidden_id": hidden.json()["id"],
             "adapter": "career_ops"},
    )


def test_bob_cannot_list_alice_projects(api_context, world):
    listed = api_context.client.get(f"{BASE}/projects").json()
    assert world.project not in {p["id"] for p in listed}
    assert [p["id"] for p in listed] == [str(world.bob_project)]


def _project_routes(client) -> list[tuple[str, str]]:
    spec = client.get("/openapi.json").json()
    return sorted((method.upper(), path) for path, item in spec["paths"].items() if "{project_id}" in path
                  for method in item if method in {"get", "post", "put", "patch", "delete"})


def _urls_and_calls(client, world, headers):
    """Yield (method, template, send) for every project route; ``send`` issues the request with
    placeholder bodies, then retries a 422 with a body built from the OpenAPI schema."""
    spec = client.get("/openapi.json").json()
    routes = _project_routes(client)
    assert len(routes) >= 40, len(routes)

    def _get(url, params=None):
        return client.get(url, params=params)

    def send_for(method, template):
        url = BASE + re.sub(r"\{(\w+)\}", lambda m: world.ids[m.group(1)], template)
        operation = spec["paths"][template][method.lower()]
        content = operation.get("requestBody", {}).get("content", {})

        def send():
            if method == "GET":
                response = _get(url)
                if response.status_code == 422:  # required query params, e.g. cv_revision_id
                    params = {p["name"]: world.ids[p["name"]] for p in operation.get("parameters", [])
                              if p["in"] == "query" and p.get("required")}
                    response = _get(url, params)
                return response
            if "multipart/form-data" in content:
                return client.request(method, url, files={"file": ("cv.txt", b"synthetic cv", "text/plain")}, headers=headers)
            response = client.request(method, url, json={}, headers=headers)
            if response.status_code == 422 and "application/json" in content:
                body = _example(spec, content["application/json"]["schema"])
                body = {**body, **_OVERRIDES.get((method, template), lambda ids: {})(world.ids)}
                response = client.request(method, url, json=body, headers=headers)
            return response
        return send

    return [(method, template, send_for(method, template)) for method, template in routes]


def test_bob_gets_404_on_every_alice_route(api_context, world):
    calls = _urls_and_calls(api_context.client, world, _write_headers(world.csrf))
    failures = []
    for method, template, send in calls:
        response = send()
        if response.status_code != 404:
            failures.append((method, template, response.status_code, response.text[:300]))
    assert not failures, "\n".join(map(str, failures))
    # Nothing of Alice's changed: same project name and the same session titles as before.
    assert _alice_state(api_context, world.project) == world.alice_state


def test_control_alice_urls_are_valid(api_context, world, monkeypatch):
    """Positive control: the exact Alice URLs Bob is denied work for Alice, so a 404 means authorization."""
    job_sources._cache.clear()  # job-search routes read the index; fake it so only authorization is under test
    monkeypatch.setattr(job_sources, "_search", lambda payload: {"hits": [], "estimatedTotalHits": 0,
                                                                  "facetDistribution": {}})
    _login(api_context, world.alice.user_id)
    calls = _urls_and_calls(api_context.client, world, _write_headers(world.alice_csrf))
    bad = []
    for method, template, send in calls:
        if method == "GET":
            response = send()
            if not 200 <= response.status_code < 300:
                bad.append((template, response.status_code, response.text[:200]))
    assert not bad, "\n".join(map(str, bad))


def test_control_bob_credentials_work_on_his_own_project(api_context, world):
    client, headers, pid = api_context.client, _write_headers(world.csrf), world.bob_project
    assert client.get(f"{BASE}/projects/{pid}").status_code == 200
    assert client.get(f"{BASE}/projects/{pid}/sessions").status_code == 200
    renamed = client.patch(f"{BASE}/projects/{pid}", json={"name": "Bob renamed"}, headers=headers)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Bob renamed"
    created = client.post(f"{BASE}/projects/{pid}/jobs", headers=headers,
                          json={"title": "Bob job", "company": "C", "description": "D"})
    assert created.status_code == 201, created.text


def _example(spec: dict, schema: dict):
    """Smallest value that satisfies the OpenAPI schema (required fields only)."""
    if "$ref" in schema:
        return _example(spec, spec["components"]["schemas"][schema["$ref"].rsplit("/", 1)[-1]])
    for key in ("anyOf", "oneOf"):
        if key in schema:
            return _example(spec, next((o for o in schema[key] if o.get("type") != "null"), schema[key][0]))
    if "allOf" in schema:
        return _example(spec, schema["allOf"][0])
    if "enum" in schema:
        return schema["enum"][0]
    kind, fmt = schema.get("type"), schema.get("format")
    if kind == "object" or "properties" in schema:
        props = schema.get("properties", {})
        return {k: _example(spec, props[k]) for k in schema.get("required", []) if k in props}
    if kind == "array":
        return [_example(spec, schema["items"])] * schema.get("minItems", 0)
    if kind == "integer":
        return max(schema.get("minimum", 0), 1)
    if kind == "boolean":
        return True
    if fmt == "date-time":
        return _FUTURE
    if fmt == "uuid":
        return str(uuid4())
    if fmt == "uri":
        return "https://jobs.example.test/x"
    return "x" * schema.get("minLength", 1)


_FUTURE = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

# Request models with cross-field validators that a required-fields-only example cannot satisfy.
_OVERRIDES = {
    ("POST", "/projects/{project_id}/agent/jobs/fit"): lambda ids: {"job_revision_id": ids["job_id"]},
    ("POST", "/projects/{project_id}/agent/applications/update"): lambda ids: {"job_id": ids["job_id"], "note": "x"},
    ("POST", "/projects/{project_id}/approvals"): lambda ids: {"action": "delete_document_revision", "revision_id": ids["revision_id"]},
    ("POST", "/projects/{project_id}/grants"): lambda ids: {"capabilities": ["results:read"]},
    ("POST", "/projects/{project_id}/runs/{run_id}/input"): lambda ids: {"answers": {"q": "a"}},
    ("POST", "/projects/{project_id}/jobs/{job_id}/application/events"): lambda ids: {"kind": "note", "text": "x"},
    ("PATCH", "/projects/{project_id}/saved-searches/{saved_search_id}"): lambda ids: {"digest_enabled": False},
    ("POST", "/projects/{project_id}/webhooks"): lambda ids: {"url": "http://127.0.0.1:9/x", "events": ["run.completed"]},
    ("PATCH", "/projects/{project_id}/webhooks/{webhook_id}"): lambda ids: {"enabled": False},
    ("POST", "/projects/{project_id}/sessions"): lambda ids: {"cv_revision_id": ids["cv_revision_id"], "job_revision_id": ids["job_id"]},
}


def _bob_grant(api_context, world, capabilities=("results:read",)) -> dict:
    return _issue_grant(api_context, world.csrf, world.bob_project, list(capabilities))


def test_agents_endpoint_is_per_user(api_context, world):
    mine = _bob_grant(api_context, world)
    agents = api_context.client.get(f"{BASE}/account/agents").json()
    assert {a["id"] for a in agents} == {mine["id"]}
    assert world.ids["grant_id"] not in {a["id"] for a in agents}


@pytest.mark.asyncio
async def test_bob_grant_cannot_reach_alice(api_context, world, unused_tcp_port):
    bob_grant = await asyncio.to_thread(
        _issue_grant, api_context, world.csrf, world.bob_project, ["results:read"])
    auth = {"Authorization": f"Bearer {bob_grant['token']}"}
    api_context.client.cookies.clear()
    own = api_context.client.get(f"{BASE}/projects/{world.bob_project}/runs/{world.bob_run}", headers=auth)
    assert own.status_code == 200, own.text
    rest = api_context.client.get(f"{BASE}/projects/{world.project}/runs/{world.ids['run_id']}", headers=auth)
    assert rest.status_code == 404, rest.text

    base_url, server, task = await _start_shared(api_context.client.app.state.services, unused_tcp_port)
    try:
        async with mcp_session(f"{base_url}/mcp/", bob_grant["token"]) as mcp:
            await mcp.initialize()
            visible = await mcp.call_tool("get_run", {"run_id": world.bob_run})
            assert not visible.is_error
            with pytest.raises(MCPError, match="not_found"):
                await mcp.call_tool("get_run", {"run_id": str(uuid4())})
            with pytest.raises(MCPError, match="not_found"):
                await mcp.call_tool("get_run", {"run_id": world.ids["run_id"]})
        a2a = await create_client(base_url, ClientConfig(
            streaming=False, supported_protocol_bindings=["JSONRPC"],
            httpx_client=httpx.AsyncClient(headers={**auth, "A2A-Version": "1.0"})))
        assert str((await a2a.get_task(GetTaskRequest(id=world.bob_run))).id) == world.bob_run
        # The foreign run must be indistinguishable from a run that does not exist.
        with pytest.raises(A2AClientError) as missing:
            await a2a.get_task(GetTaskRequest(id=str(uuid4())))
        with pytest.raises(A2AClientError) as denied:
            await a2a.get_task(GetTaskRequest(id=world.ids["run_id"]))
        assert str(denied.value) == str(missing.value) and str(denied.value), (denied.value, missing.value)
    finally:
        await _stop_shared(server, task)
