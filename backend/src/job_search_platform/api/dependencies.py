"""Request identity and service dependencies shared by the HTTP adapters."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, Request

from job_search_platform.services.contracts import Actor
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import COOKIE_NAME, CSRF_HEADER


@dataclass(slots=True)
class Services:
    """Real application services; injectable to keep transport tests isolated."""

    sessions: Any
    owner_sessions: Any
    files: Any
    documents: Any
    runs: Any
    grants: Any
    settings: Any
    approvals: Any
    supervisor: Any
    runtime: Any
    queue: Any
    artifacts: Any = None
    secret_store: Any = None
    engine: Any = None


def get_services(request: Request) -> Services:
    services = getattr(request.app.state, "services", None)
    if services is None:
        raise ServiceError("service_unavailable", retryable=True)
    return services


async def owner_actor(
    request: Request,
    services: Services = Depends(get_services),
) -> Actor:
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise ServiceError("unauthorized")
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")
    return await services.owner_sessions.authenticate(cookie, host=host, origin=origin)


async def write_actor(
    request: Request,
    services: Services = Depends(get_services),
) -> Actor:
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise ServiceError("unauthorized")
    csrf = request.headers.get(CSRF_HEADER)
    if not csrf:
        raise ServiceError("invalid_csrf")
    return await services.owner_sessions.validate_write(
        cookie,
        csrf,
        origin=request.headers.get("origin", ""),
        host=request.headers.get("host", ""),
    )


async def run_actor(
    request: Request,
    services: Services = Depends(get_services),
) -> Actor:
    """Use a local owner cookie or a project bearer grant on run routes."""
    cookie = request.cookies.get(COOKIE_NAME)
    if cookie:
        try:
            return await services.owner_sessions.authenticate(
                cookie,
                host=request.headers.get("host", ""),
                origin=request.headers.get("origin"),
            )
        except ServiceError as exc:
            if exc.code not in {"unauthorized", "invalid_origin"}:
                raise
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ServiceError("unauthorized")
    return await services.grants.authenticate(token)


async def run_write_actor(
    request: Request,
    services: Services = Depends(get_services),
) -> Actor:
    """Authenticate writes without accepting owner credentials for grants."""
    authorization = request.headers.get("authorization", "")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise ServiceError("unauthorized")
        return await services.grants.authenticate(token)
    return await write_actor(request, services)
