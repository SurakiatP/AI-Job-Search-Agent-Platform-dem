"""Admin console foundation: is_admin rule, audit detail hygiene, append-only log, route guard. Synthetic data only."""
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


def _row(**kw):
    base = dict(email="a@example.test", email_verified_at=NOW, disabled_at=None, is_admin=False)
    return User(**{**base, **kw})


def test_is_admin_flag_or_env_but_always_verified_and_enabled(monkeypatch):
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert not is_admin(_row())
    assert is_admin(_row(is_admin=True))
    monkeypatch.setenv("ADMIN_EMAILS", " Other@example.test, A@EXAMPLE.test ")
    assert is_admin(_row())
    assert not is_admin(_row(is_admin=True, email_verified_at=None))
    assert not is_admin(_row(is_admin=True, disabled_at=NOW))
    assert not is_admin(_row(disabled_at=NOW))


@pytest.mark.parametrize("code,status", [("admin_target_forbidden", 403), ("benchmark_required", 409),
                                         ("benchmark_busy", 409), ("price_invalid", 422)])
def test_admin_error_codes_map_to_http(code, status):
    assert _http_error(ServiceError(code)).status_code == status
