from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from job_search_platform.db.models import OwnerSession
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor, ApprovalRequest, ProviderSettingsUpdate, RunRequest, ToolConnectorUpdate,
)
from job_search_platform.services.errors import ServiceError
from helpers import grant, owner, project


def test_grant_can_read_results_but_cannot_read_raw_cv_or_chat(db_session):
    project_record = project(db_session)
    shared_actor, _ = grant(db_session, project_record.id, capabilities=("results:read", "jobs:evaluate"))
    authorize(db_session, shared_actor, project_record.id, "results:read", "run")
    authorize(db_session, shared_actor, project_record.id, "jobs:evaluate", "evaluate_job")
    for raw_resource in ("cv", "cv_original", "upload", "raw_input", "message", "session"):
        with pytest.raises(ServiceError) as error:
            authorize(db_session, shared_actor, project_record.id, "results:read", raw_resource)
        assert error.value.code == "forbidden"


def test_grant_capabilities_are_reloaded_and_expiry_revocation_fail_closed(db_session):
    p = project(db_session)
    actor, persisted = grant(db_session, p.id, capabilities=("results:read",))
    # A stale Actor claiming broader access cannot add authority.
    stale = Actor("grant", None, persisted.id, p.id, frozenset({"documents:draft", "results:read"}))
    with pytest.raises(ServiceError, match="forbidden"):
        authorize(db_session, stale, p.id, "documents:draft", "draft_documents")
    draft_only, _ = grant(db_session, p.id, capabilities=("documents:draft",))
    with pytest.raises(ServiceError, match="forbidden"):
        authorize(db_session, draft_only, p.id, "documents:draft", "generated_document")
    persisted.revoked_at = datetime.now(timezone.utc)
    db_session.flush()
    with pytest.raises(ServiceError, match="unauthorized"):
        authorize(db_session, actor, p.id, "results:read", "run")
    expired, _ = grant(db_session, p.id, expires_in=timedelta(seconds=-1))
    with pytest.raises(ServiceError, match="unauthorized"):
        authorize(db_session, expired, p.id, "results:read", "run")


def test_foreign_project_ids_are_generic_not_found(db_session):
    p1, p2 = project(db_session, "A"), project(db_session, "B")
    actor, _ = grant(db_session, p1.id)
    foreign_actor = Actor("grant", None, actor.grant_id, p2.id, actor.capabilities)
    with pytest.raises(ServiceError) as error:
        authorize(db_session, foreign_actor, p2.id, "results:read", "run")
    assert error.value.code == "not_found"


def test_public_run_contract_rejects_provider_and_model_overrides():
    request = dict(session_id="00000000-0000-0000-0000-000000000001",
                   operation="evaluate_job", job_revision_id="00000000-0000-0000-0000-000000000002",
                   output_language="en", idempotency_key="synthetic")
    with pytest.raises(ValueError):
        RunRequest(**request, provider="arbitrary", model="arbitrary")


def test_provider_credential_is_masked_in_settings_dto():
    dto = ProviderSettingsUpdate(provider="synthetic", model="test", credential="SYNTHETIC-SECRET")
    assert "SYNTHETIC-SECRET" not in repr(dto)
    assert dto.model_dump(mode="json")["credential"] == "**********"
    with pytest.raises(ValueError):
        ToolConnectorUpdate(enabled=True, base_url="https://arbitrary.example")
    with pytest.raises(ValueError, match="approval_target_mismatch"):
        ApprovalRequest(action="promote_cv", target_file_id="00000000-0000-0000-0000-000000000001")


def test_owner_requires_live_persisted_session(db_session):
    p = project(db_session)
    actor = owner(db_session)
    authorize(db_session, actor, p.id, "manage", "project")
    db_session.get(OwnerSession, actor.owner_session_id).revoked_at = datetime.now(timezone.utc)
    db_session.flush()
    with pytest.raises(ServiceError, match="unauthorized"):
        authorize(db_session, actor, p.id, "manage", "project")


def test_reused_session_reloads_grant_and_owner_state_from_postgres(db_session):
    bind = db_session.get_bind()
    with Session(bind=bind, expire_on_commit=False) as auth_db, Session(bind=bind) as update_db:
        p = project(auth_db)
        grant_actor, persisted_grant = grant(auth_db, p.id, capabilities=("results:read",))
        owner_actor = owner(auth_db)
        auth_db.commit()

        authorize(auth_db, grant_actor, p.id, "results:read", "run")
        authorize(auth_db, owner_actor, p.id, "manage", "project")

        changed_grant = update_db.get(type(persisted_grant), persisted_grant.id)
        changed_grant.capabilities = []
        update_db.commit()
        with pytest.raises(ServiceError, match="forbidden"):
            authorize(auth_db, grant_actor, p.id, "results:read", "run")

        changed_grant.revoked_at = datetime.now(timezone.utc)
        update_db.commit()
        with pytest.raises(ServiceError, match="unauthorized"):
            authorize(auth_db, grant_actor, p.id, "results:read", "run")

        from job_search_platform.db.models import OwnerSession
        changed_owner = update_db.get(OwnerSession, owner_actor.owner_session_id)
        changed_owner.revoked_at = datetime.now(timezone.utc)
        update_db.commit()
        with pytest.raises(ServiceError, match="unauthorized"):
            authorize(auth_db, owner_actor, p.id, "manage", "project")
