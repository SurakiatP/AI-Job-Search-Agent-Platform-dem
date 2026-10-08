"""Opt-in protocol listener. Owner REST, cookies and frontend are never mounted here."""
from contextlib import asynccontextmanager

from starlette.applications import Starlette
from starlette.routing import Mount

from job_search_platform.api.dependencies import Services
from job_search_platform.api.mcp import create_mcp_app, mcp_lifespan_context
from job_search_platform.api.a2a import create_a2a_app


def create_shared_app(services: Services, *, host: str, port: int) -> Starlette:
    authority = f"[{host}]:{port}" if ":" in host else f"{host}:{port}"
    mcp = create_mcp_app(services, allowed_hosts=[authority], allowed_origins=[])

    @asynccontextmanager
    async def lifespan(app):
        async with mcp_lifespan_context(mcp):
            yield

    a2a = create_a2a_app(services, base_url=f"http://{authority}", allowed_hosts=[authority])
    return Starlette(routes=[Mount("/mcp", app=mcp), Mount("/", app=a2a)], lifespan=lifespan)
