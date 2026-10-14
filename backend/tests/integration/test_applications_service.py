"""FR-T01 core service: stages, ledger, contact, agent rules, duplicate rule, locking. Synthetic data only."""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from psycopg.errors import LockNotAvailable
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, revisions
from job_search_platform.db.models import JobApplicationStatus, JobRevision
from job_search_platform.services import applications
from job_search_platform.services.contracts import ApplicationContact, ApplicationEmailLog, ApplicationNote
from job_search_platform.services.errors import ServiceError


def _setup(db):
    actor = owner(db)
    record = project(db, owner=actor)
    _, job = revisions(db, record.id)
    return actor, record, job


def _code(call) -> str:
    with pytest.raises(ServiceError) as caught:
        call()
    return caught.value.code


@pytest.mark.integration
def test_stage_moves_append_one_event_each_and_same_stage_is_noop(db_session):
    actor, record, job = _setup(db_session)
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, actor, record.id, job.id, "interview")
    detail = applications.detail(db_session, record.id, job.id)
    assert detail.stage == "interview"
    assert [(e.kind, e.actor, e.payload) for e in detail.events] == [
        ("stage_changed", "user", {"from": "applied", "to": "interview"}),
        ("stage_changed", "user", {"from": "saved", "to": "applied"}),
    ]


@pytest.mark.integration
def test_board_lists_every_live_job_in_order_with_default_saved(db_session):
    actor, record, job = _setup(db_session)
    other = JobRevision(project_id=record.id, revision=2, title="Synthetic Analyst", description="Synthetic")
    removed = JobRevision(project_id=record.id, revision=3, title="Removed", description="Synthetic",
                          removed_at=datetime.now(timezone.utc))
    db_session.add_all([other, removed])
    db_session.flush()
    applications.set_contact(db_session, actor, record.id, job.id,
                             ApplicationContact(name="Synthetic Recruiter", email="r@example.test"))
    cards = applications.board(db_session, record.id)
    assert [(c.title, c.stage, c.has_contact) for c in cards] == [
        ("Synthetic Engineer", "saved", True), ("Synthetic Analyst", "saved", False)]
    assert cards[0].last_activity_at >= cards[0].created_at
    assert cards[1].last_activity_at == cards[1].created_at


@pytest.mark.integration
def test_contact_and_entries_are_logged_once(db_session):
    actor, record, job = _setup(db_session)
    contact = ApplicationContact(name="Synthetic Recruiter", email="r@example.test", role="HR")
    applications.set_contact(db_session, actor, record.id, job.id, contact)
    applications.set_contact(db_session, actor, record.id, job.id, contact)
    applications.add_event(db_session, actor, record.id, job.id, ApplicationEmailLog(
        kind="email_logged", direction="received", subject="Interview invite", occurred_on=date(2026, 10, 14)))
    applications.add_event(db_session, actor, record.id, job.id, ApplicationNote(kind="note", text="Prepare portfolio"))
    detail = applications.detail(db_session, record.id, job.id)
    assert detail.contact == contact
    assert [e.kind for e in detail.events] == ["note", "email_logged", "contact_updated"]
    assert detail.events[1].payload == {"direction": "received", "subject": "Interview invite",
                                        "occurred_on": "2026-10-14", "note": None}


@pytest.mark.integration
def test_agent_rules(db_session):
    actor, record, job = _setup(db_session)
    agent, _ = grant(db_session, record.id, capabilities=("applications:write",))
    assert _code(lambda: applications.set_stage(db_session, agent, record.id, job.id, "interview")) == "application_not_applied"
    for stage in ("saved", "applied"):
        assert _code(lambda: applications.set_stage(db_session, agent, record.id, job.id, stage)) == "forbidden"
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, agent, record.id, job.id, "interview")
    assert _code(lambda: applications.set_contact(
        db_session, agent, record.id, job.id, ApplicationContact(name="X"))) == "forbidden"
    assert _code(lambda: applications.add_event(db_session, agent, record.id, job.id, ApplicationEmailLog(
        kind="email_logged", direction="sent", subject="Hi", occurred_on=date(2026, 10, 14)))) == "forbidden"
    applications.add_event(db_session, agent, record.id, job.id, ApplicationNote(kind="note", text="Recruiter replied"))
    events = applications.detail(db_session, record.id, job.id).events
    assert [(e.kind, e.actor) for e in events[:2]] == [("note", "agent"), ("stage_changed", "agent")]


@pytest.mark.integration
def test_application_recorded_survives_moving_back(db_session):
    actor, record, job = _setup(db_session)
    assert applications.application_recorded(db_session, record.id, job.id) is False
    applications.set_stage(db_session, actor, record.id, job.id, "interview")
    applications.set_stage(db_session, actor, record.id, job.id, "saved")
    assert applications.application_recorded(db_session, record.id, job.id) is True
    applications.set_stage(db_session, actor, record.id, job.id, "rejected")
    assert applications.application_recorded(db_session, record.id, job.id) is True


@pytest.mark.integration
def test_removed_or_foreign_job_is_not_found(db_session):
    actor, record, job = _setup(db_session)
    other = project(db_session, "Synthetic other", owner=actor)
    _, foreign = revisions(db_session, other.id)
    removed = JobRevision(project_id=record.id, revision=2, title="Removed", description="Synthetic",
                          removed_at=datetime.now(timezone.utc))
    db_session.add(removed)
    db_session.flush()
    for job_id in (foreign.id, removed.id):
        assert _code(lambda: applications.detail(db_session, record.id, job_id)) == "not_found"
        assert _code(lambda: applications.set_stage(db_session, actor, record.id, job_id, "applied")) == "not_found"
        assert _code(lambda: applications.set_contact(
            db_session, actor, record.id, job_id, ApplicationContact())) == "not_found"
        assert _code(lambda: applications.add_event(
            db_session, actor, record.id, job_id, ApplicationNote(kind="note", text="x"))) == "not_found"


@pytest.mark.integration
def test_status_row_is_locked_during_a_write(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor, record, job = _setup(db)
        applications.set_stage(db, actor, record.id, job.id, "saved")  # commits the status row the second session must wait on
    with sessions.begin() as first:
        applications.set_stage(first, actor, record.id, job.id, "applied")
        with sessions() as second:
            second.execute(text("SET lock_timeout = '200ms'"))
            with pytest.raises(OperationalError) as caught:
                second.execute(select(JobApplicationStatus).where(
                    JobApplicationStatus.project_id == record.id).with_for_update())
            assert isinstance(caught.value.orig, LockNotAvailable)
