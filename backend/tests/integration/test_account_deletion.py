import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import grant, project, provider_config, revisions, session as make_session, user
from job_search_platform.db.models import CV, Grant, OwnerSession, Project, RateLimitEvent, Run, StoredFile, User
from job_search_platform.integrations import tracing
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import passwords
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.runs import RunService
from job_search_platform.workers.supervisor import WorkerSupervisor

PW = "long-enough-pw"
EMAIL = "carol@example.test"


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


@pytest.fixture
def sessions(migrated_engine):
    return sessionmaker(migrated_engine, expire_on_commit=False)


@pytest.fixture
def accounts(sessions):
    owner_sessions = OwnerSessions(sessions, public_origin="https://app.example.test")
    return Accounts(sessions, owner_sessions, MemoryMailer(), public_origin="https://app.example.test",
                    runs=RunService(sessions))


class FakeStore:
    def __init__(self, fail_on=None, missing=()):
        self.fail_on, self.missing, self.deleted = fail_on, set(missing), []

    async def delete(self, key):
        if key == self.fail_on:
            raise ClientError({"Error": {"Code": "InternalError"}, "ResponseMetadata": {"HTTPStatusCode": 500}}, "DeleteObject")
        if key in self.missing:
            raise ClientError({"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}, "DeleteObject")
        self.deleted.append(key)


def seed(sessions, email=EMAIL, files=("k1", "k2"), run_status="queued"):
    """A user with a real password, a project, a grant, a run and stored files."""
    with sessions.begin() as db:
        actor = user(db, email=email)
        db.get(User, actor.user_id).password_hash = passwords.hash_password(PW)
        proj = project(db, owner=actor)
        grant_actor, _ = grant(db, proj.id)
        cv, job = revisions(db, proj.id)
        sess = make_session(db, proj.id)
        db.add(Run(project_id=proj.id, session_id=sess.id, actor_scope=f"user:{actor.user_id}", idempotency_key=uuid4().hex,
                   request_digest="0" * 64, operation="evaluate_job", cv_revision_id=cv.id, job_revision_id=job.id,
                   provider_configuration_id=provider_config(db).id, input_snapshot={}, config_snapshot={},
                   output_language="en", status=run_status))
        for key in files:
            db.add(StoredFile(project_id=proj.id, kind="cv_original", publication_state="published", storage_key=f"{key}-{proj.id}",
                              checksum_sha256="0" * 64, size_bytes=1, mime_type="text/plain", display_name=key))
        return actor, proj.id, grant_actor


def purged_counts(sessions, user_id, project_id):
    with sessions() as db:
        return [db.scalar(select(func.count()).select_from(model).where(cond)) for model, cond in (
            (User, User.id == user_id), (Project, Project.id == project_id), (CV, CV.project_id == project_id),
            (Run, Run.project_id == project_id), (Grant, Grant.project_id == project_id),
            (OwnerSession, OwnerSession.user_id == user_id))]


def test_request_deletion_disables_access_and_cancels_runs(accounts, sessions):
    actor, project_id, grant_actor = seed(sessions)
    with sessions.begin() as db:
        token_hash = db.scalar(select(Grant.token_hash).where(Grant.id == grant_actor.grant_id))
    exchange = accounts.owner_sessions.create(actor.user_id)
    accounts.request_deletion(actor.user_id, PW, " CAROL@example.test ")
    with pytest.raises(ServiceError) as err:
        asyncio.run(accounts.owner_sessions.current(exchange.session_cookie, origin="https://app.example.test", host="app.example.test"))
    assert err.value.code == "unauthorized"
    with sessions() as db:
        assert db.scalar(select(Grant.revoked_at).where(Grant.id == grant_actor.grant_id)) is not None
        assert db.scalar(select(Run.status).where(Run.project_id == project_id)) == "cancelled"
        assert db.get(User, actor.user_id).deletion_requested_at is not None
    with pytest.raises(ServiceError) as err:
        accounts.login(EMAIL, PW, "1.1.1.1")
    assert err.value.code == "invalid_credentials"
    from job_search_platform.services.grants import Grants
    with pytest.raises(ServiceError) as err:
        asyncio.run(Grants(sessions).authenticate("not-the-token"))
    assert err.value.code == "unauthorized" and token_hash


def test_purge_removes_everything_and_frees_the_email(accounts, sessions):
    actor, project_id, _ = seed(sessions)
    other, other_project, _ = seed(sessions, email="dave@example.test")
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    store = FakeStore(missing={f"k2-{project_id}"})  # a missing object counts as deleted
    assert asyncio.run(accounts.purge_due(store)) == 1
    assert store.deleted == [f"k1-{project_id}"]
    assert purged_counts(sessions, actor.user_id, project_id) == [0] * 6
    assert purged_counts(sessions, other.user_id, other_project)[0] == 1  # untouched
    accounts.signup(EMAIL, PW, "en", "2.2.2.2")
    with sessions() as db:
        assert db.scalar(select(User.id).where(User.email == EMAIL)) is not None


def test_failed_object_delete_skips_user_until_store_recovers(accounts, sessions, caplog):
    actor, project_id, _ = seed(sessions)
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    with caplog.at_level(logging.INFO):
        assert asyncio.run(accounts.purge_due(FakeStore(fail_on=f"k2-{project_id}"))) == 0
    assert purged_counts(sessions, actor.user_id, project_id)[0] == 1
    assert EMAIL not in caplog.text
    assert asyncio.run(accounts.purge_due(FakeStore())) == 1
    assert purged_counts(sessions, actor.user_id, project_id) == [0] * 6


def test_purge_waits_for_live_runs(accounts, sessions):
    actor, project_id, _ = seed(sessions, run_status="running")
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    assert asyncio.run(accounts.purge_due(FakeStore())) == 0
    assert purged_counts(sessions, actor.user_id, project_id)[0] == 1
    with sessions.begin() as db:
        db.execute(update(Run).where(Run.project_id == project_id).values(
            status="cancelled", lease_owner=None, sandbox_id=None))
    assert asyncio.run(accounts.purge_due(FakeStore())) == 1


def test_purge_removes_run_workspaces_only_for_the_deleted_user(accounts, sessions, tmp_path):
    actor, project_id, _ = seed(sessions)
    other, other_project, _ = seed(sessions, email="dave@example.test")
    for pid in (project_id, other_project):
        (tmp_path / str(pid) / "run1").mkdir(parents=True)
        (tmp_path / str(pid) / "run1" / "input.txt").write_text("cv text")
    accounts.workspace_root = tmp_path.resolve()
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    assert asyncio.run(accounts.purge_due(FakeStore())) == 1
    assert not (tmp_path / str(project_id)).exists()
    assert (tmp_path / str(other_project) / "run1" / "input.txt").exists()


def test_purge_does_not_follow_a_workspace_symlink(accounts, sessions, tmp_path):
    actor, project_id, _ = seed(sessions)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "keep.txt").write_text("keep")
    root = tmp_path / "root"
    root.mkdir()
    (root / str(project_id)).symlink_to(outside)
    accounts.workspace_root = root.resolve()
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    assert asyncio.run(accounts.purge_due(FakeStore())) == 1
    assert (outside / "keep.txt").exists() and not (root / str(project_id)).exists()


def test_overdue_purge_is_logged_without_email(accounts, sessions, caplog):
    actor, project_id, _ = seed(sessions)
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    with sessions.begin() as db:
        db.get(User, actor.user_id).deletion_requested_at = datetime.now(timezone.utc) - timedelta(hours=25)
    with caplog.at_level(logging.INFO):
        assert asyncio.run(accounts.purge_due(FakeStore())) == 1
    assert "account_purge_overdue" in caplog.text and "account_purged" in caplog.text and EMAIL not in caplog.text


def test_supervisor_purges_prunes_and_survives_failures(sessions, caplog):
    with sessions.begin() as db:
        db.add(RateLimitEvent(bucket="login_ip", key_hash=b"x", created_at=datetime.now(timezone.utc) - timedelta(days=30)))
    calls = []

    async def purge():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom secret@example.test")
        return 0

    class Queue:
        def claim_next(self, owner):
            return None

    async def go():
        supervisor = WorkerSupervisor(sessions, Queue(), object(), object(), poll_interval=0.01, purge=purge, purge_interval=0.05)
        supervisor._dispatcher = asyncio.create_task(supervisor._dispatch_loop())
        await asyncio.sleep(0.4)
        await supervisor.close()

    with caplog.at_level(logging.WARNING):
        asyncio.run(go())
    assert len(calls) >= 2  # the first failure did not stop the loop
    failed = [r for r in caplog.records if r.getMessage() == "purge_failed"]
    assert failed and failed[0].error == "RuntimeError" and "secret@example.test" not in str(failed[0].__dict__)
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(RateLimitEvent)) == 0


@pytest.mark.integration
def test_purge_deletes_the_minio_object(accounts, sessions):
    import hashlib
    import os
    import boto3
    from botocore.config import Config
    from conftest import _private_secret
    from job_search_platform.integrations.object_store import S3ObjectStore
    client = boto3.client("s3", endpoint_url=f"http://127.0.0.1:{os.environ.get('CORE02_MINIO_PORT', '59000')}",
                          aws_access_key_id=_private_secret("minio-access-key"),
                          aws_secret_access_key=_private_secret("minio-secret-key"), region_name="us-east-1",
                          config=Config(signature_version="s3v4", s3={"addressing_style": "path"}))
    bucket = f"jsp-purge-{uuid4().hex[:8]}"
    client.create_bucket(Bucket=bucket)
    store = S3ObjectStore(client, bucket)
    actor, project_id, _ = seed(sessions, files=())
    key = f"purge-test/{uuid4()}"
    with sessions.begin() as db:
        db.add(StoredFile(project_id=project_id, kind="cv_original", publication_state="published", storage_key=key,
                          checksum_sha256="0" * 64, size_bytes=1, mime_type="text/plain", display_name="cv"))
    asyncio.run(store.put(key, b"x", hashlib.sha256(b"x").hexdigest()))
    accounts.request_deletion(actor.user_id, PW, EMAIL)
    assert asyncio.run(accounts.purge_due(store)) == 1
    assert asyncio.run(store.exists(key)) is False


def test_spans_never_carry_email_or_user_id(sessions, monkeypatch):
    actor, project_id, _ = seed(sessions)
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing, "_tracer", provider.get_tracer("test"))
    with sessions() as db:
        run = db.scalar(select(Run).where(Run.project_id == project_id))
    with tracing.span("run.execute", operation=run.operation, run_id=run.id, project_id=run.project_id):
        tracing.llm_round(run_id=run.id, model="m", latency_ms=5, input_tokens=1, output_tokens=2)
    values = [str(v) for s in exporter.get_finished_spans() for v in s.attributes.values()]
    assert values and not any(EMAIL in v or str(actor.user_id) in v for v in values)
