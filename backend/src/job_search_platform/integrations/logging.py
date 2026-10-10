"""One JSON line per log record on stdout, plus request-id and access-log middleware.

Never logs headers, bodies, query strings or tokens: the request line carries only the method,
the route template, the status and the duration.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")  # also matches a uuid
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_EXTRAS = ("method", "route", "status", "duration_ms")
_log = logging.getLogger("jsp.request")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = {"ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
                "level": record.levelname, "logger": record.name, "msg": record.getMessage(),
                "request_id": _request_id.get()}
        line.update({key: getattr(record, key) for key in _EXTRAS if hasattr(record, key)})
        return json.dumps(line, separators=(",", ":"))  # exc_info is dropped on purpose: it can echo input


def configure_logging() -> None:
    """Idempotent: replaces only the handler it installed before."""
    root = logging.getLogger()
    for handler in [h for h in root.handlers if getattr(h, "_jsp", False)]:
        root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler._jsp = True  # type: ignore[attr-defined]
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    level = logging.getLevelName((os.environ.get("JSP_LOG_LEVEL") or "INFO").strip().upper())
    root.setLevel(level if isinstance(level, int) else logging.INFO)
    for noisy in ("httpx", "httpcore", "botocore", "boto3", "urllib3", "sqlalchemy.engine"):  # their INFO/DEBUG lines carry URLs, query strings or SQL parameters
        logging.getLogger(noisy).setLevel(logging.WARNING)


class RequestLogMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware) so SSE streams and disconnects pass through untouched."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        supplied = next((v.decode("latin-1") for k, v in scope["headers"] if k == b"x-request-id"), "")
        request_id = supplied if _SAFE_ID.fullmatch(supplied) else str(uuid4())
        token = _request_id.set(request_id)
        started, status = time.perf_counter(), 500

        async def send_with_id(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {**message, "headers": [*message.get("headers", []),
                                                  (REQUEST_ID_HEADER.lower().encode(), request_id.encode())]}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            route = getattr(scope.get("route"), "path", "unmatched")
            _log.info("request", extra={"method": scope["method"], "route": route, "status": status,
                                        "duration_ms": round((time.perf_counter() - started) * 1000, 1)})
            _request_id.reset(token)
