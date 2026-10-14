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
    key = path.read_text(encoding="utf-8").strip()
    if not key:
        raise RuntimeError("private_runtime_credentials_unavailable")
    return key
