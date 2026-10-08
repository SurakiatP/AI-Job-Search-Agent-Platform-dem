"""Resumable run event stream backed by persisted per-run event sequences."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse

from job_search_platform.api.dependencies import Services, get_services, run_actor
from job_search_platform.services.contracts import Actor
from job_search_platform.services.errors import ServiceError

router = APIRouter()
HEARTBEAT_SECONDS = 12
POLL_SECONDS = 0.5


def _cursor(value: str | None) -> int:
    if value is None or value == "":
        return 0
    if len(value) > 18 or not value.isascii() or not value.isdecimal():
        raise ServiceError("invalid_event_cursor")
    cursor = int(value)
    if cursor < 0:
        raise ServiceError("invalid_event_cursor")
    return cursor


@router.get(
    "/projects/{project_id}/runs/{run_id}/events",
    response_class=StreamingResponse,
    responses={200: {"description": "Persisted event stream; Last-Event-ID resumes strictly after the cursor",
                     "content": {"text/event-stream": {"schema": {"type": "string"}}}}},
)
async def stream_run_events(
    project_id: UUID,
    run_id: UUID,
    actor: Actor = Depends(run_actor),
    services: Services = Depends(get_services),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    cursor = _cursor(last_event_id)
    # Fail with an ordinary HTTP response before the stream starts if this Actor
    # lacks current results access or the run belongs to another Project.
    await services.runs.get(actor, project_id, run_id)

    async def stream() -> AsyncIterator[bytes]:
        nonlocal cursor
        last_heartbeat = asyncio.get_running_loop().time()
        while True:
            # RunService.events checks the project and current grant before each row.
            # Fetching the run before every poll also reauthorizes empty polls and heartbeats.
            current = await services.runs.get(actor, project_id, run_id)
            rows = services.runs.events(actor, project_id, run_id, after=cursor)
            sent = False
            async for event in rows:
                if event.sequence <= cursor:
                    continue
                payload = json.dumps(event.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))
                yield f"id: {event.sequence}\nevent: {event.event_type}\ndata: {payload}\n\n".encode("utf-8")
                cursor = event.sequence
                sent = True
                if event.event_type in {"run_completed", "run_failed", "run_cancelled", "run_interrupted"}:
                    return
            now = asyncio.get_running_loop().time()
            if now - last_heartbeat >= HEARTBEAT_SECONDS:
                # `runs.get` above is the live authorization check for the heartbeat.
                yield b": heartbeat\n\n"
                last_heartbeat = now
            if current.status in {"completed", "failed", "cancelled", "interrupted"} and not sent:
                return
            await asyncio.sleep(POLL_SECONDS)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
