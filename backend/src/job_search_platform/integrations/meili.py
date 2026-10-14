"""Stdlib Meilisearch REST client (FR-J01). Errors carry a status code or exception type only, never key or URL."""
from __future__ import annotations

import json
import time
from urllib.parse import quote as _urlquote
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

TIMEOUT_SECONDS = 8
MAX_BYTES = 8 * 1024 * 1024
POLL_SECONDS = 0.2


class MeiliError(Exception):
    """Request failed: transport, status, size, or a failed/canceled/timed-out task."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _urllib_transport(method, url, headers, body, timeout):
    request = Request(url, data=body, headers=headers, method=method)
    opener = build_opener(_NoRedirect(), ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            status, raw = response.status, response.read(MAX_BYTES + 1)
    except Exception as exc:  # HTTPError is a response (status + body); 3xx lands here too (no redirects)
        if not hasattr(exc, "code") or not hasattr(exc, "read"):
            raise
        try:
            status, raw = exc.code, exc.read(MAX_BYTES + 1)
        finally:
            exc.close()
    if len(raw) > MAX_BYTES:
        raise ValueError("too_large")
    return status, raw


def quote(value: str) -> str:
    """Meilisearch filter string literal."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class Meili:
    def __init__(self, url: str, key: str, *, transport=None):
        self._url = url.rstrip("/")
        self._key = key
        self._transport = transport or _urllib_transport

    def request(self, method: str, path: str, body=None, *, ok=(200, 201, 202)) -> dict | list:
        headers = {"Authorization": f"Bearer {self._key}", "Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        try:
            status, raw = self._transport(method, self._url + path, headers, data, TIMEOUT_SECONDS)
            if status not in ok:
                raise MeiliError(f"status_{status}")
            return json.loads(raw) if raw else {}
        except MeiliError:
            raise
        except (OSError, ValueError) as exc:
            raise MeiliError(type(exc).__name__) from None

    def _task(self, method, path, body=None) -> int:
        result = self.request(method, path, body)
        if not isinstance(result, dict) or not isinstance(result.get("taskUid"), int):
            raise MeiliError("bad_response")
        return result["taskUid"]

    def wait(self, task_uid: int, deadline_s: float = 120, sleep=time.sleep, clock=time.monotonic) -> None:
        end = clock() + deadline_s
        while True:
            task = self.request("GET", f"/tasks/{task_uid}")
            if not isinstance(task, dict):
                raise MeiliError("bad_response")
            if task.get("status") == "succeeded":
                return
            if task.get("status") in ("failed", "canceled"):
                raise MeiliError(f"task_{task['status']}")
            if clock() >= end:
                raise MeiliError("task_timeout")
            sleep(POLL_SECONDS)

    def index_exists(self, index: str) -> bool:
        try:
            self.request("GET", f"/indexes/{_urlquote(index, safe='')}")
            return True
        except MeiliError as exc:
            if str(exc) == "status_404":
                return False
            raise

    def update_settings(self, index: str, settings: dict) -> int:
        return self._task("PATCH", f"/indexes/{_urlquote(index, safe='')}/settings", settings)

    def add_documents(self, index: str, docs: list[dict]) -> int:
        return self._task("POST", f"/indexes/{_urlquote(index, safe='')}/documents?primaryKey=id", docs)

    def delete_documents(self, index: str, ids: list[str]) -> int:
        return self._task("POST", f"/indexes/{_urlquote(index, safe='')}/documents/delete-batch", ids)

    def search(self, index: str, payload: dict) -> dict:
        result = self.request("POST", f"/indexes/{_urlquote(index, safe='')}/search", payload)
        if not isinstance(result, dict):
            raise MeiliError("bad_response")
        return result

    def create_index(self, index: str) -> int:
        return self._task("POST", "/indexes", {"uid": index, "primaryKey": "id"})

    def swap(self, a: str, b: str) -> int:
        return self._task("POST", "/swap-indexes", [{"indexes": [a, b]}])

    def delete_index(self, index: str) -> int:
        return self._task("DELETE", f"/indexes/{_urlquote(index, safe='')}")


def client() -> Meili:
    from job_search_platform import config, main  # lazy: key file read only when called

    return Meili(config.meili_url(), main._private_text("meili-master-key"))
