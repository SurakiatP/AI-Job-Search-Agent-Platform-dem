"""Admin foundation tests that need the real PostgreSQL (audit log, append-only trigger, admin-only routes)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from helpers import user as make_user
from job_search_platform.api.admin import router as admin_router
from job_search_platform.api.dependencies import get_services, owner_actor
from job_search_platform.api.rest import _http_error
from job_search_platform.db.models import AdminAuditLog, User
from job_search_platform.services import admin_audit
from job_search_platform.services.accounts import is_admin
from job_search_platform.services.contracts import AdminAuditPage
from job_search_platform.services.errors import ServiceError

NOW = datetime.now(timezone.utc)


@pytest.mark.integration
def test_audit_record_strips_non_scalar_and_long_detail_and_lists_newest_first(db_session):
    actor = make_user(db_session)
    admin_audit.record(db_session, actor.user_id, "user.suspend", "user", "t1", {"count": 2, "note": "x" * 500,
                                                                               "nested": {"cv": "secret"}, "rows": [1]})
    for i in range(3):
        admin_audit.record(db_session, actor.user_id, "model.set", "task", f"t{i}", {})
    first = admin_audit.list(db_session, {"actor": actor.user_id}, limit=2)
    assert [i["action"] for i in first["items"]] == ["model.set", "model.set"] and first["next_cursor"]
    second = admin_audit.list(db_session, {"actor": actor.user_id}, first["next_cursor"], limit=2)
    assert len(second["items"]) == 2 and second["next_cursor"] is None
    suspended = second["items"][-1]
    assert suspended["action"] == "user.suspend" and suspended["actor_email"]
    assert suspended["detail"] == {"count": 2, "note": "x" * 200}
    assert admin_audit.list(db_session, {"action": "user.suspend"})["items"][0]["target_id"] == "t1"
    assert admin_audit.list(db_session, {"since": NOW + timedelta(days=1)})["items"] == []


@pytest.mark.integration
def test_audit_log_is_append_only_and_outlives_the_account(db_session):
    actor = make_user(db_session)
    row = admin_audit.record(db_session, actor.user_id, "user.delete", "user", "x", {})
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            db_session.execute(update(AdminAuditLog).values(action="other"))
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            db_session.execute(text("DELETE FROM admin_audit_log"))
    db_session.execute(text("DELETE FROM users WHERE id = :id"), {"id": actor.user_id})
    assert db_session.get(AdminAuditLog, row.id) is not None
    page = AdminAuditPage.model_validate(admin_audit.list(db_session))  # the response model must accept a purged actor
    assert page.items[0].actor_email is None


@pytest.mark.integration
def test_admin_routes_need_an_admin(db_session, migrated_engine, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    plain, flagged, listed = make_user(db_session), make_user(db_session), make_user(db_session)
    db_session.execute(update(User).where(User.id == flagged.user_id).values(is_admin=True))
    email = db_session.scalar(select(User.email).where(User.id == listed.user_id))
    db_session.commit()
    sessions = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    current = {"actor": plain}
    app = FastAPI()
    app.include_router(admin_router, prefix="/v1")
    app.dependency_overrides[get_services] = lambda: SimpleNamespace(sessions=sessions)
    app.dependency_overrides[owner_actor] = lambda: current["actor"]
    app.add_exception_handler(ServiceError, lambda _r, exc: _http_error(exc))
    client = TestClient(app)
    for path in ("/v1/admin/audit", "/v1/admin/users", "/v1/admin/overview", "/v1/admin/system"):
        assert client.get(path).status_code == 403
    current["actor"] = flagged
    assert client.get("/v1/admin/audit").json() == {"items": [], "next_cursor": None}
    assert client.get("/v1/admin/audit?since=not-a-date").status_code == 422
    current["actor"] = listed
    assert client.get("/v1/admin/audit").status_code == 403
    monkeypatch.setenv("ADMIN_EMAILS", email)
    assert client.get("/v1/admin/audit").status_code == 200
    db_session.execute(text("DELETE FROM users WHERE id IN (:a, :b, :c)"),
                       {"a": plain.user_id, "b": flagged.user_id, "c": listed.user_id})
    db_session.commit()
