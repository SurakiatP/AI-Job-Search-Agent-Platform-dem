"""Reusable synthetic actor and project records for integration tests."""
from __future__ import annotations

import hashlib
import secrets

from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from job_search_platform.db.models import (
    CV, CVRevision, ConversationSession, Grant, JobRevision, OwnerSession,
    Project, ProviderConfiguration, User,
)
from job_search_platform.services.contracts import Actor, RunRequest


def user(db, *, email: str | None = None, verified: bool = True,
         expires_in: timedelta = timedelta(hours=1)) -> Actor:
    now = datetime.now(timezone.utc)
    row = User(email=email or f"u{uuid4().hex[:8]}@example.test", password_hash="x",
               email_verified_at=now if verified else None)
    db.add(row)
    db.flush()
    owner_session_id = uuid4()
    db.add(OwnerSession(id=owner_session_id, user_id=row.id,
                        session_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                        csrf_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
                        expires_at=now + expires_in, last_seen_at=now))
    db.flush()
    return Actor("user", owner_session_id, None, None, frozenset(), row.id)


owner = user


def project(db, name: str = "Synthetic Project", *, owner: Actor | None = None) -> Project:
    value = Project(name=name, user_id=owner.user_id if owner is not None else None)
    db.add(value)
    db.flush()
    return value


def legacy_project(db, name: str = "Synthetic Project"):
    """Insert a project without ``user_id``, for tests that run against a pre-accounts schema."""
    from sqlalchemy import insert
    from types import SimpleNamespace
    project_id = uuid4()
    db.execute(insert(Project.__table__).values(id=project_id, name=name))
    return SimpleNamespace(id=project_id, name=name)


def login_cookie(services, user_id) -> tuple[str, str]:
    """Cookie and CSRF token for a fresh session of ``user_id``."""
    exchange = services.owner_sessions.create(user_id)
    return exchange.session_cookie, exchange.csrf_token


def grant(db, project_id, *, capabilities=("results:read",), expires_in=timedelta(hours=1)) -> tuple[Actor, Grant]:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    value = Grant(project_id=project_id, token_hash=hashlib.sha256(token.encode()).digest(),
                  capabilities=list(capabilities), expires_at=now + expires_in)
    db.add(value)
    db.flush()
    owner_id = db.scalar(select(Project.user_id).where(Project.id == project_id))
    return Actor("grant", None, value.id, project_id, frozenset(capabilities), owner_id), value


def session(db, project_id, title: str = "Synthetic session") -> ConversationSession:
    value = ConversationSession(project_id=project_id, title=title)
    db.add(value)
    db.flush()
    return value


def primary_cv(db, project_id):
    """The project's primary CV, created on first use."""
    # Only columns every schema since 0014 has, so migration tests on old revisions can use it too.
    from types import SimpleNamespace
    from uuid import uuid4
    from sqlalchemy import insert, select
    found = db.scalar(select(CV.id).where(CV.project_id == project_id, CV.is_primary, CV.removed_at.is_(None)))
    if found is None:
        found = uuid4()
        db.execute(insert(CV).values(id=found, project_id=project_id, name="CV หลัก", is_primary=True))
    return SimpleNamespace(id=found)


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


def completed_extract_run(db, project_id):
    """An owner-only extract_experience run row, for protocol-exclusion checks."""
    from job_search_platform.db.models import Run
    cv_revision = db.scalar(select(CVRevision).where(CVRevision.project_id == project_id).limit(1))
    run = Run(project_id=project_id, actor_scope="owner", idempotency_key=uuid4().hex, request_digest="0" * 64,
              operation="extract_experience", cv_revision_id=cv_revision.id,
              provider_configuration_id=provider_config(db).id, input_snapshot={}, config_snapshot={},
              output_language="en", status="completed")
    db.add(run)
    db.flush()
    return run.id
