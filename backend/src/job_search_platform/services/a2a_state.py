"""Run status to A2A task state, shared by A2A tasks/get and A2A push payloads."""
from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

_STATES = {
    "queued": "TASK_STATE_SUBMITTED",
    "running": "TASK_STATE_WORKING",
    "waiting_approval": "TASK_STATE_INPUT_REQUIRED",
    "needs_input": "TASK_STATE_INPUT_REQUIRED",
    "completed": "TASK_STATE_COMPLETED",
    "failed": "TASK_STATE_FAILED",
    "cancelled": "TASK_STATE_CANCELED",
    "interrupted": "TASK_STATE_FAILED",
}


def task_state(status: str) -> tuple[str, dict[str, Any]]:
    metadata = {"terminal_reason": "interrupted"} if status == "interrupted" else {}
    return _STATES.get(status, "TASK_STATE_FAILED"), metadata


def context_id(run_id: UUID | str) -> str:
    return str(uuid5(NAMESPACE_URL, f"job-search-a2a:{run_id}"))
