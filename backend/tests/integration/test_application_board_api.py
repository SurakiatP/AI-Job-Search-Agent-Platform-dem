"""FR-T01 owner REST routes. Synthetic data only."""
from __future__ import annotations

import pytest

from helpers import login_cookie, user
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

API = "/api/v1/projects"


def _board(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic board"}, headers=_write_headers(csrf)).json()["id"]
    job = ctx.client.post(f"{API}/{pid}/jobs", json={"title": "วิศวกรข้อมูล อาวุโส", "description": "Synthetic"},
                          headers=_write_headers(csrf)).json()["id"]
    return csrf, pid, job


@pytest.mark.integration
def test_owner_board_flow(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    assert client.get(f"{API}/{pid}/applications").json()[0]["stage"] == "saved"
    moved = client.patch(f"{base}/application-status", json={"application_status": "interview"},
                         headers=_write_headers(csrf))
    assert moved.status_code == 200 and moved.json()["application_status"] == "interview"
    contact = client.put(f"{base}/application/contact",
                         json={"name": "Synthetic Recruiter", "email": "recruiter@example.test", "role": "HR"},
                         headers=_write_headers(csrf))
    assert contact.status_code == 200 and contact.json()["contact"]["email"] == "recruiter@example.test"
    logged = client.post(f"{base}/application/events", headers=_write_headers(csrf), json={
        "kind": "email_logged", "direction": "received", "subject": "Interview invite", "occurred_on": "2026-10-14"})
    assert logged.status_code == 201 and logged.json()["actor"] == "user"
    assert client.post(f"{base}/application/events", headers=_write_headers(csrf),
                       json={"kind": "note", "text": "Prepare portfolio"}).status_code == 201
    detail = client.get(f"{base}/application").json()
    assert [e["kind"] for e in detail["events"]] == ["note", "email_logged", "contact_updated", "stage_changed"]
    card = client.get(f"{API}/{pid}/applications").json()[0]
    assert card["stage"] == "interview" and card["has_contact"] is True
    assert client.get(f"{API}/{pid}/jobs").json()[0]["application_status"] == "interview"
    assert client.get(f"{base}/application-status").json()["application_status"] == "interview"


@pytest.mark.integration
def test_contact_accepts_plus_address_thai_name_and_clearing(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    path = f"{API}/{pid}/jobs/{job}/application/contact"
    saved = client.put(path, json={"name": "สมหญิง ใจดี", "email": "a+jobs@example.co.th", "role": None},
                       headers=_write_headers(csrf))
    assert saved.status_code == 200 and saved.json()["contact"]["name"] == "สมหญิง ใจดี"
    cleared = client.put(path, json={"name": None, "email": None, "role": None}, headers=_write_headers(csrf))
    assert cleared.json()["contact"] == {"name": None, "email": None, "role": None}
    assert client.get(f"{API}/{pid}/applications").json()[0]["has_contact"] is False


@pytest.mark.integration
def test_validation_errors(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    bad = [
        ("put", f"{base}/application/contact", {"email": "not-an-email"}),
        ("post", f"{base}/application/events", {"kind": "note", "text": "   "}),
        ("post", f"{base}/application/events", {"kind": "note", "text": "x" * 2001}),
        ("post", f"{base}/application/events", {"kind": "stage_changed", "text": "x"}),
        ("post", f"{base}/application/events", {"kind": "email_logged", "direction": "sideways",
                                                "subject": "x", "occurred_on": "2026-10-14"}),
        ("patch", f"{base}/application-status", {"application_status": "ghosted"}),
    ]
    for method, path, body in bad:
        response = client.request(method.upper(), path, json=body, headers=_write_headers(csrf))
        assert response.status_code == 422, (path, body, response.text)


@pytest.mark.integration
def test_other_user_cannot_reach_owner_routes(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    services = client.app.state.services
    with api_context.sessions.begin() as db:
        stranger = user(db).user_id
    cookie, stranger_csrf = login_cookie(services, stranger)
    client.cookies.set("jsp_owner_session", cookie)
    assert client.get(f"{API}/{pid}/applications").status_code == 404
    assert client.get(f"{base}/application").status_code == 404
    assert client.put(f"{base}/application/contact", json={"name": "x"},
                      headers=_write_headers(stranger_csrf)).status_code == 404
    assert client.post(f"{base}/application/events", json={"kind": "note", "text": "x"},
                       headers=_write_headers(stranger_csrf)).status_code == 404
