"""One-time token issuance and persisted project-scoped grant lifecycle."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import secrets

from sqlalchemy import select

from job_search_platform.db.models import Grant, Project
from job_search_platform.db.repositories import Repositories
from job_search_platform.services.authorization import authorize, GRANT_CAPABILITIES
from job_search_platform.services.contracts import Actor, GrantIssuedView, GrantView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.quota import require_verified_owner
from job_search_platform.services.owner_sessions import token_hash


def grant_view(row):
    return GrantView(id=row.id, project_id=row.project_id,
                     capabilities=frozenset(row.capabilities),
                     expires_at=row.expires_at, revoked_at=row.revoked_at, label=row.label)


class Grants:
    def __init__(self, sessions):
        self.sessions = sessions

    async def issue(self, actor, project_id, request):
        now = datetime.now(timezone.utc)
        if (not request.capabilities or not request.capabilities <= GRANT_CAPABILITIES
                or request.expires_at.tzinfo is None or request.expires_at <= now):
            raise ServiceError("invalid_grant")
        def issue():
            token = "jspg_" + secrets.token_urlsafe(32)
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "manage", "grant")
                require_verified_owner(db, project_id)
                Repositories.project(db, project_id)
                row = Grant(project_id=project_id, token_hash=token_hash(token),
                            capabilities=sorted(request.capabilities), expires_at=request.expires_at,
                            label=request.label)
                db.add(row)
                db.flush()
                view = GrantIssuedView(id=row.id, token=token, project_id=project_id,
                                       capabilities=request.capabilities, expires_at=row.expires_at)
            return view
        return await asyncio.to_thread(issue)

    async def authenticate(self, token: str) -> Actor:
        def authenticate():
            digest = token_hash(token)
            with self.sessions() as db:
                found = db.execute(select(Grant, Project.user_id).join(
                    Project, Project.id == Grant.project_id).where(Grant.token_hash == digest)).first()
                if found is None or found[0].revoked_at is not None or found[0].expires_at <= datetime.now(timezone.utc):
                    raise ServiceError("unauthorized")
                row, owner_id = found
                return Actor("grant", None, row.id, row.project_id,
                             frozenset(row.capabilities) & GRANT_CAPABILITIES, owner_id)
        return await asyncio.to_thread(authenticate)

    async def list(self, actor, project_id):
        def list_grants():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "grant")
                Repositories.project(db, project_id)
                return tuple(grant_view(row) for row in db.scalars(
                    select(Grant).where(Grant.project_id == project_id).order_by(Grant.expires_at)))
        return await asyncio.to_thread(list_grants)

    async def revoke(self, actor, project_id, grant_id):
        def revoke():
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "manage", "grant")
                row = db.scalar(select(Grant).where(Grant.project_id == project_id, Grant.id == grant_id).with_for_update())
                if row is None:
                    raise ServiceError("not_found")
                if row.revoked_at is None:
                    row.revoked_at = datetime.now(timezone.utc)
        await asyncio.to_thread(revoke)
