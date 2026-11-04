"""Admin AI models: catalog, registered models and prices, per-task model/effort, benchmark tests. Thin wrappers over services."""
from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from job_search_platform.api.admin.deps import admin_actor, admin_writer
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_audit, ai_models
from job_search_platform.services.contracts import (
    AdminBenchmark, AdminBenchmarkCreate, AdminModelCatalogItem, AdminModelCreate, AdminModelPrice, AdminModelRef,
    AdminRegisteredModel, AdminTaskSetting, AdminTaskUpdate)

router = APIRouter()


async def _write(services: Services, fn, *args):
    """Plain session plus explicit commit: benchmark.* commit on their own, which `sessions.begin()` would not allow."""
    def run():
        with services.sessions() as db:
            result = fn(db, *args)
            db.commit()
            return result
    return await asyncio.to_thread(run)


@router.get("/models/catalog", response_model=list[AdminModelCatalogItem])
async def get_models_catalog(q: str | None = Query(None, max_length=200), _actor=Depends(admin_actor),
                             services: Services = Depends(get_services)):
    return await _write(services, ai_models.catalog, q)  # may refresh stale prices, so it runs in a write transaction


@router.get("/models", response_model=list[AdminRegisteredModel])
async def get_models(_actor=Depends(admin_actor), services: Services = Depends(get_services)):
    return await _write(services, ai_models.list_models)


@router.post("/models", status_code=201, response_model=AdminRegisteredModel)
async def post_models(body: AdminModelCreate, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    return await _write(services, ai_models.create_model, actor.user_id, body)


@router.delete("/models", status_code=204)
async def delete_models(body: AdminModelRef, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    await _write(services, ai_models.delete_model, actor.user_id, body.model)


@router.put("/models/price", response_model=AdminRegisteredModel)
async def put_models_price(body: AdminModelPrice, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    return await _write(services, ai_models.set_price, actor.user_id, body)


@router.post("/models/use-official-price", response_model=AdminRegisteredModel)
async def post_models_use_official_price(body: AdminModelRef, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    return await _write(services, ai_models.use_official_price, actor.user_id, body.model)


@router.get("/tasks", response_model=list[AdminTaskSetting])
async def get_tasks(_actor=Depends(admin_actor), services: Services = Depends(get_services)):
    return await _write(services, ai_models.list_tasks)


@router.put("/tasks/{operation}", response_model=AdminTaskSetting)
async def put_tasks_operation(body: AdminTaskUpdate, operation: str = Path(max_length=60), actor=Depends(admin_writer),
                              services: Services = Depends(get_services)):
    return await _write(services, ai_models.update_task, actor.user_id, operation, body)


@router.post("/benchmarks", status_code=202, response_model=AdminBenchmark)
async def post_benchmarks(body: AdminBenchmarkCreate, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    from job_search_platform.services import benchmark  # written by another task

    def run():
        with services.sessions() as db:  # benchmark.start commits itself, so no begin() wrapper
            view = benchmark.start(db, actor.user_id, body.operation, body.model, body.effort)
            admin_audit.record(db, actor.user_id, "benchmark.start", "benchmark", view.id,
                               {"operation": body.operation, "model": body.model, "effort": body.effort})
            db.commit()
            return view
    return await asyncio.to_thread(run)


@router.get("/benchmarks", response_model=list[AdminBenchmark])
async def get_benchmarks(operation: str | None = Query(None, max_length=60), _actor=Depends(admin_actor),
                         services: Services = Depends(get_services)):
    from job_search_platform.services import benchmark
    return await _write(services, benchmark.list_for, operation)


@router.get("/benchmarks/{benchmark_id}", response_model=AdminBenchmark)
async def get_benchmarks_benchmark_id(benchmark_id: UUID, _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    from job_search_platform.services import benchmark
    return await _write(services, benchmark.get, benchmark_id)
