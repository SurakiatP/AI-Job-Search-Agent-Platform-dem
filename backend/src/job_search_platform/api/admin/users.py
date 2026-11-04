"""Admin users: list, detail and the four account actions. Metadata only; every action is audited."""
from __future__ import annotations

import asyncio
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from job_search_platform.api.admin.deps import admin_actor, admin_writer
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_users
from job_search_platform.services.contracts import AdminRange, AdminUserDelete, AdminUserDetail, AdminUserPage

router = APIRouter()


@router.get("/users", response_model=AdminUserPage)
async def get_users(q: str | None = Query(None, max_length=200),
                    status: Literal["active", "suspended", "deleting"] | None = None,
                    range_: AdminRange | None = Query(None, alias="range"), page: int = Query(0, ge=0, le=100_000), page_size: int = Query(10, ge=1, le=50),
                    _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_users.list_users(db, q, status, range_, page, page_size)
    return await asyncio.to_thread(run)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_users_user_id(user_id: UUID, _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_users.detail(db, user_id)
    return await asyncio.to_thread(run)


async def _act(fn, actor, services, user_id):
    def run():
        with services.sessions.begin() as db:
            return fn(db, actor.user_id, user_id)
    return await asyncio.to_thread(run)


@router.post("/users/{user_id}/suspend", response_model=AdminUserDetail)
async def post_users_user_id_suspend(user_id: UUID, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    return await _act(admin_users.suspend, actor, services, user_id)


@router.post("/users/{user_id}/enable", response_model=AdminUserDetail)
async def post_users_user_id_enable(user_id: UUID, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    return await _act(admin_users.enable, actor, services, user_id)


@router.post("/users/{user_id}/reset-password", status_code=204)
async def post_users_user_id_reset_password(user_id: UUID, actor=Depends(admin_writer),
                                            services: Services = Depends(get_services)):
    await asyncio.to_thread(admin_users.reset_password, services.sessions, services.accounts, actor.user_id, user_id)
    return Response(status_code=204)


@router.post("/users/{user_id}/delete", status_code=204)
async def post_users_user_id_delete(user_id: UUID, body: AdminUserDelete, actor=Depends(admin_writer),
                                    services: Services = Depends(get_services)):
    await asyncio.to_thread(admin_users.delete, services.sessions, services.accounts, actor.user_id, user_id,
                            body.confirm_email)
    return Response(status_code=204)
