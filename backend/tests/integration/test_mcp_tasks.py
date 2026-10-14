"""FR-P02 tasks extension and cache hints on /mcp, protocol 2026-07-28, real PostgreSQL. Synthetic data only."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import update

from helpers import provider_config, revisions, session as make_session
from job_search_platform.api import mcp as mcp_module, mcp_tasks
from job_search_platform.api.mcp import _TASK_SKILLS, create_mcp_app, mcp_lifespan_context
from job_search_platform.db.models import Run
from job_search_platform.services.protocol_runs import ProtocolRuns
from test_rest_api import _owner, _write_headers, api_context as _api_context_fixture

TASKS = {"extensions": {"io.modelcontextprotocol/tasks": {}}}
TOOLS = ["evaluate_job", "draft_documents", "tailor_cv", "jobs_search", "jobs_fit", "apply_prepare", "apply_submit",
         "draft_follow_up", "applications_list", "applications_update", "get_run", "cancel_run", "list_results"]


@pytest.fixture
def api_context(migrated_engine, tmp_path):
    yield from _api_context_fixture.__wrapped__(migrated_engine, tmp_path)


class _Mcp:
    def __init__(self, http: httpx.AsyncClient, token: str):
        self.http, self.token = http, token

    async def rpc(self, method: str, params: dict | None = None, *, caps: dict | None = None) -> dict:
        params = dict(params or {})
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json, text/event-stream",
                   "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method}
        name = params.get("name") or params.get("taskId")
        if name is not None:
            headers["Mcp-Name"] = str(name)
        params["_meta"] = {"io.modelcontextprotocol/protocolVersion": "2026-07-28",
                           "io.modelcontextprotocol/clientInfo": {"name": "synthetic", "version": "0"},
                           "io.modelcontextprotocol/clientCapabilities": TASKS if caps is None else caps}
        response = await self.http.post("/", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                                        headers=headers)
        return response.json()


@asynccontextmanager
async def _mcp(services, token: str):
    app = create_mcp_app(services)
    async with mcp_lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1") as http:
            yield _Mcp(http, token)


def _setup(api_context, capabilities=("jobs:evaluate", "results:read", "applications:apply")):
    """Project with CV/job revisions, a session and one grant. Returns a namespace of ids."""
    client = api_context.client
    csrf = _owner(api_context)
    pid = UUID(client.post("/api/v1/projects", json={"name": "Synthetic tasks project"}, headers=_write_headers(csrf)).json()["id"])
    with api_context.sessions.begin() as db:
        cv, job = revisions(db, pid)
        provider_config(db, pid)
        sid = make_session(db, pid).id
        cv_id, job_id = cv.id, job.id
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    grant = client.post(f"/api/v1/projects/{pid}/grants", json={"capabilities": list(capabilities), "expires_at": expires},
                        headers=_write_headers(csrf)).json()
    return client.app.state.services, pid, grant, cv_id, job_id, sid


def _run_row(api_context, pid, sid, cv_id, job_id, grant_id, *, operation="evaluate_job", status="queued") -> UUID:
    with api_context.sessions.begin() as db:
        run = Run(project_id=pid, session_id=sid, job_revision_id=job_id, cv_revision_id=cv_id,
                  actor_scope=f"grant:{grant_id}", idempotency_key=uuid4().hex, request_digest="0" * 64,
                  operation=operation, provider_configuration_id=provider_config(db).id, input_snapshot={},
                  config_snapshot={}, output_language="en", status=status)
        db.add(run)
        db.flush()
        return run.id


def _set_status(api_context, run_id, status):
    finished = datetime.now(timezone.utc) if status in {"completed", "failed", "cancelled", "interrupted"} else None
    with api_context.sessions.begin() as db:
        db.execute(update(Run).where(Run.id == run_id).values(status=status, finished_at=finished))


def _evaluate_args(key: str) -> dict:
    return {"request": {"job": {"title": "Synthetic platform engineer", "company": "Example Co",
                                "source_url": "https://jobs.example.test/platform",
                                "description": "Synthetic role description for task verification."},
                        "output_language": "en", "idempotency_key": key}}


def _origin(services) -> str:
    return services.owner_sessions.public_origin


@pytest.mark.integration
async def test_discover_advertises_tasks_and_tools_list_is_public_and_ordered(api_context):
    services, _, grant, *_ = await asyncio.to_thread(_setup, api_context)
    assert _TASK_SKILLS == {"evaluate_job", "draft_documents", "tailor_cv", "apply_prepare", "apply_submit", "draft_follow_up"}
    async with _mcp(services, grant["token"]) as mcp:
        discover = (await mcp.rpc("server/discover"))["result"]
        assert discover["capabilities"]["extensions"] == {"io.modelcontextprotocol/tasks": {}}
        listed = (await mcp.rpc("tools/list"))["result"]
        assert [tool["name"] for tool in listed["tools"]] == TOOLS
        assert (listed["cacheScope"], listed["ttlMs"]) == ("public", 3_600_000)
        prompts = (await mcp.rpc("prompts/list"))["result"]
        assert (prompts["cacheScope"], prompts["ttlMs"]) == ("public", 3_600_000)
        resources = (await mcp.rpc("resources/list"))["result"]
        assert (resources["cacheScope"], resources["ttlMs"]) == ("private", 0)


@pytest.mark.integration
async def test_tasks_capable_evaluate_returns_task_that_resolves_at_once(api_context):
    services, pid, grant, *_ = await asyncio.to_thread(_setup, api_context)
    async with _mcp(services, grant["token"]) as mcp:
        created = (await mcp.rpc("tools/call", {"name": "evaluate_job", "arguments": _evaluate_args("task-1")}))["result"]
        assert created["resultType"] == "task" and created["status"] == "working"
        assert created["ttlMs"] is None and created["pollIntervalMs"] == 2000
        assert not {"result", "inputRequests", "error"} & set(created)
        got = (await mcp.rpc("tasks/get", {"taskId": created["taskId"]}))["result"]
        assert got["resultType"] == "complete" and got["taskId"] == created["taskId"]
        assert got["status"] == "working"
    with api_context.sessions() as db:
        assert db.get(Run, UUID(created["taskId"])).project_id == pid


@pytest.mark.integration
async def test_without_capability_result_is_legacy_and_tasks_methods_refuse(api_context):
    services, _, grant, *_ = await asyncio.to_thread(_setup, api_context)
    async with _mcp(services, grant["token"]) as mcp:
        legacy = (await mcp.rpc("tools/call", {"name": "evaluate_job", "arguments": _evaluate_args("legacy-1")}, caps={}))["result"]
        assert legacy.get("resultType", "complete") == "complete"
        assert legacy["structuredContent"]["status"] == "queued" and "run_id" in legacy["structuredContent"]
        refused = await mcp.rpc("tasks/get", {"taskId": legacy["structuredContent"]["run_id"]}, caps={})
        assert refused["error"]["code"] == -32021
        assert refused["error"]["data"] == {"requiredCapabilities": {"extensions": {"io.modelcontextprotocol/tasks": {}}}}


@pytest.mark.integration
async def test_non_task_tool_with_capability_is_a_normal_result(api_context):
    services, _, grant, *_ = await asyncio.to_thread(_setup, api_context)
    async with _mcp(services, grant["token"]) as mcp:
        listed = (await mcp.rpc("tools/call", {"name": "list_results", "arguments": {}}))["result"]
        assert listed.get("resultType", "complete") == "complete"
        assert listed["structuredContent"] == {"documents": [], "evaluations": []}


@pytest.mark.integration
async def test_grant_without_results_read_gets_legacy_result(api_context):
    services, _, grant, *_ = await asyncio.to_thread(_setup, api_context, ("jobs:evaluate",))
    async with _mcp(services, grant["token"]) as mcp:
        called = (await mcp.rpc("tools/call", {"name": "evaluate_job", "arguments": _evaluate_args("no-read-1")}))["result"]
        assert called.get("resultType", "complete") == "complete" and "run_id" in called["structuredContent"]


@pytest.mark.integration
async def test_tasks_get_maps_run_statuses(api_context):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    run_id = await asyncio.to_thread(_run_row, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        async def get(status):
            await asyncio.to_thread(_set_status, api_context, run_id, status)
            return (await mcp.rpc("tasks/get", {"taskId": str(run_id)}))["result"]

        approval = await get("waiting_approval")
        assert approval["status"] == "input_required"
        assert approval["inputRequests"][f"owner-approval-{run_id}"]["params"]["url"] == \
            f"{_origin(services)}/app/projects/{pid}/console?tab=approvals"
        needs = await get("needs_input")
        assert needs["inputRequests"][f"owner-input-{run_id}"]["params"]["url"] == \
            f"{_origin(services)}/app/projects/{pid}/sessions/{sid}"
        done = await get("completed")
        assert done["status"] == "completed" and done["result"]["structuredContent"]["run_id"] == str(run_id)
        assert done["result"]["isError"] is False
        failed = await get("failed")
        assert failed["error"] == {"code": -32000, "message": "run_failed"}
        assert (await get("interrupted"))["error"]["message"] == "run_interrupted"
        cancelled = await get("cancelled")
        assert cancelled["status"] == "cancelled" and not {"result", "error", "inputRequests"} & set(cancelled)


@pytest.mark.integration
async def test_tasks_get_unknown_foreign_or_malformed_is_not_found(api_context):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    _, other_pid, other_grant, other_cv, other_job, other_sid = await asyncio.to_thread(_setup, api_context)
    foreign = await asyncio.to_thread(_run_row, api_context, other_pid, other_sid, other_cv, other_job, other_grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        for task_id in (str(foreign), str(uuid4()), "not-a-uuid"):
            for method in ("tasks/get", "tasks/cancel", "tasks/update"):
                error = (await mcp.rpc(method, {"taskId": task_id}))["error"]
                assert (error["code"], error["message"]) == (-32602, "Failed to retrieve task: Task not found"), (method, task_id)
    with api_context.sessions() as db:
        assert db.get(Run, foreign).status == "queued"


@pytest.mark.integration
async def test_tasks_cancel_cancels_a_queued_run(api_context):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    run_id = await asyncio.to_thread(_run_row, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        assert (await mcp.rpc("tasks/cancel", {"taskId": str(run_id)}))["result"]["resultType"] == "complete"
        assert (await mcp.rpc("tasks/get", {"taskId": str(run_id)}))["result"]["status"] == "cancelled"


@pytest.mark.integration
async def test_tasks_update_acknowledges_without_changing_run(api_context):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    run_id = await asyncio.to_thread(_run_row, api_context, pid, sid, cv_id, job_id, grant["id"],
                                     operation="apply_prepare", status="needs_input")
    async with _mcp(services, grant["token"]) as mcp:
        ack = await mcp.rpc("tasks/update", {"taskId": str(run_id), "inputResponses": {
            f"owner-input-{run_id}": {"action": "accept", "content": {"why": "agent answer"}}}})
        assert ack["result"]["resultType"] == "complete"
    with api_context.sessions() as db:
        run = db.get(Run, run_id)
        assert run.status == "needs_input" and run.result_payload is None


URL_ELICITATION = {"elicitation": {"url": {}}}


def _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant_id):
    """apply_submit intake is covered by test_agent_applications; here it only needs to create one run row."""
    calls: list[UUID] = []

    async def fake_submit(self, actor, operation, request):
        assert operation == "apply_submit"
        run_id = await asyncio.to_thread(_run_row, api_context, pid, sid, cv_id, job_id, grant_id, operation="apply_submit")
        calls.append(run_id)
        return await api_context.client.app.state.services.runs.get(actor, actor.project_id, run_id)

    monkeypatch.setattr(ProtocolRuns, "submit", fake_submit)
    return calls


def _submit_args(job_id) -> dict:
    return {"request": {"job_revision_id": str(job_id), "idempotency_key": "mrtr-1"}}


@pytest.mark.integration
async def test_apply_submit_mrtr_rounds_until_terminal(api_context, monkeypatch):
    monkeypatch.setattr(mcp_module, "_MRTR_HOLD_SECONDS", 0.0)
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    calls = _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        first = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id)}, caps=URL_ELICITATION))["result"]
        assert first["resultType"] == "input_required"
        run_id = calls[0]
        request = first["inputRequests"][f"owner-approval-{run_id}"]
        assert request["params"] == {"mode": "url", "url": f"{_origin(services)}/app/projects/{pid}/console?tab=approvals",
                                     "message": request["params"]["message"]}
        state = first["requestState"]
        assert str(run_id) not in state  # sealed, not plaintext
        await asyncio.to_thread(_set_status, api_context, run_id, "waiting_approval")
        second = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id),
                                               "requestState": state, "inputResponses": {}}, caps=URL_ELICITATION))["result"]
        assert second["resultType"] == "input_required" and f"owner-approval-{run_id}" in second["inputRequests"]
        await asyncio.to_thread(_set_status, api_context, run_id, "completed")
        final = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id),
                                              "requestState": second["requestState"], "inputResponses": {}}, caps=URL_ELICITATION))["result"]
        assert final.get("resultType", "complete") == "complete"
        assert final["structuredContent"]["run_id"] == str(run_id) and final["structuredContent"]["status"] == "completed"
    assert calls == [run_id]


@pytest.mark.integration
async def test_mrtr_retry_holds_until_status_changes(api_context, monkeypatch):
    monkeypatch.setattr(mcp_module, "_MRTR_HOLD_SECONDS", 3.0)
    monkeypatch.setattr(mcp_module, "_MRTR_POLL_SECONDS", 0.05)
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    calls = _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        first = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id)}, caps=URL_ELICITATION))["result"]

        async def finish_later():
            await asyncio.sleep(0.3)
            await asyncio.to_thread(_set_status, api_context, calls[0], "completed")

        finisher = asyncio.create_task(finish_later())
        started = asyncio.get_running_loop().time()
        final = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id),
                                              "requestState": first["requestState"], "inputResponses": {}}, caps=URL_ELICITATION))["result"]
        elapsed = asyncio.get_running_loop().time() - started
        await finisher
        assert final["structuredContent"]["status"] == "completed"
        assert 0.25 <= elapsed < 2.5


@pytest.mark.integration
async def test_apply_submit_without_url_elicitation_is_legacy(api_context, monkeypatch):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    calls = _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        result = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id)}, caps={}))["result"]
        assert result.get("resultType", "complete") == "complete"
        assert result["structuredContent"]["run_id"] == str(calls[0])


@pytest.mark.integration
async def test_mrtr_state_replayed_by_other_project_is_not_found(api_context, monkeypatch):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    _, _, other_grant, *_ = await asyncio.to_thread(_setup, api_context)
    calls = _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        first = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id)}, caps=URL_ELICITATION))["result"]
    async with _mcp(services, other_grant["token"]) as other:
        replay = await other.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id),
                                                "requestState": first["requestState"], "inputResponses": {}}, caps=URL_ELICITATION)
    assert replay["error"]["code"] in {-32001, -32602}
    assert "result" not in replay
    assert len(calls) == 1


@pytest.mark.integration
async def test_request_state_survives_a_new_app_with_the_same_key(api_context, monkeypatch, tmp_path):
    services, pid, grant, cv_id, job_id, sid = await asyncio.to_thread(_setup, api_context)
    services.mcp_request_state_key = mcp_tasks.mcp_request_state_key(tmp_path)
    calls = _patch_submit(monkeypatch, api_context, pid, sid, cv_id, job_id, grant["id"])
    async with _mcp(services, grant["token"]) as mcp:
        first = (await mcp.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id)}, caps=URL_ELICITATION))["result"]
    await asyncio.to_thread(_set_status, api_context, calls[0], "completed")
    async with _mcp(services, grant["token"]) as restarted:
        final = (await restarted.rpc("tools/call", {"name": "apply_submit", "arguments": _submit_args(job_id),
                                                    "requestState": first["requestState"], "inputResponses": {}}, caps=URL_ELICITATION))["result"]
    assert final["structuredContent"]["status"] == "completed"
    assert len(calls) == 1
