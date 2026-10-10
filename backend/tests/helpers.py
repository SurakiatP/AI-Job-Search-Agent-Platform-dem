"""Reusable synthetic actor and project records for integration tests."""
from __future__ import annotations

import hashlib
import secrets

from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from job_search_platform.db.models import (
    CV, CVRevision, ConversationSession, Grant, JobRevision, OwnerSession,
    Project, ProviderConfiguration,
)
from job_search_platform.services.contracts import Actor, RunRequest


def owner(db, *, expires_in: timedelta = timedelta(hours=1)) -> Actor:
    now = datetime.now(timezone.utc)
    owner_session_id = uuid4()
    db.add(OwnerSession(id=owner_session_id, session_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                        csrf_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                        expires_at=now + expires_in))
    db.flush()
    return Actor("owner", owner_session_id, None, None, frozenset())


def project(db, name: str = "Synthetic Project") -> Project:
    value = Project(name=name)
    db.add(value)
    db.flush()
    return value


def grant(db, project_id, *, capabilities=("results:read",), expires_in=timedelta(hours=1)) -> tuple[Actor, Grant]:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    value = Grant(project_id=project_id, token_hash=hashlib.sha256(token.encode()).digest(),
                  capabilities=list(capabilities), expires_at=now + expires_in)
    db.add(value)
    db.flush()
    return Actor("grant", None, value.id, project_id, frozenset(capabilities)), value


def session(db, project_id, title: str = "Synthetic session") -> ConversationSession:
    value = ConversationSession(project_id=project_id, title=title)
    db.add(value)
    db.flush()
    return value


def primary_cv(db, project_id) -> CV:
    """The project's primary CV, created on first use."""
    from sqlalchemy import select
    found = db.scalar(select(CV).where(CV.project_id == project_id, CV.is_primary, CV.removed_at.is_(None)))
    if found is None:
        found = CV(project_id=project_id, name="CV หลัก", is_primary=True)
        db.add(found)
        db.flush()
    return found


def revisions(db, project_id):
    cv = CVRevision(project_id=project_id, cv_id=primary_cv(db, project_id).id, revision=1)
    job = JobRevision(project_id=project_id, revision=1, title="Synthetic Engineer",
                      description="Synthetic job description",
                      company="Example Co", source_url="https://jobs.example.test/1")
    db.add_all([cv, job])
    db.flush()
    return cv, job


def provider_config(db, project_id=None):
    """Ensure the system-wide provider configuration exists (project_id kept for old callers)."""
    existing = db.scalar(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))
                         .order_by(ProviderConfiguration.revision.desc()).limit(1))
    if existing is not None:
        return existing
    value = ProviderConfiguration(project_id=None, provider="synthetic", model="test-model",
                                  secret_reference="secret-ref://synthetic/test", revision=1)
    db.add(value)
    db.flush()
    return value


def run_request(session_id, job_revision_id, *, cv_revision_id=None, key="synthetic-run"):
    return RunRequest(session_id=session_id, operation="evaluate_job", cv_revision_id=cv_revision_id,
                      job_revision_id=job_revision_id, output_language="en", idempotency_key=key)


def cancel_queued_extract_runs(sessions) -> None:
    """Uploads now queue extract_experience; tests that claim the next run cancel it first."""
    from datetime import datetime, timezone
    from sqlalchemy import update
    from job_search_platform.db.models import Run
    with sessions.begin() as db:
        db.execute(update(Run).where(Run.operation == "extract_experience", Run.status == "queued")
                   .values(status="cancelled", finished_at=datetime.now(timezone.utc)))
