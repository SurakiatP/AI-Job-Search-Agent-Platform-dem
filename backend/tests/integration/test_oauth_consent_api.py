"""FR-P03 owner consent REST. Synthetic data only."""
from __future__ import annotations

import asyncio
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from mcp.server.auth.provider import AuthorizationParams
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from sqlalchemy import select, update

from test_rest_api import _owner, _write_headers, api_context as _api_context_fixture
from job_search_platform.db.models import Grant, OAuthAuthorization
from job_search_platform.services.oauth import OAuth

RESOURCE = "http://127.0.0.1:8766/mcp"
CB = "http://127.0.0.1:33418/callback"
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(b"v" * 64).digest()).decode().rstrip("=")


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _api_context_fixture.__wrapped__(migrated_engine, tmp_path)


async def _request(services) -> str:
    client = OAuthClientInformationFull(client_id="dcr-consent", client_name="Synthetic client", redirect_uris=[AnyUrl(CB)],
                                        token_endpoint_auth_method="none", grant_types=["authorization_code", "refresh_token"],
                                        response_types=["code"])
    await services.oauth.register_client(client)
    url = await services.oauth.authorize(client, AuthorizationParams(
        state="st", scopes=["jobs:evaluate"], code_challenge=CHALLENGE, redirect_uri=AnyUrl(CB),
        redirect_uri_provided_explicitly=True, resource=RESOURCE))
    return parse_qs(urlsplit(url).query)["request"][0]


def _setup(api_context):
    services = api_context.client.app.state.services
    services.oauth = OAuth(api_context.sessions, issuer="http://127.0.0.1:8766", resource=RESOURCE,
                           consent_url="http://127.0.0.1:8765/app/oauth/consent")
    csrf = _owner(api_context)
    project = api_context.client.post("/v1/projects", json={"name": "Consent project"}, headers=_write_headers(csrf)).json()
    return services, csrf, project


@pytest.mark.integration
async def test_view_approve_creates_grant_and_redirects_with_code(api_context):
    services, csrf, project = await asyncio.to_thread(_setup, api_context)
    handle = await _request(services)
    client = api_context.client
    assert client.get(f"/v1/oauth/requests/{handle}").status_code == 200
    view = client.get(f"/v1/oauth/requests/{handle}").json()
    assert view["client_name"] == "Synthetic client" and view["client_id_host"] == "dcr-consent"
    assert view["requested_scopes"] == ["jobs:evaluate"] and any(p["id"] == project["id"] for p in view["projects"])
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    approved = client.post(f"/v1/oauth/requests/{handle}/approve", headers=_write_headers(csrf),
                           json={"project_id": project["id"], "capabilities": ["jobs:evaluate", "results:read"], "expires_at": expires})
    assert approved.status_code == 200
    query = parse_qs(urlsplit(approved.json()["redirect_url"]).query)
    assert approved.json()["redirect_url"].startswith(CB)
    assert query["state"] == ["st"] and query["iss"] == ["http://127.0.0.1:8766"] and len(query["code"][0]) > 20
    with api_context.sessions() as db:
        grant = db.scalar(select(Grant).where(Grant.oauth_client_id == "dcr-consent"))
        assert grant.label == "Synthetic client" and grant.token_hash is None
        assert sorted(grant.capabilities) == ["jobs:evaluate", "results:read"]
    # the handle is spent
    assert client.get(f"/v1/oauth/requests/{handle}").status_code == 404
    assert client.post(f"/v1/oauth/requests/{handle}/approve", headers=_write_headers(csrf),
                       json={"project_id": project["id"], "capabilities": ["results:read"], "expires_at": expires}).status_code == 404


@pytest.mark.integration
async def test_deny_redirects_access_denied(api_context):
    services, csrf, _ = await asyncio.to_thread(_setup, api_context)
    handle = await _request(services)
    denied = api_context.client.post(f"/v1/oauth/requests/{handle}/deny", headers=_write_headers(csrf))
    assert denied.status_code == 200
    query = parse_qs(urlsplit(denied.json()["redirect_url"]).query)
    assert query["error"] == ["access_denied"] and query["state"] == ["st"]
    assert api_context.client.get(f"/v1/oauth/requests/{handle}").status_code == 404


@pytest.mark.integration
async def test_expired_request_and_bad_body(api_context):
    services, csrf, project = await asyncio.to_thread(_setup, api_context)
    handle = await _request(services)
    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    bad = api_context.client.post(f"/v1/oauth/requests/{handle}/approve", headers=_write_headers(csrf),
                                  json={"project_id": project["id"], "capabilities": [], "expires_at": expires})
    assert bad.status_code in {400, 422}
    with api_context.sessions.begin() as db:
        db.execute(update(OAuthAuthorization).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    assert api_context.client.get(f"/v1/oauth/requests/{handle}").status_code == 404


@pytest.mark.integration
async def test_approve_foreign_project_is_not_found(api_context):
    services, csrf, _ = await asyncio.to_thread(_setup, api_context)
    from helpers import owner, project as make_project
    with api_context.sessions.begin() as db:
        foreign = make_project(db, owner=owner(db))
    handle = await _request(services)
    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    response = api_context.client.post(f"/v1/oauth/requests/{handle}/approve", headers=_write_headers(csrf),
                                       json={"project_id": str(foreign.id), "capabilities": ["results:read"], "expires_at": expires})
    assert response.status_code == 404
    assert api_context.client.get(f"/v1/oauth/requests/{handle}").status_code == 200  # still pending


@pytest.mark.integration
def test_consent_routes_require_owner_session_and_csrf(api_context):
    client = api_context.client
    assert client.get("/v1/oauth/requests/x").status_code == 401
    _owner(api_context)
    assert client.post("/v1/oauth/requests/abc/deny").status_code == 403  # no CSRF


@pytest.mark.integration
def test_consent_routes_404_when_oauth_disabled(api_context):
    csrf = _owner(api_context)
    api_context.client.app.state.services.oauth = None
    client, headers = api_context.client, _write_headers(csrf)
    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert client.get("/v1/oauth/requests/x").status_code == 404
    assert client.post("/v1/oauth/requests/x/approve", headers=headers,
                       json={"project_id": "00000000-0000-0000-0000-000000000001", "capabilities": ["results:read"],
                             "expires_at": expires}).status_code == 404
    assert client.post("/v1/oauth/requests/x/deny", headers=headers).status_code == 404
