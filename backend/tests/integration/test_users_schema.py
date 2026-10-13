import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Project, User


def test_users_schema_and_project_cascade(db_session):
    user = User(email="a@example.test", password_hash="scrypt$1$8$1$AA==$AA==", locale="en")
    db_session.add(user)
    db_session.flush()
    project = Project(name="P", user_id=user.id)
    db_session.add(project)
    db_session.flush()
    db_session.delete(user)
    db_session.flush()
    db_session.expunge_all()  # the cascade happens in the database, not the identity map
    assert db_session.get(Project, project.id) is None


def test_email_must_be_lowercase(db_session):
    db_session.add(User(email="A@example.test", password_hash="x", locale="en"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_launch_nonce_table_is_gone(db_session):
    assert "owner_launch_nonces" not in inspect(db_session.bind).get_table_names()
    cols = {c["name"] for c in inspect(db_session.bind).get_columns("owner_sessions")}
    assert {"user_id", "last_seen_at"} <= cols
