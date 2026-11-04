"""Admin models endpoints. Stubs until the section is built; every route is already admin-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer, not_built

router = APIRouter()


@router.get("/models/catalog")
async def get_models_catalog(_actor=Depends(admin_actor)):
    not_built()


@router.get("/models")
async def get_models(_actor=Depends(admin_actor)):
    not_built()


@router.post("/models")
async def post_models(_actor=Depends(admin_writer)):
    not_built()


@router.put("/models/price")
async def put_models_price(_actor=Depends(admin_writer)):
    not_built()


@router.post("/models/use-official-price")
async def post_models_use_official_price(_actor=Depends(admin_writer)):
    not_built()


@router.get("/tasks")
async def get_tasks(_actor=Depends(admin_actor)):
    not_built()


@router.put("/tasks/{operation}")
async def put_tasks_operation(_actor=Depends(admin_writer)):
    not_built()


@router.post("/benchmarks")
async def post_benchmarks(_actor=Depends(admin_writer)):
    not_built()


@router.get("/benchmarks")
async def get_benchmarks(_actor=Depends(admin_actor)):
    not_built()


@router.get("/benchmarks/{benchmark_id}")
async def get_benchmarks_benchmark_id(_actor=Depends(admin_actor)):
    not_built()
