"""OAuth 2.1 authorization server for MCP (TOR FR-P03): CIMD/DCR clients, consent-backed grants, opaque tokens."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from urllib.parse import urlsplit

import httpx
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import ValidationError

from job_search_platform.services import webhooks

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


def validate_cimd(client_id: str, document: dict) -> OAuthClientInformationFull:
    if not isinstance(document, dict) or document.get("client_id") != client_id:
        raise ValueError("client_id_mismatch")
    if "client_secret" in document or document.get("token_endpoint_auth_method", "none") != "none":
        raise ValueError("not_public")
    try:
        info = OAuthClientInformationFull.model_validate({**document, "token_endpoint_auth_method": "none"})
    except ValidationError:
        raise ValueError("invalid_metadata") from None
    if not info.redirect_uris or "authorization_code" not in info.grant_types:
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
