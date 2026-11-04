"""Admin AI runs: list, detail, cancel and retry. Metadata only; both actions are audited."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from job_search_platform.api.admin.deps import admin_actor, admin_writer
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_runs
from job_search_platform.services.contracts import AdminRunDetail, AdminRunPage

router = APIRouter()

RunStatusFilter = Literal["queued", "running", "waiting_approval", "needs_input", "completed", "failed", "cancelled",
                          "interrupted"]


@router.get("/runs", response_model=AdminRunPage)
async def get_runs(status: RunStatusFilter | None = None, operation: str | None = Query(None, max_length=60),
                   model: str | None = Query(None, max_length=160), since: datetime | None = None,
                   until: datetime | None = None, page: int = Query(0, ge=0, le=100_000), page_size: int = Query(10, ge=1, le=50),
                   _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_runs.list_runs(db, {"status": status, "operation": operation, "model": model,
                                             "since": since, "until": until}, page, page_size)
    return await asyncio.to_thread(run)


@router.get("/runs/{run_id}", response_model=AdminRunDetail)
async def get_runs_run_id(run_id: UUID, _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_runs.detail(db, run_id)
    return await asyncio.to_thread(run)


@router.post("/runs/{run_id}/cancel", response_model=AdminRunDetail)
async def post_runs_run_id_cancel(run_id: UUID, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    def run():
        with services.sessions.begin() as db:
            return admin_runs.cancel(db, actor.user_id, run_id)
    return await asyncio.to_thread(run)


@router.post("/runs/{run_id}/retry", response_model=AdminRunDetail)
async def post_runs_run_id_retry(run_id: UUID, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    def run():
        new = services.runs.retry_as_admin(run_id, actor)
        with services.sessions() as db:
            return admin_runs.detail(db, new.id)
    return await asyncio.to_thread(run)
