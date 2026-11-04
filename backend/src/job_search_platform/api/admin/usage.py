"""Admin usage and cost: requests, tokens and cost grouped by task, model, day or user (short id)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_metrics
from job_search_platform.services.contracts import AdminRange, AdminUsage

router = APIRouter()


@router.get("/usage", response_model=AdminUsage)
async def get_usage(group_by: Literal["task", "model", "day", "user"], range: AdminRange = "7d",
                    _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_metrics.usage(db, range, group_by, datetime.now(timezone.utc))
    return await asyncio.to_thread(run)
