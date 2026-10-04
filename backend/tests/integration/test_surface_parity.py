"""Cross-transport authorization and durable-run parity on the shared listener."""

from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
import pytest
import uvicorn
from a2a.client import A2AClientError
from a2a.client import ClientConfig, create_client
from a2a.types import GetTaskRequest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from mcp.shared.exceptions import MCPError

from job_search_platform.api.shared import create_shared_app
from job_search_platform.db.models import Grant, Project
from job_search_platform.services.owner_sessions import COOKIE_NAME
from test_a2a import _send
from test_mcp import _session
from test_rest_api import _owner, _write_headers, api_context as _base_api_context


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _base_api_context.__wrapped__(migrated_engine, tmp_path)


def _create_project(api_context, csrf: str, name: str) -> UUID:
    response = api_context.client.post(
        "/api/v1/projects",
        json={"name": name},
        headers=_write_headers(csrf),
    )
    assert response.status_code == 201, response.text
    project_id = UUID(response.json()["id"])
    with api_context.sessions.begin() as db:
        project = db.get(Project, project_id)
        assert project is not None
        from test_runs import provider_config, revisions

        revisions(db, project.id)
        provider_config(db, project.id)
    return project_id


def _issue_grant(api_context, csrf: str, project_id: UUID, capabilities: list[str]) -> dict:
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


def _expired_token(api_context, project_id: UUID) -> str:
    token = secrets.token_urlsafe(32)
    with api_context.sessions.begin() as db:
        db.add(
            Grant(
                project_id=project_id,
                token_hash=hashlib.sha256(token.encode()).digest(),
                capabilities=["jobs:evaluate", "documents:draft", "results:read"],
                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
    return token


async def _start_shared(services, port: int):
    app = create_shared_app(services, host="127.0.0.1", port=port)
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False, log_level="error")
    )
    task = asyncio.create_task(server.serve())
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("shared_server_failed_startup")
                await asyncio.sleep(0.02)
    except BaseException:
        server.should_exit = True
        await task
        raise
    return f"http://127.0.0.1:{port}", server, task


async def _stop_shared(server, task) -> None:
    server.should_exit = True
    await asyncio.wait_for(task, timeout=10)


async def _start_owner_rest(app, port: int):
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False, log_level="error")
    )
    task = asyncio.create_task(server.serve())
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("owner_rest_server_failed_startup")
                await asyncio.sleep(0.02)
    except BaseException:
        server.should_exit = True
        await task
        raise
    return f"http://127.0.0.1:{port}", server, task


async def _stop_owner_rest(server, task) -> None:
    server.should_exit = True
    await asyncio.wait_for(task, timeout=10)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_shared_surfaces_preserve_run_identity_and_project_capabilities(
    api_context, unused_tcp_port_factory
):
    csrf = await asyncio.to_thread(_owner, api_context)
    project_a = await asyncio.to_thread(_create_project, api_context, csrf, "Synthetic parity A")
    project_b = await asyncio.to_thread(_create_project, api_context, csrf, "Synthetic parity B")
    full = await asyncio.to_thread(
        _issue_grant,
        api_context,
        csrf,
        project_a,
        ["jobs:evaluate", "documents:draft", "results:read"],
    )
    read_only = await asyncio.to_thread(
        _issue_grant, api_context, csrf, project_a, ["results:read"]
    )
    evaluate_only = await asyncio.to_thread(
        _issue_grant, api_context, csrf, project_a, ["jobs:evaluate"]
    )
    draft_only = await asyncio.to_thread(
        _issue_grant, api_context, csrf, project_a, ["documents:draft"]
    )
    project_b_grant = await asyncio.to_thread(
        _issue_grant,
        api_context,
        csrf,
        project_b,
        ["jobs:evaluate", "documents:draft", "results:read"],
    )
    expired_token = await asyncio.to_thread(_expired_token, api_context, project_a)

    base_url, server, server_task = await _start_shared(
        api_context.client.app.state.services, unused_tcp_port_factory()
    )
    rest_url, rest_server, rest_task = await _start_owner_rest(
        api_context.client.app, unused_tcp_port_factory()
    )
    request = {
        "job": {
            "title": "Synthetic platform role",
            "company": "Example Co",
            "source_url": "https://jobs.example.test/platform",
            "description": "Synthetic role description for transport parity.",
        },
        "output_language": "en",
        "idempotency_key": "shared-transport-parity-01",
    }
    try:
        async with httpx.AsyncClient(timeout=5) as raw:
            # The shared TCP listener contains protocol routes only. Bearer auth cannot
            # turn the platform owner cookie, grants, CV or settings APIs into tools.
            for path in (
                "/api/v1/projects",
                "/api/v1/owner/session",
                f"/api/v1/projects/{project_a}/cv",
                f"/api/v1/projects/{project_a}/jobs",
                f"/api/v1/projects/{project_a}/jobs/00000000-0000-4000-8000-000000000001/application-status",
                f"/api/v1/projects/{project_a}/settings/provider",
                f"/api/v1/projects/{project_a}/approvals",
            ):
                absent = await raw.get(
                    f"{base_url}{path}",
                    headers={"Authorization": f"Bearer {full['token']}"},
                )
                assert absent.status_code == 404, (path, absent.status_code, absent.text)

            # Missing bearer credentials are rejected by both protocol HTTP mounts.
            unauthenticated_mcp = await raw.post(
                f"{base_url}/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}
            )
            assert unauthenticated_mcp.status_code == 401
            unauthenticated_a2a = await raw.post(
                base_url,
                json={"jsonrpc": "2.0", "id": 1, "method": "tasks/list", "params": {}},
            )
            assert unauthenticated_a2a.status_code == 401

        async with _session(f"{base_url}/mcp/", full["token"]) as mcp:
            initialized = await mcp.initialize()
            assert initialized.protocol_version == "2025-11-25"
            submitted = await mcp.call_tool("evaluate_job", {"request": request})
            assert not submitted.is_error
            mcp_run_id = submitted.structured_content["run_id"]
            replay = await mcp.call_tool("evaluate_job", {"request": request})
            assert replay.structured_content["run_id"] == mcp_run_id

        a2a_client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {full['token']}", "A2A-Version": "1.0"}
                ),
            ),
        )
        a2a_replay = await _send(a2a_client, "evaluate_job", request)
        assert str(a2a_replay.id) == mcp_run_id

        async with _session(f"{base_url}/mcp/", project_b_grant["token"]) as foreign_mcp:
            await foreign_mcp.initialize()
            with pytest.raises(MCPError):
                await foreign_mcp.call_tool("get_run", {"run_id": mcp_run_id})

        foreign_a2a_client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=httpx.AsyncClient(
                    headers={
                        "Authorization": f"Bearer {project_b_grant['token']}",
                        "A2A-Version": "1.0",
                    }
                ),
            ),
        )
        with pytest.raises(A2AClientError):
            await foreign_a2a_client.get_task(GetTaskRequest(id=mcp_run_id))

        async with _session(f"{base_url}/mcp/", evaluate_only["token"]) as evaluator:
            await evaluator.initialize()
            with pytest.raises(MCPError):
                await evaluator.call_tool(
                    "draft_documents",
                    {"request": {**request, "idempotency_key": "parity-eval-only-deny"}},
                )

        # REST reads the same durable run created over MCP/A2A; a Project B token
        # cannot use a known Project A run ID to cross the boundary.
        async with httpx.AsyncClient(
            timeout=5,
            headers={"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:8765"},
        ) as rest:
            run_read = await rest.get(
                f"{rest_url}/api/v1/projects/{project_a}/runs/{mcp_run_id}",
                headers={"Authorization": f"Bearer {full['token']}"},
            )
            assert run_read.status_code == 200, run_read.text
            assert run_read.json()["id"] == mcp_run_id
            assert run_read.json()["operation"] == "evaluate_job"
            foreign_read = await rest.get(
                f"{rest_url}/api/v1/projects/{project_b}/runs/{mcp_run_id}",
                headers={"Authorization": f"Bearer {project_b_grant['token']}"},
            )
            assert foreign_read.status_code in {403, 404}

            expired_rest = await rest.get(
                f"{rest_url}/api/v1/projects/{project_a}/runs/{mcp_run_id}",
                headers={"Authorization": f"Bearer {expired_token}"},
            )
            assert expired_rest.status_code == 401

        # Expiry is checked on each transport request, even after a protocol client
        # has established its session with an otherwise valid Project grant.
        async with httpx.AsyncClient(timeout=5) as expired_client:
            expired_mcp = await expired_client.post(
                f"{base_url}/mcp/",
                json={"jsonrpc": "2.0", "id": 8, "method": "ping"},
                headers={"Authorization": f"Bearer {expired_token}"},
            )
            expired_a2a = await expired_client.post(
                base_url,
                json={"jsonrpc": "2.0", "id": 9, "method": "tasks/list", "params": {}},
                headers={"Authorization": f"Bearer {expired_token}", "A2A-Version": "1.0"},
            )
        assert expired_mcp.status_code == 401
        assert expired_a2a.status_code == 401

        # Revocation is also live across all three listeners. The owning grant is
        # revoked through the real owner REST API after it created the shared run.
        async with httpx.AsyncClient(
            timeout=5,
            headers={"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:8765"},
            cookies={COOKIE_NAME: api_context.client.cookies.get(COOKIE_NAME)},
        ) as owner_rest:
            revoked = await owner_rest.delete(
                f"{rest_url}/api/v1/projects/{project_a}/grants/{full['id']}",
                headers={"X-CSRF-Token": csrf},
            )
            assert revoked.status_code == 204, revoked.text

        async with httpx.AsyncClient(
            timeout=5,
            headers={"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:8765"},
        ) as revoked_rest_client:
            revoked_rest = await revoked_rest_client.get(
                f"{rest_url}/api/v1/projects/{project_a}/runs/{mcp_run_id}",
                headers={"Authorization": f"Bearer {full['token']}"},
            )
            assert revoked_rest.status_code == 401

        async with httpx.AsyncClient(timeout=5) as revoked_client:
            revoked_mcp = await revoked_client.post(
                f"{base_url}/mcp/",
                json={"jsonrpc": "2.0", "id": 10, "method": "ping"},
                headers={"Authorization": f"Bearer {full['token']}"},
            )
            revoked_a2a = await revoked_client.post(
                base_url,
                json={"jsonrpc": "2.0", "id": 11, "method": "tasks/list", "params": {}},
                headers={"Authorization": f"Bearer {full['token']}", "A2A-Version": "1.0"},
            )
        assert revoked_mcp.status_code == 401
        assert revoked_a2a.status_code == 401

        async with _session(f"{base_url}/mcp/", read_only["token"]) as reader:
            await reader.initialize()
            visible = await reader.call_tool("get_run", {"run_id": mcp_run_id})
            assert not visible.is_error
            with pytest.raises(MCPError):
                await reader.call_tool("cancel_run", {"run_id": mcp_run_id})
            with pytest.raises(MCPError):
                await reader.call_tool(
                    "evaluate_job",
                    {"request": {**request, "idempotency_key": "parity-results-only-deny"}},
                )

        draft_client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {draft_only['token']}", "A2A-Version": "1.0"}
                ),
            ),
        )
        with pytest.raises(A2AClientError):
            await _send(
                draft_client,
                "evaluate_job",
                {**request, "idempotency_key": "parity-draft-only-deny"},
            )

        evaluate_client = await create_client(
            base_url,
            ClientConfig(
                streaming=False,
                supported_protocol_bindings=["JSONRPC"],
                httpx_client=httpx.AsyncClient(
                    headers={"Authorization": f"Bearer {evaluate_only['token']}", "A2A-Version": "1.0"}
                ),
            ),
        )
        with pytest.raises(A2AClientError):
            await _send(
                evaluate_client,
                "draft_documents",
                {**request, "idempotency_key": "parity-eval-only-draft-deny"},
            )
    finally:
        await _stop_shared(server, server_task)
        await _stop_owner_rest(rest_server, rest_task)
