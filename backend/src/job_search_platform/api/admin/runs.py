"""Admin runs endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/runs")
async def get_runs(_actor=Depends(admin_actor)):
    not_built()


@router.get("/runs/{run_id}")
async def get_runs_run_id(_actor=Depends(admin_actor)):
    not_built()


@router.post("/runs/{run_id}/cancel")
async def post_runs_run_id_cancel(_actor=Depends(admin_writer)):
    not_built()


@router.post("/runs/{run_id}/retry")
async def post_runs_run_id_retry(_actor=Depends(admin_writer)):
    not_built()
