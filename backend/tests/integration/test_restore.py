from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import tarfile
import uuid
import asyncio
from datetime import timedelta
from argparse import Namespace
from pathlib import Path
import sys

import boto3
import psycopg
import pytest
from botocore.config import Config
from psycopg import sql
from sqlalchemy import create_engine, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from conftest import PRIVATE_DIR, _private_secret
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from job_search_platform.db.models import (
    CVRevision, Document, DocumentRevision, Grant, JobRevision, OwnerLaunchNonce, OwnerSession,
    ConversationSession, Project, ProviderConfiguration, Run, RunArtifact, StoredFile,
)
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.maintenance import assert_restore_ready
from job_search_platform.services.contracts import Actor, RunRequest
from job_search_platform.services.runs import RunService
from scripts import backup, restore as restore_script


def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"http://127.0.0.1:{os.environ.get('CORE02_MINIO_PORT', '59000')}",
        aws_access_key_id=_private_secret("minio-access-key"),
        aws_secret_access_key=_private_secret("minio-secret-key"),
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@pytest.fixture
def source_bucket():
    client = _client()
    bucket = f"jsp-core10-source-{uuid.uuid4().hex}"
    client.create_bucket(Bucket=bucket)
    yield client, bucket
    _remove_bucket(client, bucket)


@pytest.fixture
def empty_restore_target():
    port = int(os.environ.get("CORE02_POSTGRES_PORT", "55432"))
    user = _private_secret("postgres-user")
    password = _private_secret("postgres-password")
    database = f"jsp_restore_{uuid.uuid4().hex}"
    with psycopg.connect(host="127.0.0.1", port=port, dbname="postgres", user=user, password=password, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    client = _client()
    bucket = f"jsp-core10-target-{uuid.uuid4().hex}"
    client.create_bucket(Bucket=bucket)
    yield database, bucket, client
    _remove_bucket(client, bucket)
    with psycopg.connect(host="127.0.0.1", port=port, dbname="postgres", user=user, password=password, autocommit=True) as admin:
        admin.execute(sql.SQL("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = {}").format(sql.Literal(database)))
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(database)))


def _remove_bucket(client, bucket: str):
    try:
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for item in page.get("Contents", []):
                client.delete_object(Bucket=bucket, Key=item["Key"])
        client.delete_bucket(Bucket=bucket)
    except Exception:
        pass


def _seed_snapshot(engine, client, bucket: str):
    project = Project(name="Synthetic recovery project")
    samples = [
        ("cv_original", "synthetic-cv.txt", b"synthetic CV: no personal data"),
        ("job_source", "synthetic-job.txt", b"synthetic job description"),
        ("generated_document", "synthetic-letter.pdf", b"%PDF-1.4\nsynthetic generated output\n%%EOF"),
        ("chat_attachment", "synthetic-chat.txt", "สวัสดี synthetic chat".encode()),
    ]
    file_rows = []
    file_ids = {}
    with Session(engine) as session, session.begin():
        session.add(project)
        session.flush()
        for kind, display_name, body in samples:
            file_id = uuid.uuid4()
            key = f"projects/{project.id}/files/{file_id}"
            digest = hashlib.sha256(body).hexdigest()
            client.put_object(Bucket=bucket, Key=key, Body=body, Metadata={"sha256": digest})
            row = StoredFile(
                id=file_id, project_id=project.id, kind=kind, publication_state="published",
                storage_key=key, checksum_sha256=digest, size_bytes=len(body),
                mime_type="application/pdf" if display_name.endswith(".pdf") else "text/plain",
                display_name=display_name,
            )
            session.add(row)
            file_rows.append((key, body, file_id))
            file_ids[kind] = file_id
        session.flush()
        cv = CVRevision(project_id=project.id, revision=1, file_id=file_ids["cv_original"])
        job = JobRevision(
            project_id=project.id, revision=1, title="Synthetic role",
            description="Synthetic job description", content_file_id=file_ids["job_source"],
        )
        document = Document(project_id=project.id, document_type="cover_letter", title="Synthetic cover letter")
        session.add_all([cv, job, document])
        session.flush()
        document_revision = DocumentRevision(
            project_id=project.id, document_id=document.id, revision=1,
            file_id=file_ids["generated_document"], source_cv_revision_id=cv.id,
            source_job_revision_id=job.id, content_markdown="Synthetic generated cover letter preview.",
        )
        session.add(document_revision)
        session.add(OwnerSession(session_hash=b"s" * 32, csrf_hash=b"c" * 32, expires_at=backup.datetime.now(backup.timezone.utc)))
        session.add(OwnerLaunchNonce(nonce_hash=b"n" * 32, origin="http://127.0.0.1:8000", expires_at=backup.datetime.now(backup.timezone.utc)))
        session.add(Grant(
            project_id=project.id, token_hash=b"g" * 32, capabilities=["read"],
            expires_at=backup.datetime.now(backup.timezone.utc),
        ))
        provider = ProviderConfiguration(
            project_id=project.id, provider="openai", model="synthetic-model",
            secret_reference="source-keychain-reference", revision=1,
        )
        chat = ConversationSession(project_id=project.id, title="Synthetic recovery run")
        session.add_all([provider, chat])
        session.flush()
        now = backup.datetime.now(backup.timezone.utc)
        completed = Run(
            project_id=project.id, actor_scope="owner", idempotency_key="backup-completed",
            request_digest="a" * 64, session_id=chat.id, operation="evaluate_job",
            cv_revision_id=cv.id, job_revision_id=job.id, provider_configuration_id=provider.id,
            input_snapshot={"cv_revision_id": str(cv.id), "job_revision_id": str(job.id)},
            config_snapshot={"model": "synthetic-model", "secret_reference": "run-source-keychain-reference"},
            output_language="en", status="completed", finished_at=now,
        )
        interrupted = Run(
            project_id=project.id, actor_scope="owner", idempotency_key="backup-interrupted",
            request_digest="b" * 64, session_id=chat.id, operation="evaluate_job",
            cv_revision_id=cv.id, job_revision_id=job.id, provider_configuration_id=provider.id,
            input_snapshot={"cv_revision_id": str(cv.id), "job_revision_id": str(job.id)},
            config_snapshot={"model": "synthetic-model", "secret_reference": "run-source-keychain-reference"},
            output_language="en", status="interrupted", finished_at=now,
        )
        session.add_all([completed, interrupted])
        session.flush()
        session.add(RunArtifact(
            project_id=project.id, run_id=completed.id,
            file_id=file_ids["generated_document"], document_revision_id=document_revision.id,
        ))
        session.flush()
        snapshot = {
            "files": file_rows,
            "runs": {"completed": completed.id, "interrupted": interrupted.id},
            "provider": provider.id,
            "document_revision": document_revision.id,
        }
    return snapshot


def _backup_args(engine, bucket: str, archive: Path):
    return Namespace(
        archive=archive, private_dir=PRIVATE_DIR, database=engine.url.database, bucket=bucket,
        postgres_port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")),
        minio_port=int(os.environ.get("CORE02_MINIO_PORT", "59000")),
    )


def _restore_args(archive: Path, target):
    database, bucket, _client_obj = target
    return Namespace(
        archive=archive, target_database=database, target_bucket=bucket, allow_owner_data=False,
        private_dir=PRIVATE_DIR,
        postgres_port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")),
        minio_port=int(os.environ.get("CORE02_MINIO_PORT", "59000")),
    )


@pytest.mark.integration
def test_pg_minio_backup_restores_content_auth_reset_and_keychain_invalidation(
    migrated_engine, source_bucket, empty_restore_target, tmp_path
):
    source_client, source_name = source_bucket
    target_database, target_bucket, target_client = empty_restore_target
    snapshot = _seed_snapshot(migrated_engine, source_client, source_name)
    expected = snapshot["files"]
    archive = tmp_path / "synthetic-platform-recovery.tar.gz"
    report = backup.create_backup(_backup_args(migrated_engine, source_name, archive))
    assert report["objects"] == len(expected)
    assert stat.S_IMODE(archive.stat().st_mode) == 0o600
    with psycopg.connect(
        host="127.0.0.1", port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")),
        dbname="postgres", user=_private_secret("postgres-user"),
        password=_private_secret("postgres-password"),
    ) as admin:
        assert admin.execute(
            "SELECT 1 FROM pg_database WHERE datname LIKE 'jsp_recovery_stage_%' LIMIT 1"
        ).fetchone() is None
    with tarfile.open(archive, "r:gz") as package:
        dump_path = tmp_path / "portable.dump"
        dump_path.write_bytes(package.extractfile("database.dump").read())
    portable_sql = subprocess.run(
        ["pg_restore", "--file", "-", str(dump_path)], capture_output=True, check=True,
    ).stdout
    assert b"source-keychain-reference" not in portable_sql
    assert b"run-source-keychain-reference" not in portable_sql
    assert b"restored-unconfigured:" in portable_sql

    restored = restore_script.restore(_restore_args(archive, empty_restore_target))
    assert restored["status"] == "restored"
    target_engine = create_engine(URL.create(
        "postgresql+psycopg", username=_private_secret("postgres-user"),
        password=_private_secret("postgres-password"), host="127.0.0.1",
        port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")), database=target_database,
    ))
    try:
        with Session(target_engine) as session:
            rows = session.scalars(select(StoredFile).order_by(StoredFile.display_name)).all()
            assert len(rows) == len(expected)
            assert session.scalar(select(OwnerSession.id).limit(1)) is None
            assert session.scalar(select(OwnerLaunchNonce.id).limit(1)) is None
            assert session.scalar(select(Grant.id).limit(1)) is None
            provider = session.get(ProviderConfiguration, snapshot["provider"])
            assert provider is not None
            assert provider.secret_reference == f"restored-unconfigured:{provider.id}"
            completed = session.get(Run, snapshot["runs"]["completed"])
            interrupted = session.get(Run, snapshot["runs"]["interrupted"])
            assert completed is not None and completed.status == "completed"
            assert interrupted is not None and interrupted.status == "interrupted"
            assert completed.config_snapshot["secret_reference"] == f"restored-unconfigured:{provider.id}"
            assert interrupted.config_snapshot["secret_reference"] == f"restored-unconfigured:{provider.id}"
            assert session.scalar(select(RunArtifact.run_id).where(
                RunArtifact.run_id == completed.id,
                RunArtifact.file_id == expected[2][2],
                RunArtifact.document_revision_id == snapshot["document_revision"],
            )) == completed.id

        # A retry is a new run after the owner creates a fresh session and
        # provider configuration on the destination machine.
        with Session(target_engine) as session, session.begin():
            old_run = session.get(Run, snapshot["runs"]["interrupted"])
            assert old_run is not None
            owner_session = OwnerSession(
                session_hash=b"r" * 32, csrf_hash=b"x" * 32,
                expires_at=backup.datetime.now(backup.timezone.utc) + timedelta(hours=1),
            )
            fresh_provider = ProviderConfiguration(
                project_id=old_run.project_id, provider="openai", model="synthetic-model-v2",
                secret_reference="fresh-destination-keychain-reference", revision=2,
            )
            session.add_all([owner_session, fresh_provider])
            session.flush()
            retry_request = RunRequest(
                session_id=old_run.session_id, operation=old_run.operation,
                job_revision_id=old_run.job_revision_id, cv_revision_id=old_run.cv_revision_id,
                output_language=old_run.output_language, idempotency_key="destination-manual-retry",
                retry_of_id=old_run.id,
            )
            owner_actor = Actor("owner", owner_session.id, None, None, frozenset())
            project_id = old_run.project_id
            original_cv_id = old_run.cv_revision_id
            original_job_id = old_run.job_revision_id
            old_id = old_run.id
        retry = asyncio.run(RunService(sessionmaker(bind=target_engine, expire_on_commit=False)).submit(
            owner_actor, project_id, retry_request,
        ))
        assert retry.id != old_id
        assert retry.retry_of_id == old_id
        assert retry.status == "queued"
        with Session(target_engine) as session:
            retried = session.get(Run, retry.id)
            assert retried is not None
            assert retried.cv_revision_id == original_cv_id
            assert retried.job_revision_id == original_job_id
            assert retried.provider_configuration_id != snapshot["provider"]
            assert retried.config_snapshot["secret_reference"] == "fresh-destination-keychain-reference"
            assert session.scalar(select(CVRevision.file_id).limit(1)) is not None
            assert session.scalar(select(JobRevision.content_file_id).limit(1)) is not None
            document_revision = session.scalar(select(DocumentRevision).limit(1))
            assert document_revision is not None
            assert document_revision.content_markdown == "Synthetic generated cover letter preview."
        by_key = {key: body for key, body, _file_id in expected}
        for row in rows:
            response = target_client.get_object(Bucket=target_bucket, Key=row.storage_key)
            body = response["Body"].read()
            assert body == by_key[row.storage_key]
            assert hashlib.sha256(body).hexdigest() == row.checksum_sha256
    finally:
        target_engine.dispose()


@pytest.mark.integration
@pytest.mark.parametrize("damage", ["missing", "tampered"])
def test_restore_rejects_missing_or_tampered_manifest_objects_before_serving(
    migrated_engine, source_bucket, empty_restore_target, tmp_path, damage
):
    source_client, source_name = source_bucket
    target_database, target_bucket, target_client = empty_restore_target
    _seed_snapshot(migrated_engine, source_client, source_name)
    valid_archive = tmp_path / "valid.tar.gz"
    backup.create_backup(_backup_args(migrated_engine, source_name, valid_archive))
    damaged_archive = tmp_path / f"{damage}.tar.gz"
    with tarfile.open(valid_archive, "r:gz") as source:
        members = source.getmembers()
        with tarfile.open(damaged_archive, "w:gz") as destination:
            changed = False
            for member in members:
                if member.name.startswith("objects/") and damage == "missing":
                    continue
                stream = source.extractfile(member)
                data = stream.read() if stream is not None else b""
                if member.name.startswith("objects/") and damage == "tampered" and not changed:
                    data = data + b"tamper"
                    member.size = len(data)
                    changed = True
                import io

                destination.addfile(member, io.BytesIO(data) if member.isfile() else None)
    damaged_archive.chmod(0o600)
    with pytest.raises(restore_script.RecoveryError):
        restore_script.restore(_restore_args(damaged_archive, empty_restore_target))
    target_engine = create_engine(URL.create(
        "postgresql+psycopg", username=_private_secret("postgres-user"),
        password=_private_secret("postgres-password"), host="127.0.0.1",
        port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")), database=target_database,
    ))
    try:
        with target_engine.connect() as connection:
            assert connection.execute(__import__("sqlalchemy").text(
                "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')"
            )).scalar_one() == 0
        assert target_client.list_objects_v2(Bucket=target_bucket).get("KeyCount", 0) == 0
    finally:
        target_engine.dispose()


@pytest.mark.integration
def test_restore_refuses_nonempty_object_target_without_overwriting(migrated_engine, source_bucket, empty_restore_target, tmp_path):
    source_client, source_name = source_bucket
    _target_database, target_bucket, target_client = empty_restore_target
    _seed_snapshot(migrated_engine, source_client, source_name)
    archive = tmp_path / "valid.tar.gz"
    backup.create_backup(_backup_args(migrated_engine, source_name, archive))
    target_client.put_object(Bucket=target_bucket, Key="sentinel", Body=b"synthetic existing data")
    with pytest.raises(restore_script.RecoveryError, match="restore_bucket_target_must_be_empty"):
        restore_script.restore(_restore_args(archive, empty_restore_target))
    assert target_client.get_object(Bucket=target_bucket, Key="sentinel")["Body"].read() == b"synthetic existing data"


@pytest.mark.integration
def test_failed_restore_quarantines_target_until_a_verified_retry(
    migrated_engine, source_bucket, empty_restore_target, tmp_path, monkeypatch
):
    source_client, source_name = source_bucket
    target_database, target_bucket, target_client = empty_restore_target
    _seed_snapshot(migrated_engine, source_client, source_name)
    archive = tmp_path / "valid.tar.gz"
    backup.create_backup(_backup_args(migrated_engine, source_name, archive))
    original_client_factory = restore_script.backup_support._s3

    class FailsAfterOneObject:
        def __init__(self):
            self.calls = 0

        def __getattr__(self, name):
            return getattr(target_client, name)

        def put_object(self, **kwargs):
            self.calls += 1
            if self.calls == 2:
                raise RuntimeError("synthetic object-store write failure")
            return target_client.put_object(**kwargs)

    monkeypatch.setattr(restore_script.backup_support, "_s3", lambda _private_dir, _args: FailsAfterOneObject())
    with pytest.raises(RuntimeError, match="synthetic object-store write failure"):
        restore_script.restore(_restore_args(archive, empty_restore_target))

    target_url = URL.create(
        "postgresql+psycopg", username=_private_secret("postgres-user"),
        password=_private_secret("postgres-password"), host="127.0.0.1",
        port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")), database=target_database,
    ).render_as_string(hide_password=True)
    with pytest.raises(ServiceError, match="restore_incomplete"):
        assert_restore_ready(PRIVATE_DIR, target_url, target_bucket)
    assert target_client.list_objects_v2(Bucket=target_bucket).get("KeyCount", 0) == 0

    monkeypatch.setattr(restore_script.backup_support, "_s3", original_client_factory)
    assert restore_script.restore(_restore_args(archive, empty_restore_target))["status"] == "restored"
    assert_restore_ready(PRIVATE_DIR, target_url, target_bucket)
