"""OAuth 2.1 for MCP (FR-P03): owner consent REST here; authorization-server routes for the shared listener."""
from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.services.contracts import Capability
from starlette.responses import JSONResponse
from starlette.routing import Route

from mcp.server.auth.handlers.metadata import MetadataHandler
from mcp.server.auth.routes import (REGISTRATION_PATH, build_metadata, create_auth_routes,
                                    create_protected_resource_routes, cors_middleware)
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from pydantic import AnyHttpUrl, TypeAdapter

from job_search_platform.services import rate_limits
from job_search_platform.services.authorization import GRANT_CAPABILITIES
from job_search_platform.services.errors import ServiceError

router = APIRouter()


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConsentProject(_Body):
    id: UUID
    name: str


class OAuthConsentView(_Body):
    client_name: str
    client_id_host: str
    redirect_uri: str
    requested_scopes: list[str]
    projects: list[ConsentProject]
    expires_at: datetime


class OAuthApproveRequest(_Body):
    project_id: UUID
    capabilities: frozenset[Capability]
    expires_at: datetime


class OAuthRedirectView(_Body):
    redirect_url: str


def _oauth(services: Services):
    if services.oauth is None:  # OAuth is off (no SHARE_PUBLIC_ORIGIN)
        raise ServiceError("not_found")
    return services.oauth


@router.get("/oauth/requests/{handle}", response_model=OAuthConsentView)
async def consent_view(handle: str, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await asyncio.to_thread(_oauth(services).consent_view, actor, handle)


@router.post("/oauth/requests/{handle}/approve", response_model=OAuthRedirectView)
async def approve(handle: str, body: OAuthApproveRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    url = await asyncio.to_thread(_oauth(services).approve, actor, handle, body.project_id, body.capabilities, body.expires_at)
    return {"redirect_url": url}


@router.post("/oauth/requests/{handle}/deny", response_model=OAuthRedirectView)
async def deny(handle: str, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return {"redirect_url": await asyncio.to_thread(_oauth(services).deny, actor, handle)}


# The SDK models keep an empty path ("http://host:port"); a bare AnyHttpUrl() adds "/" and breaks RFC 8414 issuer matching.
_URL = TypeAdapter(AnyHttpUrl, config=ConfigDict(url_preserve_empty_path=True))


def oauth_routes(provider) -> list[Route]:
    """SDK authorization-server routes, our metadata (public clients + CIMD), and RFC 9728 metadata for /mcp."""
    issuer = _URL.validate_python(provider.issuer)
    scopes = sorted(GRANT_CAPABILITIES)
    registration = ClientRegistrationOptions(enabled=True, valid_scopes=scopes)
    revocation = RevocationOptions(enabled=True)
    routes = create_auth_routes(provider, issuer, client_registration_options=registration, revocation_options=revocation)
    metadata = build_metadata(issuer, None, registration, revocation)
    metadata.token_endpoint_auth_methods_supported = ["none"]
    metadata.revocation_endpoint_auth_methods_supported = ["none"]
    metadata.client_id_metadata_document_supported = True
    replaced = []
    for route in routes:
        if route.path == "/.well-known/oauth-authorization-server":
            route = Route(route.path, endpoint=cors_middleware(MetadataHandler(metadata).handle, ["GET", "OPTIONS"]),
                          methods=["GET", "OPTIONS"])
        elif route.path == REGISTRATION_PATH:
            route = Route(route.path, endpoint=_RateLimited(provider.sessions, route.endpoint), methods=["POST", "OPTIONS"])
        replaced.append(route)
    return replaced + create_protected_resource_routes(AnyHttpUrl(provider.resource), [issuer], scopes_supported=scopes,
                                                       resource_name="Job Search Platform MCP")


class _RateLimited:
    """ASGI wrapper (a class, because Starlette treats a plain function endpoint as a request handler)."""

    def __init__(self, sessions, app):
        self.sessions, self.app = sessions, app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] == "POST":
            ip = (scope.get("client") or ("unknown",))[0]

            def hit():
                with self.sessions.begin() as db:
                    rate_limits.hit(db, "oauth_register_ip", ip)
            try:
                await asyncio.to_thread(hit)
            except ServiceError:
                await JSONResponse({"error": "rate_limited"}, status_code=429, headers={"Retry-After": "3600"})(scope, receive, send)
                return
        await self.app(scope, receive, send)
