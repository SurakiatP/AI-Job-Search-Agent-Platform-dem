"""Named CVs, CV + job paired sessions, per-session run pairing, revise and project isolation."""
from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text

from helpers import provider_config
from job_search_platform.db.models import ConversationSession, Document, DocumentRevision, JobRevision, Run
from test_rest_api import ROOT_FOR_MIGRATIONS, _owner, _write_headers, api_context  # noqa: F401

PREFIX = "/api/v1/projects"
JOB = {"title": "Engineer", "company": "Example Co", "description": "Synthetic role description"}


def _project(api_context, csrf, name="P"):
    pid = api_context.client.post(PREFIX, json={"name": name}, headers=_write_headers(csrf)).json()["id"]
    workspace = api_context.tmp_path / "parse" / pid
    (workspace / "inputs").mkdir(parents=True)
    api_context.parser.projects[UUID(pid)] = SimpleNamespace(workspace=workspace)
    with api_context.sessions.begin() as db:
        provider_config(db, UUID(pid))
    return pid


def _upload(api_context, csrf, pid, filename="cv-a.txt", name=None, path="cvs"):
    data = {"name": name} if name else None
    return api_context.client.post(f"{PREFIX}/{pid}/{path}", files={"file": (filename, f"CV {filename} {uuid4()}".encode(), "text/plain")},
                                   data=data, headers=_write_headers(csrf))


def _session(api_context, csrf, pid, cv_revision_id, **body):
    return api_context.client.post(f"{PREFIX}/{pid}/sessions", json={"cv_revision_id": cv_revision_id, **body},
                                   headers=_write_headers(csrf))


@pytest.mark.integration
def test_cv_lifecycle_primary_promotion_revisions_and_in_use(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    first = _upload(api_context, csrf, pid, "cv-a.txt")
    assert first.status_code == 201, first.text
    assert first.json()["name"] == "cv-a" and first.json()["is_primary"] is True
    assert first.json()["revision_count"] == 1 and first.json()["latest_revision"]["revision"] == 1
    second = _upload(api_context, csrf, pid, "cv-b.txt", name="Second").json()
    assert second["name"] == "Second" and second["is_primary"] is False
    a, b = first.json()["id"], second["id"]

    promoted = client.patch(f"{PREFIX}/{pid}/cvs/{b}", json={"is_primary": True}, headers=headers)
    assert promoted.status_code == 200 and promoted.json()["is_primary"] is True
    listing = client.get(f"{PREFIX}/{pid}/cvs").json()
    assert [(c["name"], c["is_primary"]) for c in listing] == [("Second", True), ("cv-a", False)]
    assert client.patch(f"{PREFIX}/{pid}/cvs/{a}", json={"name": "Renamed"}, headers=headers).json()["name"] == "Renamed"

    added = _upload(api_context, csrf, pid, "cv-a2.txt", path=f"cvs/{a}/revisions")
    assert added.status_code == 201 and added.json()["revision"] == 2
    row = next(c for c in client.get(f"{PREFIX}/{pid}/cvs").json() if c["id"] == a)
    assert row["revision_count"] == 2 and row["latest_revision"]["revision"] == 2 and row["in_use"] is False

    # Legacy routes act on the primary CV (Second).
    assert [r["revision"] for r in client.get(f"{PREFIX}/{pid}/cv").json()] == [1]
    legacy = _upload(api_context, csrf, pid, "cv-b2.txt", path="cv")
    assert legacy.status_code == 201 and legacy.json()["revision"] == 2

    session = _session(api_context, csrf, pid, row["latest_revision"]["id"], job=JOB)
    assert session.status_code == 201, session.text
    assert next(c for c in client.get(f"{PREFIX}/{pid}/cvs").json() if c["id"] == a)["in_use"] is True

    # Deleting the primary promotes the newest remaining CV.
    assert client.delete(f"{PREFIX}/{pid}/cvs/{b}", headers=headers).status_code == 204
    left = client.get(f"{PREFIX}/{pid}/cvs").json()
    assert [(c["id"], c["is_primary"]) for c in left] == [(a, True)]
    # A CV used by a session can still be deleted; the session keeps its pinned revision.
    assert client.delete(f"{PREFIX}/{pid}/cvs/{a}", headers=headers).status_code == 204
    assert client.get(f"{PREFIX}/{pid}/cvs").json() == []
    kept = client.get(f"{PREFIX}/{pid}/sessions/{session.json()['id']}")
    assert kept.status_code == 200 and kept.json()["cv_name"] == "Renamed"


@pytest.mark.integration
def test_session_pair_auto_evaluation_duplicate_and_outdated(api_context):
    client, csrf = api_context.client, _owner(api_context)
    pid = _project(api_context, csrf)
    cv = _upload(api_context, csrf, pid).json()
    rev = cv["latest_revision"]["id"]

    created = _session(api_context, csrf, pid, rev, job=JOB)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["title"] == "Engineer · Example Co"
    assert (body["cv_name"], body["cv_revision"], body["job_title"], body["job_company"]) == ("cv-a", 1, "Engineer", "Example Co")
    assert body["cv_outdated"] is False and body["evaluation_run_id"]
    with api_context.sessions() as db:
        run = db.get(Run, UUID(body["evaluation_run_id"]))
        assert (run.session_id, run.operation, run.status) == (UUID(body["id"]), "evaluate_job", "queued")
        assert str(run.cv_revision_id) == rev and str(run.job_revision_id) == body["job_revision_id"]

    # Same CV revision + same pasted job: deduplicated job, duplicate pair -> 409 with the existing id.
    dup = _session(api_context, csrf, pid, rev, job=JOB)
    assert dup.status_code == 409 and dup.json()["code"] == "session_pair_exists"
    assert dup.json()["fields"]["session_id"] == body["id"]
    again = _session(api_context, csrf, pid, rev, job_revision_id=body["job_revision_id"])
    assert again.status_code == 409
    with api_context.sessions() as db:
        assert db.scalar(select(func.count()).select_from(JobRevision).where(JobRevision.project_id == UUID(pid))) == 1

    # Exactly one job source; untitled default without company.
    assert _session(api_context, csrf, pid, rev).status_code == 422
    assert _session(api_context, csrf, pid, rev, job=JOB, job_revision_id=body["job_revision_id"]).status_code == 422
    plain = _session(api_context, csrf, pid, rev, job={"title": "Solo", "description": "Other role"}).json()
    assert plain["title"] == "Solo"

    _upload(api_context, csrf, pid, "cv-a2.txt", path=f"cvs/{cv['id']}/revisions")
    fetched = client.get(f"{PREFIX}/{pid}/sessions/{body['id']}").json()
    assert fetched["cv_outdated"] is True and fetched["evaluation_run_id"] is None
    # Only a pinned older revision is outdated; the new revision pairs cleanly with the same job.
    new_rev = client.get(f"{PREFIX}/{pid}/cvs").json()[0]["latest_revision"]["id"]
    assert _session(api_context, csrf, pid, new_rev, job_revision_id=body["job_revision_id"]).status_code == 201


@pytest.mark.integration
def test_runs_use_session_pair_and_default_to_primary_cv(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    primary = _upload(api_context, csrf, pid, "cv-a.txt").json()
    other = _upload(api_context, csrf, pid, "cv-b.txt").json()
    paired = _session(api_context, csrf, pid, primary["latest_revision"]["id"], job=JOB).json()
    job2 = client.post(f"{PREFIX}/{pid}/jobs", json={"title": "Other", "description": "Another"}, headers=headers).json()["id"]

    def run(sid, key, **extra):
        return client.post(f"{PREFIX}/{pid}/runs", headers=headers, json={
            "session_id": sid, "operation": "evaluate_job", "output_language": "en", "idempotency_key": key, **extra})

    # Pair comes from the session; repeating it is fine, conflicting ids are 422.
    ok = run(paired["id"], "k1")
    assert ok.status_code in (200, 201, 202), ok.text
    with api_context.sessions() as db:
        stored = db.get(Run, UUID(ok.json()["id"]))
        assert str(stored.cv_revision_id) == primary["latest_revision"]["id"]
        assert str(stored.job_revision_id) == paired["job_revision_id"]
    for extra in ({"job_revision_id": job2}, {"cv_revision_id": other["latest_revision"]["id"]}, {"cv_id": other["id"]}):
        bad = run(paired["id"], f"bad-{len(extra)}-{list(extra)[0]}", **extra)
        assert bad.status_code == 422 and bad.json()["code"] == "session_pair_mismatch", bad.text
    assert run(paired["id"], "k2", job_revision_id=paired["job_revision_id"],
               cv_revision_id=primary["latest_revision"]["id"]).status_code in (200, 201, 202)

    # Legacy unpaired session: default is the primary CV, cv_id picks another CV.
    with api_context.sessions.begin() as db:
        legacy = ConversationSession(project_id=UUID(pid), title="legacy")
        db.add(legacy)
        db.flush()
        legacy_id = str(legacy.id)
    assert run(legacy_id, "l0").status_code == 400  # job required without a pair
    default = run(legacy_id, "l1", job_revision_id=job2).json()
    chosen = run(legacy_id, "l2", job_revision_id=job2, cv_id=other["id"]).json()
    with api_context.sessions() as db:
        assert str(db.get(Run, UUID(default["id"])).cv_revision_id) == primary["latest_revision"]["id"]
        assert str(db.get(Run, UUID(chosen["id"])).cv_revision_id) == other["latest_revision"]["id"]


@pytest.mark.integration
def test_revise_run_requires_a_live_document_and_snapshots_it(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    cv = _upload(api_context, csrf, pid).json()
    paired = _session(api_context, csrf, pid, cv["latest_revision"]["id"], job=JOB).json()
    with api_context.sessions.begin() as db:
        document = Document(project_id=UUID(pid), document_type="cover_letter", title="Letter")
        db.add(document)
        db.flush()
        db.add(DocumentRevision(project_id=UUID(pid), document_id=document.id, revision=1, content_markdown="Dear team",
                                source_job_revision_id=UUID(paired["job_revision_id"])))
        other = Document(project_id=UUID(pid), document_type="cover_letter", title="Other job letter")
        db.add(other)
        db.flush()
        db.add(DocumentRevision(project_id=UUID(pid), document_id=other.id, revision=1, content_markdown="Other"))
        doc_id, other_id = str(document.id), str(other.id)

    def draft(key, **extra):
        return client.post(f"{PREFIX}/{pid}/runs", headers=headers, json={
            "session_id": paired["id"], "operation": "draft_documents", "output_language": "en",
            "idempotency_key": key, "owner_instructions": "shorter", **extra})

    ok = draft("r1", document_id=doc_id)
    assert ok.status_code in (200, 201, 202), ok.text
    with api_context.sessions() as db:
        snapshot = db.get(Run, UUID(ok.json()["id"])).input_snapshot
        assert snapshot["document_id"] == doc_id and snapshot["previous_draft"] == "Dear team"
    assert draft("r2", document_id=str(uuid4())).status_code == 404
    assert draft("r2b", document_id=other_id).status_code == 404  # not drafted for this session's job
    evaluate = client.post(f"{PREFIX}/{pid}/runs", headers=headers, json={
        "session_id": paired["id"], "operation": "evaluate_job", "output_language": "en",
        "idempotency_key": "r3", "document_id": doc_id})
    assert evaluate.status_code == 403
    assert client.delete(f"{PREFIX}/{pid}/documents/{doc_id}", headers=headers).status_code == 204
    assert draft("r4", document_id=doc_id).status_code == 404


@pytest.mark.integration
def test_project_b_cannot_use_project_a_cvs_jobs_sessions_or_documents(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    a = _project(api_context, csrf, "A")
    b = _project(api_context, csrf, "B")
    cv_a = _upload(api_context, csrf, a).json()
    cv_b = _upload(api_context, csrf, b, "cv-b.txt").json()
    session_a = _session(api_context, csrf, a, cv_a["latest_revision"]["id"], job=JOB).json()
    session_b = _session(api_context, csrf, b, cv_b["latest_revision"]["id"], job=JOB).json()
    with api_context.sessions.begin() as db:
        document = Document(project_id=UUID(a), document_type="cover_letter", title="Letter")
        db.add(document)
        db.flush()
        db.add(DocumentRevision(project_id=UUID(a), document_id=document.id, revision=1, content_markdown="x"))
        doc_a = str(document.id)

    # CV routes: A's CV id under project B.
    assert client.patch(f"{PREFIX}/{b}/cvs/{cv_a['id']}", json={"name": "x"}, headers=headers).status_code == 404
    assert client.delete(f"{PREFIX}/{b}/cvs/{cv_a['id']}", headers=headers).status_code == 404
    assert _upload(api_context, csrf, b, path=f"cvs/{cv_a['id']}/revisions").status_code == 404
    assert all(c["id"] != cv_a["id"] for c in client.get(f"{PREFIX}/{b}/cvs").json())
    # Sessions: A's CV revision, A's job, A's session.
    assert _session(api_context, csrf, b, cv_a["latest_revision"]["id"], job=JOB).status_code == 404
    assert _session(api_context, csrf, b, cv_b["latest_revision"]["id"], job_revision_id=session_a["job_revision_id"]).status_code == 404
    assert client.get(f"{PREFIX}/{b}/sessions/{session_a['id']}").status_code == 404
    # Runs: A's session, CV (by id and by revision), job and document under project B.
    def run(**body):
        return client.post(f"{PREFIX}/{b}/runs", headers=headers, json={
            "operation": "evaluate_job", "output_language": "en", "idempotency_key": uuid4().hex, **body})

    assert run(session_id=session_a["id"]).status_code == 404
    assert run(session_id=session_b["id"], cv_id=cv_a["id"]).status_code == 422  # pair mismatch, never resolves A's CV
    assert run(session_id=session_b["id"], cv_revision_id=cv_a["latest_revision"]["id"]).status_code == 422
    with api_context.sessions.begin() as db:
        legacy = ConversationSession(project_id=UUID(b), title="legacy")
        db.add(legacy)
        db.flush()
        legacy_id = str(legacy.id)
    assert run(session_id=legacy_id, cv_id=cv_a["id"], job_revision_id=session_b["job_revision_id"]).status_code == 404
    assert run(session_id=legacy_id, cv_revision_id=cv_a["latest_revision"]["id"],
               job_revision_id=session_b["job_revision_id"]).status_code == 404
    assert run(session_id=legacy_id, job_revision_id=session_a["job_revision_id"]).status_code == 404
    assert run(session_id=session_b["id"], operation="draft_documents", document_id=doc_a).status_code == 404
    assert client.get(f"{PREFIX}/{b}/documents/{doc_a}/revisions").status_code == 404


@pytest.mark.integration
def test_migration_0009_backfills_one_primary_cv_per_project(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))
    p1, p2, p3 = uuid4(), uuid4(), uuid4()
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0008_document_trashed_at")
        for pid in (p1, p2, p3):
            connection.execute(text("INSERT INTO projects (id, name) VALUES (:id, 'p')"), {"id": pid})
        for pid, number in ((p1, 1), (p1, 2), (p2, 1)):
            connection.execute(text("INSERT INTO cv_revisions (id, project_id, revision) VALUES (:id, :p, :n)"),
                               {"id": uuid4(), "p": pid, "n": number})
        command.upgrade(config, "head")
        cvs = connection.execute(text("SELECT project_id, name, is_primary FROM cvs")).all()
        assert sorted(str(r[0]) for r in cvs) == sorted([str(p1), str(p2)])  # p3 has no revisions
        assert all(r[1] == "CV หลัก" and r[2] is True for r in cvs)
        orphans = connection.execute(text(
            "SELECT count(*) FROM cv_revisions r LEFT JOIN cvs c ON c.id = r.cv_id AND c.project_id = r.project_id WHERE c.id IS NULL")).scalar()
        assert orphans == 0
        command.downgrade(config, "0008_document_trashed_at")
        assert connection.execute(text("SELECT count(*) FROM cv_revisions")).scalar() == 3


def _set_status(api_context, run_id, status):
    with api_context.sessions.begin() as db:
        db.get(Run, UUID(run_id)).status = status


@pytest.mark.integration
def test_delete_session_hard_without_runs_hides_with_runs_and_restores(api_context):
    client, csrf = api_context.client, _owner(api_context)
    headers = _write_headers(csrf)
    pid = _project(api_context, csrf)
    other = _project(api_context, csrf, "Other")
    cv = _upload(api_context, csrf, pid).json()
    rev = cv["latest_revision"]["id"]
    base = f"{PREFIX}/{pid}/sessions"

    # Without runs: hard delete.
    with api_context.sessions.begin() as db:
        empty = ConversationSession(project_id=UUID(pid), title="Legacy")
        db.add(empty)
        db.flush()
        empty_id = str(empty.id)
    gone = client.delete(f"{base}/{empty_id}", headers=headers)
    assert gone.status_code == 200 and gone.json() == {"mode": "deleted"}
    with api_context.sessions() as db:
        assert db.get(ConversationSession, UUID(empty_id)) is None

    # With a queued evaluation run: busy.
    created = _session(api_context, csrf, pid, rev, job=JOB).json()
    sid, run_id = created["id"], created["evaluation_run_id"]
    for status in ("queued", "running", "waiting_approval"):
        _set_status(api_context, run_id, status)
        busy = client.delete(f"{base}/{sid}", headers=headers)
        assert busy.status_code == 409 and busy.json()["code"] == "session_busy"
    _set_status(api_context, run_id, "completed")

    # Cross-project delete/restore are 404.
    assert client.delete(f"{PREFIX}/{other}/sessions/{sid}", headers=headers).status_code == 404
    assert client.post(f"{PREFIX}/{other}/sessions/{sid}/restore", headers=headers).status_code == 404

    hidden = client.delete(f"{base}/{sid}", headers=headers)
    assert hidden.status_code == 200 and hidden.json() == {"mode": "hidden"}
    assert client.delete(f"{base}/{sid}", headers=headers).status_code == 404
    assert client.get(base).json() == []
    assert client.get(f"{base}/{sid}").status_code == 404
    assert client.patch(f"{base}/{sid}", json={"title": "x"}, headers=headers).status_code == 404
    assert client.post(f"{PREFIX}/{pid}/runs", headers=headers, json={
        "session_id": sid, "operation": "evaluate_job", "output_language": "en", "idempotency_key": "after-hide"}).status_code == 404
    # Runs stay visible; the session row and its pair stay referenced.
    assert [r["id"] for r in client.get(f"{PREFIX}/{pid}/runs").json()] == [run_id]
    cvs = client.get(f"{PREFIX}/{pid}/cvs").json()
    assert cvs[0]["in_use"] is True

    # Restore brings it back; restoring a visible session is idempotent.
    restored = client.post(f"{base}/{sid}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["id"] == sid
    assert [s["id"] for s in client.get(base).json()] == [sid]
    assert client.post(f"{base}/{sid}/restore", headers=headers).status_code == 200
    assert client.post(f"{base}/{sid}/restore", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403

    # Hide, recreate the same pair, then restoring the old one conflicts.
    assert client.delete(f"{base}/{sid}", headers=headers).json() == {"mode": "hidden"}
    again = _session(api_context, csrf, pid, rev, job=JOB)
    assert again.status_code == 201, again.text
    clash = client.post(f"{base}/{sid}/restore", headers=headers)
    assert clash.status_code == 409 and clash.json()["code"] == "session_pair_exists"
    assert clash.json()["fields"]["session_id"] == again.json()["id"]
    with api_context.sessions() as db:
        assert db.get(ConversationSession, UUID(sid)).removed_at is not None


@pytest.mark.integration
def test_hidden_external_agent_session_reappears_on_new_protocol_run(db_session):
    import asyncio
    from datetime import datetime, timezone
    from sqlalchemy.orm import sessionmaker
    from helpers import grant, project, provider_config, revisions
    from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns

    p = project(db_session)
    actor, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    provider_config(db_session, p.id)
    revisions(db_session, p.id)
    db_session.commit()
    service = ProtocolRuns(sessionmaker(bind=db_session.get_bind(), expire_on_commit=False))

    def submit(key):
        return asyncio.run(service.submit(actor, "evaluate_job", ProtocolJobInput.model_validate({
            "job": {"title": "T", "description": "Synthetic posting", "company": "C"},
            "output_language": "en", "idempotency_key": key})))

    run = submit("one")
    session_id = db_session.get(Run, run.id).session_id
    db_session.get(ConversationSession, session_id).removed_at = datetime.now(timezone.utc)
    db_session.commit()
    db_session.expire_all()
    submit("two")
    db_session.expire_all()
    assert db_session.get(ConversationSession, session_id).removed_at is None


@pytest.mark.integration
def test_migration_0011_partial_pair_index_up_down(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0010_export_document_operation")
        command.upgrade(config, "0011_session_removed_at")

        def pair_index():
            return connection.execute(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_sessions_pair'")).scalar()

        assert "removed_at IS NULL" in pair_index()
        command.downgrade(config, "0010_export_document_operation")
        assert connection.execute(text(
            "SELECT count(*) FROM pg_constraint WHERE conname = 'uq_sessions_pair'")).scalar() == 1
        assert "removed_at" not in connection.execute(text(
            "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name = 'sessions'")).scalar()
