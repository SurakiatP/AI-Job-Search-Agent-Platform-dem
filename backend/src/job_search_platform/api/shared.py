"""Opt-in protocol listener. Owner REST, cookies and frontend are never mounted here."""
import logging
from urllib.parse import urlsplit
from contextlib import asynccontextmanager

from mcp.server.auth.routes import build_resource_metadata_url, validate_issuer_url
from pydantic import AnyHttpUrl

from starlette.applications import Starlette
from starlette.responses import Response
from starlette.routing import Mount, Route

from job_search_platform.api.dependencies import Services
from job_search_platform.api.mcp import create_mcp_app, mcp_lifespan_context
from job_search_platform.api.a2a import create_a2a_app
from job_search_platform.api.oauth import oauth_routes

logger = logging.getLogger(__name__)


async def _not_found(request):
    return Response(status_code=404)


def _oauth_enabled(oauth) -> bool:
    if oauth is None:
        return False
    try:
        validate_issuer_url(AnyHttpUrl(oauth.issuer))
        if urlsplit(oauth.issuer).path not in {"", "/"}:
            raise ValueError("issuer path")
    except ValueError:
        logger.warning("oauth_disabled_insecure_issuer")
        return False
    return True


def create_shared_app(services: Services, *, host: str, port: int) -> Starlette:
    authority = f"[{host}]:{port}" if ":" in host else f"{host}:{port}"
    oauth = services.oauth if _oauth_enabled(services.oauth) else None
    # behind a proxy the client's Host is the public origin, not the bind address
    public = [urlsplit(oauth.issuer).netloc] if oauth else []
    mcp = create_mcp_app(services, allowed_hosts=[authority, *public], allowed_origins=[],
                         resource=oauth.resource if oauth else None,
                         resource_metadata_url=str(build_resource_metadata_url(AnyHttpUrl(oauth.resource))) if oauth else None)

    @asynccontextmanager
    async def lifespan(app):
        async with mcp_lifespan_context(mcp):
            yield

    # behind the proxy A2A is reached (and must advertise itself) on the public origin too
    a2a = create_a2a_app(services, base_url=oauth.issuer if oauth else f"http://{authority}",
                         allowed_hosts=[authority, *public])
    # ponytail: without OAuth the A2A catch-all would answer 401 on discovery paths; clients need a plain 404 there.
    off = [] if oauth else [Route(p, _not_found) for p in ("/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp")]
    routes = [*(oauth_routes(oauth) if oauth else off), Mount("/mcp", app=mcp), Mount("/", app=a2a)]
    return Starlette(routes=routes, lifespan=lifespan)
