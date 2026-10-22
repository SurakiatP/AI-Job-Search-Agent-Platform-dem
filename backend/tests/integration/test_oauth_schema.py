"""FR-P03 OAuth schema. Synthetic data only."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from helpers import owner, project
from job_search_platform.db.models import Grant, OAuthAuthorization, OAuthClient, OAuthToken


def _h() -> bytes:
    return hashlib.sha256(secrets.token_bytes(16)).digest()


def _client(db, client_id="c-1", kind="dcr"):
    row = OAuthClient(client_id=client_id, kind=kind, client_info={"client_id": client_id, "redirect_uris": ["http://127.0.0.1:9/cb"]})
    db.add(row)
    db.flush()
    return row


def _oauth_grant(db, pid, client_id):
    row = Grant(project_id=pid, token_hash=None, oauth_client_id=client_id, capabilities=["results:read"],
                expires_at=datetime.now(timezone.utc) + timedelta(days=1), label="Synthetic client")
    db.add(row)
    db.flush()
    return row


@pytest.mark.integration
def test_client_kind_and_token_kind_are_checked(db_session):
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            _client(db_session, kind="manual")
    client = _client(db_session)
    pid = project(db_session, owner=owner(db_session)).id
    grant = _oauth_grant(db_session, pid, client.client_id)
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(OAuthToken(token_hash=_h(), kind="id", pair_id=uuid.uuid4(), grant_id=grant.id,
                                      client_id=client.client_id, resource="http://127.0.0.1:1/mcp",
                                      expires_at=datetime.now(timezone.utc)))
            db_session.flush()


@pytest.mark.integration
def test_grant_delete_cascades_tokens_and_authorizations(db_session):
    client = _client(db_session)
    pid = project(db_session, owner=owner(db_session)).id
    grant = _oauth_grant(db_session, pid, client.client_id)
    now = datetime.now(timezone.utc)
    db_session.add(OAuthToken(token_hash=_h(), kind="access", pair_id=uuid.uuid4(), grant_id=grant.id,
                              client_id=client.client_id, resource="r", expires_at=now + timedelta(hours=1)))
    db_session.add(OAuthAuthorization(request_hash=_h(), client_id=client.client_id, redirect_uri="http://127.0.0.1:9/cb",
                                      redirect_uri_explicit=True, code_challenge="x" * 43, resource="r", scopes=[],
                                      expires_at=now + timedelta(minutes=10), grant_id=grant.id))
    db_session.flush()
    db_session.execute(delete(Grant).where(Grant.id == grant.id))
    assert db_session.scalar(select(OAuthToken.id)) is None
    assert db_session.scalar(select(OAuthAuthorization.id)) is None


@pytest.mark.integration
def test_client_delete_keeps_grant_and_nulls_link(db_session):
    client = _client(db_session)
    pid = project(db_session, owner=owner(db_session)).id
    grant = _oauth_grant(db_session, pid, client.client_id)
    db_session.execute(delete(OAuthClient).where(OAuthClient.client_id == client.client_id))
    db_session.expire_all()
    assert db_session.get(Grant, grant.id).oauth_client_id is None
