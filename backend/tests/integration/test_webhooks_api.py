"""FR-P06 owner REST: CRUD, one-time secret, test ping, deliveries, redeliver, SSRF, limits, grants denied."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import update

from job_search_platform.db.models import WebhookDelivery
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

API = "/api/v1/projects"


def _project(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic hooks"}, headers=_write_headers(csrf)).json()["id"]
    return csrf, pid


@pytest.mark.integration
def test_owner_crud_secret_once_test_and_redeliver(api_context, monkeypatch):
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    client = api_context.client
    csrf, pid = _project(api_context)
    base = f"{API}/{pid}/webhooks"
    created = client.post(base, headers=_write_headers(csrf),
                          json={"url": "http://127.0.0.1:9/hook", "events": ["run.completed", "digest.ready"]})
    assert created.status_code == 201, created.text
    body = created.json()
    assert len(body["secret"]) >= 40 and body["events"] == ["digest.ready", "run.completed"]
    listed = client.get(base).json()
    assert [w["id"] for w in listed] == [body["id"]] and "secret" not in listed[0]
    patched = client.patch(f"{base}/{body['id']}", headers=_write_headers(csrf), json={"enabled": False})
    assert patched.status_code == 200 and patched.json()["enabled"] is False
    client.patch(f"{base}/{body['id']}", headers=_write_headers(csrf), json={"enabled": True})
    assert client.post(f"{base}/{body['id']}/test", headers=_write_headers(csrf)).json() == {"status": "queued"}
    deliveries = client.get(f"{base}/deliveries").json()
    assert [d["event_type"] for d in deliveries] == ["ping"] and deliveries[0]["status"] == "pending"
    assert "payload" not in deliveries[0]
    not_dead = client.post(f"{base}/deliveries/{deliveries[0]['id']}/redeliver", headers=_write_headers(csrf))
    assert not_dead.status_code == 409 and not_dead.json()["code"] == "delivery_not_dead"
    with api_context.sessions.begin() as db:
        db.execute(update(WebhookDelivery).where(WebhookDelivery.id == UUID(deliveries[0]["id"])).values(status="dead", attempts=8))
    assert client.post(f"{base}/deliveries/{deliveries[0]['id']}/redeliver", headers=_write_headers(csrf)).status_code == 202
    again = client.get(f"{base}/deliveries").json()[0]
    assert again["status"] == "pending" and again["attempts"] == 0
    assert client.delete(f"{base}/{body['id']}", headers=_write_headers(csrf)).status_code == 204
    assert client.get(base).json() == []


@pytest.mark.integration
def test_ssrf_validation_and_limit(api_context, monkeypatch):
    monkeypatch.delenv("WEBHOOK_ALLOW_PRIVATE", raising=False)
    client = api_context.client
    csrf, pid = _project(api_context)
    base = f"{API}/{pid}/webhooks"
    for url in ("http://hooks.example.com/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://ex..com/x"):
        bad = client.post(base, headers=_write_headers(csrf), json={"url": url, "events": ["run.completed"]})
        assert bad.status_code == 422 and bad.json()["code"] == "invalid_webhook_url", url
    monkeypatch.setenv("WEBHOOK_ALLOW_PRIVATE", "1")
    for i in range(5):
        assert client.post(base, headers=_write_headers(csrf), json={"url": f"http://127.0.0.1:9/{i}", "events": ["run.failed"]}).status_code == 201
    limit = client.post(base, headers=_write_headers(csrf), json={"url": "http://127.0.0.1:9/6", "events": ["run.failed"]})
    assert limit.status_code == 409 and limit.json()["code"] == "webhook_limit"


@pytest.mark.integration
def test_grant_cannot_reach_webhooks(api_context):
    client = api_context.client
    csrf, pid = _project(api_context)
    grant = client.post(f"{API}/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["results:read"], "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}).json()
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {grant['token']}"}
    assert client.get(f"{API}/{pid}/webhooks", headers=headers).status_code in {401, 403}
    assert client.post(f"{API}/{pid}/webhooks", headers=headers, json={"url": "https://x.test", "events": ["run.failed"]}).status_code in {401, 403}
