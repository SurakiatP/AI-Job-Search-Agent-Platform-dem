"""Migration 0015: experience_items, extract_experience operation, downgrade guard."""
from __future__ import annotations

import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from helpers import primary_cv, project, provider_config
from job_search_platform.db.models import CVRevision, ExperienceItem, Run
from test_smart_match_migration import _migrate


def _revision(db):
    project_row = project(db)
    revision = CVRevision(project_id=project_row.id, cv_id=primary_cv(db, project_row.id).id, revision=1)
    db.add(revision)
    db.flush()
    return project_row, revision


def test_migration_0015_up_down(postgres_engine):
    _migrate(postgres_engine, command.upgrade, "head")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name='experience_items'")).first()
        check = c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
        assert "extract_experience" in check
    _migrate(postgres_engine, command.downgrade, "0014_smart_match_jev")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name='experience_items'")).first() is None
        assert "extract_experience" not in c.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
    _migrate(postgres_engine, command.upgrade, "head")


def test_extract_run_needs_no_provider_session_or_job_but_llm_ops_need_session_and_job(migrated_engine):
    with sessionmaker(bind=migrated_engine)() as db:
        project_row, revision = _revision(db)
        db.add(Run(project_id=project_row.id, actor_scope="owner", idempotency_key="k", request_digest="d" * 64,
                   operation="extract_experience", cv_revision_id=revision.id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="queued"))
        db.flush()
        db.add(Run(project_id=project_row.id, actor_scope="owner", idempotency_key="k2", request_digest="e" * 64,
                   operation="evaluate_job", cv_revision_id=revision.id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="queued"))
        with pytest.raises(IntegrityError):
            db.flush()


def test_migration_0021_downgrade_blocked_by_gateway_runs(migrated_engine):
    with sessionmaker(bind=migrated_engine)() as db:
        project_row, revision = _revision(db)
        db.add(Run(project_id=project_row.id, actor_scope="owner", idempotency_key="k", request_digest="d" * 64,
                   operation="extract_experience", cv_revision_id=revision.id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="queued"))
        db.commit()
    with pytest.raises(RuntimeError, match="cannot downgrade"):
        _migrate(migrated_engine, command.downgrade, "0020_tor_ai_gaps")


def test_item_constraints(migrated_engine):
    with sessionmaker(bind=migrated_engine)() as db:
        project_row, revision = _revision(db)
        db.add(ExperienceItem(project_id=project_row.id, kind="experience", text="Built pipelines", source="cv",
                              source_cv_revision_id=revision.id, text_hash="a" * 64))
        db.flush()
        db.add(ExperienceItem(project_id=project_row.id, kind="skill", text="Python", source="owner",
                              source_cv_revision_id=revision.id, text_hash="b" * 64))
        with pytest.raises(IntegrityError):
            db.flush()


def test_migration_0015_downgrade_blocked_by_extract_runs(migrated_engine):
    with sessionmaker(bind=migrated_engine)() as db:
        project_row, revision = _revision(db)
        config = provider_config(db, project_row.id)
        db.add(Run(project_id=project_row.id, actor_scope="owner", idempotency_key="k", request_digest="d" * 64,
                   operation="extract_experience", cv_revision_id=revision.id, provider_configuration_id=config.id,
                   input_snapshot={}, config_snapshot={}, output_language="en", status="queued"))
        db.commit()
    with pytest.raises(RuntimeError, match="downgrade_blocked"):
        _migrate(migrated_engine, command.downgrade, "0014_smart_match_jev")
