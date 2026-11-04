"""Component probes behind /health/ready and the admin System page. The reason a probe failed is never kept."""
from __future__ import annotations

import asyncio
import subprocess
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request as _UrlRequest

from sqlalchemy import delete, select, text

from job_search_platform.db.models import HealthProbe
from job_search_platform.integrations.gateway import GatewaySettings

READY_TIMEOUT_SECONDS = 2
READY_MAX_BODY_BYTES = 4096
PROBE_KEEP = timedelta(days=90)
PROBE_FRESH = timedelta(minutes=2)  # a stored probe newer than this stands in for a live one (probes run every 30 s)
COMPONENTS = ("postgres", "object_store", "llm_gateway", "sandbox")
# range -> (window seconds, bucket seconds) of the System page; `all` is everything kept (90 days)
PROBE_RANGES = {"1m": (60, 30), "5m": (300, 30), "10m": (600, 30), "15m": (900, 30), "30m": (1800, 30), "1h": (3600, 30),
                "4h": (14400, 120), "10h": (36000, 300), "7d": (7 * 86400, 3600), "30d": (30 * 86400, 6 * 3600),
                "90d": (90 * 86400, 86400), "all": (90 * 86400, 86400)}
BANGKOK_OFFSET = 7 * 3600  # buckets of an hour or more start on Bangkok clock edges


def gateway_alive() -> None:
    gateway = GatewaySettings.from_env()
    with gateway.opener.open(_UrlRequest(gateway.base_url + "/health/liveliness"), timeout=READY_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise ValueError
        response.read(READY_MAX_BODY_BYTES)  # bounded; urllib's timeout is per socket operation, not total


def image_present(image: str) -> None:
    subprocess.run(["docker", "image", "inspect", image], check=True, capture_output=True, timeout=READY_TIMEOUT_SECONDS)


async def probe(check, name: str | None = None, timings: dict | None = None) -> str:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(check(), READY_TIMEOUT_SECONDS)
        return "ok"
    except Exception:  # the reason is deliberately dropped: readiness leaks no addresses or errors
        return "down"
    finally:
        if timings is not None:
            timings[name] = round((time.perf_counter() - started) * 1000)


async def check_components(sessions, object_store, runtime, *, gateway=None, image=None, timings: dict | None = None) -> tuple[int, dict]:
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
        probe(lambda: asyncio.to_thread(postgres), names[0], timings), probe(object_store.ping, names[1], timings),
        probe(lambda: asyncio.to_thread(gateway), names[2], timings), probe(sandbox, names[3], timings))
    ok = all(value == "ok" for value in results)
    return (200 if ok else 503), {"status": "ok" if ok else "degraded", "components": dict(zip(names, results))}


def admin_components(components: dict) -> dict:
    """Probe names as the admin API spells them (sandbox_image is just 'sandbox' there)."""
    return {"postgres": components["postgres"], "object_store": components["object_store"],
            "llm_gateway": components["llm_gateway"], "sandbox": components.get("sandbox", components.get("sandbox_image", "down"))}


async def record_probe(sessions, object_store, runtime) -> dict:
    """One health_probes row now ({component: {status, ms}}); rows older than 90 days go. Called by the supervisor every 30 s."""
    timings: dict = {}
    _, body = await check_components(sessions, object_store, runtime, timings=timings)
    components = admin_components(body["components"])
    ms = admin_components(timings) if len(timings) == 4 else {}  # a cancelled probe leaves no timings
    now = datetime.now(timezone.utc)
    row = {k: {"status": v, "ms": ms.get(k)} for k, v in components.items()}

    def write() -> None:
        with sessions.begin() as db:
            db.merge(HealthProbe(checked_at=now, components=row))
            db.execute(delete(HealthProbe).where(HealthProbe.checked_at < now - PROBE_KEEP))
    await asyncio.to_thread(write)
    return components


def _status(value) -> str:
    """Old rows keep a bare "ok" / "down"; new rows hold {status, ms}."""
    return value.get("status", "down") if isinstance(value, dict) else value


def latest_probe(db, now: datetime | None = None) -> dict | None:
    """Status of every component in the newest probe, or None when it is older than PROBE_FRESH (or there is none)."""
    now = now or datetime.now(timezone.utc)
    row = db.scalar(select(HealthProbe).order_by(HealthProbe.checked_at.desc()).limit(1))
    if row is None or row.checked_at < now - PROBE_FRESH:
        return None
    return {k: _status(row.components.get(k, "down")) for k in COMPONENTS}


def probe_buckets(db, range_: str, now: datetime | None = None) -> tuple[int, list[dict]]:
    """(bucket seconds, buckets oldest first). Per component: ok / down (any failed check in the bucket) / unknown (no check),
    the slowest response in ms, and how many of the bucket's checks failed. Empty buckets are included."""
    span, size = PROBE_RANGES[range_]
    now = now or datetime.now(timezone.utc)
    off = BANGKOK_OFFSET if size >= 3600 else 0
    last = (int(now.timestamp()) + off) // size
    first = last - span // size + 1
    cols = ", ".join(
        f"count(*) FILTER (WHERE coalesce(components->'{k}'->>'status', components->>'{k}') IS DISTINCT FROM 'ok') AS {k}_failed, "
        f"max((components->'{k}'->>'ms')::int) AS {k}_ms" for k in COMPONENTS)
    rows = db.execute(text(
        f"SELECT floor((extract(epoch FROM checked_at) + CAST(:off AS bigint)) / CAST(:size AS bigint))::bigint AS idx, count(*) AS checks, {cols} "
        "FROM health_probes WHERE checked_at >= to_timestamp(CAST(:since AS double precision)) GROUP BY idx"),
        {"off": off, "size": size, "since": first * size - off}).mappings()
    found = {r["idx"]: r for r in rows}
    out = []
    for i in range(first, last + 1):
        r = found.get(i)
        out.append({"checked_at": datetime.fromtimestamp(i * size - off, timezone.utc), "components": {k: {
            "status": "unknown" if r is None else "down" if r[f"{k}_failed"] else "ok",
            "ms": None if r is None else r[f"{k}_ms"], "failed": 0 if r is None else r[f"{k}_failed"],
            "checks": 0 if r is None else r["checks"]} for k in COMPONENTS}})
    return size, out
