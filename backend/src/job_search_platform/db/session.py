"""Database engine/session construction. No credentials are logged."""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


def make_engine(url: str | None = None, **kwargs):
    database_url = url or os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("database_url_required")
    return create_engine(database_url, pool_pre_ping=True, **kwargs)


def make_session_factory(engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
