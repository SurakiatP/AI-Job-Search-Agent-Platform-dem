"""Persisted, fail-closed authorization shared by every transport."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import get_args
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from job_search_platform.db.models import Grant, OwnerSession, Project, User
from job_search_platform.services.contracts import Actor, Capability
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.skills import SKILL_BY_ID, SKILLS

GRANT_CAPABILITIES = frozenset(get_args(Capability))
RESULT_RESOURCES = frozenset({"run", "event", "result", "generated_document"})
GRANT_WORK_RESOURCES = frozenset(skill.id for skill in SKILLS if skill.kind == "task")
GRANT_READ_RESOURCES = frozenset(skill.id for skill in SKILLS if skill.kind == "direct")
OWNER_ONLY_RESOURCES = frozenset({
    "project", "session", "message", "cv", "cv_original", "upload", "raw_input",
    "preference", "job", "provider_settings", "grant", "approval", "owner_session",
})


def authorize(db: Session, actor: Actor, project_id: UUID, action: str,
              resource_kind: str, *, now: datetime | None = None) -> None:
    """Validate the identity again from PostgreSQL for every request/event.

    ``Actor.capabilities`` is descriptive input only for grants. Persisted grant
    capabilities, revocation and expiry are authoritative.
    """
    now = now or datetime.now(timezone.utc)
    if actor.kind == "user":
        if actor.owner_session_id is None or actor.grant_id is not None or actor.user_id is None:
            raise ServiceError("unauthorized")
        owner_session = db.scalar(select(OwnerSession).where(
            OwnerSession.id == actor.owner_session_id,
        ).execution_options(populate_existing=True))
        if (owner_session is None or owner_session.user_id != actor.user_id
                or owner_session.revoked_at is not None or _utc(owner_session.expires_at) <= now):
            raise ServiceError("unauthorized")
        if db.scalar(select(User.disabled_at).where(User.id == actor.user_id)) is not None:
            raise ServiceError("unauthorized")
        if db.scalar(select(Project.user_id).where(Project.id == project_id)) != actor.user_id:
            raise ServiceError("not_found")
        return

    if actor.kind != "grant" or actor.grant_id is None or actor.owner_session_id is not None:
        raise ServiceError("unauthorized")
    grant = db.scalar(select(Grant).where(
        Grant.id == actor.grant_id, Grant.project_id == project_id,
    ).execution_options(populate_existing=True))
    if grant is None:
        raise ServiceError("not_found")
    if grant.revoked_at is not None or _utc(grant.expires_at) <= now:
        raise ServiceError("unauthorized")
    if actor.project_id != project_id or grant.project_id != project_id:
        raise ServiceError("not_found")
    owner_id = db.scalar(select(Project.user_id).where(Project.id == project_id))
    if owner_id is not None and db.scalar(select(User.disabled_at).where(User.id == owner_id)) is not None:
        raise ServiceError("unauthorized")
    if resource_kind == "run" and action == "cancel":
        # RunService additionally verifies this is the original creating grant.
        return
    if resource_kind == "approval" and action in {"request", "read"}:
        persisted = frozenset(grant.capabilities) & GRANT_CAPABILITIES
        needed = "documents:draft" if action == "request" else "results:read"
        if needed not in persisted:
            raise ServiceError("forbidden")
        return
    if resource_kind in OWNER_ONLY_RESOURCES or resource_kind not in RESULT_RESOURCES | GRANT_WORK_RESOURCES | GRANT_READ_RESOURCES:
        raise ServiceError("forbidden")
    persisted = frozenset(grant.capabilities) & GRANT_CAPABILITIES
    if resource_kind in GRANT_WORK_RESOURCES | GRANT_READ_RESOURCES:
        if SKILL_BY_ID[resource_kind].capability not in persisted:
            raise ServiceError("forbidden")
        return
    if resource_kind in RESULT_RESOURCES:
        if action != "results:read" or "results:read" not in persisted:
            raise ServiceError("forbidden")
        return
    raise ServiceError("forbidden")


def user_scope_is_current(db: Session, scope: str, project_id: UUID) -> bool:
    """True for ``user:<id>`` when that user exists, is enabled and owns the project."""
    if not scope.startswith("user:"):
        return False
    try:
        user_id = UUID(scope.removeprefix("user:"))
    except ValueError:
        return False
    return db.scalar(select(Project.id).join(User, User.id == Project.user_id).where(
        Project.id == project_id, User.id == user_id, User.disabled_at.is_(None),
    ).with_for_update(of=User)) is not None


def require_scoped_id(db: Session, model: type, project_id: UUID, resource_id: UUID,
                      *, id_column: str = "id"):
    """Resolve a resource by project and ID; conceal foreign IDs uniformly."""
    column = getattr(model, id_column)
    project_column = getattr(model, "project_id")
    record = db.scalar(select(model).where(project_column == project_id, column == resource_id))
    if record is None:
        raise ServiceError("not_found")
    return record


def _utc(value: datetime) -> datetime:
    # PostgreSQL returns aware values; normalize SQLite-like test values too.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
