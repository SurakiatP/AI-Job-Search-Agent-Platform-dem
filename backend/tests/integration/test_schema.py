from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Column, Integer, MetaData, Table, inspect
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import (
    Approval, Base, CVRevision, Document, DocumentRevision, JobRevision, Project,
    Run, RunEvent, StoredFile, ToolConnectorConfiguration,
)
from job_search_platform.db.repositories import Repositories
from job_search_platform.services.errors import ServiceError
from helpers import provider_config, project, revisions, session, primary_cv


@pytest.fixture
def future_model_probe():
    table = Table("future_model_probe", Base.metadata, Column("id", Integer, primary_key=True))
    yield table
    Base.metadata.remove(table)


def test_empty_database_migrates_and_repeat_upgrade_preserves_synthetic_rows(postgres_engine, future_model_probe):
    config = Config()
    config.set_main_option("script_location", str(__import__("pathlib").Path(__file__).resolve().parents[2] / "migrations"))
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    assert "future_model_probe" not in inspect(postgres_engine).get_table_names()
    assert {"projects", "sessions", "messages", "cv_revisions", "job_revisions", "documents",
            "document_revisions", "files", "provider_configurations", "owner_sessions",
            "owner_launch_nonces", "grants", "runs", "run_events", "approvals", "job_submissions"}.issubset(
                set(inspect(postgres_engine).get_table_names()))
    with postgres_engine.begin() as connection:
        p = Project(name="Migration synthetic")
        connection.execute(Project.__table__.insert().values(id=p.id or uuid4(), name=p.name))
        # Preserve a non-sensitive sentinel row through a subsequent upgrade call.
        sentinel_id = uuid4()
        connection.execute(Project.__table__.insert().values(id=sentinel_id, name="Retained synthetic"))
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    with postgres_engine.connect() as connection:
        assert connection.execute(Project.__table__.select().where(Project.id == sentinel_id)).first() is not None
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    assert "tool_connector_configurations" in inspect(postgres_engine).get_table_names()


def test_project_bound_run_references_reject_cross_project_ids(db_session):
    p1, p2 = project(db_session, "Project A"), project(db_session, "Project B")
    s1, s2 = session(db_session, p1.id), session(db_session, p2.id)
    cv1, job1 = revisions(db_session, p1.id)
    cv2, job2 = revisions(db_session, p2.id)
    provider1 = provider_config(db_session)  # system-wide: shared by every project
    db_session.commit()

    common = dict(project_id=p1.id, actor_scope="owner", idempotency_key="schema-check",
                  request_digest="0" * 64, session_id=s1.id, operation="evaluate_job",
                  cv_revision_id=cv1.id, job_revision_id=job1.id,
                  provider_configuration_id=provider1.id, input_snapshot={}, config_snapshot={},
                  output_language="en", status="queued")
    for field, foreign_value in (("session_id", s2.id), ("cv_revision_id", cv2.id),
                                 ("job_revision_id", job2.id)):
        with pytest.raises(IntegrityError):
            with db_session.begin_nested():
                db_session.add(Run(**{**common, field: foreign_value, "idempotency_key": f"bad-{field}"}))
                db_session.flush()
        db_session.expire_all()


def test_document_revision_rejects_cross_project_source_revision(db_session):
    p1, p2 = project(db_session, "Project A"), project(db_session, "Project B")
    document = Document(project_id=p1.id, document_type="cover_letter", title="Synthetic")
    cv2, _ = revisions(db_session, p2.id)
    db_session.add(document)
    db_session.flush()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(DocumentRevision(project_id=p1.id, document_id=document.id,
                                            revision=1, source_cv_revision_id=cv2.id))
            db_session.flush()


def test_project_bound_file_event_and_approval_references_reject_foreign_ids(db_session):
    p1, p2 = project(db_session, "Project A"), project(db_session, "Project B")
    s1 = session(db_session, p1.id)
    cv1, job1 = revisions(db_session, p1.id)
    provider1 = provider_config(db_session, p1.id)
    cv2, job2 = revisions(db_session, p2.id)
    provider2 = provider_config(db_session, p2.id)
    file2 = StoredFile(project_id=p2.id, kind="cv_original", publication_state="published",
                       storage_key=f"synthetic/{uuid4().hex}", checksum_sha256="a" * 64,
                       size_bytes=1, mime_type="text/plain", display_name="synthetic.txt")
    db_session.add(file2)
    run1 = Run(project_id=p1.id, actor_scope="owner", idempotency_key="good-run",
               request_digest="1" * 64, session_id=s1.id, operation="evaluate_job",
               cv_revision_id=cv1.id, job_revision_id=job1.id,
               provider_configuration_id=provider1.id, input_snapshot={}, config_snapshot={},
               output_language="en", status="queued")
    run2 = Run(project_id=p2.id, actor_scope="owner", idempotency_key="foreign-run",
               request_digest="2" * 64, session_id=session(db_session, p2.id).id,
               operation="evaluate_job", cv_revision_id=cv2.id, job_revision_id=job2.id,
               provider_configuration_id=provider2.id, input_snapshot={}, config_snapshot={},
               output_language="en", status="queued")
    db_session.add_all([run1, run2])
    document = Document(project_id=p1.id, document_type="cover_letter", title="Synthetic")
    db_session.add(document)
    db_session.flush()
    revision = DocumentRevision(project_id=p1.id, document_id=document.id, revision=1)
    document2 = Document(project_id=p2.id, document_type="cover_letter", title="Synthetic")
    db_session.add(document2)
    db_session.flush()
    revision2 = DocumentRevision(project_id=p2.id, document_id=document2.id, revision=1)
    db_session.add_all([revision, revision2])
    db_session.flush()

    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            cv_file_ref = CVRevision(project_id=p1.id, cv_id=primary_cv(db_session, p1.id).id, revision=99, file_id=file2.id)
            db_session.add(cv_file_ref)
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(RunEvent(project_id=p1.id, run_id=run2.id, sequence=1,
                                    event_type="progress", public_data={}))
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Approval(project_id=p1.id, run_id=run1.id,
                                    action="promote_cv", revision_id=revision2.id,
                                    expected_cv_revision_id=cv1.id,
                                    change_digest="c" * 64,
                                    token_hash=b"x" * 32,
                                    expires_at=datetime.now(timezone.utc)))
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Approval(project_id=p1.id, run_id=run1.id,
                                    action="promote_cv", revision_id=revision.id,
                                    expected_cv_revision_id=cv2.id,
                                    change_digest="e" * 64, token_hash=b"w" * 32,
                                    expires_at=datetime.now(timezone.utc)))
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Approval(project_id=p1.id, run_id=run1.id,
                                    action="delete_file", target_file_id=file2.id,
                                    change_digest="d" * 64, token_hash=b"y" * 32,
                                    expires_at=datetime.now(timezone.utc)))
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Approval(project_id=p1.id, run_id=run1.id,
                                    action="delete_document_revision", revision_id=revision.id,
                                    change_digest="bad", token_hash=b"z" * 32,
                                    expires_at=datetime.now(timezone.utc)))
            db_session.flush()


def test_run_identity_and_active_project_guard_are_database_constraints(db_session):
    p = project(db_session)
    s = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    provider = provider_config(db_session, p.id)
    db_session.flush()
    base = dict(project_id=p.id, actor_scope="owner", idempotency_key="same-key",
                request_digest="0" * 64, session_id=s.id, operation="evaluate_job",
                cv_revision_id=cv.id, job_revision_id=job.id,
                provider_configuration_id=provider.id, input_snapshot={}, config_snapshot={},
                output_language="en")
    db_session.add(Run(**{**base, "status": "running"}))
    db_session.flush()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Run(**{**base, "idempotency_key": "second-active", "status": "waiting_approval"}))
            db_session.flush()
    db_session.expire_all()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(Run(**{**base, "status": "queued"}))
            db_session.flush()


def test_connector_allowlist_is_database_enforced(db_session):
    p = project(db_session)
    db_session.add(ToolConnectorConfiguration(project_id=p.id, adapter_key="arbitrary_url",
                                              revision=1, enabled=True))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_repeated_inline_job_submission_resolves_original_revision(db_session):
    p = project(db_session)
    first = Repositories.resolve_job_submission(
        db_session, project_id=p.id, actor_scope="grant:synthetic", idempotency_key="job-input-1",
        title="Synthetic role", description="Synthetic job description", company="Example Co",
    )
    repeated = Repositories.resolve_job_submission(
        db_session, project_id=p.id, actor_scope="grant:synthetic", idempotency_key="job-input-1",
        title="Synthetic role", description="Synthetic job description", company="Example Co",
    )
    assert repeated.id == first.id
    assert repeated.description == "Synthetic job description"
    assert db_session.query(JobRevision).filter_by(project_id=p.id).count() == 1
    with pytest.raises(ServiceError) as error:
        Repositories.resolve_job_submission(
            db_session, project_id=p.id, actor_scope="grant:synthetic", idempotency_key="job-input-1",
            title="Changed role", description="Synthetic job description", company="Example Co",
        )
    assert getattr(error.value, "code", None) == "idempotency_conflict"


def test_revision_content_and_run_snapshots_are_immutable(db_session):
    p = project(db_session)
    s = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    provider = provider_config(db_session, p.id)
    run = Run(project_id=p.id, actor_scope="owner", idempotency_key="immutable-run",
              request_digest="3" * 64, session_id=s.id, operation="evaluate_job",
              cv_revision_id=cv.id, job_revision_id=job.id,
              provider_configuration_id=provider.id, input_snapshot={"source": "synthetic"},
              config_snapshot={"model": "private-ref"}, output_language="en", status="queued")
    db_session.add(run)
    db_session.flush()
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            job.title = "Mutated synthetic title"
            db_session.flush()
    db_session.expire_all()
    run = db_session.get(Run, run.id)
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            run.input_snapshot = {"source": "changed"}
            db_session.flush()
    db_session.expire_all()
    run = db_session.get(Run, run.id)
    run.status = "running"
    run.lease_owner = "synthetic-worker"
    db_session.flush()
    assert run.status == "running"
def test_durable_runtime_limits_and_output_provenance(db_session):
    from sqlalchemy import update
    from sqlalchemy.exc import IntegrityError
    from job_search_platform.db.models import Run, RunArtifact
    from helpers import project, session, revisions, provider_config

    p = project(db_session)
    s = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    config = provider_config(db_session, p.id)
    run = Run(project_id=p.id, session_id=s.id, operation="evaluate_job",
              cv_revision_id=cv.id, job_revision_id=job.id,
              provider_configuration_id=config.id, actor_scope="owner",
              idempotency_key="runtime-accounting", request_digest="e" * 64,
              input_snapshot={}, config_snapshot={}, output_language="en")
    db_session.add(run)
    db_session.flush()
    assert run.active_seconds == 0 and run.tool_calls == 0
    for changes in ({"active_seconds": -1}, {"tool_calls": 31}, {"tool_calls": -1}):
        with pytest.raises(IntegrityError):
            with db_session.begin_nested():
                db_session.execute(update(Run).where(Run.id == run.id).values(**changes))
                db_session.flush()
    assert RunArtifact.__table__.primary_key.columns.keys() == ["run_id", "file_id"]


def test_migration_0012_copies_newest_config_to_global_and_keeps_run_history(postgres_engine):
    from sqlalchemy import text
    config = Config()
    config.set_main_option("script_location", str(__import__("pathlib").Path(__file__).resolve().parents[2] / "migrations"))
    pid, old_id, newest = uuid4(), uuid4(), uuid4()
    def migrate(fn, target):
        with postgres_engine.begin() as connection:
            config.attributes["connection"] = connection
            fn(config, target)
    migrate(command.upgrade, "0011_session_removed_at")
    with postgres_engine.begin() as c:
        c.execute(text("INSERT INTO projects (id, name) VALUES (:p, 'Legacy')"), {"p": pid})
        for cid, model, rev, ts in ((old_id, "old", 1, "2026-01-01"), (newest, "newest", 2, "2026-02-01")):
            c.execute(text("INSERT INTO provider_configurations (id, project_id, provider, model, secret_reference, revision, updated_at)"
                           " VALUES (:i, :p, 'openai', :m, 'secret-ref://x', :r, :t)"), {"i": cid, "p": pid, "m": model, "r": rev, "t": ts})
    migrate(command.upgrade, "head")
    with postgres_engine.begin() as c:
        rows = c.execute(text("SELECT model, revision, secret_reference FROM provider_configurations WHERE project_id IS NULL")).all()
        assert [tuple(r) for r in rows] == [("newest", 1, "secret-ref://x")]
        assert c.execute(text("SELECT count(*) FROM provider_configurations WHERE project_id = :p"), {"p": pid}).scalar() == 2
    migrate(command.downgrade, "0011_session_removed_at")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT count(*) FROM provider_configurations WHERE project_id IS NULL")).scalar() == 0
        assert c.execute(text("SELECT count(*) FROM provider_configurations")).scalar() == 2
