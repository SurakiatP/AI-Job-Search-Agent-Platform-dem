"""Admin System page: health now and over 24 h, job ingest history, webhooks, gateway and tools."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends

from job_search_platform.api.admin.deps import admin_actor, admin_writer
from job_search_platform.api.admin.overview import health_now
from job_search_platform.api.dependencies import Services, get_services
from job_search_platform.api.rest import tools_view
from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.services import admin_metrics, health
from job_search_platform.services.contracts import AdminSystem, AdminWebhookDelivery

router = APIRouter()


@router.get("/system", response_model=AdminSystem)
async def get_system(_actor=Depends(admin_actor), services: Services = Depends(get_services)):
    components, now = await health_now(services), datetime.now(timezone.utc)

    def run():
        with services.sessions() as db:
            return {"probes": [{"checked_at": p.checked_at, "components": p.components} for p in health.probes(db, now)],
                    "ingest": admin_metrics.ingest_history(db), "webhooks": admin_metrics.webhook_counts(db)}
    data = await asyncio.to_thread(run)
    return {"generated_at": now, "health": {"components": components}, **data,
            "gateway": await GatewaySettings.from_env().status(), "tools": tools_view()}


@router.get("/webhooks", response_model=list[AdminWebhookDelivery])
async def get_webhooks(status: Literal["pending", "delivered", "dead"] | None = None,
                       _actor=Depends(admin_actor), services: Services = Depends(get_services)):
    def run():
        with services.sessions() as db:
            return admin_metrics.webhook_deliveries(db, status)
    return await asyncio.to_thread(run)


@router.post("/webhooks/{delivery_id}/resend", response_model=AdminWebhookDelivery)
async def post_webhook_resend(delivery_id: UUID, actor=Depends(admin_writer), services: Services = Depends(get_services)):
    def run():
        services.webhooks.admin_resend(actor.user_id, delivery_id)
        with services.sessions() as db:
            return admin_metrics.webhook_deliveries(db, delivery_id=delivery_id)[0]
    return await asyncio.to_thread(run)
