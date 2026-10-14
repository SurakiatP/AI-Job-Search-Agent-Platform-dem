"""FR-J05 REST: owner routes, preview, public unsubscribe, grants denied. Synthetic data only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

API = "/api/v1/projects"


def _project(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic digests"}, headers=_write_headers(csrf)).json()["id"]
    services = ctx.client.app.state.services
    services.saved_searches.search = lambda **kw: {"items": [{"slug": "a", "title": "Synthetic job", "company": None,
                                                              "cities": [], "age_days": 1, "stale": False,
                                                              "source_url": None}], "total": 1, "limit": 20, "offset": 0}
    return csrf, pid, services


@pytest.mark.integration
def test_owner_crud_preview_and_unsubscribe(api_context):
    client = api_context.client
    csrf, pid, services = _project(api_context)
    base = f"{API}/{pid}/saved-searches"
    created = client.post(base, headers=_write_headers(csrf),
                          json={"name": "Data BKK", "filters": {"q": "data", "cities": ["Bangkok"]}, "frequency": "weekly"})
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    listed = client.get(base).json()
    assert [i["name"] for i in listed["items"]] == ["Data BKK"]
    assert listed["status"] == {"email_verified": True, "notifications_enabled": True}
    patched = client.patch(f"{base}/{sid}", headers=_write_headers(csrf), json={"digest_enabled": False})
    assert patched.status_code == 200 and patched.json()["digest_enabled"] is False
    preview = client.post(f"{base}/{sid}/preview", headers=_write_headers(csrf))
    assert preview.status_code == 202 and preview.json() == {"status": "sent"}
    mail = services.saved_searches.mailer.sent[-1]
    token = mail.text.split("token=")[1].split()[0]
    client.patch(f"{base}/{sid}", headers=_write_headers(csrf), json={"digest_enabled": True})
    client.cookies.clear()
    assert client.post("/api/v1/digest/unsubscribe", json={"token": token}).status_code == 204
    assert client.post("/api/v1/digest/unsubscribe", json={"token": token + "x"}).status_code == 400
    csrf = _owner(api_context)
    assert client.get(base).json()["items"][0]["digest_enabled"] is False
    assert client.delete(f"{base}/{sid}", headers=_write_headers(csrf)).status_code == 204
    assert client.get(base).json()["items"] == []


@pytest.mark.integration
def test_validation_and_conflicts(api_context):
    client = api_context.client
    csrf, pid, _ = _project(api_context)
    base = f"{API}/{pid}/saved-searches"
    for body in ({"name": ""}, {"name": "x" * 81}, {"name": "ok", "frequency": "hourly"},
                 {"name": "ok", "filters": {"posted_within_days": 7}}, {"name": "ok", "filters": {"skills": ["Bad Skill"]}}):
        assert client.post(base, headers=_write_headers(csrf), json=body).status_code == 422, body
    assert client.post(base, headers=_write_headers(csrf), json={"name": "Dup"}).status_code == 201
    taken = client.post(base, headers=_write_headers(csrf), json={"name": "Dup"})
    assert taken.status_code == 409 and taken.json()["code"] == "saved_search_name_taken"
    for i in range(9):
        client.post(base, headers=_write_headers(csrf), json={"name": f"S{i}"})
    limit = client.post(base, headers=_write_headers(csrf), json={"name": "Eleventh"})
    assert limit.status_code == 409 and limit.json()["code"] == "saved_search_limit"


@pytest.mark.integration
def test_grant_cannot_reach_saved_searches(api_context):
    client = api_context.client
    csrf, pid, _ = _project(api_context)
    issued = client.post(f"{API}/{pid}/grants", headers=_write_headers(csrf),
                         json={"capabilities": ["results:read", "jobs:search"],
                               "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()})
    assert issued.status_code == 201, issued.text
    headers = {"Authorization": f"Bearer {issued.json()['token']}"}
    client.cookies.clear()
    assert client.get(f"{API}/{pid}/saved-searches", headers=headers).status_code in {401, 403}
    assert client.post(f"{API}/{pid}/saved-searches", headers=headers, json={"name": "x"}).status_code in {401, 403}
