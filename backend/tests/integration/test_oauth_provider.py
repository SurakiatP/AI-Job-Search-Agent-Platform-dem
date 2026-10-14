"""FR-P03 provider behaviour against real PostgreSQL. Synthetic data only."""
from __future__ import annotations

import asyncio
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from mcp.server.auth.provider import AuthorizationParams, AuthorizeError, RegistrationError, TokenError
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from sqlalchemy import update
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.db.models import Grant
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.grants import Grants
from job_search_platform.services.oauth import OAuth

RESOURCE = "http://127.0.0.1:8766/mcp"
CB = "http://127.0.0.1:33418/callback"
VERIFIER = "v" * 64
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).decode().rstrip("=")


def _svc(engine):
    factory = sessionmaker(engine, expire_on_commit=False)
    return factory, OAuth(factory, issuer="http://127.0.0.1:8766", resource=RESOURCE, consent_url="http://127.0.0.1:8765/app/oauth/consent")


def _public_client(client_id="dcr-1"):
    return OAuthClientInformationFull(client_id=client_id, client_name="Synthetic client", redirect_uris=[AnyUrl(CB)],
                                      token_endpoint_auth_method="none", grant_types=["authorization_code", "refresh_token"],
                                      response_types=["code"])


async def _approved_code(factory, svc, client, capabilities=("results:read", "jobs:evaluate")):
    await svc.register_client(client)
    url = await svc.authorize(client, AuthorizationParams(state="s1", scopes=None, code_challenge=CHALLENGE,
                                                          redirect_uri=AnyUrl(CB), redirect_uri_provided_explicitly=True,
                                                          resource=RESOURCE))
    handle = parse_qs(urlsplit(url).query)["request"][0]
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
        grant = Grant(project_id=p.id, oauth_client_id=client.client_id, capabilities=list(capabilities),
                      expires_at=datetime.now(timezone.utc) + timedelta(days=1), label="Synthetic client")
        db.add(grant)
        db.flush()
        code = svc.issue_code(handle, grant.id, actor.user_id, db)
    return code, grant.id


@pytest.mark.integration
async def test_register_rejects_confidential_client(migrated_engine):
    _, svc = _svc(migrated_engine)
    secret_client = _public_client().model_copy(update={"token_endpoint_auth_method": "client_secret_post", "client_secret": "x"})
    with pytest.raises(RegistrationError):
        await svc.register_client(secret_client)
    bad = _public_client().model_copy(update={"redirect_uris": [AnyUrl("javascript:alert(1)//")]})
    with pytest.raises(RegistrationError) as caught:
        await svc.register_client(bad)
    assert caught.value.error == "invalid_redirect_uri"


@pytest.mark.integration
async def test_get_client_rejects_malformed_ids(migrated_engine):
    _, svc = _svc(migrated_engine)
    assert await svc.get_client("x" * 3000) is None
    assert await svc.get_client("a\x00b") is None


@pytest.mark.integration
async def test_authorize_requires_matching_resource_and_known_scopes(migrated_engine):
    _, svc = _svc(migrated_engine)
    client = _public_client()
    await svc.register_client(client)
    base = dict(state=None, code_challenge=CHALLENGE, redirect_uri=AnyUrl(CB), redirect_uri_provided_explicitly=True)
    for resource in (None, "http://127.0.0.1:8766/other"):
        with pytest.raises(AuthorizeError) as caught:
            await svc.authorize(client, AuthorizationParams(scopes=None, resource=resource, **base))
        assert caught.value.error == "invalid_target"
    with pytest.raises(AuthorizeError) as caught:
        await svc.authorize(client, AuthorizationParams(scopes=["admin"], resource=RESOURCE, **base))
    assert caught.value.error == "invalid_scope"
    for over in ({"state": "s" * 513}, {"code_challenge": "c" * 129}):
        with pytest.raises(AuthorizeError) as caught:
            await svc.authorize(client, AuthorizationParams(scopes=None, resource=RESOURCE, **{**base, **over}))
        assert caught.value.error == "invalid_request"
    url = await svc.authorize(client, AuthorizationParams(scopes=["results:read"], resource=RESOURCE + "/", **base))
    assert url.startswith("http://127.0.0.1:8765/app/oauth/consent?request=")


@pytest.mark.integration
async def test_code_exchange_access_token_and_refresh_rotation(migrated_engine):
    factory, svc = _svc(migrated_engine)
    client = _public_client()
    code, grant_id = await _approved_code(factory, svc, client)
    loaded = await svc.load_authorization_code(client, code)
    assert loaded.code_challenge == CHALLENGE and loaded.resource == RESOURCE
    tokens = await svc.exchange_authorization_code(client, loaded)
    assert tokens.access_token.startswith("jspo_") and tokens.refresh_token.startswith("jspr_")
    assert tokens.expires_in == 3600 and set(tokens.scope.split()) == {"results:read", "jobs:evaluate"}
    access = await svc.load_access_token(tokens.access_token)
    assert access.subject == str(grant_id) and access.resource == RESOURCE
    grants = Grants(factory, mcp_resource=RESOURCE)
    actor = await grants.authenticate(tokens.access_token, resource=RESOURCE)
    assert actor.kind == "grant" and actor.grant_id == grant_id
    with pytest.raises(ServiceError, match="unauthorized"):
        await grants.authenticate(tokens.access_token)  # A2A path: no resource
    old_refresh = await svc.load_refresh_token(client, tokens.refresh_token)
    rotated = await svc.exchange_refresh_token(client, old_refresh, old_refresh.scopes)
    assert rotated.refresh_token != tokens.refresh_token
    assert await svc.load_access_token(tokens.access_token) is None  # old pair revoked
    # reuse of the rotated-out refresh token revokes everything for the grant
    reused = await svc.load_refresh_token(client, tokens.refresh_token)
    with pytest.raises(TokenError):
        await svc.exchange_refresh_token(client, reused, reused.scopes)
    assert await svc.load_access_token(rotated.access_token) is None


@pytest.mark.integration
async def test_code_exchange_is_single_use_under_race(migrated_engine):
    factory, svc = _svc(migrated_engine)
    client = _public_client()
    code, _ = await _approved_code(factory, svc, client)
    loaded = await svc.load_authorization_code(client, code)
    results = await asyncio.gather(svc.exchange_authorization_code(client, loaded),
                                   svc.exchange_authorization_code(client, loaded), return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    assert len(ok) == 1 and isinstance([r for r in results if isinstance(r, Exception)][0], TokenError)
    assert await svc.load_access_token(ok[0].access_token) is None  # replay revoked the winner too
    with pytest.raises(TokenError):  # a later sequential replay is refused as well
        await svc.exchange_authorization_code(client, await svc.load_authorization_code(client, code))


@pytest.mark.integration
async def test_refresh_after_grant_revoke_is_rejected(migrated_engine):
    factory, svc = _svc(migrated_engine)
    client = _public_client()
    code, grant_id = await _approved_code(factory, svc, client)
    tokens = await svc.exchange_authorization_code(client, await svc.load_authorization_code(client, code))
    with factory.begin() as db:
        db.execute(update(Grant).where(Grant.id == grant_id).values(revoked_at=datetime.now(timezone.utc)))
    assert await svc.load_refresh_token(client, tokens.refresh_token) is None
    assert await svc.load_access_token(tokens.access_token) is None


@pytest.mark.integration
async def test_revoke_token_revokes_pair_but_keeps_grant(migrated_engine):
    factory, svc = _svc(migrated_engine)
    client = _public_client()
    code, grant_id = await _approved_code(factory, svc, client)
    tokens = await svc.exchange_authorization_code(client, await svc.load_authorization_code(client, code))
    await svc.revoke_token(await svc.load_access_token(tokens.access_token))
    assert await svc.load_refresh_token(client, tokens.refresh_token) is not None  # loads (revoked) for reuse detection
    with pytest.raises(TokenError):
        refresh = await svc.load_refresh_token(client, tokens.refresh_token)
        await svc.exchange_refresh_token(client, refresh, refresh.scopes)
    with factory() as db:
        assert db.get(Grant, grant_id).revoked_at is None


@pytest.mark.integration
async def test_cimd_client_is_fetched_once_and_cached(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    url = "https://client.example.test/oauth/client.json"
    calls = []

    async def fetch(client_id):
        calls.append(client_id)
        return _public_client(client_id)
    svc = OAuth(factory, issuer="http://127.0.0.1:8766", resource=RESOURCE, consent_url="http://127.0.0.1:8765/app/oauth/consent", fetch=fetch)
    assert (await svc.get_client(url)).client_id == url
    assert (await svc.get_client(url)).client_id == url
    assert calls == [url]
    assert await svc.get_client("unknown-dcr-id") is None
