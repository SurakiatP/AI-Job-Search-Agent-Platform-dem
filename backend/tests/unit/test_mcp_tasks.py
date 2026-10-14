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
