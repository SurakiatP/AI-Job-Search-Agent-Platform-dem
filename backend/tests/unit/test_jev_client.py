import io
import json
import urllib.error

import pytest

from job_search_platform.integrations.jev import JEV_MODEL, JEV_URL, JevClient
from job_search_platform.services.errors import ServiceError


class Opener:
    def __init__(self, *responses):
        self.responses, self.requests = list(responses), []

    def open(self, request, timeout):
        self.requests.append(request)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return io.BytesIO(json.dumps(item).encode())


def _http(code, retry_after=None):
    headers = {"retry-after": retry_after} if retry_after else {}
    return urllib.error.HTTPError(JEV_URL, code, "x", headers, io.BytesIO(b"{}"))


def test_decide_posts_pinned_model_and_returns_answers():
    opener = Opener({"answers": {"q": {"type": "noul", "noul": 0.9}}})
    client = JevClient("sk-secret", opener=opener, sleep=lambda s: None)
    assert client.decide({"cv": "x"}, {"q": {"type": "noul"}}) == {"q": {"type": "noul", "noul": 0.9}}
    sent = json.loads(opener.requests[0].data)
    assert opener.requests[0].full_url == JEV_URL and sent["model"] == JEV_MODEL
    assert "sk-secret" not in repr(client)


def test_retries_429_then_succeeds_and_honours_retry_after():
    waits = []
    client = JevClient("k", opener=Opener(_http(429, "3"), {"answers": {}}), sleep=waits.append)
    assert client.decide({}, {}) == {}
    assert waits == [3.0]


def test_non_retryable_and_exhausted_errors_raise_jev_failed_without_key():
    for opener in (Opener(_http(401)), Opener(*[_http(503)] * 4), Opener({"oops": 1})):
        with pytest.raises(ServiceError) as caught:
            JevClient("sk-secret", opener=opener, sleep=lambda s: None).decide({}, {})
        assert caught.value.code == "jev_failed" and "sk-secret" not in str(caught.value)


def test_decide_records_one_jev_span_with_usage_and_no_content(monkeypatch):
    from job_search_platform.integrations import jev as jev_module
    calls = []
    monkeypatch.setattr(jev_module.tracing, "jev_decision", lambda **kw: calls.append(kw))
    reply = {"answers": {"q": {"type": "noul", "noul": 0.9}}, "model": "typesafe/jev-1.13-20260917",
             "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 0.000001}}
    client = JevClient("k", opener=Opener(_http(503), reply), sleep=lambda s: None)
    client.decide({"cv": "secret cv text"}, {"q": {"type": "noul"}})
    (call,) = calls
    assert call["model"] == JEV_MODEL and call["served_model"] == "typesafe/jev-1.13-20260917"
    assert call["usage"] == reply["usage"] and call["latency_ms"] >= 0
    assert "secret cv text" not in repr(call)


def test_decide_failure_records_no_span(monkeypatch):
    from job_search_platform.integrations import jev as jev_module
    calls = []
    monkeypatch.setattr(jev_module.tracing, "jev_decision", lambda **kw: calls.append(kw))
    client = JevClient("k", opener=Opener(_http(400)), sleep=lambda s: None)
    with pytest.raises(ServiceError):
        client.decide({}, {})
    assert calls == []
