"""Admin overview endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/overview")
async def get_overview(_actor=Depends(admin_actor)):
    not_built()


@router.get("/overview/bucket")
async def get_overview_bucket(_actor=Depends(admin_actor)):
    not_built()


@router.get("/overview.csv")
async def get_overview_csv(_actor=Depends(admin_actor)):
    not_built()


@router.get("/prefs")
async def get_prefs(_actor=Depends(admin_actor)):
    not_built()


@router.put("/prefs")
async def put_prefs(_actor=Depends(admin_writer)):
    not_built()
