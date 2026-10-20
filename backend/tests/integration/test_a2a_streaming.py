"""FR-P04 A2A message/stream and tasks/subscribe with official SDK clients over live TCP."""

from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from a2a.client import ClientCallContext, ClientConfig, create_client
from a2a.types import SubscribeToTaskRequest, TaskState

from job_search_platform.db.models import Run
from test_a2a import _message, _project_and_grant, _start_a2a, _stop_a2a, api_context  # noqa: F401 (fixture)
from test_rest_api import _write_headers

CAPS = ["results:read", "jobs:evaluate"]
CTX = ClientCallContext(service_parameters={"A2A-Version": "1.0"})
JOB = {
    "job": {"title": "Synthetic data analyst", "company": "Example Co", "source_url": "https://jobs.example.test/da",
            "description": "Synthetic role description for streaming verification."},
    "output_language": "en",
}


def _kind(event) -> str:
    for field in ("task", "message", "status_update", "artifact_update"):
        if event.HasField(field):
            return field
    raise AssertionError(event)


def _state(event) -> str:
    status = event.task.status if event.HasField("task") else event.status_update.status
    return TaskState.Name(status.state)


async def _client(base_url: str, token: str, binding: str):
    http = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"}, timeout=30)
    client = await create_client(base_url, ClientConfig(streaming=True, supported_protocol_bindings=[binding], httpx_client=http))
    return client, http


async def _collect(stream, sink: list) -> None:
    async for event in stream:
        sink.append(event)


async def _wait_for(sink: list, count: int) -> None:
    async with asyncio.timeout(10):
        while len(sink) < count:
            await asyncio.sleep(0.05)


async def _run_worker(services, run_id: UUID) -> None:
    """Claim the run, hold it running long enough for a poll, then complete it."""
    claimed = await asyncio.to_thread(services.queue.claim_next, "a2a-stream-worker")
    assert claimed is not None and claimed.id == run_id
    await asyncio.sleep(1.2)
    await asyncio.to_thread(services.queue.finish, claimed.id, claimed.lease_owner, "completed",
                            evaluation_result={"report_markdown": "Synthetic streamed report.", "score": 4.0})


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("binding", ["JSONRPC", "HTTP+JSON"])
async def test_message_stream_reports_progress_artifact_and_end(api_context, unused_tcp_port, binding):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, CAPS)
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"], binding)
    try:
        async with httpx.AsyncClient() as public:
            card = (await public.get(f"{base_url}/.well-known/agent-card.json")).json()
        assert card["capabilities"]["streaming"] is True

        events: list = []
        stream = asyncio.create_task(_collect(client.send_message(
            _message("evaluate_job", {**JOB, "idempotency_key": f"stream-{binding}"}), context=CTX), events))
        await _wait_for(events, 1)
        assert _kind(events[0]) == "task" and _state(events[0]) == "TASK_STATE_SUBMITTED"
        run_id = UUID(events[0].task.id)
        await _run_worker(services, run_id)
        async with asyncio.timeout(10):
            await stream

        kinds = [_kind(e) for e in events]
        states = [_state(e) for e in events if _kind(e) == "status_update"]
        assert "TASK_STATE_WORKING" in states
        assert states[-1] == "TASK_STATE_COMPLETED" and kinds[-1] == "status_update"
        artifacts = [e.artifact_update for e in events if _kind(e) == "artifact_update"]
        assert len(artifacts) == 1 and artifacts[0].task_id == str(run_id) and artifacts[0].last_chunk
        uri = artifacts[0].artifact.parts[0].data.struct_value.fields["uri"].string_value
        assert uri.endswith(f"/artifacts/evaluations/{run_id}")
        assert kinds.index("artifact_update") < len(kinds) - 1  # artifact arrives before the final status
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("binding", ["JSONRPC", "HTTP+JSON"])
async def test_subscribe_follows_a_running_task_and_rejects_ended_or_foreign_tasks(api_context, unused_tcp_port, binding):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, CAPS)
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"], binding)
    other_client = other_http = None
    try:
        # Read only the first event, then disconnect: the run keeps going without the stream.
        async for first in client.send_message(
                _message("evaluate_job", {**JOB, "idempotency_key": f"sub-{binding}"}), context=CTX):
            break
        run_id = UUID(first.task.id)
        events: list = []
        stream = asyncio.create_task(_collect(client.subscribe(SubscribeToTaskRequest(id=str(run_id)), context=CTX), events))
        await _wait_for(events, 1)
        assert _kind(events[0]) == "task" and events[0].task.id == str(run_id)
        await _run_worker(services, run_id)
        async with asyncio.timeout(10):
            await stream
        assert _state(events[-1]) == "TASK_STATE_COMPLETED"
        assert any(_kind(e) == "artifact_update" for e in events)

        # The adapter sanitises every error to request_rejected on the wire (see test_a2a.py).
        ended: list = []
        with pytest.raises(Exception) as ended_error:
            async for event in client.subscribe(SubscribeToTaskRequest(id=str(run_id)), context=CTX):
                ended.append(event)
        assert ended == []
        if binding == "JSONRPC":
            assert "request_rejected" in str(ended_error.value)

        # A foreign task is indistinguishable from one that does not exist.
        _c2, _p2, other = await asyncio.to_thread(_project_and_grant, api_context, CAPS)
        other_client, other_http = await _client(base_url, other["token"], binding)
        with pytest.raises(Exception) as foreign:
            [e async for e in other_client.subscribe(SubscribeToTaskRequest(id=str(run_id)), context=CTX)]
        with pytest.raises(Exception) as missing:
            [e async for e in other_client.subscribe(SubscribeToTaskRequest(id=str(uuid4())), context=CTX)]
        assert str(foreign.value) == str(missing.value) and str(foreign.value)
    finally:
        await http.aclose()
        if other_http:
            await other_http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_stream_ends_when_the_run_waits_for_its_owner(api_context, unused_tcp_port):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, CAPS)
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"], "JSONRPC")
    try:
        events: list = []
        stream = asyncio.create_task(_collect(client.send_message(
            _message("evaluate_job", {**JOB, "idempotency_key": "stream-rest"}), context=CTX), events))
        await _wait_for(events, 1)
        with api_context.sessions.begin() as db:
            db.get(Run, UUID(events[0].task.id)).status = "needs_input"
        async with asyncio.timeout(10):
            await stream
        assert _state(events[-1]) == "TASK_STATE_INPUT_REQUIRED"
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_stream_stops_when_the_grant_is_revoked_and_needs_results_access(api_context, unused_tcp_port):
    csrf, project_id, grant = await asyncio.to_thread(_project_and_grant, api_context, CAPS)
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"], "JSONRPC")
    try:
        events: list = []
        stream = asyncio.create_task(_collect(client.send_message(
            _message("evaluate_job", {**JOB, "idempotency_key": "stream-revoke"}), context=CTX), events))
        await _wait_for(events, 1)
        revoked = await asyncio.to_thread(api_context.client.delete, f"/v1/projects/{project_id}/grants/{grant['id']}",
                                          headers=_write_headers(csrf))
        assert revoked.status_code == 204
        with pytest.raises(Exception):
            async with asyncio.timeout(10):
                await stream
        assert all(_kind(e) != "artifact_update" for e in events)

        from test_a2a import _grant
        submit_only = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:evaluate"])
        limited, limited_http = await _client(base_url, submit_only["token"], "JSONRPC")
        try:
            with pytest.raises(Exception):
                [e async for e in limited.send_message(
                    _message("evaluate_job", {**JOB, "idempotency_key": "stream-no-read"}), context=CTX)]
        finally:
            await limited_http.aclose()
        with api_context.sessions() as db:
            from sqlalchemy import func, select
            assert db.scalar(select(func.count()).select_from(Run).where(Run.idempotency_key == "stream-no-read")) == 0
    finally:
        await http.aclose()
        await _stop_a2a(server, task)
