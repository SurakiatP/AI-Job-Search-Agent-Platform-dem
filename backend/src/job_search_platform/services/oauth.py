"""OAuth 2.1 authorization server for MCP (TOR FR-P03): CIMD/DCR clients, consent-backed grants, opaque tokens."""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
from mcp.server.auth.provider import (AccessToken, AuthorizationCode, AuthorizationParams, AuthorizeError,
                                      RefreshToken, RegistrationError, TokenError)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import ValidationError
from sqlalchemy import select, update

from job_search_platform.db.models import Grant, OAuthAuthorization, OAuthClient
from job_search_platform.db.models import OAuthToken as OAuthTokenRow
from job_search_platform.services import webhooks
from job_search_platform.services.authorization import GRANT_CAPABILITIES
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import token_hash

logger = logging.getLogger(__name__)

ACCESS_TTL = 3600
REQUEST_TTL = timedelta(minutes=10)
CODE_TTL = timedelta(seconds=60)
CIMD_TTL = timedelta(hours=24)
CIMD_MAX_BYTES = 5120
CIMD_DEADLINE = 5.0


def is_cimd_client_id(client_id: str) -> bool:
    parts = urlsplit(client_id)
    return (parts.scheme == "https" and bool(parts.hostname) and parts.path not in {"", "/"}
            and not parts.username and not parts.password and not parts.fragment)


def resource_matches(requested: str | None, resource: str) -> bool:
    return requested is not None and requested.rstrip("/") == resource


_LOOPBACK = {"127.0.0.1", "localhost", "::1"}
_BAD_SCHEMES = {"javascript", "data", "file", "vbscript", "blob", "about", "ftp"}


def redirect_uris_ok(uris) -> bool:
    """https anywhere, http only on loopback, other schemes only as private-use (RFC 8252); never script/data/file."""
    if not uris:
        return False
    for uri in uris:
        parts = urlsplit(str(uri))
        scheme = parts.scheme.lower()
        if scheme == "https":
            ok = bool(parts.hostname)
        elif scheme == "http":
            ok = parts.hostname in _LOOPBACK
        else:
            ok = bool(scheme) and scheme not in _BAD_SCHEMES
        if not ok:
            return False
    return True


def validate_cimd(client_id: str, document: dict) -> OAuthClientInformationFull:
    if not isinstance(document, dict) or document.get("client_id") != client_id:
        raise ValueError("client_id_mismatch")
    if "client_secret" in document or document.get("token_endpoint_auth_method", "none") != "none":
        raise ValueError("not_public")
    try:
        info = OAuthClientInformationFull.model_validate({**document, "token_endpoint_auth_method": "none"})
    except ValidationError:
        raise ValueError("invalid_metadata") from None
    if not redirect_uris_ok(info.redirect_uris) or "authorization_code" not in info.grant_types:
        raise ValueError("invalid_metadata")
    return info


async def fetch_cimd(client_id: str, *, transport: httpx.AsyncBaseTransport | None = None) -> OAuthClientInformationFull | None:
    """Fetch and validate a Client ID Metadata Document. Never raises; logs only the failure class."""
    verdict = await webhooks.check_url(client_id)
    if verdict != "ok":
        logger.warning("cimd fetch refused: %s", verdict)
        return None
    try:
        async with asyncio.timeout(CIMD_DEADLINE):
            async with httpx.AsyncClient(follow_redirects=False, trust_env=False, timeout=CIMD_DEADLINE,
                                         transport=transport) as client:
                async with client.stream("GET", client_id, headers={"Accept": "application/json"}) as response:
                    if response.status_code != 200:
                        logger.warning("cimd fetch refused: http_%s", response.status_code)
                        return None
                    body = b""
                    async for chunk in response.aiter_bytes():
                        body += chunk
                        if len(body) > CIMD_MAX_BYTES:
                            logger.warning("cimd fetch refused: too_large")
                            return None
        return validate_cimd(client_id, json.loads(body))
    except (TimeoutError, httpx.HTTPError):
        logger.warning("cimd fetch refused: unreachable")
    except ValueError:  # json.JSONDecodeError, UnicodeDecodeError and validate_cimd failures
        logger.warning("cimd fetch refused: invalid")
    return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _digest(value: str) -> bytes | None:
    try:
        return token_hash(value)
    except ServiceError:
        return None


class OAuth:
    def __init__(self, sessions, *, resource: str, consent_url: str, fetch=fetch_cimd):
        self.sessions = sessions
        self.resource = resource
        self.consent_url = consent_url
        self.fetch = fetch

    # -- clients ------------------------------------------------------------------------------
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        def cached():
            with self.sessions() as db:
                return db.get(OAuthClient, client_id)
        row = await asyncio.to_thread(cached)
        if row is not None and (row.kind == "dcr" or row.fetched_at > _now() - CIMD_TTL):
            return OAuthClientInformationFull.model_validate(row.client_info)
        if not is_cimd_client_id(client_id):
            return None
        info = await self.fetch(client_id)
        if info is None:
            return None

        def upsert():
            with self.sessions.begin() as db:
                current = db.get(OAuthClient, client_id, with_for_update=True)
                data = info.model_dump(mode="json")
                if current is None:
                    db.add(OAuthClient(client_id=client_id, kind="cimd", client_info=data, fetched_at=_now()))
                else:
                    current.client_info, current.fetched_at = data, _now()
        await asyncio.to_thread(upsert)
        return info

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.token_endpoint_auth_method != "none" or client_info.client_secret:
            raise RegistrationError("invalid_client_metadata", "only public clients (token_endpoint_auth_method none) are supported")
        if not redirect_uris_ok(client_info.redirect_uris):
            raise RegistrationError("invalid_redirect_uri", "redirect_uris must be https, loopback http, or private-use schemes")

        def add():
            with self.sessions.begin() as db:
                db.add(OAuthClient(client_id=client_info.client_id, kind="dcr", client_info=client_info.model_dump(mode="json")))
        await asyncio.to_thread(add)

    # -- authorization ------------------------------------------------------------------------
    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if not resource_matches(params.resource, self.resource):
            raise AuthorizeError("invalid_target", "resource must be this MCP server")
        if params.scopes and not set(params.scopes) <= GRANT_CAPABILITIES:
            raise AuthorizeError("invalid_scope", "unknown scope")
        handle = secrets.token_urlsafe(32)

        def add():
            with self.sessions.begin() as db:
                db.add(OAuthAuthorization(
                    request_hash=token_hash(handle), client_id=client.client_id, redirect_uri=str(params.redirect_uri),
                    redirect_uri_explicit=params.redirect_uri_provided_explicitly, state=params.state,
                    code_challenge=params.code_challenge, resource=self.resource, scopes=list(params.scopes or []),
                    expires_at=_now() + REQUEST_TTL))
        await asyncio.to_thread(add)
        return f"{self.consent_url}?{urlencode({'request': handle})}"

    def issue_code(self, handle: str, grant_id: uuid.UUID, user_id: uuid.UUID, db) -> str:
        row = self.pending(handle, db, lock=True)
        code = secrets.token_urlsafe(32)
        row.code_hash, row.code_expires_at = token_hash(code), _now() + CODE_TTL
        row.grant_id, row.user_id = grant_id, user_id
        return code

    def pending(self, handle: str, db, *, lock: bool = False) -> OAuthAuthorization:
        digest = _digest(handle)
        query = select(OAuthAuthorization).where(OAuthAuthorization.request_hash == digest)
        row = db.scalar(query.with_for_update() if lock else query) if digest else None
        if row is None or row.consumed_at is not None or row.code_hash is not None or row.expires_at <= _now():
            raise ServiceError("not_found")
        return row

    async def load_authorization_code(self, client, authorization_code: str) -> AuthorizationCode | None:
        digest = _digest(authorization_code)
        if digest is None:
            return None

        def load():
            with self.sessions() as db:
                row = db.scalar(select(OAuthAuthorization).where(OAuthAuthorization.code_hash == digest))
                if row is None or row.client_id != client.client_id:
                    return None
                # consumed codes still load, so a replay reaches exchange and revokes the grant's tokens
                return AuthorizationCode(code=authorization_code, scopes=list(row.scopes), expires_at=row.code_expires_at.timestamp(),
                                         client_id=row.client_id, code_challenge=row.code_challenge,
                                         redirect_uri=row.redirect_uri, redirect_uri_provided_explicitly=row.redirect_uri_explicit,
                                         resource=row.resource, subject=str(row.grant_id))
        return await asyncio.to_thread(load)

    async def exchange_authorization_code(self, client, authorization_code: AuthorizationCode) -> OAuthToken:
        digest = token_hash(authorization_code.code)

        def exchange():
            with self.sessions.begin() as db:
                row = db.scalar(select(OAuthAuthorization).where(OAuthAuthorization.code_hash == digest).with_for_update())
                if row is None or row.client_id != client.client_id:
                    raise TokenError("invalid_grant", "authorization code does not exist")
                if row.consumed_at is None:
                    row.consumed_at = _now()
                    return self._issue_pair(db, row.grant_id, client.client_id)
                self._revoke_grant_tokens(db, row.grant_id)  # replay: commit the revocation, then refuse
            return None
        tokens = await asyncio.to_thread(exchange)
        if tokens is None:
            raise TokenError("invalid_grant", "authorization code already used")
        return tokens

    # -- tokens -------------------------------------------------------------------------------
    def _live_grant(self, db, grant_id) -> Grant | None:
        grant = db.get(Grant, grant_id)
        if grant is None or grant.revoked_at is not None or grant.expires_at <= _now():
            return None
        return grant

    def _issue_pair(self, db, grant_id, client_id) -> OAuthToken:
        grant = self._live_grant(db, grant_id)
        if grant is None:
            raise TokenError("invalid_grant", "grant is no longer active")
        access, refresh, pair = "jspo_" + secrets.token_urlsafe(32), "jspr_" + secrets.token_urlsafe(32), uuid.uuid4()
        now = _now()
        db.add(OAuthTokenRow(token_hash=token_hash(access), kind="access", pair_id=pair, grant_id=grant.id, client_id=client_id,
                             resource=self.resource, expires_at=now + timedelta(seconds=ACCESS_TTL)))
        db.add(OAuthTokenRow(token_hash=token_hash(refresh), kind="refresh", pair_id=pair, grant_id=grant.id, client_id=client_id,
                             resource=self.resource, expires_at=grant.expires_at))
        db.flush()
        return OAuthToken(access_token=access, expires_in=ACCESS_TTL, scope=" ".join(sorted(grant.capabilities)), refresh_token=refresh)

    @staticmethod
    def _revoke_grant_tokens(db, grant_id) -> None:
        db.execute(update(OAuthTokenRow).where(OAuthTokenRow.grant_id == grant_id, OAuthTokenRow.revoked_at.is_(None))
                   .values(revoked_at=_now()))

    async def load_refresh_token(self, client, refresh_token: str) -> RefreshToken | None:
        digest = _digest(refresh_token)
        if digest is None:
            return None

        def load():
            with self.sessions() as db:
                row = db.scalar(select(OAuthTokenRow).where(OAuthTokenRow.token_hash == digest, OAuthTokenRow.kind == "refresh"))
                if row is None or row.client_id != client.client_id:
                    return None
                grant = self._live_grant(db, row.grant_id)
                if grant is None:
                    return None
                return RefreshToken(token=refresh_token, client_id=row.client_id, scopes=sorted(grant.capabilities),
                                    expires_at=int(row.expires_at.timestamp()), resource=row.resource, subject=str(row.grant_id))
        return await asyncio.to_thread(load)

    async def exchange_refresh_token(self, client, refresh_token: RefreshToken, scopes: list[str]) -> OAuthToken:
        digest = token_hash(refresh_token.token)

        def exchange():
            with self.sessions.begin() as db:
                row = db.scalar(select(OAuthTokenRow).where(OAuthTokenRow.token_hash == digest).with_for_update())
                if row is None or row.client_id != client.client_id:
                    return None, "missing"
                if row.revoked_at is not None:
                    self._revoke_grant_tokens(db, row.grant_id)
                    return None, "reused"
                db.execute(update(OAuthTokenRow).where(OAuthTokenRow.pair_id == row.pair_id).values(revoked_at=_now()))
                return self._issue_pair(db, row.grant_id, client.client_id), None
        tokens, problem = await asyncio.to_thread(exchange)
        if problem:
            raise TokenError("invalid_grant", "refresh token is not valid")
        return tokens

    async def load_access_token(self, token: str) -> AccessToken | None:
        digest = _digest(token)
        if digest is None or not token.startswith("jspo_"):
            return None

        def load():
            with self.sessions() as db:
                row = db.scalar(select(OAuthTokenRow).where(OAuthTokenRow.token_hash == digest, OAuthTokenRow.kind == "access"))
                if row is None or row.revoked_at is not None or row.expires_at <= _now():
                    return None
                grant = self._live_grant(db, row.grant_id)
                if grant is None:
                    return None
                return AccessToken(token=token, client_id=row.client_id, scopes=sorted(grant.capabilities),
                                   expires_at=int(row.expires_at.timestamp()), resource=row.resource, subject=str(row.grant_id))
        return await asyncio.to_thread(load)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        digest = _digest(token.token)

        def revoke():
            with self.sessions.begin() as db:
                row = db.scalar(select(OAuthTokenRow).where(OAuthTokenRow.token_hash == digest))
                if row is not None:
                    db.execute(update(OAuthTokenRow).where(OAuthTokenRow.pair_id == row.pair_id,
                                                           OAuthTokenRow.revoked_at.is_(None)).values(revoked_at=_now()))
        if digest is not None:
            await asyncio.to_thread(revoke)
