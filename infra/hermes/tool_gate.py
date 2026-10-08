"""Synchronous native-bridge gate for reserving durable tool-call budget."""
from __future__ import annotations

from dataclasses import dataclass
from threading import Event, Lock
from typing import Callable
from uuid import uuid4


class ToolCallDenied(RuntimeError):
    """The backend did not authorize this native tool invocation."""


@dataclass
class _PendingCall:
    event: Event
    allowed: bool | None = None


class ToolCallGate:
    """Block native dispatch until the trusted parent reserves the call."""

    def __init__(self, emit: Callable[[dict[str, str]], None], *, timeout: float = 60) -> None:
        self._emit = emit
        self._timeout = timeout
        self._lock = Lock()
        self._pending: dict[str, _PendingCall] = {}

    def authorize(self, name: str) -> bool:
        if name not in {"terminal", "read_file", "write_file", "patch", "search_files"}:
            raise ToolCallDenied("unsupported_tool")
        call_id = uuid4().hex
        pending = _PendingCall(Event())
        with self._lock:
            self._pending[call_id] = pending
        try:
            # Tool arguments and results never cross this bridge gate.
            self._emit({"tool_request": call_id, "name": name})
            if not pending.event.wait(self._timeout) or pending.allowed is not True:
                raise ToolCallDenied("tool_call_denied")
            return True
        finally:
            with self._lock:
                self._pending.pop(call_id, None)

    def resolve(self, call_id: object, allowed: object) -> bool:
        if not isinstance(call_id, str) or type(allowed) is not bool:
            return False
        with self._lock:
            pending = self._pending.get(call_id)
            if pending is None:
                return False
            pending.allowed = allowed
            pending.event.set()
            return True
