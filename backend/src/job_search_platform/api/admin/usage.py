"""Admin usage endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/usage")
async def get_usage(_actor=Depends(admin_actor)):
    not_built()
