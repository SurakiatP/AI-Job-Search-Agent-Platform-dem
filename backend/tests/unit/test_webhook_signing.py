"""FR-P06 signing, backoff and URL rules. Synthetic data only."""
import hashlib
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
