"""Admin users endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/users")
async def get_users(_actor=Depends(admin_actor)):
    not_built()


@router.get("/users/{user_id}")
async def get_users_user_id(_actor=Depends(admin_actor)):
    not_built()


@router.post("/users/{user_id}/suspend")
async def post_users_user_id_suspend(_actor=Depends(admin_writer)):
    not_built()


@router.post("/users/{user_id}/enable")
async def post_users_user_id_enable(_actor=Depends(admin_writer)):
    not_built()


@router.post("/users/{user_id}/reset-password")
async def post_users_user_id_reset_password(_actor=Depends(admin_writer)):
    not_built()


@router.post("/users/{user_id}/delete")
async def post_users_user_id_delete(_actor=Depends(admin_writer)):
    not_built()
