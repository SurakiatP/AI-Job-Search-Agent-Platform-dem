"""Experience bank API: owner CRUD, upload-triggered extraction and grant isolation."""
from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select

from job_search_platform.db.models import ProviderConfiguration, Run
from test_paired_sessions import _project, _upload  # noqa: F401
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

PREFIX = "/api/v1/projects"


@pytest.mark.integration
def test_upload_queues_extraction_once_and_owner_crud(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    cv_id = _upload(api_context, csrf, pid).json()["id"]
    with api_context.sessions() as db:
        runs = list(db.scalars(select(Run).where(Run.project_id == UUID(pid), Run.operation == "extract_experience")))
    assert len(runs) == 1 and runs[0].status == "queued"
    assert client.get(f"{PREFIX}/{pid}/runs").json() == []

    view = client.get(f"{PREFIX}/{pid}/experience").json()
    assert view["items"] == [] and view["provider_configured"] is True
    assert view["extraction"]["status"] == "queued" and view["extraction"]["cv_id"] == cv_id

    url = f"{PREFIX}/{pid}/experience"
    created = client.post(url, headers=headers, json={"kind": "skill", "text": "Python"})
    assert created.status_code == 201 and created.json()["source"] == "owner" and created.json()["source_cv_id"] is None
    assert client.post(url, headers=headers, json={"kind": "skill", "text": " python "}).status_code == 409
    assert client.post(url, headers=headers, json={"kind": "hobby", "text": "x"}).status_code == 422
    assert client.post(url, json={"kind": "skill", "text": "Go"}).status_code in {401, 403}  # no CSRF
    replaced = client.put(f"{url}/{created.json()['id']}", headers=headers, json={"kind": "skill", "text": "Python 3"})
    assert replaced.status_code == 200 and replaced.json()["id"] != created.json()["id"]
    assert client.delete(f"{url}/{replaced.json()['id']}", headers=headers).status_code == 204
    assert client.get(url).json()["items"] == []
    rerun = client.post(f"{PREFIX}/{pid}/cvs/{cv_id}/experience-runs", headers=headers)
    assert rerun.status_code == 202 and rerun.json()["id"] == str(runs[0].id)


@pytest.mark.integration
def test_grant_cannot_reach_bank(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    cv_id = _upload(api_context, csrf, pid).json()["id"]
    item = client.post(f"{PREFIX}/{pid}/experience", headers=headers, json={"kind": "skill", "text": "Go"}).json()
    token = client.post(f"{PREFIX}/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read", "jobs:evaluate", "documents:draft"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    saved = dict(client.cookies)
    client.cookies.clear()
    try:
        bearer = {"Authorization": f"Bearer {token}"}
        url = f"{PREFIX}/{pid}/experience"
        assert client.get(url, headers=bearer).status_code in {401, 403}
        assert client.post(url, headers=bearer, json={"kind": "skill", "text": "x"}).status_code in {401, 403}
        assert client.put(f"{url}/{item['id']}", headers=bearer, json={"kind": "skill", "text": "y"}).status_code in {401, 403}
        assert client.delete(f"{url}/{item['id']}", headers=bearer).status_code in {401, 403}
        assert client.post(f"{PREFIX}/{pid}/cvs/{cv_id}/experience-runs", headers=bearer).status_code in {401, 403}
        # Grants cannot list runs over REST (403); were that to open up, extraction runs must stay hidden.
        runs = client.get(f"{PREFIX}/{pid}/runs", headers=bearer)
        assert runs.status_code == 403 or all(r["operation"] != "extract_experience" for r in runs.json())
    finally:
        client.cookies.update(saved)


@pytest.mark.integration
def test_no_provider_skips_queue_and_reports_it(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    with api_context.sessions.begin() as db:
        for row in db.scalars(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))):
            db.delete(row)
    assert _upload(api_context, csrf, pid).status_code == 201
    view = api_context.client.get(f"{PREFIX}/{pid}/experience").json()
    assert view["provider_configured"] is False and view["extraction"] is None
