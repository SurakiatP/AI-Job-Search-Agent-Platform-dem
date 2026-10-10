"""Migration 0014: Jev smart-match tables, match_jobs operation, downgrade guard."""
from __future__ import annotations

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from helpers import primary_cv, project
from job_search_platform.db.models import CVRevision, Run

from test_rest_api import ROOT_FOR_MIGRATIONS


def _migrate(engine, fn, target):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        fn(config, target)


def test_migration_0014_up_down(postgres_engine):
    _migrate(postgres_engine, command.upgrade, "head")
    with postgres_engine.begin() as c:
        tables = {r[0] for r in c.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_name IN "
            "('cv_revision_texts','job_match_scores','job_search_hidden')"))}
        assert tables == {"cv_revision_texts", "job_match_scores", "job_search_hidden"}
        check = c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
        assert "match_jobs" in check
        context = c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_context_required'")).scalar()
        assert "match_jobs" in context
    _migrate(postgres_engine, command.downgrade, "0013_cv_skill_profile")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name='job_match_scores'")).first() is None
        assert "match_jobs" not in c.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
    _migrate(postgres_engine, command.upgrade, "head")


def test_migration_0014_downgrade_blocked_by_match_jobs_runs(migrated_engine):
    with sessionmaker(bind=migrated_engine)() as db:
        project_row = project(db)
        revision = CVRevision(project_id=project_row.id, cv_id=primary_cv(db, project_row.id).id, revision=1)
        db.add(revision)
        db.flush()
        db.add(Run(project_id=project_row.id, actor_scope="owner", idempotency_key="k", request_digest="d" * 64,
                   operation="match_jobs", cv_revision_id=revision.id, input_snapshot={}, config_snapshot={},
                   output_language="en", status="queued"))
        db.commit()
    with pytest.raises(RuntimeError, match="downgrade_blocked"):
        _migrate(migrated_engine, command.downgrade, "0013_cv_skill_profile")
