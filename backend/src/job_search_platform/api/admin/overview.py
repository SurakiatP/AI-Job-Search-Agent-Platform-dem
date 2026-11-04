"""Admin overview: KPIs, trend, attention list, widgets, CSV and the per-admin widget choice."""
from __future__ import annotations

import asyncio
import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from job_search_platform.api.admin.deps import admin_actor, admin_writer
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.services import admin_metrics, health
from job_search_platform.services.contracts import AdminBucket, AdminMetric, AdminOverview, AdminPrefs, AdminRange

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def health_now(services: Services) -> dict:
    """Latest stored probe, or a live one when the supervisor has not written a recent row."""
    def stored():
        with services.sessions() as db:
            return health.latest_probe(db)
    return await asyncio.to_thread(stored) or health.admin_components(
        (await health.check_components(services.sessions, services.files.object_store, services.runtime))[1]["components"])


@router.get("/overview", response_model=AdminOverview)
async def get_overview(range: AdminRange = "7d", _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    components, now = await health_now(services), _now()

    def run():
        with services.sessions() as db:
            return admin_metrics.overview(db, range, now, components)
    return await asyncio.to_thread(run)


@router.get("/overview/bucket", response_model=AdminBucket)
async def get_overview_bucket(metric: AdminMetric, start: datetime, range: AdminRange = "7d",
                              _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_metrics.bucket(db, range, metric, start)
    return await asyncio.to_thread(run)


@router.get("/overview.csv", response_class=Response, responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}})
async def get_overview_csv(range: AdminRange = "7d", _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_metrics.csv_rows(db, range, _now())
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["bucket_start", "runs", "failures", "active_users", "cost_usd"])
    writer.writerows(await asyncio.to_thread(run))
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="overview-{range}.csv"'})


@router.get("/prefs", response_model=AdminPrefs)
async def get_prefs(actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_metrics.get_prefs(db, actor.user_id)
    return await asyncio.to_thread(run)


@router.put("/prefs", response_model=AdminPrefs)
async def put_prefs(body: AdminPrefs, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    def run():
        with services.sessions.begin() as db:
            return admin_metrics.set_prefs(db, actor.user_id, body.widgets)
    return await asyncio.to_thread(run)
