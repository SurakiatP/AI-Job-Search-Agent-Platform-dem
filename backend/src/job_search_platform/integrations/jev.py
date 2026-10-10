"""TypeSafe Jev typed decisions over OpenRouter. Answers only; the key never leaves this object."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

from job_search_platform.services.errors import ServiceError

JEV_URL = "https://openrouter.ai/api/alpha/decisions"
JEV_MODEL = "typesafe/jev-1.13"
TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 2_000_000
RETRY_STATUSES = {429, 500, 502, 503, 504}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


class JevClient:
    def __init__(self, api_key: str, *, opener=None, sleep=time.sleep, attempts: int = 4) -> None:
        self._key, self._opener, self._sleep, self._attempts = api_key, opener or _OPENER, sleep, attempts

    def __repr__(self) -> str:
        return "JevClient(<redacted>)"

    def decide(self, state: dict, questions: dict) -> dict:
        body = json.dumps({"model": JEV_MODEL, "state": state, "questions": questions}).encode()
        for attempt in range(self._attempts):
            last = attempt == self._attempts - 1
            request = urllib.request.Request(JEV_URL, data=body, method="POST", headers={
                "Authorization": f"Bearer {self._key}", "Content-Type": "application/json"})
            try:
                with self._opener.open(request, timeout=TIMEOUT_SECONDS) as response:
                    data = json.loads(response.read(MAX_RESPONSE_BYTES))
            except urllib.error.HTTPError as error:
                retry = error.code in RETRY_STATUSES
                if not retry or last:
                    raise ServiceError("jev_failed", retryable=retry) from None
                wait = (error.headers or {}).get("retry-after")
                self._sleep(min(float(wait), 30.0) if wait and wait.isdigit() else float(2 ** attempt))
                continue
            except (urllib.error.URLError, TimeoutError, ValueError):
                if last:
                    raise ServiceError("jev_failed", retryable=True) from None
                self._sleep(float(2 ** attempt))
                continue
            answers = data.get("answers") if isinstance(data, dict) else None
            if not isinstance(answers, dict):
                raise ServiceError("jev_failed")
            return answers
        raise ServiceError("jev_failed")
