"""Shared real-PostgreSQL fixtures; test data and credentials stay synthetic/private."""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "tests"))
PRIVATE_DIR = Path(os.environ.get(
    "CORE02_PRIVATE_DIR",
    Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003",
))


def _private_secret(name: str) -> str:
    path = PRIVATE_DIR / name
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise RuntimeError("test_infrastructure_credentials_unavailable")
    return path.read_text(encoding="utf-8").strip()


@pytest.fixture
def postgres_engine():
    """Give each test a uniquely named database; never reset shared/global state."""
    database = f"jsp_test_{uuid.uuid4().hex}"
    port = int(os.environ.get("CORE02_POSTGRES_PORT", "55432"))
    user = _private_secret("postgres-user")
    password = _private_secret("postgres-password")
    with psycopg.connect(host="127.0.0.1", port=port, dbname="postgres",
                         user=user, password=password, autocommit=True) as admin:
        admin.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(database)))
    url = URL.create("postgresql+psycopg", username=user, password=password,
                     host="127.0.0.1", port=port, database=database)
    engine = create_engine(url, pool_pre_ping=True)
    try:
        yield engine
    finally:
        engine.dispose()
        with psycopg.connect(host="127.0.0.1", port=port, dbname="postgres",
                             user=user, password=password, autocommit=True) as admin:
            admin.execute(psycopg.sql.SQL(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = {}"
            ).format(psycopg.sql.Literal(database)))
            admin.execute(psycopg.sql.SQL("DROP DATABASE IF EXISTS {}").format(psycopg.sql.Identifier(database)))


@pytest.fixture
def migrated_engine(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    return postgres_engine


@pytest.fixture
def db_session(migrated_engine):
    factory = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    with factory() as db:
        yield db
        db.rollback()


@pytest.fixture(autouse=True)
def gateway_env(monkeypatch):
    """Every test sees a configured LiteLLM gateway with a fake key; nothing real is contacted."""
    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:4000")
    monkeypatch.setenv("LITELLM_API_KEY", "sk-test-gateway")
    monkeypatch.setenv("AI_ANALYZE_MODEL", "ai-analyze")
    monkeypatch.setenv("AI_DECISION_MODEL", "typesafe/jev-1.13")


@pytest.fixture
def no_gateway_key(monkeypatch, tmp_path):
    """Gateway without an app key: no env key and an empty private dir."""
    monkeypatch.delenv("LITELLM_API_KEY")
    monkeypatch.setenv("CORE02_PRIVATE_DIR", str(tmp_path))
