"""Admin audit log: every admin action, newest first. Metadata only."""
from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from job_search_platform.api.admin.deps import admin_actor
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_audit
from job_search_platform.services.contracts import AdminAuditPage

router = APIRouter()


@router.get("/audit", response_model=AdminAuditPage)
async def get_audit(action: str | None = Query(None, max_length=64), actor: UUID | None = None,
                    since: datetime | None = None, cursor: str | None = Query(None, max_length=200),
                    _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_audit.list(db, {"action": action, "actor": actor, "since": since}, cursor)
    return await asyncio.to_thread(run)
