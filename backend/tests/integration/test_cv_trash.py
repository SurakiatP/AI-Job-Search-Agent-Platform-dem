"""CR-CVT-01: CV trash, restore and permanent delete (docs/superpowers/specs/2026-10-20-cv-trash-and-photo-templates-design.md)."""
from __future__ import annotations

from uuid import UUID

import pytest
from datetime import datetime, timezone

from sqlalchemy import func, select, update

from job_search_platform.db.models import (CV, CVRevision, CVRevisionText, ExperienceItem, ResumeDraft, Run,
                                           StoredFile)
from resume_samples import thai_long
from test_cv_builder import _Render
from test_paired_sessions import JOB, PREFIX, _project, _session, _upload
from test_rest_api import _object_exists, _owner, _seed_completed_run, _seed_document, _write_headers, api_context  # noqa: F401


def _settle_runs(ctx) -> None:
    """Uploads and new sessions queue AI runs; finish them so only the run a test seeds can block."""
    with ctx.sessions.begin() as db:
        db.execute(update(Run).where(Run.status.in_(("queued", "running")))
                   .values(status="cancelled", finished_at=datetime.now(timezone.utc)))


def _builder_cv(ctx, csrf, pid) -> tuple[str, dict]:
    headers = _write_headers(csrf)
    cv_id = ctx.client.post(f"{PREFIX}/{pid}/cvs/builder", json={"name": "CV ทดลอง"}, headers=headers).json()["id"]
    draft = ctx.client.get(f"{PREFIX}/{pid}/cvs/{cv_id}/draft").json()
    saved = ctx.client.put(f"{PREFIX}/{pid}/cvs/{cv_id}/draft", headers=headers, json={
        "resume_data": thai_long(), "template_id": "onyx", "accent": "indigo", "document_language": "th",
        "updated_at": draft["updated_at"]})
    assert saved.status_code == 200, saved.text
    published = ctx.client.post(f"{PREFIX}/{pid}/cvs/{cv_id}/draft/publish", headers=headers)
    assert published.status_code == 201, published.text
    return cv_id, published.json()


@pytest.mark.integration
def test_ac_cvt_01_to_03_trash_restore_and_purge_keep_history(api_context):
    api_context.runtime.render_typst = _Render()
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    cv_id, revision = _builder_cv(api_context, csrf, pid)
    session = _session(api_context, csrf, pid, revision["id"], job=JOB)
    assert session.status_code == 201, session.text
    with api_context.sessions() as db:
        key = db.get(StoredFile, UUID(revision["file_id"])).storage_key
        facts = db.scalar(select(func.count()).select_from(ExperienceItem).where(
            ExperienceItem.builder_cv_id == UUID(cv_id), ExperienceItem.removed_at.is_(None)))
    assert facts > 0 and _object_exists(api_context, key)

    _settle_runs(api_context)
    url = f"{PREFIX}/{pid}/cvs/{cv_id}"
    live = client.delete(f"{url}/permanent", headers=headers)
    assert live.status_code == 409 and live.json()["code"] == "cv_not_trashed"

    # AC-CVT-01: trash, list, restore; the only CV comes back as primary.
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(f"{PREFIX}/{pid}/cvs").json() == []
    trash = client.get(f"{PREFIX}/{pid}/cvs", params={"view": "trash"}).json()
    assert [c["id"] for c in trash] == [cv_id] and trash[0]["trashed_at"]
    restored = client.post(f"{url}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["is_primary"] is True and restored.json()["trashed_at"] is None
    assert [c["id"] for c in client.get(f"{PREFIX}/{pid}/cvs").json()] == [cv_id]
    assert client.get(f"{PREFIX}/{pid}/cvs", params={"view": "trash"}).json() == []

    # AC-CVT-03: a run still working on the CV blocks permanent delete.
    assert client.delete(url, headers=headers).status_code == 204
    run_id = _seed_completed_run(api_context, pid, session.json()["id"], status="running", key="cvt-busy")
    with api_context.sessions.begin() as db:
        db.get(Run, run_id).cv_revision_id = UUID(revision["id"])
    busy = client.delete(f"{url}/permanent", headers=headers)
    assert busy.status_code == 409 and busy.json()["code"] == "cv_in_use"
    with api_context.sessions.begin() as db:
        db.get(Run, run_id).status = "completed"

    # AC-CVT-02: purge removes content, keeps the name, revision numbers, session and bank facts.
    purged = client.delete(f"{url}/permanent", headers=headers)
    assert purged.status_code == 204, purged.text
    with api_context.sessions() as db:
        rev = db.get(CVRevision, UUID(revision["id"]))
        assert rev is not None and rev.revision == 1 and rev.file_id is None and rev.resume_data is None
        assert db.get(StoredFile, UUID(revision["file_id"])) is None
        assert db.get(CVRevisionText, UUID(revision["id"])) is None
        assert db.scalar(select(ResumeDraft).where(ResumeDraft.cv_id == UUID(cv_id))) is None
        assert db.get(CV, UUID(cv_id)).purged_at is not None
        assert db.scalar(select(func.count()).select_from(ExperienceItem).where(
            ExperienceItem.builder_cv_id == UUID(cv_id), ExperienceItem.removed_at.is_(None))) == facts
    assert not _object_exists(api_context, key)
    shown = client.get(f"{PREFIX}/{pid}/sessions/{session.json()['id']}").json()
    assert shown["cv_name"] == "CV ทดลอง" and shown["cv_revision"] == 1
    assert client.get(f"{PREFIX}/{pid}/cvs", params={"view": "trash"}).json() == []
    assert client.post(f"{url}/restore", headers=headers).status_code == 404
    assert client.delete(f"{url}/permanent", headers=headers).status_code == 404


@pytest.mark.integration
def test_ac_cvt_02_purge_keeps_a_file_a_document_still_uses(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    cv = _upload(api_context, csrf, pid, "cv-a.txt").json()
    shared = _seed_document(api_context, pid, "promoted.pdf")
    with api_context.sessions.begin() as db:  # a tailored CV promoted into this CV shares the document's file
        db.add(CVRevision(project_id=UUID(pid), cv_id=UUID(cv["id"]), revision=2, file_id=shared.file))
    own = cv["latest_revision"]["file_id"]
    _settle_runs(api_context)
    assert client.delete(f"{PREFIX}/{pid}/cvs/{cv['id']}", headers=headers).status_code == 204
    assert client.delete(f"{PREFIX}/{pid}/cvs/{cv['id']}/permanent", headers=headers).status_code == 204
    with api_context.sessions() as db:
        assert db.get(StoredFile, shared.file) is not None and db.get(StoredFile, UUID(own)) is None
    assert _object_exists(api_context, shared.key)
    assert str(shared.document) in [d["id"] for d in client.get(f"{PREFIX}/{pid}/documents").json()]


@pytest.mark.integration
def test_cvt_restore_keeps_an_existing_primary_and_other_projects_get_404(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    a = _upload(api_context, csrf, pid, "cv-a.txt").json()["id"]
    b = _upload(api_context, csrf, pid, "cv-b.txt").json()["id"]
    assert client.delete(f"{PREFIX}/{pid}/cvs/{a}", headers=headers).status_code == 204  # b becomes primary
    other = _project(api_context, csrf, "Other")
    assert client.post(f"{PREFIX}/{other}/cvs/{a}/restore", headers=headers).status_code == 404
    assert client.delete(f"{PREFIX}/{other}/cvs/{a}/permanent", headers=headers).status_code == 404
    assert client.post(f"{PREFIX}/{pid}/cvs/{a}/restore", headers=headers).json()["is_primary"] is False
    assert [(c["id"], c["is_primary"]) for c in client.get(f"{PREFIX}/{pid}/cvs").json()] == [(b, True), (a, False)]
    assert client.post(f"{PREFIX}/{pid}/cvs/{a}/restore", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403
