"""scripts/accounts.py against a per-test database, run as the owner would run it."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from conftest import ROOT
from helpers import legacy_project, provider_config, revisions, session as make_session, user
from job_search_platform.db.models import Project, Run, User
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.queue import PostgresRunQueue

PW = "long-enough-pw"


@pytest.fixture
def cli(migrated_engine):
    env = {**os.environ, "JSP_DATABASE": migrated_engine.url.database,
           "CORE02_POSTGRES_PORT": str(migrated_engine.url.port)}
    env.pop("JSP_POSTGRES_PORT", None)

    def run(*args, password=PW):
        return subprocess.run([sys.executable, str(ROOT / "scripts" / "accounts.py"), *args],
                              input=f"{password}\n", text=True, capture_output=True, env=env, timeout=120)
    return run


def test_claim_existing_takes_orphan_projects_and_owner_runs(cli, migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        ids = [legacy_project(db, f"P{i}").id for i in range(2)]
        taken = user(db)
        mine = Project(name="already owned", user_id=taken.user_id)
        db.add(mine)
        db.flush()
        cv, job = revisions(db, ids[0])
        run = Run(project_id=ids[0], session_id=make_session(db, ids[0]).id, actor_scope="owner",
                  idempotency_key=uuid4().hex, request_digest="0" * 64, operation="evaluate_job",
                  cv_revision_id=cv.id, job_revision_id=job.id, provider_configuration_id=provider_config(db).id,
                  input_snapshot={}, config_snapshot={}, output_language="en", status="queued")
        db.add(run)
        db.flush()
        run_id, mine_id = run.id, mine.id

    done = cli("create-user", "--email", "Owner@Example.test", "--claim-existing", "--locale", "en")
    assert done.returncode == 0, done.stderr
    assert "projects=2" in done.stdout and "runs=1" in done.stdout
    assert "example.test" not in done.stdout + done.stderr

    with sessions() as db:
        owner = db.scalar(select(User).where(User.email == "owner@example.test"))
        assert owner.email_verified_at is not None and owner.locale == "en"
        assert [db.get(Project, i).user_id for i in ids] == [owner.id] * 2
        assert db.get(Project, mine_id).user_id != owner.id  # someone else's project is untouched
        scope = db.get(Run, run_id).actor_scope
        assert scope == f"user:{owner.id}"
        assert PostgresRunQueue._scope_is_current(db, scope, ids[0], datetime.now(timezone.utc)) is True
        with pytest.raises(IntegrityError):  # the immutability trigger is back on after the claim
            db.execute(update(Run).where(Run.id == run_id).values(actor_scope="owner"))


def test_create_without_claim_leaves_orphans_and_weak_password_exits_2(cli, migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        pid = legacy_project(db).id
    weak = cli("create-user", "--email", "a@example.test", password="short")
    assert weak.returncode == 2 and "error: weak_password" in weak.stderr
    assert cli("create-user", "--email", "a@example.test").returncode == 0
    with sessions() as db:
        assert db.get(Project, pid).user_id is None


def test_disable_user_blocks_authorize(cli, migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = user(db)
        pid = Project(name="p", user_id=actor.user_id)
        db.add(pid)
        db.flush()
        project_id = pid.id
        email = db.get(User, actor.user_id).email
    with sessions() as db:
        authorize(db, actor, project_id, "read", "project")
    done = cli("disable-user", "--email", email)
    assert done.returncode == 0 and done.stdout.strip() == "disabled"
    with sessions() as db, pytest.raises(ServiceError) as err:
        authorize(db, actor, project_id, "read", "project")
    assert err.value.code == "unauthorized"
