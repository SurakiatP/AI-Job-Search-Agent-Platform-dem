"""FR-P04 A2A push configs and tasks/list through the official a2a client; push reaches a local receiver."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from uuid import UUID

import httpx
import pytest
import uvicorn
from a2a.client import ClientCallContext, ClientConfig, create_client
from a2a.types import (
    CancelTaskRequest, DeleteTaskPushNotificationConfigRequest, GetTaskPushNotificationConfigRequest, ListTaskPushNotificationConfigsRequest,
    ListTasksRequest, TaskPushNotificationConfig, TaskState,
)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from test_a2a import _grant, _project_and_grant, _send, _start_a2a, _stop_a2a
from test_rest_api import api_context  # noqa: F401

CTX = ClientCallContext(service_parameters={"A2A-Version": "1.0"})
TOKEN = "synthetic-push-token-123"
JOB = {"job": {"title": "Synthetic engineer", "company": "Example Co", "source_url": "https://jobs.example.test/1",
               "description": "Synthetic role."}, "output_language": "en"}


async def _client(base_url, token):
    http = httpx.AsyncClient(headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"})
    return http, await create_client(base_url, ClientConfig(streaming=False, supported_protocol_bindings=["JSONRPC"], httpx_client=http))


@pytest.mark.integration
async def test_push_config_crud_delivery_and_list(api_context, unused_tcp_port, monkeypatch):
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    received = []

    async def hook(request: Request) -> Response:
        received.append({"headers": dict(request.headers), "body": await request.body()})
        return Response(status_code=204)
    hook_server = uvicorn.Server(uvicorn.Config(Starlette(routes=[Route("/push", hook, methods=["POST"])]),
                                                host="127.0.0.1", port=unused_tcp_port + 1, log_level="error"))
    hook_task = asyncio.create_task(hook_server.serve())
    while not hook_server.started:
        await asyncio.sleep(0.02)
    hook_url = f"http://127.0.0.1:{unused_tcp_port + 1}/push"

    csrf, project_id, grant = await asyncio.to_thread(_project_and_grant, api_context, ["jobs:evaluate", "results:read"])
    other = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:evaluate", "results:read"])
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    http, client = await _client(base_url, grant["token"])
    other_http, other_client = await _client(base_url, other["token"])
    try:
        task = await _send(client, "evaluate_job", {**JOB, "idempotency_key": "a2a-push-1"})
        second = await _send(client, "evaluate_job", {**JOB, "idempotency_key": "a2a-push-2"})
        created = await client.create_task_push_notification_config(
            TaskPushNotificationConfig(task_id=task.id, id="cfg-1", url=hook_url, token=TOKEN), context=CTX)
        assert created.id == "cfg-1" and created.url == hook_url and created.token == ""
        got = await client.get_task_push_notification_config(GetTaskPushNotificationConfigRequest(task_id=task.id, id="cfg-1"), context=CTX)
        assert got.url == hook_url
        listed = await client.list_task_push_notification_configs(ListTaskPushNotificationConfigsRequest(task_id=task.id), context=CTX)
        assert [c.id for c in listed.configs] == ["cfg-1"]

        with pytest.raises(Exception):  # short token
            await client.create_task_push_notification_config(
                TaskPushNotificationConfig(task_id=task.id, id="cfg-2", url=hook_url, token="short"), context=CTX)
        with pytest.raises(Exception):  # another grant's task
            await other_client.create_task_push_notification_config(
                TaskPushNotificationConfig(task_id=task.id, id="cfg-x", url=hook_url, token=TOKEN), context=CTX)

        await client.cancel_task(CancelTaskRequest(id=task.id), context=CTX)
        await services.webhooks.deliver_due()
        (push,) = [r for r in received if json.loads(r["body"]).get("statusUpdate", {}).get("taskId") == task.id]
        assert push["headers"]["x-a2a-notification-token"] == TOKEN
        t, v1 = (p.split("=", 1)[1] for p in push["headers"]["x-jsp-signature"].split(","))
        assert v1 == hmac.new(TOKEN.encode(), f"{t}.".encode() + push["body"], hashlib.sha256).hexdigest()
        assert json.loads(push["body"])["statusUpdate"]["status"]["state"] == "TASK_STATE_CANCELED"

        page = await client.list_tasks(ListTasksRequest(page_size=1), context=CTX)
        assert len(page.tasks) == 1 and page.next_page_token and page.total_size == 2
        rest = await client.list_tasks(ListTasksRequest(page_size=1, page_token=page.next_page_token), context=CTX)
        assert {page.tasks[0].id, rest.tasks[0].id} == {task.id, second.id}
        canceled = await client.list_tasks(ListTasksRequest(status=TaskState.TASK_STATE_CANCELED), context=CTX)
        assert [t.id for t in canceled.tasks] == [task.id]
        assert (await other_client.list_tasks(ListTasksRequest(), context=CTX)).tasks == []

        await client.delete_task_push_notification_config(DeleteTaskPushNotificationConfigRequest(task_id=task.id, id="cfg-1"), context=CTX)
        assert (await client.list_task_push_notification_configs(ListTaskPushNotificationConfigsRequest(task_id=task.id), context=CTX)).configs == []

        async with httpx.AsyncClient() as public:
            card = (await public.get(f"{base_url}/.well-known/agent-card.json")).json()
        assert card["capabilities"]["pushNotifications"] is True
    finally:
        await http.aclose()
        await other_http.aclose()
        await _stop_a2a(server, server_task)
        hook_server.should_exit = True
        await hook_task
