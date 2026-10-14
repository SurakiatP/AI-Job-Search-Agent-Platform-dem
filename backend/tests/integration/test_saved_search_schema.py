"""FR-J05 schema: saved_searches and saved_search_seen. Synthetic data only."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from helpers import owner, project
from job_search_platform.db.models import Project, SavedSearch, SavedSearchSeen, User


def _saved(db, project_id, name="Synthetic search", frequency="daily"):
    row = SavedSearch(project_id=project_id, name=name, filters={"q": "data"}, frequency=frequency,
                      unsubscribe_token_hash=hashlib.sha256(secrets.token_bytes(16)).digest(),
                      next_run_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    return row


@pytest.mark.integration
def test_name_unique_per_project_and_frequency_checked(db_session):
    actor = owner(db_session)
    first, second = project(db_session, owner=actor), project(db_session, "Other", owner=actor)
    _saved(db_session, first.id)
    _saved(db_session, second.id)  # same name, other project: fine
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            _saved(db_session, first.id)
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            _saved(db_session, first.id, name="Hourly", frequency="hourly")


@pytest.mark.integration
def test_project_and_user_deletion_cascade(db_session):
    actor = owner(db_session)
    first = project(db_session, owner=actor)
    row = _saved(db_session, first.id)
    db_session.add(SavedSearchSeen(saved_search_id=row.id, slug="synthetic-slug"))
    db_session.flush()
    db_session.execute(delete(Project).where(Project.id == first.id))
    db_session.flush()
    assert db_session.scalar(select(SavedSearch.id)) is None
    assert db_session.scalar(select(SavedSearchSeen.slug)) is None

    second = project(db_session, "Second", owner=actor)
    _saved(db_session, second.id)
    db_session.execute(delete(User).where(User.id == actor.user_id))
    db_session.flush()
    assert db_session.scalar(select(SavedSearch.id)) is None
