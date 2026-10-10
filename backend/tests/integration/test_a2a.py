"""Official A2A SDK clients against the live, durable platform adapter."""

from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import httpx
import pytest
import uvicorn
from a2a.client import ClientCallContext, ClientConfig, create_client
from a2a.types import (
    CancelTaskRequest,
    GetTaskRequest,
    SendMessageRequest,
    TaskState,
)
from google.protobuf.json_format import ParseDict

from job_search_platform.api.shared import create_shared_app
from sqlalchemy import select

from job_search_platform.db.models import DocumentRevision, Project, Run
from job_search_platform.integrations.hermes_runtime import HermesRuntime
from job_search_platform.workers.executor import RunExecutor
from test_rest_api import _owner, _write_headers, api_context as _base_api_context
from helpers import completed_extract_run
from test_runs import provider_config, revisions


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _base_api_context.__wrapped__(migrated_engine, tmp_path)


async def _start_a2a(services, port: int):
    host = "127.0.0.1"
    base_url = f"http://{host}:{port}"
    app = create_shared_app(services, host=host, port=port)
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False, log_level="error")
    )
    task = asyncio.create_task(server.serve())
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("a2a_server_failed_startup")
                await asyncio.sleep(0.02)
    except BaseException:
        server.should_exit = True
        await task
        raise
    return base_url, app, server, task


async def _stop_a2a(server, task) -> None:
    server.should_exit = True
    await task


def _grant(api_context, project_id: UUID, csrf: str, capabilities: list[str]) -> dict:
    response = api_context.client.post(
        f"/api/v1/projects/{project_id}/grants",
        json={
            "capabilities": capabilities,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        },
        headers=_write_headers(csrf),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _message(skill: str, request: dict) -> SendMessageRequest:
    return ParseDict(
        {
            "message": {
                "role": "ROLE_USER",
                "metadata": {"skill_id": skill},
                "parts": [{"data": request}],
            }
        },
        SendMessageRequest(),
    )


async def _send(client, skill: str, request: dict) -> object:
    events = [
        event
        async for event in client.send_message(
            _message(skill, request), context=ClientCallContext(service_parameters={"A2A-Version": "1.0"})
        )
    ]
    assert events
    task = next((event.task for event in reversed(events) if event.HasField("task")), None)
    assert task is not None
    return task


def _project_and_grant(api_context, capabilities: list[str]):
    csrf = _owner(api_context)
    created = api_context.client.post(
        "/api/v1/projects", json={"name": "Synthetic A2A project"}, headers=_write_headers(csrf)
    )
    assert created.status_code == 201
    project_id = UUID(created.json()["id"])
    with api_context.sessions.begin() as db:
        project = db.get(Project, project_id)
        revisions(db, project.id)
        provider_config(db, project.id)
    return csrf, project_id, _grant(api_context, project_id, csrf, capabilities)


async def _publish_document(api_context, services, project_id: UUID, claimed) -> UUID:
    staging = services.artifacts.staging_root_for_run(project_id, claimed.id)
    staging.mkdir(parents=True, exist_ok=True)
    body = b"%PDF-1.7\nSynthetic A2A cover letter\n%%EOF\n"
    output = staging / "cover-letter.pdf"
    output.write_bytes(body)
    with services.sessions() as db:
        run = db.get(Run, claimed.id)
        cv_id, job_id = run.cv_revision_id, run.job_revision_id
    published = await services.artifacts.publish(
        project_id,
        claimed.id,
        {
            "staging_dir": str(staging),
            "lease_owner": claimed.lease_owner,
            "files": [
            {
                "path": output.name,
                "document_type": "cover_letter",
                "title": "Synthetic cover letter",
                "display_name": output.name,
                "mime_type": "application/pdf",
                "sha256": hashlib.sha256(body).hexdigest(),
                "source_cv_revision_id": str(cv_id),
                "source_job_revision_id": str(job_id),
                "content_markdown": "Synthetic A2A cover letter body.",
            }
            ],
        },
    )
    await asyncio.to_thread(
        services.queue.finish,
        claimed.id,
        claimed.lease_owner,
        "completed",
    )
    with services.sessions() as db:
        document_id = db.scalar(
            select(DocumentRevision.document_id).where(
                DocumentRevision.project_id == project_id,
                DocumentRevision.file_id == published[0].id,
            )
        )
    return document_id


@pytest.mark.integration
@pytest.mark.asyncio
async def test_official_a2a_clients_use_durable_runs_and_authorized_artifacts(api_context, unused_tcp_port):
    csrf, project_id, grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["results:read", "jobs:evaluate", "documents:draft"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    http_client = httpx.AsyncClient(
        headers={"Authorization": f"Bearer {grant['token']}", "A2A-Version": "1.0"}
    )
    try:
        async with httpx.AsyncClient() as public_client:
            card_response = await public_client.get(f"{base_url}/.well-known/agent-card.json")
        assert card_response.status_code == 200
        card = card_response.json()
        assert [skill["id"] for skill in card["skills"]] == ["evaluate_job", "draft_documents", "tailor_cv"]
        assert card["capabilities"]["extendedAgentCard"] is True
        assert "extract_experience" not in json.dumps(card)
        assert {interface["protocolBinding"] for interface in card["supportedInterfaces"]} == {
            "JSONRPC",
            "HTTP+JSON",
        }
        assert all(interface["url"] == base_url for interface in card["supportedInterfaces"])
        assert "projects" not in json.dumps(card).lower()

        request = {
            "job": {
                "title": "Synthetic platform engineer",
                "company": "Example Co",
                "source_url": "https://jobs.example.test/platform",
                "description": "Synthetic role description for protocol verification.",
            },
            "output_language": "en",
            "idempotency_key": "a2a-durable-evaluation-01",
        }
        jsonrpc = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=http_client,
            ),
        )
        submitted = await _send(jsonrpc, "evaluate_job", request)
        run_id = UUID(submitted.id)
        assert TaskState.Name(submitted.status.state) == "TASK_STATE_SUBMITTED"
        replay = await _send(jsonrpc, "evaluate_job", request)
        assert replay.id == submitted.id

        async with httpx.AsyncClient(
            headers={"Authorization": f"Bearer {grant['token']}"}
        ) as check_client:
            assert (await check_client.get(f"{base_url}/api/v1/projects")).status_code == 404
            assert (await check_client.get(f"{base_url}/owner/session")).status_code == 404
            assert (await check_client.get(f"{base_url}/app")).status_code == 404

        # A second official client uses the SDK's HTTP+JSON binding against the same run.
        http_json = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["HTTP+JSON"],
                httpx_client=http_client,
            ),
        )
        draft_request = {**request, "idempotency_key": "a2a-http-json-draft-01"}
        draft = await _send(http_json, "draft_documents", draft_request)
        assert TaskState.Name(draft.status.state) == "TASK_STATE_SUBMITTED"

        claimed = await asyncio.to_thread(services.queue.claim_next, "a2a-test-worker")
        assert claimed is not None and claimed.id == run_id
        await asyncio.to_thread(
            services.queue.finish,
            claimed.id,
            claimed.lease_owner,
            "completed",
            evaluation_result={
                "report_markdown": "Synthetic A2A evaluation report.",
                "score": 4.5,
            },
        )

        # A new app/server instance still resolves task state from PostgreSQL.
        await _stop_a2a(server, server_task)
        base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
        persisted_client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=http_client,
            ),
        )
        context = ClientCallContext(service_parameters={"A2A-Version": "1.0"})
        recovered = await persisted_client.get_task(GetTaskRequest(id=str(run_id)), context=context)
        assert TaskState.Name(recovered.status.state) == "TASK_STATE_COMPLETED"
        assert len(recovered.artifacts) == 1
        artifact_url = recovered.artifacts[0].parts[0].data.struct_value.fields["uri"].string_value
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {grant['token']}"}) as download:
            artifact = await download.get(artifact_url)
        assert artifact.status_code == 200
        assert artifact.text == "Synthetic A2A evaluation report."

        draft_claim = await asyncio.to_thread(services.queue.claim_next, "a2a-synthetic-draft-worker")
        assert draft_claim is not None and draft_claim.id == UUID(draft.id)
        assert draft_claim.output_language == "en"
        document_id = await _publish_document(api_context, services, project_id, draft_claim)
        drafted = await persisted_client.get_task(
            GetTaskRequest(id=draft.id),
            context=context,
        )
        assert TaskState.Name(drafted.status.state) == "TASK_STATE_COMPLETED"
        document_uri = drafted.artifacts[0].parts[0].data.struct_value.fields["uri"].string_value
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {grant['token']}"}) as download:
            document_response = await download.get(document_uri)
            assert document_response.status_code == 200
            assert document_response.text == "Synthetic A2A cover letter body."

        # A valid submission token must receive a stable denial on result-only routes.
        restricted = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["jobs:evaluate"])
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {restricted['token']}"}) as download:
            for uri in (artifact_url, document_uri):
                denied = await download.get(uri)
                assert denied.status_code == 403
                assert denied.json() == {"error": "request_rejected"}

        cancel_run = await _send(
            jsonrpc,
            "evaluate_job",
            {**request, "idempotency_key": "a2a-durable-cancel-01"},
        )
        canceled = await persisted_client.cancel_task(CancelTaskRequest(id=cancel_run.id), context=context)
        assert TaskState.Name(canceled.status.state) == "TASK_STATE_CANCELED"
        recovered_cancel = await persisted_client.get_task(GetTaskRequest(id=cancel_run.id), context=context)
        assert TaskState.Name(recovered_cancel.status.state) == "TASK_STATE_CANCELED"

        with api_context.sessions.begin() as db:
            durable = db.get(Run, run_id)
            assert durable.status == "completed"
            assert durable.project_id == project_id
            draft_record = db.get(Run, UUID(draft.id))
            assert draft_record.status == "completed"
            assert draft_record.output_language == "en"

        revoked = api_context.client.delete(
            f"/api/v1/projects/{project_id}/grants/{grant['id']}", headers=_write_headers(csrf)
        )
        assert revoked.status_code == 204
        async with httpx.AsyncClient(headers={"Authorization": f"Bearer {grant['token']}"}) as download:
            assert (await download.get(artifact_url)).status_code == 401
            assert (await download.get(document_uri)).status_code == 401
    finally:
        await http_client.aclose()
        if not server_task.done():
            await _stop_a2a(server, server_task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a2a_rechecks_grants_and_never_reflects_rejected_input(api_context, unused_tcp_port, caplog):
    csrf, project_id, grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["results:read", "jobs:evaluate"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    url = f"{base_url}/"
    try:
        headers = {"Authorization": f"Bearer {grant['token']}"}
        caplog.set_level("DEBUG", logger="a2a.server.routes.jsonrpc_dispatcher")
        caplog.clear()
        async with httpx.AsyncClient(headers=headers) as client:
            malformed = await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "SendMessage",
                    "params": {
                        "message": {
                            "role": "ROLE_USER",
                            "metadata": {"skill_id": "evaluate_job"},
                            "parts": [
                                {
                                    "data": {
                                        "job": {
                                            "title": "SYNTHETIC_RAW_INPUT_SENTINEL",
                                            "company": "Example Co",
                                            "description": "Rejected payload.",
                                            "unknown": "SYNTHETIC_RAW_INPUT_SENTINEL",
                                        },
                                        "output_language": "en",
                                        "idempotency_key": "a2a-malformed-01",
                                    }
                                }
                            ],
                        }
                    },
                },
                headers={"A2A-Version": "1.0"},
            )
            assert malformed.status_code == 200
            assert "SYNTHETIC_RAW_INPUT_SENTINEL" not in malformed.text
            assert "SYNTHETIC_RAW_INPUT_SENTINEL" not in caplog.text

            invalid_token = await client.get(
                f"{base_url}/tasks/00000000-0000-4000-8000-000000000001",
                headers={"Authorization": "Bearer SYNTHETIC_BEARER_SENTINEL"},
            )
            assert invalid_token.status_code == 401
            assert "SYNTHETIC_BEARER_SENTINEL" not in invalid_token.text

        request = {
            "job": {
                "title": "Synthetic role",
                "company": "Example Co",
                "source_url": "https://jobs.example.test/role",
                "description": "Synthetic input.",
            },
            "output_language": "en",
            "idempotency_key": "a2a-revocation-01",
        }
        client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=httpx.AsyncClient(headers={**headers, "A2A-Version": "1.0"}),
            ),
        )
        created = await _send(client, "evaluate_job", request)
        # Owner-only experience-bank extraction is neither a skill nor a task a grant can read.
        with api_context.sessions.begin() as db:
            extract_id = completed_extract_run(db, project_id)
        a2a_context = ClientCallContext(service_parameters={"A2A-Version": "1.0"})
        assert (await client.get_task(GetTaskRequest(id=created.id), context=a2a_context)).id == created.id
        # The adapter maps TaskNotFound to the generic request_rejected on the wire.
        with pytest.raises(Exception, match="request_rejected"):
            await client.get_task(GetTaskRequest(id=str(extract_id)), context=a2a_context)
        response = api_context.client.delete(
            f"/api/v1/projects/{project_id}/grants/{grant['id']}", headers=_write_headers(csrf)
        )
        assert response.status_code == 204
        async with httpx.AsyncClient(headers=headers) as revoked_client:
            denied = await revoked_client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tasks/get",
                    "params": {"id": created.id},
                },
            )
        assert denied.status_code == 401
        assert "SYNTHETIC_BEARER_SENTINEL" not in denied.text
    finally:
        await _stop_a2a(server, server_task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_official_a2a_cancel_waits_for_real_native_cleanup(api_context, unused_tcp_port):
    _csrf, project_id, grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["results:read", "jobs:evaluate"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    http_client = httpx.AsyncClient(
        headers={"Authorization": f"Bearer {grant['token']}", "A2A-Version": "1.0"}
    )
    client = await create_client(
        base_url,
        ClientConfig(streaming=False, supported_protocol_bindings=["JSONRPC"], httpx_client=http_client),
    )
    cache = Path.home() / ".cache" / "job-search-platform"
    runtime_config = json.loads((cache / "hermes-runtime.json").read_text(encoding="utf-8"))
    runtime_root = cache / "hermes-proofs" / f"a2a-cancel-{UUID(int=unused_tcp_port)}"
    runtime = HermesRuntime(
        runtime_config["image"],
        environment=Path(runtime_config["environment"]),
        hermes_source=Path(runtime_config["hermes"]["source"]),
        career_ops_source=Path(runtime_config["career-ops"]["source"]),
        workspace_root=runtime_root,
    )
    started = False
    run_id: UUID | None = None
    running_tool: asyncio.Task | None = None
    try:
        task = await _send(
            client,
            "evaluate_job",
            {
                "job": {
                    "title": "Synthetic cancellation role",
                    "company": "Example Co",
                    "source_url": "https://jobs.example.test/cancel",
                    "description": "Synthetic input for real native cancellation verification.",
                },
                "output_language": "en",
                "idempotency_key": "a2a-real-native-cancel-01",
            },
        )
        run_id = UUID(task.id)
        lease_owner = f"a2a-native-cancel-{unused_tcp_port}"
        claimed = await asyncio.to_thread(services.queue.claim_next, lease_owner)
        assert claimed is not None and claimed.id == run_id and claimed.status == "running"

        workspace = runtime_root / str(project_id) / str(run_id)
        workspace.mkdir(parents=True, exist_ok=True)
        native = await runtime.start_project(project_id, workspace)
        started = True

        async def reserve_tool(_call_id: str, _name: str) -> bool:
            try:
                await asyncio.to_thread(services.queue.reserve_tool_call, run_id, lease_owner)
                return True
            except Exception:
                return False

        native.tool_gate = reserve_tool
        running_tool = asyncio.create_task(
            runtime._request(
                native,
                "tool",
                name="terminal",
                arguments={"command": "touch /workspace/cancel-marker && sleep 60", "timeout": 90},
            )
        )
        marker = workspace / "cancel-marker"
        async with asyncio.timeout(15):
            while not marker.exists():
                if running_tool.done():
                    await running_tool
                    raise AssertionError("native_terminal_tool_did_not_start")
                await asyncio.sleep(0.05)

        first_cancel = await client.cancel_task(
            CancelTaskRequest(id=str(run_id)),
            context=ClientCallContext(service_parameters={"A2A-Version": "1.0"}),
        )
        assert TaskState.Name(first_cancel.status.state) == "TASK_STATE_WORKING"
        assert first_cancel.metadata.fields["cancellation_requested"].bool_value
        process = native.process
        assert process.returncode is None and project_id in runtime.projects
        with services.sessions() as db:
            persisted = db.get(Run, run_id)
            assert persisted.status == "running"
            assert persisted.cancellation_requested_at is not None

        executor = RunExecutor(
            services.sessions,
            services.queue,
            runtime,
            services.settings,
            services.artifacts,
            services.files.object_store,
            workspace_root=runtime_root,
        )
        await executor._stop(project_id, started=True)
        assert process.returncode is not None
        assert project_id not in runtime.projects
        assert running_tool is not None
        try:
            await asyncio.wait_for(running_tool, timeout=5)
        except Exception:
            pass

        with services.sessions() as db:
            run_record = db.get(Run, run_id)
        await executor._finish_after_stop(run_record, lease_owner, "cancelled", "errors.cancelled")
        final_cancel = await client.cancel_task(
            CancelTaskRequest(id=str(run_id)),
            context=ClientCallContext(service_parameters={"A2A-Version": "1.0"}),
        )
        assert TaskState.Name(final_cancel.status.state) == "TASK_STATE_CANCELED"
        with services.sessions() as db:
            persisted = db.get(Run, run_id)
            assert persisted.status == "cancelled"
    finally:
        if started:
            await runtime.close(project_id)
        if running_tool is not None and not running_tool.done():
            running_tool.cancel()
            await asyncio.gather(running_tool, return_exceptions=True)
        await http_client.aclose()
        await _stop_a2a(server, server_task)
        shutil.rmtree(runtime_root, ignore_errors=True)


async def _extended_card(base_url: str, token: str) -> httpx.Response:
    async with httpx.AsyncClient() as client:
        return await client.post(
            f"{base_url}/",
            json={"jsonrpc": "2.0", "id": 1, "method": "GetExtendedAgentCard", "params": {}},
            headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"},
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_extended_agent_card_filters_by_grant_capabilities(api_context, unused_tcp_port):
    csrf, project_id, evaluate_grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["jobs:evaluate"]
    )
    read_grant = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["results:read"])
    full_grant = await asyncio.to_thread(
        _grant, api_context, project_id, csrf, ["results:read", "jobs:evaluate", "documents:draft"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        cards = {}
        for label, grant in (("evaluate", evaluate_grant), ("read", read_grant), ("full", full_grant)):
            response = await _extended_card(base_url, grant["token"])
            assert response.status_code == 200, response.text
            cards[label] = response.json()["result"]
        assert [skill["id"] for skill in cards["evaluate"]["skills"]] == ["evaluate_job"]
        assert cards["read"].get("skills", []) == []
        assert [skill["id"] for skill in cards["full"]["skills"]] == ["evaluate_job", "draft_documents"]
        assert "extract_experience" not in json.dumps(cards)

        revoked = api_context.client.delete(
            f"/api/v1/projects/{project_id}/grants/{evaluate_grant['id']}", headers=_write_headers(csrf)
        )
        assert revoked.status_code == 204
        denied = await _extended_card(base_url, evaluate_grant["token"])
        assert denied.status_code == 401
    finally:
        await _stop_a2a(server, server_task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a2a_rejects_owner_only_skill_id(api_context, unused_tcp_port):
    csrf, project_id, grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["results:read", "jobs:evaluate", "documents:draft"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        with api_context.sessions() as db:
            before = len(db.scalars(select(Run).where(Run.project_id == project_id)).all())
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/",
                json={
                    "jsonrpc": "2.0", "id": 1, "method": "SendMessage",
                    "params": {"message": {
                        "role": "ROLE_USER",
                        "metadata": {"skill_id": "extract_experience"},
                        "parts": [{"data": {
                            "job": {"title": "Synthetic", "description": "Synthetic input."},
                            "output_language": "en",
                            "idempotency_key": "a2a-owner-only-01",
                        }}],
                    }},
                },
                headers={"Authorization": f"Bearer {grant['token']}", "A2A-Version": "1.0"},
            )
        body = response.json()
        assert "result" not in body and "error" in body
        with api_context.sessions() as db:
            after = len(db.scalars(select(Run).where(Run.project_id == project_id)).all())
        assert after == before
    finally:
        await _stop_a2a(server, server_task)
