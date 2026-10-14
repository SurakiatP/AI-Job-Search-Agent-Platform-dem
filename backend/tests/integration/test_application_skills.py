"""applications_list / applications_update direct skills across REST and MCP. Synthetic data only."""
from __future__ import annotations

import asyncio
from uuid import UUID

import pytest
from mcp.shared.exceptions import MCPError

from test_agent_tools_direct import _as_grant, _grant, api_context  # noqa: F401
from test_a2a import _start_a2a, _stop_a2a
from test_mcp import _session
from test_rest_api import _owner, _write_headers

API = "/api/v1/projects"


def _setup(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic agent board"}, headers=_write_headers(csrf)).json()["id"]
    job = ctx.client.post(f"{API}/{pid}/jobs", json={"title": "Synthetic Engineer", "description": "Synthetic"},
                          headers=_write_headers(csrf)).json()["id"]
    return csrf, UUID(pid), job


@pytest.mark.integration
def test_rest_agent_board_rules(api_context):
    client = api_context.client
    csrf, pid, job = _setup(api_context)
    reader = _grant(api_context, pid, csrf, ["results:read"])
    writer = _grant(api_context, pid, csrf, ["applications:write"])
    list_url, update_url = f"{API}/{pid}/agent/applications/list", f"{API}/{pid}/agent/applications/update"

    listed = _as_grant(client, "POST", list_url, reader, json={})
    assert listed.status_code == 200 and listed.json()["applications"][0]["stage"] == "saved"
    one = _as_grant(client, "POST", list_url, reader, json={"job_id": job}).json()["application"]
    assert one["job_revision_id"] == job and one["events"] == []
    assert _as_grant(client, "POST", list_url, writer, json={}).status_code == 403
    assert _as_grant(client, "POST", update_url, reader, json={"job_id": job, "note": "x"}).status_code == 403

    early = _as_grant(client, "POST", update_url, writer, json={"job_id": job, "stage": "interview"})
    assert early.status_code == 409 and early.json()["code"] == "application_not_applied"
    for body in ({"job_id": job, "stage": "applied"}, {"job_id": job, "stage": "saved"}, {"job_id": job}):
        assert _as_grant(client, "POST", update_url, writer, json=body).status_code == 422

    client.patch(f"{API}/{pid}/jobs/{job}/application-status", headers=_write_headers(csrf),
                 json={"application_status": "applied"})
    moved = _as_grant(client, "POST", update_url, writer,
                      json={"job_id": job, "stage": "interview", "note": "Recruiter booked a call"})
    assert moved.status_code == 200 and moved.json()["stage"] == "interview"
    assert [(e["kind"], e["actor"]) for e in moved.json()["events"][:2]] == [("note", "agent"), ("stage_changed", "agent")]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_board_tools(api_context, unused_tcp_port):
    csrf, pid, job = await asyncio.to_thread(_setup, api_context)
    full = await asyncio.to_thread(_grant, api_context, pid, csrf, ["results:read", "applications:write"])
    reader = await asyncio.to_thread(_grant, api_context, pid, csrf, ["results:read"])
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        async with _session(f"{base_url}/mcp/", full) as session:
            await session.initialize()
            board = await session.call_tool("applications_list", {"request": {}})
            assert not board.is_error and board.structured_content["applications"][0]["stage"] == "saved"
            noted = await session.call_tool("applications_update", {"request": {"job_id": job, "note": "Synthetic"}})
            assert not noted.is_error and noted.structured_content["events"][0]["kind"] == "note"
        async with _session(f"{base_url}/mcp/", reader) as session:
            await session.initialize()
            with pytest.raises(MCPError, match="forbidden"):
                await session.call_tool("applications_update", {"request": {"job_id": job, "note": "x"}})
    finally:
        await _stop_a2a(server, server_task)
