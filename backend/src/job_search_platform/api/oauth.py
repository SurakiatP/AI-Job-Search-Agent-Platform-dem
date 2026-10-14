"""OAuth 2.1 for MCP (FR-P03): owner consent REST here; authorization-server routes for the shared listener."""
from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.services.contracts import Capability

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


@router.get("/oauth/requests/{handle}", response_model=OAuthConsentView)
async def consent_view(handle: str, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await asyncio.to_thread(services.oauth.consent_view, actor, handle)


@router.post("/oauth/requests/{handle}/approve", response_model=OAuthRedirectView)
async def approve(handle: str, body: OAuthApproveRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    url = await asyncio.to_thread(services.oauth.approve, actor, handle, body.project_id, body.capabilities, body.expires_at)
    return {"redirect_url": url}


@router.post("/oauth/requests/{handle}/deny", response_model=OAuthRedirectView)
async def deny(handle: str, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return {"redirect_url": await asyncio.to_thread(services.oauth.deny, actor, handle)}
