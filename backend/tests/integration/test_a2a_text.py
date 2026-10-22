"""A2A for LLM agents (Hermes and similar): plain-text guide, skill JSON in a text part, blocking SendMessage."""

from __future__ import annotations

import asyncio
import json
from uuid import UUID, uuid4

import httpx
import pytest
from a2a.client import ClientCallContext, ClientConfig, create_client
from a2a.types import SendMessageRequest, TaskState
from google.protobuf.json_format import MessageToDict, ParseDict

from test_a2a import _grant, _project_and_grant, _start_a2a, _stop_a2a, api_context  # noqa: F401 (fixture)
from test_mcp import STRUCTURED
from job_search_platform.services import job_sources

CTX = ClientCallContext(service_parameters={"A2A-Version": "1.0"})
JOB = {"title": "Synthetic data analyst", "company": "Example Co", "description": "Synthetic role for text-mode A2A."}


def _text(text: str) -> SendMessageRequest:
    return ParseDict({"message": {"messageId": str(uuid4()), "role": "ROLE_USER", "parts": [{"text": text}]}}, SendMessageRequest())


async def _client(base_url, token, *, polling=False):
    http = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"}, timeout=60)
    return await create_client(base_url, ClientConfig(streaming=False, polling=polling, supported_protocol_bindings=["JSONRPC"],
                                                       httpx_client=http)), http


async def _one(client, request):
    events = [e async for e in client.send_message(request, context=CTX)]
    assert len(events) == 1
    return events[0]


def _reply_text(event) -> str:
    message = event.message if event.HasField("message") else event.task.status.message
    return "\n".join(part.text for part in message.parts)


async def _finish_when_queued(services, report: str | dict) -> None:
    async with asyncio.timeout(10):
        while (claimed := await asyncio.to_thread(services.queue.claim_next, "a2a-text-worker")) is None:
            await asyncio.sleep(0.1)
    await asyncio.sleep(0.6)
    result = report if isinstance(report, dict) else {"report_markdown": report, "score": 4.0}
    await asyncio.to_thread(services.queue.finish, claimed.id, claimed.lease_owner, "completed", evaluation_result=result)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_plain_text_gets_a_guide_listing_only_the_grants_skills(api_context, unused_tcp_port):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, ["jobs:search"])
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"])
    try:
        guide = _reply_text(await _one(client, _text("Find me 3 data analyst jobs in Bangkok")))
        assert "jobs_search" in guide and '"skill"' in guide and '"request"' in guide
        assert "evaluate_job" not in guide  # this grant cannot evaluate
        assert "Bangkok" not in guide  # input is never reflected
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_skill_json_in_text_runs_a_direct_skill(api_context, unused_tcp_port, monkeypatch):
    # Routing is under test, not Meilisearch: an empty index answer keeps this independent of local job data.
    monkeypatch.setattr(job_sources, "_search", lambda payload: {"hits": [], "estimatedTotalHits": 0, "facetDistribution": {}})
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, ["jobs:search"])
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"])
    try:
        body = json.dumps({"skill": "jobs_search", "request": {"q": "python", "limit": 2}})
        event = await _one(client, _text(f"```json\n{body}\n```"))
        assert event.HasField("message")
        data = MessageToDict(event.message.parts[0].data)
        assert "jobs" in data

        bad = _reply_text(await _one(client, _text(json.dumps({"skill": "jobs_search", "request": {"limit": 999}}))))
        assert "did not match" in bad and "jobs_search" in bad and "999" not in bad
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_blocking_send_waits_and_returns_the_report_text(api_context, unused_tcp_port):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, ["results:read", "jobs:evaluate"])
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"])
    try:
        body = json.dumps({"skill": "evaluate_job", "request": {"job": JOB, "output_language": "en", "idempotency_key": "text-block-1"}})
        worker = asyncio.create_task(_finish_when_queued(services, "Synthetic blocking report."))
        event = await _one(client, _text(body))
        await worker
        assert TaskState.Name(event.task.status.state) == "TASK_STATE_COMPLETED"
        artifact = event.task.artifacts[0]
        assert "Synthetic blocking report." in [p.text for p in artifact.parts]
        assert any(p.HasField("data") for p in artifact.parts)  # the authorized URI stays
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tc_evr_06_structured_report_reaches_a2a_as_its_markdown(api_context, unused_tcp_port):
    _csrf, _pid, grant = await asyncio.to_thread(_project_and_grant, api_context, ["results:read", "jobs:evaluate"])
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"])
    try:
        body = json.dumps({"skill": "evaluate_job", "request": {"job": JOB, "output_language": "en", "idempotency_key": "text-evr-06"}})
        worker = asyncio.create_task(_finish_when_queued(services, STRUCTURED.model_dump(mode="json")))
        event = await _one(client, _text(body))
        await worker
        assert TaskState.Name(event.task.status.state) == "TASK_STATE_COMPLETED"
        texts = [p.text for p in event.task.artifacts[0].parts if p.text]
        assert texts == [STRUCTURED.report_markdown]
        assert "Synthetic verdict" in texts[0]
    finally:
        await http.aclose()
        await _stop_a2a(server, task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_return_immediately_and_submit_only_grants_do_not_wait(api_context, unused_tcp_port):
    csrf, project_id, grant = await asyncio.to_thread(_project_and_grant, api_context, ["results:read", "jobs:evaluate"])
    services = api_context.client.app.state.services
    base_url, _app, server, task = await _start_a2a(services, unused_tcp_port)
    client, http = await _client(base_url, grant["token"], polling=True)
    submit_only = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:evaluate"])
    blind, blind_http = await _client(base_url, submit_only["token"])
    try:
        body = {"skill": "evaluate_job", "request": {"job": JOB, "output_language": "en", "idempotency_key": "text-now-1"}}
        async with asyncio.timeout(5):
            event = await _one(client, _text(json.dumps(body)))
        assert TaskState.Name(event.task.status.state) == "TASK_STATE_SUBMITTED"
        body["request"]["idempotency_key"] = "text-now-2"
        async with asyncio.timeout(5):  # cannot read results, so it cannot wait for them either
            event = await _one(blind, _text(json.dumps(body)))
        assert TaskState.Name(event.task.status.state) == "TASK_STATE_SUBMITTED"
        UUID(event.task.id)
    finally:
        await http.aclose()
        await blind_http.aclose()
        await _stop_a2a(server, task)
