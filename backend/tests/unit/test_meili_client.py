"""Meilisearch REST client with a fake transport; no network."""
from __future__ import annotations

import json

import pytest

from job_search_platform.integrations import meili


class Fake:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def __call__(self, method, url, headers, body, timeout):
        self.calls.append((method, url, headers, json.loads(body) if body else None))
        status, payload = self.responses.pop(0)
        return status, json.dumps(payload).encode()


def test_bearer_key_and_json_body():
    fake = Fake((202, {"taskUid": 7}))
    client = meili.Meili("http://127.0.0.1:57700", "k", transport=fake)
    assert client.add_documents("jobs", [{"id": "a"}]) == 7
    method, url, headers, body = fake.calls[0]
    assert (method, url, body) == ("POST", "http://127.0.0.1:57700/indexes/jobs/documents?primaryKey=id", [{"id": "a"}])
    assert headers["Authorization"] == "Bearer k"
    assert headers["Content-Type"] == "application/json"


def test_error_status_raises_without_leaking_key():
    client = meili.Meili("http://x", "secret-key", transport=Fake((500, {"message": "boom"})))
    with pytest.raises(meili.MeiliError) as caught:
        client.search("jobs", {"q": ""})
    assert "secret-key" not in str(caught.value)


def test_wait_polls_until_succeeded_and_raises_on_failed():
    client = meili.Meili("http://x", "k", transport=Fake((200, {"status": "processing"}), (200, {"status": "succeeded"})))
    client.wait(3, deadline_s=5, sleep=lambda s: None)
    failing = meili.Meili("http://x", "k", transport=Fake((200, {"status": "failed", "error": {"code": "x"}})))
    with pytest.raises(meili.MeiliError):
        failing.wait(3, deadline_s=5, sleep=lambda s: None)


def test_index_exists_false_on_404():
    assert meili.Meili("http://x", "k", transport=Fake((404, {"code": "index_not_found"}))).index_exists("jobs") is False


def test_filter_values_are_escaped():
    assert meili.quote('Bang"kok\\') == '"Bang\\"kok\\\\"'
    assert meili.quote("กรุงเทพ") == '"กรุงเทพ"'


def test_transport_error_is_meili_error():
    def boom(*a):
        raise OSError("refused")
    with pytest.raises(meili.MeiliError):
        meili.Meili("http://x", "k", transport=boom).search("jobs", {})


def test_wait_deadline_uses_wall_clock():
    ticks = iter(range(0, 1000, 50))
    fake = Fake(*[(200, {"status": "processing"})] * 10)
    client = meili.Meili("http://x", "k", transport=fake)
    with pytest.raises(meili.MeiliError, match="task_timeout"):
        client.wait(3, deadline_s=120, sleep=lambda s: None, clock=lambda: next(ticks))
    assert len(fake.calls) == 3


def test_unexpected_2xx_shapes_raise_bad_response():
    with pytest.raises(meili.MeiliError, match="bad_response"):
        meili.Meili("http://x", "k", transport=Fake((202, {}))).add_documents("jobs", [])
    with pytest.raises(meili.MeiliError, match="bad_response"):
        meili.Meili("http://x", "k", transport=Fake((200, []))).wait(1, sleep=lambda s: None)
    with pytest.raises(meili.MeiliError, match="bad_response"):
        meili.Meili("http://x", "k", transport=Fake((200, []))).search("jobs", {})
