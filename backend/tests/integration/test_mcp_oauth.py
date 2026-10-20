"""FR-P03 end to end over a real shared listener: discovery, DCR, consent, PKCE token, MCP call, revoke."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import httpx
import pytest
import uvicorn

from job_search_platform.api.shared import create_shared_app
from job_search_platform.services import rate_limits
from job_search_platform.services.grants import Grants
from job_search_platform.services.oauth import OAuth, validate_cimd
from test_rest_api import _owner, _write_headers, api_context as _api_context_fixture

CB = "http://127.0.0.1:33418/callback"


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _api_context_fixture.__wrapped__(migrated_engine, tmp_path)


async def _serve(app, port):
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, lifespan="on", access_log=False, log_level="error"))
    task = asyncio.create_task(server.serve())
    async with asyncio.timeout(10):
        while not server.started:
            if task.done():
                await task
            await asyncio.sleep(0.02)
    return server, task


async def _flow(api_context, port, *, register=True, client_id=None, fetch=None):
    origin = f"http://127.0.0.1:{port}"
    services = api_context.client.app.state.services
    services.oauth = OAuth(api_context.sessions, issuer=origin, resource=f"{origin}/mcp",
                           consent_url="http://127.0.0.1:8765/app/oauth/consent", **({"fetch": fetch} if fetch else {}))
    services.grants = Grants(api_context.sessions, mcp_resource=f"{origin}/mcp")
    csrf = await asyncio.to_thread(_owner, api_context)
    project = api_context.client.post("/v1/projects", json={"name": "OAuth project"}, headers=_write_headers(csrf)).json()
    server, task = await _serve(create_shared_app(services, host="127.0.0.1", port=port), port)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    async with httpx.AsyncClient(base_url=origin, trust_env=False) as http:
        unauth = await http.post("/mcp/", json={})
        assert unauth.status_code == 401
        assert f'resource_metadata="{origin}/.well-known/oauth-protected-resource/mcp"' in unauth.headers["www-authenticate"]
        prm = (await http.get("/.well-known/oauth-protected-resource/mcp")).json()
        assert prm["resource"] == f"{origin}/mcp" and prm["authorization_servers"] == [origin]
        meta = (await http.get("/.well-known/oauth-authorization-server")).json()
        assert meta["token_endpoint_auth_methods_supported"] == ["none"]
        assert meta["authorization_response_iss_parameter_supported"] is True
        assert meta["client_id_metadata_document_supported"] is True and meta["code_challenge_methods_supported"] == ["S256"]
        if register:
            reg = await http.post("/register", json={"client_name": "Synthetic DCR", "redirect_uris": [CB],
                                                     "token_endpoint_auth_method": "none"})
            assert reg.status_code == 201
            client_id = reg.json()["client_id"]
        auth = await http.get("/authorize", params={"client_id": client_id, "response_type": "code", "redirect_uri": CB,
                                                    "code_challenge": challenge, "code_challenge_method": "S256",
                                                    "state": "s", "resource": f"{origin}/mcp"})
        assert auth.status_code == 302
        bad = await http.get("/authorize", params={"client_id": "https://[abc/x", "response_type": "code", "redirect_uri": CB})
        assert bad.status_code < 500
        handle = parse_qs(urlsplit(auth.headers["location"]).query)["request"][0]
        expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        approved = api_context.client.post(f"/v1/oauth/requests/{handle}/approve", headers=_write_headers(csrf),
                                           json={"project_id": project["id"], "capabilities": ["results:read"], "expires_at": expires})
        code = parse_qs(urlsplit(approved.json()["redirect_url"]).query)["code"][0]
        token = await http.post("/token", data={"grant_type": "authorization_code", "code": code, "redirect_uri": CB,
                                                "client_id": client_id, "code_verifier": verifier, "resource": f"{origin}/mcp"})
        assert token.status_code == 200, token.text
        tokens = token.json()
    return server, task, origin, csrf, project, tokens, client_id


async def _mcp_list_tools(origin, access):
    from mcp.client.session import ClientSession
    from mcp.client.streamable_http import streamable_http_client
    from mcp.shared._httpx_utils import create_mcp_http_client
    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {access}"})
    async with streamable_http_client(f"{origin}/mcp/", http_client=http_client) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return {tool.name for tool in (await session.list_tools()).tools}


@pytest.mark.integration
async def test_dcr_flow_mcp_call_and_revocation(api_context, unused_tcp_port):
    server, task, origin, csrf, project, tokens, _ = await _flow(api_context, unused_tcp_port)
    try:
        assert "list_results" in await _mcp_list_tools(origin, tokens["access_token"])
        async with httpx.AsyncClient(base_url=origin, trust_env=False) as http:
            a2a = await http.post("/", json={"jsonrpc": "2.0", "id": 1, "method": "tasks/list", "params": {}},
                                  headers={"Authorization": f"Bearer {tokens['access_token']}"})
            assert a2a.status_code == 401 or "error" in a2a.json()  # A2A refuses OAuth tokens
        agents = api_context.client.get(f"/v1/projects/{project['id']}/grants").json()  # test context has no Accounts service
        agent = next(a for a in agents if a["label"] == "Synthetic DCR")
        api_context.client.delete(f"/v1/projects/{project['id']}/grants/{agent['id']}", headers=_write_headers(csrf))
        async with httpx.AsyncClient(base_url=origin, trust_env=False) as http:
            after = await http.post("/mcp/", json={}, headers={"Authorization": f"Bearer {tokens['access_token']}"})
            assert after.status_code == 401 and 'error="invalid_token"' in after.headers["www-authenticate"]
    finally:
        server.should_exit = True
        await task


@pytest.mark.integration
async def test_cimd_flow(api_context, unused_tcp_port):
    # The network fetch and its SSRF guard are unit-tested (test_oauth_cimd.py); here the document is served in-process.
    client_id = "https://client.example.test/oauth/client.json"
    fetched = []

    async def fake_fetch(url):
        fetched.append(url)
        return validate_cimd(url, {"client_id": url, "client_name": "Synthetic CIMD", "redirect_uris": [CB],
                                   "token_endpoint_auth_method": "none"})
    server, task, origin, _csrf, _project, tokens, _ = await _flow(api_context, unused_tcp_port, register=False,
                                                                 client_id=client_id, fetch=fake_fetch)
    try:
        assert fetched == [client_id]  # fetched once, then served from oauth_clients
        assert "list_results" in await _mcp_list_tools(origin, tokens["access_token"])
    finally:
        server.should_exit = True
        await task


@pytest.mark.integration
async def test_register_rate_limit_and_confidential_rejected(api_context, unused_tcp_port):
    server, task, origin, *_ = await _flow(api_context, unused_tcp_port)
    try:
        async with httpx.AsyncClient(base_url=origin, trust_env=False) as http:
            confidential = await http.post("/register", json={"client_name": "x", "redirect_uris": [CB]})
            assert confidential.status_code == 400  # SDK defaults to client_secret_post; we refuse
            codes = [(await http.post("/register", json={"client_name": "x", "redirect_uris": [CB],
                                                         "token_endpoint_auth_method": "none"})).status_code for _ in range(25)]
            assert 429 in codes
    finally:
        server.should_exit = True
        await task


@pytest.mark.integration
async def test_insecure_issuer_leaves_oauth_off(api_context, unused_tcp_port):
    services = api_context.client.app.state.services
    services.oauth = OAuth(api_context.sessions, issuer="http://192.0.2.10:9", resource="http://192.0.2.10:9/mcp",
                           consent_url="http://127.0.0.1:8765/app/oauth/consent")
    server, task = await _serve(create_shared_app(services, host="127.0.0.1", port=unused_tcp_port), unused_tcp_port)
    try:
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{unused_tcp_port}", trust_env=False) as http:
            assert (await http.get("/.well-known/oauth-authorization-server")).status_code == 404
            unauth = await http.post("/mcp/", json={})
            assert unauth.status_code == 401 and "resource_metadata" not in unauth.headers.get("www-authenticate", "")
    finally:
        server.should_exit = True
        await task


@pytest.mark.integration
async def test_public_host_and_authorize_rate_limit(api_context, unused_tcp_port, monkeypatch):
    monkeypatch.setitem(rate_limits.LIMITS, "oauth_authorize_ip", (3, 3600))
    server, task, origin, _, _, tokens, _ = await _flow(api_context, unused_tcp_port)
    services = api_context.client.app.state.services
    services.oauth.issuer = "https://agents.example.test"
    server2, task2 = await _serve(create_shared_app(services, host="127.0.0.1", port=unused_tcp_port + 1), unused_tcp_port + 1)
    try:
        async with httpx.AsyncClient(base_url=origin, trust_env=False) as http:
            codes = [(await http.get("/authorize", params={"client_id": "x"})).status_code for _ in range(5)]
            assert codes[0] != 429 and codes[-1] == 429  # the flow already spent two hits
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{unused_tcp_port + 1}", trust_env=False) as http:
            auth = {"authorization": f"Bearer {tokens['access_token']}"}
            ok = await http.post("/mcp/", json={}, headers={**auth, "host": "agents.example.test"})
            evil = await http.post("/mcp/", json={}, headers={**auth, "host": "evil.example.test"})
            assert ok.status_code != 421 and evil.status_code == 421  # Host check, not the (empty) body, decides
    finally:
        server.should_exit = server2.should_exit = True
        await task
        await task2


@pytest.mark.integration
async def test_agent_card_served_on_public_host(api_context, unused_tcp_port):
    services = api_context.client.app.state.services
    services.oauth = OAuth(api_context.sessions, issuer="https://agents.example.test", resource="https://agents.example.test/mcp",
                           consent_url="http://127.0.0.1:8765/app/oauth/consent")
    server, task = await _serve(create_shared_app(services, host="127.0.0.1", port=unused_tcp_port), unused_tcp_port)
    try:
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{unused_tcp_port}", trust_env=False) as http:
            public = await http.get("/.well-known/agent-card.json", headers={"host": "agents.example.test"})
            assert public.status_code == 200 and "https://agents.example.test" in public.text and "127.0.0.1" not in public.text
            assert (await http.get("/.well-known/agent-card.json")).status_code == 200  # bind authority still works
            assert (await http.get("/.well-known/agent-card.json", headers={"host": "evil.example.test"})).status_code == 400
    finally:
        server.should_exit = True
        await task


@pytest.mark.integration
async def test_issuer_with_path_leaves_oauth_off(api_context, unused_tcp_port):
    services = api_context.client.app.state.services
    services.oauth = OAuth(api_context.sessions, issuer="https://agents.example.test/base", resource="https://agents.example.test/base/mcp",
                           consent_url="http://127.0.0.1:8765/app/oauth/consent")
    server, task = await _serve(create_shared_app(services, host="127.0.0.1", port=unused_tcp_port), unused_tcp_port)
    try:
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{unused_tcp_port}", trust_env=False) as http:
            assert (await http.get("/.well-known/oauth-authorization-server")).status_code == 404
    finally:
        server.should_exit = True
        await task
