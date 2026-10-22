"""FR-P06 signing, backoff and URL rules. Synthetic data only."""
import hashlib
import socket
import hmac
from datetime import timedelta

import pytest

from job_search_platform.services import webhooks
from job_search_platform.services.errors import ServiceError


def test_sign_matches_hmac_of_timestamp_dot_body():
    body = b'{"type":"ping"}'
    header = webhooks.sign("k" * 43, 1760400000, body)
    expected = hmac.new(b"k" * 43, b"1760400000." + body, hashlib.sha256).hexdigest()
    assert header == f"t=1760400000,v1={expected}"


def test_backoff_schedule_with_jitter():
    assert [webhooks.backoff(n, 0.0) for n in range(1, 9)] == [timedelta(minutes=m) for m in (1, 2, 4, 8, 16, 32, 64, 128)]
    assert webhooks.backoff(1, 1.0) == timedelta(minutes=1.1)


async def test_validate_url_rules(monkeypatch):
    monkeypatch.delenv("WEBHOOK_ALLOW_PRIVATE", raising=False)
    for bad in ("http://hooks.example.com/x", "https://127.0.0.1/x", "https://10.0.0.1/x", "https://localhost/x", "ftp://x.test/"):
        with pytest.raises(ServiceError) as caught:
            await webhooks.validate_url(bad)
        assert caught.value.code == "invalid_webhook_url"
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    await webhooks.validate_url("http://127.0.0.1:9/x")
    with pytest.raises(ServiceError):
        await webhooks.validate_url("ftp://127.0.0.1/x")


async def test_check_url_classification(monkeypatch):
    monkeypatch.delenv("WEBHOOK_ALLOW_PRIVATE", raising=False)
    table = {"pub.test": ["93.184.216.34"], "a.test": ["10.0.0.1"], "b.test": ["127.0.0.1"],
             "c.test": ["::ffff:127.0.0.1"], "d.test": ["169.254.169.254"],
             "e.test": ["100.64.0.1"], "f.test": ["64:ff9b::7f00:1"]}

    async def fake(host):
        if host == "gone.test":
            raise socket.gaierror("nope")
        if ".." in host:
            raise UnicodeError("label empty")  # what getaddrinfo raises for malformed IDNA hosts
        return table[host]
    monkeypatch.setattr(webhooks, "_resolve", fake)
    assert await webhooks.check_url("https://pub.test/x") == "ok"
    for host in "abcdef":
        assert await webhooks.check_url(f"https://{host}.test/x") == "blocked", host
    assert await webhooks.check_url("https://gone.test/x") == "unresolvable"
    assert await webhooks.check_url("https://ex..com/") == "invalid"
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    assert await webhooks.check_url("http://b.test/x") == "ok"
    assert await webhooks.check_url("https://ex..com/") == "invalid"


async def test_validate_url_malformed_is_service_error(monkeypatch):
    monkeypatch.delenv("WEBHOOK_ALLOW_PRIVATE", raising=False)
    with pytest.raises(ServiceError) as caught:
        await webhooks.validate_url("https://ex..com/x")
    assert caught.value.code == "invalid_webhook_url"
