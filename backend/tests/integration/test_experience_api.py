"""Experience bank API: owner CRUD, upload-triggered extraction and grant isolation."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import select

from job_search_platform.db.models import ProviderConfiguration, Run
from test_paired_sessions import _project, _upload  # noqa: F401
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

PREFIX = "/v1/projects"


@pytest.mark.integration
def test_upload_does_not_extract_until_owner_asks_and_owner_crud(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    cv_id = _upload(api_context, csrf, pid).json()["id"]
    with api_context.sessions() as db:
        assert not list(db.scalars(select(Run).where(Run.project_id == UUID(pid), Run.operation == "extract_experience")))
    revision = client.get(f"{PREFIX}/{pid}/cv").json()[0]
    assert revision["extracted_at"] is None and revision["extracted_count"] == 0
    assert client.get(f"{PREFIX}/{pid}/experience").json()["extraction"] is None

    started = client.post(f"/v1/async/projects/{pid}/cvs/{cv_id}/experience-extractions", headers=headers)
    assert started.status_code == 202
    again = client.post(f"/v1/async/projects/{pid}/cvs/{cv_id}/experience-extractions", headers=headers)
    assert again.json()["id"] == started.json()["id"]
    with api_context.sessions() as db:
        runs = list(db.scalars(select(Run).where(Run.project_id == UUID(pid), Run.operation == "extract_experience")))
    assert len(runs) == 1 and runs[0].status == "queued"

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
    rerun = client.post(f"/v1/async/projects/{pid}/cvs/{cv_id}/experience-extractions", headers=headers)
    assert rerun.status_code == 202 and rerun.json()["id"] == str(runs[0].id)


@pytest.mark.integration
def test_grant_cannot_reach_bank(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    cv_id = _upload(api_context, csrf, pid).json()["id"]
    item = client.post(f"{PREFIX}/{pid}/experience", headers=headers, json={"kind": "skill", "text": "Go"}).json()
    token = client.post(f"{PREFIX}/{pid}/grants", headers=headers, json={
        "capabilities": ["results:read", "jobs:evaluate", "documents:draft"], "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}).json()["token"]
    saved = dict(client.cookies)
    client.cookies.clear()
    try:
        bearer = {"Authorization": f"Bearer {token}"}
        url = f"{PREFIX}/{pid}/experience"
        assert client.get(url, headers=bearer).status_code in {401, 403}
        assert client.post(url, headers=bearer, json={"kind": "skill", "text": "x"}).status_code in {401, 403}
        assert client.put(f"{url}/{item['id']}", headers=bearer, json={"kind": "skill", "text": "y"}).status_code in {401, 403}
        assert client.delete(f"{url}/{item['id']}", headers=bearer).status_code in {401, 403}
        assert client.post(f"/v1/async/projects/{pid}/cvs/{cv_id}/experience-extractions", headers=bearer).status_code in {401, 403}
        # Grants cannot list runs over REST (403); were that to open up, extraction runs must stay hidden.
        runs = client.get(f"{PREFIX}/{pid}/runs", headers=bearer)
        assert runs.status_code == 403 or all(r["operation"] != "extract_experience" for r in runs.json())
    finally:
        client.cookies.update(saved)


@pytest.mark.integration
def test_no_gateway_key_skips_queue_and_reports_it(api_context, no_gateway_key):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    assert _upload(api_context, csrf, pid).status_code == 201
    view = api_context.client.get(f"{PREFIX}/{pid}/experience").json()
    assert view["provider_configured"] is False and view["extraction"] is None


@pytest.mark.integration
def test_owner_revives_a_removed_cv_fact_over_http(api_context):
    from job_search_platform.db.models import CVRevision, ExperienceItem
    from job_search_platform.services import experience
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    cv_id = _upload(api_context, csrf, pid).json()["id"]
    with api_context.sessions.begin() as db:
        rev = CVRevision(project_id=UUID(pid), cv_id=UUID(cv_id), revision=99)
        db.add(rev)
        db.flush()
        for text in ("Ran BigQuery", "Built Airflow"):
            experience._insert(db, UUID(pid), kind="skill", text=text, source="cv", source_cv_revision_id=rev.id)
            item = db.scalar(select(ExperienceItem).where(ExperienceItem.text == text))
            item.removed_at = datetime.now(timezone.utc)
    url = f"{PREFIX}/{pid}/experience"
    posted = client.post(url, headers=headers, json={"kind": "skill", "text": "ran bigquery"})
    assert posted.status_code == 201 and posted.json()["source"] == "owner" and posted.json()["source_cv_id"] is None
    mine = client.post(url, headers=headers, json={"kind": "skill", "text": "Other"}).json()["id"]
    reverted = client.put(f"{url}/{mine}", headers=headers, json={"kind": "skill", "text": "Built Airflow"})
    assert reverted.status_code == 200 and reverted.json()["source"] == "owner"


def test_put_with_end_before_start_answers_422_validation_error(api_context):
    csrf = _owner(api_context)
    pid = _project(api_context, csrf)
    client, headers = api_context.client, _write_headers(csrf)
    url = f"{PREFIX}/{pid}/experience"
    created = client.post(url, headers=headers, json={"kind": "skill", "text": "Python"}).json()
    bad = client.put(f"{url}/{created['id']}", headers=headers,
                     json={"kind": "skill", "text": "Python", "start_date": "2024-05", "end_date": "2023-01"})
    assert bad.status_code == 422 and bad.json()["code"] == "validation_error", bad.text
