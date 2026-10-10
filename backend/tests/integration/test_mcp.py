"""Official MCP client checks over a parent-managed live HTTP listener."""

from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID
import hashlib
import secrets
from types import SimpleNamespace

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import MCPError
from mcp.shared._httpx_utils import create_mcp_http_client
from sqlalchemy import select

from job_search_platform.api.mcp import create_mcp_app, create_mcp_server, mcp_lifespan_context
from job_search_platform.api.shared import create_shared_app
from job_search_platform.db.models import DocumentRevision, Grant, Project, Run

from test_rest_api import _owner, _write_headers, api_context as _api_context_fixture
from helpers import completed_extract_run, provider_config, revisions


def test_mcp_transport_rejects_wildcard_host_or_origin():
    services = SimpleNamespace(sessions=None, grants=None)
    with pytest.raises(ValueError, match="allowlist_must_be_exact"):
        create_mcp_app(services, allowed_hosts=["*"])
    with pytest.raises(ValueError, match="allowlist_must_be_exact"):
        create_mcp_app(services, allowed_origins=["http://127.0.0.1:*"])


def test_mcp_skill_tools_match_golden_schemas():
    # External MCP clients cache tool schemas; the registry must not change them.
    golden = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "mcp_skill_tools.json").read_text())
    server = create_mcp_server(SimpleNamespace(sessions=None, grants=None))
    tools = {tool.name: tool for tool in asyncio.run(server.list_tools())}
    assert [name for name in tools if name in golden] == ["evaluate_job", "draft_documents"]
    for name, expected in golden.items():
        assert tools[name].description == expected["description"]
        assert tools[name].input_schema == expected["input_schema"]
        assert tools[name].output_schema == expected["output_schema"]


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _api_context_fixture.__wrapped__(migrated_engine, tmp_path)


async def _publish_synthetic_document(context, services, project_id, claimed):
    staging = services.artifacts.staging_root_for_run(project_id, claimed.id)
    staging.mkdir(parents=True, exist_ok=True)
    body = b"%PDF-1.7\nSynthetic published cover letter\n%%EOF\n"
    output = staging / "cover-letter.pdf"
    output.write_bytes(body)
    with context.sessions.begin() as db:
        run = db.get(Run, claimed.id)
        cv_id, job_id = run.cv_revision_id, run.job_revision_id
    published = await services.artifacts.publish(project_id, claimed.id, {
        "staging_dir": str(staging),
        "lease_owner": claimed.lease_owner,
        "files": [{
            "path": output.name,
            "document_type": "cover_letter",
            "title": "Synthetic cover letter",
            "display_name": output.name,
            "mime_type": "application/pdf",
            "sha256": hashlib.sha256(body).hexdigest(),
            "source_cv_revision_id": str(cv_id),
            "source_job_revision_id": str(job_id),
            "content_markdown": body.decode("utf-8"),
        }],
    })
    await asyncio.to_thread(services.queue.finish, claimed.id, claimed.lease_owner, "completed")
    with context.sessions() as db:
        return str(db.scalar(select(DocumentRevision.document_id).where(
            DocumentRevision.project_id == project_id,
            DocumentRevision.file_id == published[0].id,
        )))


@asynccontextmanager
async def _session(url: str, token: str):
    http_client = create_mcp_http_client(headers={"Authorization": f"Bearer {token}"})
    async with streamable_http_client(url, http_client=http_client) as (read, write):
        async with ClientSession(read, write) as session:
            yield session


@pytest.mark.integration
@pytest.mark.asyncio
async def test_official_mcp_http_tools_submission_cancel_and_revocation(api_context, unused_tcp_port):
    client = api_context.client
    csrf = await asyncio.to_thread(_owner, api_context)
    project = client.post(
        "/api/v1/projects", json={"name": "Synthetic MCP project"}, headers=_write_headers(csrf)
    ).json()
    project_id = UUID(project["id"])
    with api_context.sessions.begin() as db:
        row = db.get(Project, project_id)
        revisions(db, row.id)
        provider_config(db, row.id)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    issued = client.post(
        f"/api/v1/projects/{project_id}/grants",
        json={
            "capabilities": ["jobs:evaluate", "documents:draft", "results:read"],
            "expires_at": expires_at,
        },
        headers=_write_headers(csrf),
    )
    assert issued.status_code == 201
    grant = issued.json()
    authenticated = await asyncio.to_thread(
        lambda: asyncio.run(client.app.state.services.grants.authenticate(grant["token"]))
    )
    assert authenticated.project_id == project_id

    shared_app = create_shared_app(client.app.state.services, host="127.0.0.1", port=unused_tcp_port)
    server = uvicorn.Server(uvicorn.Config(
        shared_app,
        host="127.0.0.1",
        port=unused_tcp_port,
        lifespan="on",
        access_log=False,
        log_level="error",
    ))
    server_task = asyncio.create_task(server.serve())
    url = f"http://127.0.0.1:{unused_tcp_port}/mcp/"
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if server_task.done():
                    await server_task
                    raise AssertionError("mcp_server_failed_startup")
                await asyncio.sleep(0.02)

        async with _session(url, grant["token"]) as session:
                try:
                    initialized = await session.initialize()
                except Exception as exc:
                    raise AssertionError(f"MCP initialize failed: {exc!r} {getattr(exc, 'data', None)!r}") from exc
                assert initialized.server_info.name == "Job Search Platform"
                assert initialized.protocol_version == "2025-11-25"
                names = {tool.name for tool in (await session.list_tools()).tools}
                assert names == {
                    "evaluate_job", "draft_documents", "get_run", "cancel_run", "list_results"
                }
                args = {
                    "request": {
                        "job": {
                            "title": "Synthetic platform engineer",
                            "company": "Example Co",
                            "source_url": "https://jobs.example.test/platform",
                            "description": "Synthetic role description for transport verification.",
                        },
                        "output_language": "en",
                        "idempotency_key": "mcp-live-synthetic-01",
                    },
                }
                submitted = await session.call_tool("evaluate_job", args)
                assert not submitted.is_error
                run = submitted.structured_content
                assert run["status"] == "queued"
                assert run["run_id"]
                replay = await session.call_tool("evaluate_job", args)
                assert replay.structured_content["run_id"] == run["run_id"]

                with pytest.raises(MCPError, match="idempotency_conflict"):
                    await session.call_tool(
                        "evaluate_job",
                        {"request": {
                            **args["request"],
                            "job": {**args["request"]["job"], "title": "Different synthetic role"},
                        }},
                    )

                read = await session.call_tool("get_run", {"run_id": run["run_id"]})
                assert read.structured_content["run_id"] == run["run_id"]

                services = client.app.state.services
                claimed = await asyncio.to_thread(
                    services.queue.claim_next, "mcp-synthetic-fixture-worker"
                )
                assert claimed is not None and str(claimed.id) == run["run_id"]
                await asyncio.to_thread(
                    services.queue.finish,
                    claimed.id,
                    claimed.lease_owner,
                    "completed",
                    evaluation_result={"report_markdown": "Synthetic evaluation report", "score": 4.5},
                )
                report = await session.read_resource(f"job-search://runs/{run['run_id']}/evaluation")
                assert report.contents[0].text == "Synthetic evaluation report"

                draft = await session.call_tool("draft_documents", {
                    "request": {
                        **args["request"],
                        "idempotency_key": "mcp-draft-synthetic-01",
                    },
                })
                draft_run_id = draft.structured_content["run_id"]
                draft_claim = await asyncio.to_thread(
                    services.queue.claim_next, "mcp-synthetic-draft-worker"
                )
                assert draft_claim is not None and str(draft_claim.id) == draft_run_id
                document_file_id = await _publish_synthetic_document(
                    api_context, services, project_id, draft_claim
                )
                listed = await session.call_tool("list_results", {})
                document_uri = listed.structured_content["documents"][0]["resource"]
                assert listed.structured_content["evaluations"][0]["resource"] == (
                    f"job-search://runs/{run['run_id']}/evaluation"
                )
                assert document_uri == f"job-search://documents/{document_file_id}"
                draft_status = await session.call_tool("get_run", {"run_id": draft_run_id})
                assert draft_status.structured_content["artifact_resources"] == [document_uri]
                document = await session.read_resource(document_uri)
                assert "Synthetic published cover letter" in document.contents[0].text

                cancellation = await session.call_tool("evaluate_job", {
                    "request": {
                        **args["request"],
                        "idempotency_key": "mcp-cancel-synthetic-01",
                    },
                })
                cancelled = await session.call_tool(
                    "cancel_run", {"run_id": cancellation.structured_content["run_id"]}
                )
                assert cancelled.structured_content["status"] == "cancelled"
                assert cancelled.structured_content["cancellation_pending"] is False
                pending = await session.call_tool("evaluate_job", {
                    "request": {
                        **args["request"],
                        "idempotency_key": "mcp-pending-cancel-synthetic-01",
                    },
                })
                pending_claim = await asyncio.to_thread(
                    services.queue.claim_next, "mcp-synthetic-pending-worker"
                )
                assert pending_claim is not None
                pending_cancel = await session.call_tool(
                    "cancel_run", {"run_id": pending.structured_content["run_id"]}
                )
                assert pending_cancel.structured_content["status"] == "running"
                assert pending_cancel.structured_content["cancellation_pending"] is True
                await asyncio.to_thread(
                    services.queue.finish,
                    pending_claim.id,
                    pending_claim.lease_owner,
                    "cancelled",
                )

                top_level_extra = await session.call_tool(
                    "evaluate_job", {**args, "unexpected": "synthetic-extra-sentinel"}
                )
                assert top_level_extra.is_error
                assert [item.text for item in top_level_extra.content] == ["invalid_parameters"]
                assert "synthetic-extra-sentinel" not in str(top_level_extra.content)
                nested_extra = await session.call_tool(
                    "evaluate_job",
                    {"request": {**args["request"], "unexpected": "synthetic-extra-sentinel"}},
                )
                assert nested_extra.is_error
                assert [item.text for item in nested_extra.content] == ["invalid_parameters"]
                assert "synthetic-extra-sentinel" not in str(nested_extra.content)
                malformed = await session.call_tool("evaluate_job", {
                    "request": {
                        **args["request"],
                        "output_language": "SYNTHETIC_INVALID_LANGUAGE_SENTINEL",
                    },
                })
                assert malformed.is_error
                assert [item.text for item in malformed.content] == ["invalid_parameters"]
                assert "SYNTHETIC_INVALID_LANGUAGE_SENTINEL" not in str(malformed.content)

                with pytest.raises(Exception):
                    await session.read_resource(f"job-search://files/{UUID(int=1)}")

        revoked = client.delete(
            f"/api/v1/projects/{project_id}/grants/{grant['id']}",
            headers=_write_headers(csrf),
        )
        assert revoked.status_code in {200, 204}
        async with httpx.AsyncClient(timeout=3) as anonymous:
            missing = await anonymous.post(url, json={})
            assert missing.status_code == 401
            stale = await anonymous.post(
                url,
                json={},
                headers={"Authorization": f"Bearer {grant['token']}"},
            )
            assert stale.status_code == 401
    finally:
        server.should_exit = True
        await asyncio.wait_for(server_task, timeout=10)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_http_rechecks_capabilities_and_project_scope(api_context, unused_tcp_port):
    client = api_context.client
    csrf = await asyncio.to_thread(_owner, api_context)
    project_ids = []
    for name in ("Synthetic MCP A", "Synthetic MCP B"):
        project = client.post(
            "/api/v1/projects", json={"name": name}, headers=_write_headers(csrf)
        ).json()
        project_id = UUID(project["id"])
        project_ids.append(project_id)
        with api_context.sessions.begin() as db:
            row = db.get(Project, project_id)
            revisions(db, row.id)
            provider_config(db, row.id)
    grants = []
    for project_id, capabilities in (
        (project_ids[0], ["jobs:evaluate", "documents:draft", "results:read"]),
        (project_ids[1], ["results:read"]),
    ):
        issued = client.post(
            f"/api/v1/projects/{project_id}/grants",
            json={
                "capabilities": capabilities,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            },
            headers=_write_headers(csrf),
        )
        assert issued.status_code == 201
        grants.append(issued.json())
    expired_token = secrets.token_urlsafe(32)
    with api_context.sessions.begin() as db:
        db.add(Grant(
            project_id=project_ids[1],
            token_hash=hashlib.sha256(expired_token.encode()).digest(),
            capabilities=["results:read"],
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        ))

    mcp_app = create_mcp_app(
        client.app.state.services,
        allowed_hosts=["127.0.0.1", f"127.0.0.1:{unused_tcp_port}"],
        allowed_origins=[f"http://127.0.0.1:{unused_tcp_port}"],
    )

    @asynccontextmanager
    async def parent_lifespan(app):
        async with mcp_lifespan_context(mcp_app):
            yield

    shared_app = FastAPI(lifespan=parent_lifespan)
    shared_app.mount("/mcp", mcp_app)
    server = uvicorn.Server(uvicorn.Config(
        shared_app, host="127.0.0.1", port=unused_tcp_port, lifespan="on",
        access_log=False, log_level="error",
    ))
    task = asyncio.create_task(server.serve())
    url = f"http://127.0.0.1:{unused_tcp_port}/mcp/"
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("mcp_server_failed_startup")
                await asyncio.sleep(0.02)

        async with httpx.AsyncClient(timeout=3) as expired_client:
            expired_response = await expired_client.post(
                url,
                json={},
                headers={"Authorization": f"Bearer {expired_token}"},
            )
            assert expired_response.status_code == 401

        async with _session(url, grants[0]["token"]) as first, _session(url, grants[1]["token"]) as second:
                try:
                    await first.initialize()
                    await second.initialize()
                except Exception as exc:
                    raise AssertionError(f"MCP initialize failed: {exc!r} {getattr(exc, 'data', None)!r}") from exc
                submitted = await first.call_tool("evaluate_job", {
                    "request": {
                        "job": {"title": "Synthetic role", "description": "Synthetic description"},
                        "output_language": "th",
                        "idempotency_key": "mcp-project-bound-01",
                    },
                })
                run_id = submitted.structured_content["run_id"]
                with pytest.raises(MCPError):
                    await second.call_tool("get_run", {"run_id": run_id})
                # Owner-only experience-bank extraction is invisible to grants, even in their own project.
                assert "extract_experience" not in {tool.name for tool in (await first.list_tools()).tools}
                with api_context.sessions.begin() as db:
                    extract_id = completed_extract_run(db, project_ids[0])
                with pytest.raises(MCPError, match="not_found"):
                    await first.call_tool("get_run", {"run_id": str(extract_id)})
                with pytest.raises(MCPError, match="forbidden"):
                    await second.call_tool("evaluate_job", {
                        "request": {
                            "job": {"title": "Synthetic role", "description": "Synthetic description"},
                            "output_language": "th",
                            "idempotency_key": "mcp-no-evaluate-01",
                        },
                    })
                # The results-only grant can list results, and an unknown resource URI
                # is still resolved through current Project authorization.
                listed = await second.call_tool("list_results", {})
                assert not listed.is_error
                with pytest.raises(Exception):
                    await second.read_resource(f"job-search://runs/{run_id}/evaluation")
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, timeout=10)
