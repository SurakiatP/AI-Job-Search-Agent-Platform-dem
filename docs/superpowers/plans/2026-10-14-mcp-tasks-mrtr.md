# MCP Tasks Extension, MRTR and Cache Hints (FR-P02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mcp` serves the 2026-07-28 tasks extension over durable runs, synchronous MRTR `input_required` on `apply_submit`, and public cache hints on list methods.

**Architecture:**
- Pure helpers live in a new `api/mcp_tasks.py`: status mapping, the task wire dict, capability detection, the owner-action URL elicitation, and the request-state key file.
- The `TasksExtension` class lives in `api/mcp.py`, next to the auth and run-result helpers it reuses. Putting it in `mcp_tasks.py` would create an import cycle.
- MRTR is added to the `apply_submit` tool only.
- The `requestState` sealing key is persisted in the private runtime directory.

**Tech Stack:** Python 3.12, `mcp==2.3.0` and `mcp_types==2.3.0` (`Extension`, `MethodBinding`, `CacheHint`, `RequestStateSecurity`, `InputRequiredResult`), Starlette, SQLAlchemy 2, PostgreSQL, pytest, httpx `ASGITransport`.

**Spec:** `docs/superpowers/specs/2026-10-14-mcp-tasks-mrtr-design.md`

## Global Constraints

- No new dependencies.
- Protocol revision `2026-07-28` only for `tasks/*` (`MethodBinding(..., protocol_versions=frozenset({"2026-07-28"}))`).
- Extension identifier: `"io.modelcontextprotocol/tasks"`.
- `pollIntervalMs` = 2000. `ttlMs` = `null` (JSON null, present on every task dict).
- Task tools: exactly the skills with `kind == "task"`. These are `evaluate_job`, `draft_documents`, `tailor_cv`, `apply_prepare`, `apply_submit` and `draft_follow_up`.
- A task or MRTR flow is used only when the client declared the capability on that request **and** the grant has `results:read`. Without `results:read` it could never read the run back, so it gets the legacy result.
- An unknown, malformed or foreign task id → `MCPError(-32602, "Failed to retrieve task: Task not found")`.
- `tasks/*` without the declared capability → `MCPError(-32021, "Missing required client capability", {"requiredCapabilities": {"extensions": {"io.modelcontextprotocol/tasks": {}}}})`.
- Cache hints:
  - `tools/list`, `prompts/list` and `resources/templates/list` → `CacheHint(ttl_ms=3_600_000, scope="public")`.
  - Every other method keeps the SDK default (`private`/0).
- The `requestState` key file is `<private dir>/mcp-request-state-key`, with mode `0600`. It holds `secrets.token_urlsafe(32)`. Audience is `"job-search-platform-mcp"`. Never log it.
- Owner app URLs use `services.owner_sessions.public_origin`, falling back to `"http://127.0.0.1:8000"` when absent:
  - approvals: `{origin}/app/projects/{project_id}/console?tab=approvals`
  - needs input: `{origin}/app/projects/{project_id}/sessions/{session_id}`
- Clients that declare neither tasks nor URL elicitation see no behaviour change. The existing `test_mcp.py`, `test_mcp_oauth.py`, `test_a2a.py` and golden tool schemas must stay green.
- Backend commands run from `backend/`:
  - unit: `uv run pytest tests/unit -q`
  - integration: `uv run pytest tests/integration/<file> -q` (local Postgres/MinIO already running)
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A tasks-capable grant without `results:read` must still get a working tool call.** Expected: the legacy `{run_id, status, …}` result, not a task it can never poll. Test: Task 2 `test_grant_without_results_read_gets_legacy_result`.
2. **One grant must not read or cancel another Project's run by guessing or replaying an id.** Expected: `tasks/get`, `tasks/cancel` and an MRTR replay all answer not found. Test: Task 2 `test_tasks_get_unknown_foreign_or_malformed_is_not_found`, Task 3 `test_mrtr_state_replayed_by_other_project_is_not_found`.
3. **A retried MRTR call must never create a second run.** Expected: a retry with `requestState` reads the same run. Test: Task 3 `test_apply_submit_mrtr_rounds_until_terminal` (asserts one `submit` call across three rounds).
4. **`tasks/update` must not let an agent answer or approve on the owner's behalf.** Expected: empty acknowledgement, run status unchanged. Test: Task 2 `test_tasks_update_acknowledges_without_changing_run`.
5. **A restart must not break in-flight MRTR rounds, and the key file must stay private.** Expected: the same key is read back, the file is created `0600`, and a group-readable file is refused. Test: Task 3 `test_request_state_key_is_created_private_and_reused`.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/job_search_platform/api/mcp_tasks.py` (create) | Pure helpers: `TASKS_EXTENSION`, `POLL_INTERVAL_MS`, `task_status`, `owner_action`, `task_view`, `created_task`, `client_declares_tasks`, `client_declares_url_elicitation`, `mcp_request_state_key` |
| `backend/src/job_search_platform/api/mcp.py` (modify) | Header-based auth helper, shared run-result helper, `_TasksExtension`, cache hints, request-state security, `apply_submit` MRTR |
| `backend/src/job_search_platform/api/dependencies.py` (modify) | `Services.mcp_request_state_key: str \| None = None` |
| `backend/src/job_search_platform/main.py` (modify) | Pass `mcp_request_state_key(PRIVATE_DIR)` into `Services` |
| `docs/contracts/mcp.md` (modify) | "Tasks, MRTR and caching (FR-P02)" section |
| `backend/tests/unit/test_mcp_tasks.py` (create) | Helper unit tests |
| `backend/tests/integration/test_mcp_tasks.py` (create) | Wire-level tests on protocol 2026-07-28 |

---

### Task 1: Pure task helpers

**Files:**
- Create: `backend/src/job_search_platform/api/mcp_tasks.py`
- Test: `backend/tests/unit/test_mcp_tasks.py`

**Interfaces:**
- Consumes: `RunView` from `job_search_platform.services.contracts` (fields `id`, `project_id`, `session_id`, `status`, `created_at`, `finished_at`). `ClientCapabilities` from `mcp_types` (`.extensions: dict | None`, `.elicitation.url`).
- Produces (Tasks 2 and 3 rely on these exact names):
  - `TASKS_EXTENSION: str`
  - `POLL_INTERVAL_MS: int`
  - `task_status(run_status: str) -> str`
  - `owner_action(run, owner_origin: str, *, approval: bool = False) -> tuple[str, dict] | None`
  - `task_view(run, last_updated_at: datetime, owner_origin: str, *, result: dict | None = None) -> dict`
  - `created_task(view: dict) -> dict`
  - `client_declares_tasks(capabilities) -> bool`
  - `client_declares_url_elicitation(capabilities) -> bool`
  - `mcp_request_state_key(private_dir: Path) -> str`

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/test_mcp_tasks.py`:

```python
"""FR-P02 task helpers: status mapping, wire shape, capabilities, request-state key. Synthetic data only."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from mcp_types import ClientCapabilities

from job_search_platform.api import mcp_tasks
from job_search_platform.services.contracts import RunView

ORIGIN = "http://127.0.0.1:8765"
CREATED = datetime(2026, 10, 14, 9, 0, tzinfo=timezone.utc)


def _run(status: str, **over) -> RunView:
    values = dict(id=uuid4(), project_id=uuid4(), session_id=uuid4(), job_revision_id=uuid4(), operation="evaluate_job",
                  status=status, output_language="en", created_at=CREATED)
    values.update(over)
    return RunView(**values)


def test_task_status_maps_every_run_status():
    expected = {"queued": "working", "running": "working", "waiting_approval": "input_required",
                "needs_input": "input_required", "completed": "completed", "failed": "failed",
                "interrupted": "failed", "cancelled": "cancelled"}
    assert {status: mcp_tasks.task_status(status) for status in expected} == expected


def test_working_view_has_required_task_fields():
    run = _run("running")
    view = mcp_tasks.task_view(run, CREATED + timedelta(seconds=5), ORIGIN)
    assert view == {"taskId": str(run.id), "status": "working", "statusMessage": "running",
                    "createdAt": CREATED.isoformat(), "lastUpdatedAt": (CREATED + timedelta(seconds=5)).isoformat(),
                    "ttlMs": None, "pollIntervalMs": 2000}


def test_waiting_approval_points_to_console_approvals():
    run = _run("waiting_approval")
    view = mcp_tasks.task_view(run, CREATED, ORIGIN)
    assert view["status"] == "input_required"
    (key, request), = view["inputRequests"].items()
    assert key == f"owner-approval-{run.id}"
    assert request["method"] == "elicitation/create"
    assert request["params"]["mode"] == "url"
    assert request["params"]["url"] == f"{ORIGIN}/app/projects/{run.project_id}/console?tab=approvals"
    assert request["params"]["message"]


def test_needs_input_points_to_session_and_uses_a_different_key():
    run = _run("needs_input")
    (key, request), = mcp_tasks.task_view(run, CREATED, ORIGIN)["inputRequests"].items()
    assert key == f"owner-input-{run.id}"
    assert request["params"]["url"] == f"{ORIGIN}/app/projects/{run.project_id}/sessions/{run.session_id}"


def test_needs_input_without_session_falls_back_to_console():
    run = _run("needs_input", session_id=None, operation="profile_cv", job_revision_id=None)
    (_, request), = mcp_tasks.task_view(run, CREATED, ORIGIN)["inputRequests"].items()
    assert request["params"]["url"] == f"{ORIGIN}/app/projects/{run.project_id}/console?tab=timeline"


def test_owner_action_approval_flag_forces_approval_link_for_any_open_status():
    run = _run("queued", operation="apply_submit")
    assert mcp_tasks.owner_action(run, ORIGIN) is None
    key, request = mcp_tasks.owner_action(run, ORIGIN, approval=True)
    assert key == f"owner-approval-{run.id}"
    assert request["params"]["url"].endswith("/console?tab=approvals")


def test_completed_view_carries_call_tool_result():
    run = _run("completed", finished_at=CREATED + timedelta(minutes=1))
    result = {"run_id": str(run.id), "status": "completed"}
    view = mcp_tasks.task_view(run, run.finished_at, ORIGIN, result=result)
    assert view["result"] == {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                              "structuredContent": result, "isError": False}
    assert "inputRequests" not in view and "error" not in view


@pytest.mark.parametrize("status, message", [("failed", "run_failed"), ("interrupted", "run_interrupted")])
def test_failed_view_carries_stable_error(status, message):
    view = mcp_tasks.task_view(_run(status), CREATED, ORIGIN)
    assert view["status"] == "failed" and view["error"] == {"code": -32000, "message": message}


def test_cancelled_view_has_no_payload():
    view = mcp_tasks.task_view(_run("cancelled"), CREATED, ORIGIN)
    assert view["status"] == "cancelled"
    assert not {"inputRequests", "result", "error"} & set(view)


def test_created_task_keeps_only_task_fields():
    run = _run("completed")
    view = mcp_tasks.task_view(run, CREATED, ORIGIN, result={"run_id": str(run.id)})
    assert mcp_tasks.created_task(view) == {key: view[key] for key in (
        "taskId", "status", "statusMessage", "createdAt", "lastUpdatedAt", "ttlMs", "pollIntervalMs")}


def test_capability_detection():
    both = ClientCapabilities.model_validate({"extensions": {mcp_tasks.TASKS_EXTENSION: {}}, "elicitation": {"url": {}}})
    form_only = ClientCapabilities.model_validate({"elicitation": {"form": {}}})
    assert mcp_tasks.client_declares_tasks(both) and mcp_tasks.client_declares_url_elicitation(both)
    assert not mcp_tasks.client_declares_tasks(form_only)
    assert not mcp_tasks.client_declares_url_elicitation(form_only)
    assert not mcp_tasks.client_declares_tasks(None) and not mcp_tasks.client_declares_url_elicitation(None)
    assert not mcp_tasks.client_declares_tasks(ClientCapabilities())


def test_request_state_key_is_created_private_and_reused(tmp_path):
    key = mcp_tasks.mcp_request_state_key(tmp_path)
    path = tmp_path / "mcp-request-state-key"
    assert len(key) >= 43 and oct(path.stat().st_mode & 0o777) == "0o600"
    assert mcp_tasks.mcp_request_state_key(tmp_path) == key
    os.chmod(path, 0o640)
    with pytest.raises(RuntimeError, match="private_runtime_credentials_unavailable"):
        mcp_tasks.mcp_request_state_key(tmp_path)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run pytest tests/unit/test_mcp_tasks.py -q`
Expected: FAIL with `ImportError: cannot import name 'mcp_tasks'`.

- [ ] **Step 3: Implement** — `backend/src/job_search_platform/api/mcp_tasks.py`:

```python
"""MCP tasks extension (io.modelcontextprotocol/tasks, 2026-07-28) and MRTR helpers over durable runs (TOR FR-P02)."""
from __future__ import annotations

import json
import os
import secrets
import stat
from datetime import datetime
from pathlib import Path
from typing import Any

TASKS_EXTENSION = "io.modelcontextprotocol/tasks"
POLL_INTERVAL_MS = 2000
_TASK_KEYS = ("taskId", "status", "statusMessage", "createdAt", "lastUpdatedAt", "ttlMs", "pollIntervalMs")
_TASK_STATUS = {"queued": "working", "running": "working", "waiting_approval": "input_required",
                "needs_input": "input_required", "completed": "completed", "failed": "failed",
                "interrupted": "failed", "cancelled": "cancelled"}


def task_status(run_status: str) -> str:
    return _TASK_STATUS.get(run_status, "failed")


def owner_action(run: Any, owner_origin: str, *, approval: bool = False) -> tuple[str, dict[str, Any]] | None:
    """The URL elicitation that sends the user to the owner app; owner decisions never happen over MCP."""
    base = f"{owner_origin}/app/projects/{run.project_id}"
    if approval or run.status == "waiting_approval":
        key, url = f"owner-approval-{run.id}", f"{base}/console?tab=approvals"
        message = "The project owner must approve this step in the Job Search Platform app."
    elif run.status == "needs_input":
        key = f"owner-input-{run.id}"
        url = f"{base}/sessions/{run.session_id}" if run.session_id else f"{base}/console?tab=timeline"
        message = "The project owner must answer the remaining questions in the Job Search Platform app."
    else:
        return None
    return key, {"method": "elicitation/create", "params": {"mode": "url", "message": message, "url": url}}


def task_view(run: Any, last_updated_at: datetime, owner_origin: str, *, result: dict[str, Any] | None = None) -> dict[str, Any]:
    """The task wire dict (camelCase; `ttlMs` stays an explicit null because runs are durable)."""
    status = task_status(run.status)
    view: dict[str, Any] = {
        "taskId": str(run.id), "status": status, "statusMessage": run.status,
        "createdAt": run.created_at.isoformat(), "lastUpdatedAt": last_updated_at.isoformat(),
        "ttlMs": None, "pollIntervalMs": POLL_INTERVAL_MS,
    }
    action = owner_action(run, owner_origin)
    if status == "input_required" and action is not None:
        view["inputRequests"] = {action[0]: action[1]}
    elif status == "completed" and result is not None:
        view["result"] = {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                          "structuredContent": result, "isError": False}
    elif status == "failed":
        view["error"] = {"code": -32000, "message": "run_interrupted" if run.status == "interrupted" else "run_failed"}
    return view


def created_task(view: dict[str, Any]) -> dict[str, Any]:
    """CreateTaskResult carries the Task fields only; details come from tasks/get."""
    return {key: view[key] for key in _TASK_KEYS}


def client_declares_tasks(capabilities: Any) -> bool:
    return TASKS_EXTENSION in (getattr(capabilities, "extensions", None) or {})


def client_declares_url_elicitation(capabilities: Any) -> bool:
    return getattr(getattr(capabilities, "elicitation", None), "url", None) is not None


def mcp_request_state_key(private_dir: Path) -> str:
    """Key sealing MRTR requestState, created once (0600) so in-flight rounds survive a restart."""
    path = private_dir / "mcp-request-state-key"
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(secrets.token_urlsafe(32))
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RuntimeError("private_runtime_credentials_unavailable")
    return path.read_text(encoding="utf-8").strip()
```

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/unit/test_mcp_tasks.py -q`, then `uv run pytest tests/unit -q`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/job_search_platform/api/mcp_tasks.py backend/tests/unit/test_mcp_tasks.py
git commit -m "feat(mcp): task status mapping, wire shape and request-state key helpers (FR-P02)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tasks extension and cache hints on `/mcp`

**Files:**
- Modify: `backend/src/job_search_platform/api/mcp.py`
- Test: `backend/tests/integration/test_mcp_tasks.py` (create)

**Interfaces:**
- Consumes:
  - Everything from Task 1.
  - `ProtocolRuns.submit(actor, operation, request) -> RunView`.
  - `services.runs.get(actor, project_id, run_id) -> RunView`, which raises `ServiceError("forbidden")` for a grant without `results:read`, and `ServiceError("not_found")`.
  - `services.runs.cancel(actor, project_id, run_id)`.
  - `services.documents.list_ready(actor, project_id)`.
- Produces (Task 3 relies on these):
  - module-level `async def _authenticate_headers(headers, grants, resource=None) -> Actor`
  - `_TERMINAL_RUN_STATUSES: frozenset[str]`
  - `async def _run_result_with_artifacts(services, actor, run_id: UUID) -> tuple[RunView, dict]`
  - `_TASK_SKILLS: frozenset[str]`
  - `_owner_origin(services) -> str`
  - in `create_mcp_server`: `intake` is created before `MCPServer(...)`, and `MCPServer(..., extensions=[_TasksExtension(...)], cache_hints=_CACHE_HINTS)`.

SDK facts (verified on the installed 2.3.0):
- In an extension handler or interceptor, `ctx` is `ServerRequestContext`:
  - the per-request client capabilities are `ctx.session.client_capabilities` (a `ClientCapabilities`, rebuilt from that request's `_meta`);
  - HTTP headers are `getattr(ctx.request, "headers", None)`.
- Returning a plain `dict` from an interceptor or a `MethodBinding` handler is serialized as-is, so `"ttlMs": None` reaches the wire as `null`.
- `RequestParams` subclasses parse camelCase (`taskId` → `task_id`).

- [ ] **Step 1: Write the failing test** — `backend/tests/integration/test_mcp_tasks.py`:

```python
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
from job_search_platform.api.mcp import _TASK_SKILLS, create_mcp_app, mcp_lifespan_context
from job_search_platform.db.models import Run
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run pytest tests/integration/test_mcp_tasks.py -q`
Expected: FAIL with `ImportError: cannot import name '_TASK_SKILLS'`.

- [ ] **Step 3: Refactor auth and the run-result helper in `api/mcp.py`**

Add imports:

```python
import asyncio
import json
from datetime import datetime

from mcp.server.caching import CacheHint
from mcp.server.extension import Extension, MethodBinding
from mcp_types import RequestParams
from sqlalchemy import func

from job_search_platform.api.mcp_tasks import (TASKS_EXTENSION, client_declares_tasks, created_task, task_view)
from job_search_platform.db.models import Run, RunEvent
```

Keep the existing `from sqlalchemy import select` and `Run` import (merge `RunEvent` into it).

Replace `_token_from_context` and `_authenticate` with a header-based core. The `Context` version becomes a thin wrapper, so every existing call site is unchanged:

```python
def _token_from_headers(headers: Any) -> str:
    authorization_header = next(
        (value for key, value in (headers or {}).items() if key.lower() == "authorization"),
        "",
    )
    scheme, separator, token = authorization_header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token or token.strip() != token:
        raise MCPError(-32001, "unauthorized")
    return token


async def _authenticate_headers(headers: Any, grants: Any, resource: str | None = None) -> Actor:
    try:
        actor = await grants.authenticate(_token_from_headers(headers), resource=resource)
    except ServiceError as exc:
        raise _error(exc) from None
    except Exception:
        raise MCPError(-32000, "request_failed") from None
    if actor.kind != "grant" or actor.project_id is None:
        raise MCPError(-32001, "unauthorized")
    return actor


async def _authenticate(ctx: Context[Any, Any], grants: Any, resource: str | None = None) -> Actor:
    return await _authenticate_headers(ctx.headers, grants, resource)
```

(Keep the existing `_authenticate` behaviour. If the current body differs from the one above in any way other than the token source, keep the current body and only swap `_token_from_context(ctx)` for `_token_from_headers(headers)`.)

Add, at module level after `_run_result`:

```python
_TASK_SKILLS = frozenset(skill.id for skill in SKILLS if skill.kind == "task")
_TERMINAL_RUN_STATUSES = frozenset({"completed", "failed", "cancelled", "interrupted"})
_LIST_HINT = CacheHint(ttl_ms=3_600_000, scope="public")
_CACHE_HINTS = {"tools/list": _LIST_HINT, "prompts/list": _LIST_HINT, "resources/templates/list": _LIST_HINT}


def _owner_origin(services: Any) -> str:
    return getattr(getattr(services, "owner_sessions", None), "public_origin", None) or "http://127.0.0.1:8000"


async def _run_result_with_artifacts(services: Any, actor: Actor, run_id: UUID) -> tuple[RunView, dict[str, Any]]:
    """The get_run payload: run status plus published document resources from this run."""
    run = await services.runs.get(actor, actor.project_id, run_id)
    result = _run_result(run)
    documents = await services.documents.list_ready(actor, actor.project_id)
    resources = [f"job-search://documents/{document.id}" for document in documents if document.source_run_id == run.id]
    if resources:
        result["artifact_resources"] = resources
    return run, result
```

Change the body of the `get_run` tool to use it:

```python
        try:
            return (await _run_result_with_artifacts(services, actor, run_id))[1]
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
```

- [ ] **Step 4: Add the extension class in `api/mcp.py`** (module level, after `_run_result_with_artifacts`):

```python
_TASK_NOT_FOUND = "Failed to retrieve task: Task not found"
_TASK_VERSIONS = frozenset({"2026-07-28"})


class _TaskParams(RequestParams):
    task_id: str


class _TaskUpdateParams(_TaskParams):
    input_responses: dict[str, Any] = {}


class _TasksExtension(Extension):
    """io.modelcontextprotocol/tasks over durable runs. Owner decisions stay in the owner app (ADR-001, FR-A05)."""

    identifier = TASKS_EXTENSION

    def __init__(self, services: Any, resource: str | None, intake: ProtocolRuns) -> None:
        self.services, self.resource, self.intake = services, resource, intake

    async def _actor(self, ctx: Any) -> Actor:
        return await _authenticate_headers(getattr(ctx.request, "headers", None), self.services.grants, self.resource)

    @staticmethod
    def _require_capability(ctx: Any) -> None:
        if not client_declares_tasks(ctx.session.client_capabilities):
            raise MCPError(-32021, "Missing required client capability",
                           {"requiredCapabilities": {"extensions": {TASKS_EXTENSION: {}}}})

    def _last_updated(self, run: RunView) -> datetime:
        if run.finished_at is not None:
            return run.finished_at
        with self.services.sessions() as db:
            newest = db.scalar(select(func.max(RunEvent.created_at)).where(
                RunEvent.project_id == run.project_id, RunEvent.run_id == run.id))
        return newest or run.created_at

    async def _view(self, actor: Actor, task_id: str) -> dict[str, Any]:
        try:
            run, result = await _run_result_with_artifacts(self.services, actor, UUID(task_id))
        except ValueError:
            raise MCPError(-32602, _TASK_NOT_FOUND) from None
        except ServiceError as exc:
            if exc.code == "not_found":
                raise MCPError(-32602, _TASK_NOT_FOUND) from None
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        last = await asyncio.to_thread(self._last_updated, run)
        return task_view(run, last, _owner_origin(self.services), result=result)

    async def intercept_tool_call(self, params: Any, ctx: Any, call_next: Any) -> Any:
        if params.name not in _TASK_SKILLS or not client_declares_tasks(ctx.session.client_capabilities):
            return await call_next(ctx)
        actor = await self._actor(ctx)
        if "results:read" not in actor.capabilities:
            return await call_next(ctx)  # it could never read the task back
        skill = SKILL_BY_ID[params.name]
        try:
            request = skill.input_model.model_validate((params.arguments or {})["request"])
            run = await self.intake.submit(actor, skill.id, request)
        except ServiceError as exc:
            raise _error(exc) from None
        except (KeyError, ValidationError):
            raise MCPError(-32602, "invalid_parameters") from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return {"resultType": "task", **created_task(task_view(run, run.created_at, _owner_origin(self.services)))}

    def methods(self) -> tuple[MethodBinding, ...]:
        return (
            MethodBinding("tasks/get", _TaskParams, self._get, protocol_versions=_TASK_VERSIONS),
            MethodBinding("tasks/update", _TaskUpdateParams, self._update, protocol_versions=_TASK_VERSIONS),
            MethodBinding("tasks/cancel", _TaskParams, self._cancel, protocol_versions=_TASK_VERSIONS),
        )

    async def _get(self, ctx: Any, params: _TaskParams) -> dict[str, Any]:
        self._require_capability(ctx)
        return {"resultType": "complete", **await self._view(await self._actor(ctx), params.task_id)}

    async def _update(self, ctx: Any, params: _TaskUpdateParams) -> dict[str, Any]:
        # Owner questions and approvals are answered in the owner app, never by the agent.
        self._require_capability(ctx)
        await self._view(await self._actor(ctx), params.task_id)
        return {"resultType": "complete"}

    async def _cancel(self, ctx: Any, params: _TaskParams) -> dict[str, Any]:
        self._require_capability(ctx)
        actor = await self._actor(ctx)
        await self._view(actor, params.task_id)
        try:
            await self.services.runs.cancel(actor, actor.project_id, UUID(params.task_id))
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return {"resultType": "complete"}
```

- [ ] **Step 5: Wire it into `create_mcp_server`**

Move `intake = ProtocolRuns(services.sessions)` above the `MCPServer(...)` call, and pass the extension and the hints:

```python
    intake = ProtocolRuns(services.sessions)
    server = MCPServer(
        name="Job Search Platform",
        version="0.1.0",
        instructions="Use project-granted tools to evaluate job postings and draft application documents.",
        extensions=[_TasksExtension(services, resource, intake)],
        cache_hints=_CACHE_HINTS,
    )
```

- [ ] **Step 6: Run the tests**

Run: `uv run pytest tests/integration/test_mcp_tasks.py tests/integration/test_mcp.py tests/integration/test_mcp_oauth.py tests/integration/test_a2a.py -q`, then `uv run pytest tests/unit -q`.
Expected: all PASS. `test_mcp_skill_tools_match_golden_schemas` must pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/src/job_search_platform/api/mcp.py backend/tests/integration/test_mcp_tasks.py
git commit -m "feat(mcp): tasks extension over durable runs and public list cache hints (FR-P02)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: MRTR `input_required` on `apply_submit`, persisted request-state key

**Files:**
- Modify: `backend/src/job_search_platform/api/mcp.py` (`skill_tool`, `MCPServer(...)` request-state security)
- Modify: `backend/src/job_search_platform/api/dependencies.py` (`Services`)
- Modify: `backend/src/job_search_platform/main.py` (`build_services`)
- Test: `backend/tests/integration/test_mcp_tasks.py` (append)

**Interfaces:**
- Consumes:
  - Task 1: `owner_action(run, origin, approval=True)`, `client_declares_url_elicitation`, `mcp_request_state_key`.
  - Task 2: `_authenticate`, `_run_result_with_artifacts`, `_owner_origin`, the `submit` closure in `create_mcp_server`.
  - SDK: in a tool, `ctx.client_capabilities` is the per-request `ClientCapabilities` and `ctx.request_state` is the decrypted plaintext string. The SDK seals `InputRequiredResult.request_state` on the way out.
- Produces: `Services.mcp_request_state_key: str | None = None`.

MRTR rules for `apply_submit` (the only MRTR tool):
- Round 1 runs when `ctx.request_state is None`, the client declared URL elicitation, and the grant has `results:read`.
  1. Create the run through `submit`.
  2. Read it back.
  3. If it is terminal, return the `get_run` dict.
  4. Otherwise return `InputRequiredResult(input_requests={key: ElicitRequest(...)}, request_state=json.dumps({"run_id": "<uuid>"}))`. The request comes from `owner_action(run, origin, approval=True)`.
- A retry (`ctx.request_state` set):
  - Parse `{"run_id"}`; bad JSON or a missing key → `MCPError(-32602, "invalid_request_state")`.
  - Re-authenticate, then load the run through `_run_result_with_artifacts`. A run that is `not_found`, or whose `operation != "apply_submit"`, → `MCPError(-32001, "not_found")`.
  - Never call `submit`.
  - If the run is terminal, return the dict. Otherwise return another `InputRequiredResult` with the same key.
- Terminal statuses are `completed`, `failed`, `cancelled` and `interrupted`.
- Every other case is unchanged (legacy `submit` result).

- [ ] **Step 1: Append the failing tests to `backend/tests/integration/test_mcp_tasks.py`**

```python
from job_search_platform.api import mcp_tasks
from job_search_platform.services.protocol_runs import ProtocolRuns

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
```

- [ ] **Step 2: Run it to verify the new tests fail**

Run: `uv run pytest tests/integration/test_mcp_tasks.py -q -k "mrtr or apply_submit or request_state"`
Expected:
- `test_apply_submit_mrtr_rounds_until_terminal` FAILs, because the result is the legacy dict with no `input_required`.
- `test_request_state_survives_a_new_app_with_the_same_key` FAILs.
- `test_apply_submit_without_url_elicitation_is_legacy` may already pass.

- [ ] **Step 3: Add `Services.mcp_request_state_key`**

In `api/dependencies.py`, add `mcp_request_state_key: str | None = None` to `Services`, right after `oauth: Any = None`.

In `main.py`:
- import `from job_search_platform.api.mcp_tasks import mcp_request_state_key`;
- add `mcp_request_state_key=mcp_request_state_key(PRIVATE_DIR)` to the `Services(...)` call in `build_services`.

- [ ] **Step 4: Seal `requestState` with the persisted key**

In `api/mcp.py` add the imports:

```python
from mcp.server.request_state import RequestStateSecurity
from mcp_types import ElicitRequest, InputRequiredResult

from job_search_platform.api.mcp_tasks import client_declares_url_elicitation, owner_action
```

(Merge them into the existing `mcp_tasks` and `mcp_types` import lines.)

In `create_mcp_server`, before `MCPServer(...)`:

```python
    key = getattr(services, "mcp_request_state_key", None)
    # None (tests, SimpleNamespace services) keeps the SDK's process-local key.
    request_state = RequestStateSecurity(keys=[key], audience="job-search-platform-mcp") if key else None
```

Then add `request_state_security=request_state,` to the `MCPServer(...)` arguments.

- [ ] **Step 5: MRTR in `skill_tool`**

Inside `create_mcp_server`, add this helper next to `submit`:

```python
    async def apply_submit_rounds(skill: Skill, request: Any, ctx: Context[Any, Any]) -> dict[str, Any] | InputRequiredResult:
        """MRTR: the owner approves in the app; each retry re-reads the same run and never submits again."""
        actor = await _authenticate(ctx, services.grants, resource)
        if ctx.request_state is None:
            if "results:read" not in actor.capabilities or not client_declares_url_elicitation(ctx.client_capabilities):
                return await submit(skill.id, request, ctx)
            run_id = UUID((await submit(skill.id, request, ctx))["run_id"])
        else:
            try:
                run_id = UUID(json.loads(ctx.request_state)["run_id"])
            except (ValueError, KeyError, TypeError):
                raise MCPError(-32602, "invalid_request_state") from None
        try:
            run, result = await _run_result_with_artifacts(services, actor, run_id)
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        if run.operation != "apply_submit":
            raise MCPError(-32001, "not_found")
        if run.status in _TERMINAL_RUN_STATUSES:
            return result
        key, elicitation = owner_action(run, _owner_origin(services), approval=True)
        return InputRequiredResult(input_requests={key: ElicitRequest.model_validate(elicitation)},
                                   request_state=json.dumps({"run_id": str(run.id)}))
```

In `skill_tool`, after the existing generic `tool` is defined and its annotations are set, special-case `apply_submit`. Keep the generic path byte-for-byte for every other skill:

```python
        if skill.id == "apply_submit":
            async def tool(request, ctx: Context[Any, Any]) -> dict[str, Any] | InputRequiredResult:
                require_arguments(ctx, {"request"})
                return await apply_submit_rounds(skill, request, ctx)
            tool.__annotations__["request"] = skill.input_model
            tool.__name__ = tool.__qualname__ = skill.id
        return tool
```

(The output schema is unchanged: the SDK derives `{"additionalProperties": true, "type": "object", "title": "apply_submitDictOutput"}` from `dict[str, Any] | InputRequiredResult`, so the golden schema test stays green.)

- [ ] **Step 6: Run the tests**

Run:
- `uv run pytest tests/integration/test_mcp_tasks.py tests/integration/test_mcp.py tests/integration/test_agent_applications.py tests/integration/test_a2a.py tests/integration/test_rest_api.py tests/integration/test_application_startup.py -q`
- `uv run pytest tests/unit -q`

Expected: all PASS, except that `test_application_startup.py::test_actual_built_frontend_with_production_rest_upload_and_session_restore` is a known baseline failure on `develop`. Confirm it fails the same way without your change, and report it as such.

- [ ] **Step 7: Commit**

```bash
git add backend/src/job_search_platform/api/mcp.py backend/src/job_search_platform/api/dependencies.py backend/src/job_search_platform/main.py backend/tests/integration/test_mcp_tasks.py
git commit -m "feat(mcp): MRTR input_required on apply_submit with a persisted requestState key (FR-P02)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contract docs and full verification

**Files:**
- Modify: `docs/contracts/mcp.md`

- [ ] **Step 1: Document the behaviour.** Append a `## Tasks, MRTR and caching (FR-P02)` section to `docs/contracts/mcp.md` that states:
  - Protocol `2026-07-28`. `server/discover` advertises `capabilities.extensions["io.modelcontextprotocol/tasks"]`.
  - Which six tools may return `resultType: "task"`, and that this happens only when the request declares the tasks extension and the grant has `results:read`. `taskId` is the run id.
  - `tasks/get`, `tasks/update` and `tasks/cancel` (no `tasks/list`).
  - The status mapping table from the spec. `pollIntervalMs` is 2000, and `ttlMs` is null.
  - `input_required` carries a URL elicitation to the owner app. `tasks/update` only acknowledges, because the owner decides in the app.
  - Errors: `-32602` for an unknown or foreign task, and `-32021` when the capability is missing.
  - MRTR on `apply_submit` for clients that declare URL elicitation. The sealed `requestState` lasts 10 minutes and survives a restart. A retry never submits again.
  - Cache hints: the three list methods are public for 1 hour, and everything else is private/0.
  - Clients that declare nothing see the old behaviour.

- [ ] **Step 2: Backend suites.** From `backend/`:
  - `uv run pytest tests/unit -q`: all pass.
  - `uv run pytest tests -m integration -q`: all pass except the 2 known baseline failures, `test_application_startup.py::test_actual_built_frontend_with_production_rest_upload_and_session_restore` and `test_storage_infrastructure.py::test_real_postgres_minio_checksum_and_restart_proof`. They also fail on `origin/develop`.

- [ ] **Step 3: Live smoke.** Start `uv run python ../scripts/run_local.py --port 8010 --enable-sharing --share-host 127.0.0.1 --share-port 8011` (from `backend/`, `PYTHONUNBUFFERED=1`).
  - With a `jspg_` grant of a dev Project, POST raw 2026-07-28 JSON-RPC to `http://127.0.0.1:8011/mcp/`. Send headers `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name`, and the `_meta` keys `protocolVersion`, `clientInfo` and `clientCapabilities`.
  - Confirm:
    - `server/discover` lists the extension;
    - `tools/list` is `public`/3600000;
    - `tasks/get` of a random UUID → `-32602`;
    - `tasks/get` without the capability → `-32021`;
    - a tasks-capable `evaluate_job` returns `resultType: "task"` (or a stable `-32001` code such as `cv_required` if the dev Project has no CV; record which).
  - Record the result in the Hub WORKING_LOG.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/contracts/mcp.md
git commit -m "docs(mcp): tasks extension, MRTR and cache hints contract (FR-P02)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then stop for the owner's push/PR decision.
