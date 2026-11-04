"""Admin console REST: /v1/admin/*. Each section has its own module; auth is per route (admin_actor / admin_writer)."""
from __future__ import annotations

from fastapi import APIRouter

from job_search_platform.api.admin import audit, models, overview, runs, system, usage, users

router = APIRouter(prefix="/admin", tags=["admin"])
for _module in (overview, users, runs, usage, models, system, audit):
    router.include_router(_module.router)
