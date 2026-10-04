"""Live TCP streaming checks supplement deterministic persisted-event tests."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import pytest
import uvicorn
from sqlalchemy import select

from job_search_platform.api import sse
from job_search_platform.db.models import Grant, Run
from test_rest_api import _write_headers, api_context
from test_sse import _create_run


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_http_replay_disconnect_and_grant_revocation(api_context, monkeypatch, unused_tcp_port):
    project_id, run_id, csrf, _ = await asyncio.to_thread(_create_run, api_context)
    issued = api_context.client.post(
        f"/api/v1/projects/{project_id}/grants",
        json={"capabilities": ["results:read"], "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()},
        headers=_write_headers(csrf),
    )
    assert issued.status_code == 201
    grant = issued.json()
    monkeypatch.setattr(sse, "POLL_SECONDS", 0.02)
    monkeypatch.setattr(sse, "HEARTBEAT_SECONDS", 0.05)
    # The fixture has already entered this app's lifespan with controlled workers.
    # Production worker/factory startup is independently exercised in startup tests.
    server = uvicorn.Server(uvicorn.Config(api_context.client.app, host="127.0.0.1", port=unused_tcp_port, lifespan="off", access_log=False, log_level="critical"))
    task = asyncio.create_task(server.serve())
    headers = {"Authorization": f"Bearer {grant['token']}"}
    path = f"/api/v1/projects/{project_id}/runs/{run_id}/events"
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("stream_server_failed_startup")
                await asyncio.sleep(0.02)
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{unused_tcp_port}", timeout=3) as client:
            async with client.stream("GET", path, headers=headers) as response:
                assert response.status_code == 200
                assert response.headers["content-type"].startswith("text/event-stream")
                async for line in response.aiter_lines():
                    if line == "id: 1":
                        break
            with api_context.sessions() as db:
                run = db.scalar(select(Run).where(Run.id == UUID(run_id)))
                assert run.status == "queued"
                assert run.cancellation_requested_at is None
            replay_headers = {**headers, "Last-Event-ID": "1"}
            async with client.stream("GET", path, headers=replay_headers) as response:
                assert response.status_code == 200
                lines = response.aiter_lines()
                async with asyncio.timeout(3):
                    async for line in lines:
                        assert not line.startswith("id:")
                        if line.startswith(": heartbeat"):
                            break
                with api_context.sessions.begin() as db:
                    row = db.scalar(select(Grant).where(Grant.id == UUID(grant["id"])).with_for_update())
                    row.revoked_at = datetime.now(timezone.utc)
                stopped = False
                try:
                    async with asyncio.timeout(3):
                        async for line in lines:
                            assert not line.startswith("id:")
                    stopped = True
                except httpx.RemoteProtocolError:
                    stopped = True
                assert stopped
            denied = await client.get(path, headers=headers)
            assert denied.status_code == 401
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, timeout=10)
