"""FR-T01 schema: eight stages, contact columns, append-only application_events. Synthetic data only."""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError

from helpers import owner, project, revisions
from job_search_platform.db.models import ApplicationEvent, JobApplicationStatus, Project, User

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


def _event(db, project_id, job_id, kind="note"):
    event = ApplicationEvent(project_id=project_id, job_revision_id=job_id, kind=kind,
                             actor_scope="user:synthetic", payload={"text": "Synthetic note"})
    db.add(event)
    db.flush()
    return event


@pytest.mark.integration
def test_eight_stages_and_contact_columns(db_session):
    record = project(db_session, owner=owner(db_session))
    _, job = revisions(db_session, record.id)
    db_session.add(JobApplicationStatus(project_id=record.id, job_revision_id=job.id, status="interview",
                                        contact_name="ผู้สรรหา ตัวอย่าง", contact_email="a+jobs@example.co.th",
                                        contact_role="HR"))
    db_session.flush()
    for stage in ("saved", "applied", "responded", "offer", "hired", "rejected", "withdrawn"):
        db_session.execute(update(JobApplicationStatus).values(status=stage))
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            db_session.execute(update(JobApplicationStatus).values(status="ghosted"))


@pytest.mark.integration
def test_events_reject_update_direct_delete_and_unknown_kind(db_session):
    record = project(db_session, owner=owner(db_session))
    _, job = revisions(db_session, record.id)
    event = _event(db_session, record.id, job.id)
    with pytest.raises(DBAPIError, match="append_only_application_event"):
        with db_session.begin_nested():
            db_session.execute(update(ApplicationEvent).where(ApplicationEvent.id == event.id)
                               .values(payload={"text": "edited"}))
    with pytest.raises(DBAPIError, match="append_only_application_event"):
        with db_session.begin_nested():
            db_session.execute(delete(ApplicationEvent).where(ApplicationEvent.id == event.id))
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            _event(db_session, record.id, job.id, kind="email_sent")


@pytest.mark.integration
def test_project_and_user_deletion_cascade_events(db_session):
    actor = owner(db_session)
    first = project(db_session, owner=actor)
    _, first_job = revisions(db_session, first.id)
    _event(db_session, first.id, first_job.id)
    db_session.execute(delete(Project).where(Project.id == first.id))
    db_session.flush()
    assert db_session.scalar(select(ApplicationEvent.id).where(ApplicationEvent.project_id == first.id)) is None

    second = project(db_session, owner=actor)
    _, second_job = revisions(db_session, second.id)
    _event(db_session, second.id, second_job.id)
    db_session.execute(delete(User).where(User.id == actor.user_id))
    db_session.flush()
    assert db_session.scalar(select(ApplicationEvent.id).where(ApplicationEvent.project_id == second.id)) is None


@pytest.mark.integration
def test_backfill_gives_existing_applied_rows_one_migration_event(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))

    def migrate(target):
        with postgres_engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, target)

    migrate("0022_users")
    project_id, applied_job, saved_job = uuid4(), uuid4(), uuid4()
    with postgres_engine.begin() as c:
        c.execute(text("INSERT INTO projects (id, name) VALUES (:id, 'Synthetic')"), {"id": project_id})
        for job_id, number in ((applied_job, 1), (saved_job, 2)):
            c.execute(text("INSERT INTO job_revisions (id, project_id, revision, title, description) "
                           "VALUES (:id, :p, :n, 'Synthetic', 'Synthetic')"),
                      {"id": job_id, "p": project_id, "n": number})
        c.execute(text("INSERT INTO job_application_statuses (project_id, job_revision_id, status) "
                       "VALUES (:p, :a, 'applied'), (:p, :s, 'saved')"),
                  {"p": project_id, "a": applied_job, "s": saved_job})
    migrate("head")
    with postgres_engine.connect() as c:
        rows = c.execute(text("SELECT job_revision_id, kind, actor_scope, payload FROM application_events")).all()
    assert [tuple(row) for row in rows] == [
        (applied_job, "stage_changed", "migration", {"from": "saved", "to": "applied"})]
