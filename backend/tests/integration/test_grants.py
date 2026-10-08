from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.db.models import Grant
from job_search_platform.services.contracts import GrantIssueRequest
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.grants import Grants


async def test_tokens_are_disclosed_once_hashed_and_currently_revocable(migrated_engine, caplog):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor, p = owner(db), project(db)
    svc = Grants(factory)
    issued = await svc.issue(actor, p.id, GrantIssueRequest(
        capabilities=frozenset({"results:read", "jobs:evaluate"}),
        expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
    caller = await svc.authenticate(issued.token)
    assert caller.kind == "grant" and caller.project_id == p.id
    views = await svc.list(actor, p.id)
    assert len(views) == 1 and "token" not in type(views[0]).model_fields
    assert issued.token not in repr(issued) + views[0].model_dump_json() + caplog.text
    with factory() as db:
        row = db.scalar(select(Grant))
        assert issued.token.encode() != row.token_hash
    with pytest.raises(ServiceError, match="forbidden"):
        await svc.list(caller, p.id)
    await svc.revoke(actor, p.id, issued.id)
    with pytest.raises(ServiceError, match="unauthorized"):
        await svc.authenticate(issued.token)
    with pytest.raises(ServiceError, match="unauthorized"):
        await svc.list(caller, p.id)


async def test_grant_expiry_empty_capabilities_and_foreign_revoke_are_denied(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor, first, second = owner(db), project(db), project(db)
    svc = Grants(factory)
    with pytest.raises(ServiceError, match="invalid_grant"):
        await svc.issue(actor, first.id, GrantIssueRequest(
            capabilities=frozenset(), expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
    with pytest.raises(ServiceError, match="invalid_grant"):
        await svc.issue(actor, first.id, GrantIssueRequest(
            capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)))
    issued = await svc.issue(actor, first.id, GrantIssueRequest(
        capabilities=frozenset({"results:read"}), expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
    with pytest.raises(ServiceError, match="not_found"):
        await svc.revoke(actor, second.id, issued.id)
    with pytest.raises(ServiceError, match="unauthorized"):
        await svc.authenticate("jspg_SYNTHETIC_INVALID_" + uuid4().hex)
