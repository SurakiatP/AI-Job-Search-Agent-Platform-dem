"""Admin system endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/system")
async def get_system(_actor=Depends(admin_actor)):
    not_built()


@router.get("/webhooks")
async def get_webhooks(_actor=Depends(admin_actor)):
    not_built()


@router.post("/webhooks/{delivery_id}/resend")
async def post_webhooks_delivery_id_resend(_actor=Depends(admin_writer)):
    not_built()
