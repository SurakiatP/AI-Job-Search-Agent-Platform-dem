"""Admin route dependencies: the signed-in owner session, then require_admin. Writes also check CSRF and origin."""
from __future__ import annotations

import asyncio

from fastapi import Depends

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.services.accounts import require_admin


async def admin_actor(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    await asyncio.to_thread(require_admin, services.sessions, actor.user_id)
    return actor


async def admin_writer(actor=Depends(write_actor), services: Services = Depends(get_services)):
    await asyncio.to_thread(require_admin, services.sessions, actor.user_id)
    return actor


def not_built():
    from fastapi import HTTPException
    raise HTTPException(status_code=501, detail="not_implemented")
