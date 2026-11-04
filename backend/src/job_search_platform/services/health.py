"""Component probes behind /health/ready and the admin System page. The reason a probe failed is never kept."""
from __future__ import annotations

import asyncio
import subprocess
from datetime import datetime, timedelta, timezone
from urllib.request import Request as _UrlRequest

from sqlalchemy import delete, select, text

from job_search_platform.db.models import HealthProbe
from job_search_platform.integrations.gateway import GatewaySettings

READY_TIMEOUT_SECONDS = 2
READY_MAX_BODY_BYTES = 4096
PROBE_KEEP = timedelta(hours=24)
PROBE_FRESH = timedelta(minutes=10)  # a stored probe newer than this stands in for a live one


def gateway_alive() -> None:
    gateway = GatewaySettings.from_env()
    with gateway.opener.open(_UrlRequest(gateway.base_url + "/health/liveliness"), timeout=READY_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise ValueError
        response.read(READY_MAX_BODY_BYTES)  # bounded; urllib's timeout is per socket operation, not total


def image_present(image: str) -> None:
    subprocess.run(["docker", "image", "inspect", image], check=True, capture_output=True, timeout=READY_TIMEOUT_SECONDS)


async def probe(check) -> str:
    try:
        await asyncio.wait_for(check(), READY_TIMEOUT_SECONDS)
        return "ok"
    except Exception:  # the reason is deliberately dropped: readiness leaks no addresses or errors
        return "down"


async def check_components(sessions, object_store, runtime, *, gateway=None, image=None) -> tuple[int, dict]:
    """(http status, body) for /health/ready. gateway / image let rest.py hand in its own patchable probes."""
    gateway, image = gateway or gateway_alive, image or image_present

    def postgres():
        with sessions() as session:
            session.execute(text("SET LOCAL statement_timeout = 2000"))
            session.execute(text("SELECT 1"))

    async def sandbox():
        await asyncio.to_thread(image, runtime.image)

    names = ("postgres", "object_store", "llm_gateway", "sandbox_image")
    results = await asyncio.gather(
        probe(lambda: asyncio.to_thread(postgres)), probe(object_store.ping),
        probe(lambda: asyncio.to_thread(gateway)), probe(sandbox))
    ok = all(value == "ok" for value in results)
    return (200 if ok else 503), {"status": "ok" if ok else "degraded", "components": dict(zip(names, results))}


def admin_components(components: dict) -> dict:
    """Probe names as the admin API spells them (sandbox_image is just 'sandbox' there)."""
    return {"postgres": components["postgres"], "object_store": components["object_store"],
            "llm_gateway": components["llm_gateway"], "sandbox": components.get("sandbox", components.get("sandbox_image", "down"))}


async def record_probe(sessions, object_store, runtime) -> dict:
    """One health_probes row now; rows older than 24 h go. Called by the supervisor every 300 s."""
    _, body = await check_components(sessions, object_store, runtime)
    components = admin_components(body["components"])
    now = datetime.now(timezone.utc)

    def write() -> None:
        with sessions.begin() as db:
            db.merge(HealthProbe(checked_at=now, components=components))
            db.execute(delete(HealthProbe).where(HealthProbe.checked_at < now - PROBE_KEEP))
    await asyncio.to_thread(write)
    return components


def latest_probe(db, now: datetime | None = None) -> dict | None:
    """Components of the newest probe, or None when it is older than PROBE_FRESH (or there is none)."""
    now = now or datetime.now(timezone.utc)
    row = db.scalar(select(HealthProbe).order_by(HealthProbe.checked_at.desc()).limit(1))
    return row.components if row is not None and row.checked_at >= now - PROBE_FRESH else None


def probes(db, now: datetime | None = None) -> list[HealthProbe]:
    now = now or datetime.now(timezone.utc)
    return list(db.scalars(select(HealthProbe).where(HealthProbe.checked_at >= now - PROBE_KEEP)
                           .order_by(HealthProbe.checked_at)).all())
