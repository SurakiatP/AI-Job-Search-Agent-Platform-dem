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

from job_search_platform.db.models import Approval, CVRevision, ConversationSession, Project
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services.accounts import Accounts
from helpers import login_cookie, session as make_session, user as make_user
from test_mcp import _session as mcp_session
from test_rest_api import (
    _removal_project, _seed_completed_run, _seed_document, _write_headers,
    api_context as _base_api_context,
)
from test_surface_parity import _issue_grant, _start_shared, _stop_shared

BASE = "/api/v1"
ALICE_SESSION_TITLE = "Alice private session"


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


@pytest.fixture
def world(api_context):
    """Alice owns a full project; Bob is a second verified user with his own project."""
    with api_context.sessions.begin() as db:
        alice, bob = make_user(db), make_user(db)
    csrf_alice = _login(api_context, alice.user_id)
    project_id, session_id = _removal_project(api_context, csrf_alice)
    with api_context.sessions.begin() as db:
        db.get(ConversationSession, UUID(session_id)).title = ALICE_SESSION_TITLE
    run_id = _seed_completed_run(api_context, project_id, session_id, status="waiting_approval", key="iso-run")
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
        cv_id, cv_revision_id = cv_revision.cv_id, cv_revision.id
    alice_grant = _issue_grant(api_context, csrf_alice, UUID(project_id), ["results:read"])
    csrf_bob = _login(api_context, bob.user_id)
    bob_project = api_context.client.post(f"{BASE}/projects", json={"name": "Bob project"},
                                          headers=_write_headers(csrf_bob)).json()["id"]
    return SimpleNamespace(
        csrf=csrf_bob, alice=alice, bob=bob, project=project_id, bob_project=UUID(bob_project),
        ids={"project_id": project_id, "session_id": session_id, "cv_id": str(cv_id), "cv_revision_id": str(cv_revision_id), "job_id": job_id,
             "job_revision_id": job_id, "document_id": str(doc.document), "revision_id": str(doc.revision),
             "file_id": str(doc.file), "run_id": str(run_id), "grant_id": alice_grant["id"],
             "approval_id": str(approval_id)},
    )


def test_bob_cannot_list_alice_projects(api_context, world):
    listed = api_context.client.get(f"{BASE}/projects").json()
    assert world.project not in {p["id"] for p in listed}
    assert [p["name"] for p in listed] == ["Bob project"]


def _project_routes(client) -> list[tuple[str, str]]:
    spec = client.get("/openapi.json").json()
    return sorted((method.upper(), path) for path, item in spec["paths"].items() if "{project_id}" in path
                  for method in item if method in {"get", "post", "put", "patch", "delete"})


def test_bob_gets_404_on_every_alice_route(api_context, world):
    client = api_context.client
    routes = _project_routes(client)
    assert len(routes) >= 40, len(routes)
    headers = _write_headers(world.csrf)
    skipped, failures = [], []

    spec = client.get("/openapi.json").json()

    def query(method, template):
        """Required query parameters (e.g. cv_revision_id) a GET needs to get past validation."""
        found = spec["paths"][template][method.lower()].get("parameters", [])
        return {p["name"]: world.ids.get(p["name"], str(uuid4())) for p in found if p["in"] == "query" and p.get("required")}

    def call(method, template, url):
        if method == "GET":
            return client.get(url)
        content = spec["paths"][template][method.lower()].get("requestBody", {}).get("content", {})
        if "application/json" in content:
            # First pass sends {} as the brief says; a 422 is retried below with a valid body.
            return client.request(method, url, json={}, headers=headers)
        if "multipart/form-data" in content:
            return client.request(method, url, files={"file": ("cv.txt", b"synthetic cv", "text/plain")}, headers=headers)
        return client.request(method, url, json={}, headers=headers)

    for method, template in routes:
        url = BASE + re.sub(r"\{(\w+)\}", lambda m: world.ids.get(m.group(1), "career_ops" if m.group(1) == "adapter" else str(uuid4())), template)
        response = call(method, template, url)
        if response.status_code == 422 and method == "GET":
            response = client.get(url, params=query(method, template))
        elif response.status_code == 422:
            # Validation ran before authorization: retry with a well-formed body from the schema.
            content = spec["paths"][template][method.lower()].get("requestBody", {}).get("content", {})
            if "application/json" not in content:
                skipped.append((method, template))
                continue
            body = _example(spec, content["application/json"]["schema"])
            body = {**body, **_OVERRIDES.get((method, template), lambda ids: {})(world.ids)}
            response = client.request(method, url, json=body, headers=headers)
        if response.status_code != 404:
            failures.append((method, template, response.status_code, response.text[:300]))
    assert not failures, "\n".join(map(str, failures))
    assert not skipped, skipped
    with api_context.sessions() as db:
        assert db.get(Project, UUID(world.project)).name is not None
        assert db.scalar(select(ConversationSession.title).where(
            ConversationSession.id == UUID(world.ids["session_id"]))) == ALICE_SESSION_TITLE


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
    ("POST", "/projects/{project_id}/approvals"): lambda ids: {"action": "delete_document_revision", "revision_id": ids["revision_id"]},
    ("POST", "/projects/{project_id}/grants"): lambda ids: {"capabilities": ["results:read"]},
    ("POST", "/projects/{project_id}/runs/{run_id}/input"): lambda ids: {"answers": {"q": "a"}},
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
    bob_grant = await asyncio.to_thread(_bob_grant, api_context, world)
    auth = {"Authorization": f"Bearer {bob_grant['token']}"}
    api_context.client.cookies.clear()
    rest = api_context.client.get(f"{BASE}/projects/{world.project}/runs/{world.ids['run_id']}", headers=auth)
    assert rest.status_code == 404, rest.text

    base_url, server, task = await _start_shared(api_context.client.app.state.services, unused_tcp_port)
    try:
        async with mcp_session(f"{base_url}/mcp/", bob_grant["token"]) as mcp:
            await mcp.initialize()
            with pytest.raises(MCPError):
                await mcp.call_tool("get_run", {"run_id": world.ids["run_id"]})
        a2a = await create_client(base_url, ClientConfig(
            streaming=False, supported_protocol_bindings=["JSONRPC"],
            httpx_client=httpx.AsyncClient(headers={**auth, "A2A-Version": "1.0"})))
        with pytest.raises(A2AClientError):
            await a2a.get_task(GetTaskRequest(id=world.ids["run_id"]))
    finally:
        await _stop_shared(server, task)
