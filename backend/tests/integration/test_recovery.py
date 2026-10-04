from __future__ import annotations

import hashlib
import os
import asyncio
import json
import shutil
import uuid
from argparse import Namespace
from datetime import datetime, timezone
from pathlib import Path
import sys

import boto3
import pytest
from botocore.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from conftest import PRIVATE_DIR, _private_secret
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from job_search_platform.db.models import (
    CVRevision, ConversationSession, Document, DocumentRevision, JobRevision, Project, ProviderConfiguration,
    Run, RunArtifact, RunEvent, StoredFile,
)
from job_search_platform.integrations.hermes_runtime import HermesRuntime
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.maintenance import acquire_maintenance_lock
from scripts import backup
from helpers import owner, project, provider_config, revisions, run_request, session as conversation_session


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
def recovery_bucket():
    client = _client()
    bucket = f"jsp-core10-backup-{uuid.uuid4().hex}"
    client.create_bucket(Bucket=bucket)
    yield client, bucket
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            client.delete_object(Bucket=bucket, Key=item["Key"])
    client.delete_bucket(Bucket=bucket)


def _args(engine, bucket: str, archive: Path):
    return Namespace(
        archive=archive,
        private_dir=PRIVATE_DIR,
        database=engine.url.database,
        bucket=bucket,
        postgres_port=int(os.environ.get("CORE02_POSTGRES_PORT", "55432")),
        minio_port=int(os.environ.get("CORE02_MINIO_PORT", "59000")),
    )


@pytest.mark.integration
def test_backup_cannot_race_a_live_application_maintenance_lock(migrated_engine, recovery_bucket, tmp_path):
    _client_obj, bucket = recovery_bucket
    archive = tmp_path / "live-app.tar.gz"
    target = str(migrated_engine.url)
    with acquire_maintenance_lock(PRIVATE_DIR, target, bucket):
        with pytest.raises(ServiceError, match="maintenance_active"):
            backup.create_backup(_args(migrated_engine, bucket, archive))
    assert not archive.exists()


@pytest.mark.integration
def test_backup_rejects_missing_or_tampered_published_objects(migrated_engine, recovery_bucket, tmp_path):
    client, bucket = recovery_bucket
    project = Project(name="Synthetic recovery proof")
    body = b"synthetic CV content for checksum validation"
    file_id = uuid.uuid4()
    key = f"projects/{uuid.uuid4()}/files/{file_id}"
    with Session(migrated_engine) as session, session.begin():
        session.add(project)
        session.flush()
        session.add(StoredFile(
            id=file_id, project_id=project.id, kind="cv_original", publication_state="published",
            storage_key=key, checksum_sha256=hashlib.sha256(body).hexdigest(), size_bytes=len(body),
            mime_type="text/plain", display_name="synthetic-cv.txt",
        ))
    client.put_object(Bucket=bucket, Key=key, Body=b"tampered synthetic data")
    archive = tmp_path / "must-not-exist.tar.gz"
    with pytest.raises(backup.RecoveryError, match="stored_object_checksum_mismatch"):
        backup.create_backup(_args(migrated_engine, bucket, archive))
    assert not archive.exists()
    client.delete_object(Bucket=bucket, Key=key)
    with pytest.raises(backup.RecoveryError, match="stored_object_unavailable"):
        backup.create_backup(_args(migrated_engine, bucket, archive))
    assert not archive.exists()


@pytest.mark.integration
def test_running_native_execution_prevents_capture(migrated_engine, recovery_bucket, tmp_path):
    _client_obj, bucket = recovery_bucket
    project = Project(name="Synthetic active run")
    with Session(migrated_engine) as session, session.begin():
        session.add(project)
        session.flush()
        conversation = ConversationSession(project_id=project.id)
        cv = CVRevision(project_id=project.id, revision=1)
        job = JobRevision(project_id=project.id, revision=1, title="Synthetic role", description="Synthetic description")
        provider = ProviderConfiguration(
            project_id=project.id, provider="openai", model="synthetic-model",
            secret_reference="synthetic-keychain-ref", revision=1,
        )
        session.add_all([conversation, cv, job, provider])
        session.flush()
        session.add(Run(
            project_id=project.id,
            actor_scope="owner",
            idempotency_key="synthetic-active-run",
            request_digest="a" * 64,
            session_id=conversation.id,
            operation="evaluate_job",
            cv_revision_id=cv.id,
            job_revision_id=job.id,
            provider_configuration_id=provider.id,
            input_snapshot={},
            config_snapshot={},
            output_language="en",
            status="running",
            active_seconds=0,
            tool_calls=0,
        ))
    archive = tmp_path / "active-run.tar.gz"
    with pytest.raises(backup.RecoveryError, match="active_execution_requires_graceful_app_shutdown"):
        backup.create_backup(_args(migrated_engine, bucket, archive))
    assert not archive.exists()


@pytest.mark.integration
def test_backup_marks_queued_runs_interrupted_before_dump(migrated_engine, recovery_bucket, tmp_path):
    _client_obj, bucket = recovery_bucket
    sessions = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        db_project = project(db, "Synthetic queued recovery")
        conversation = conversation_session(db, db_project.id)
        cv, job = revisions(db, db_project.id)
        provider_config(db, db_project.id)
    service = __import__("job_search_platform.services.runs", fromlist=["RunService"]).RunService(sessions)
    queued = asyncio.run(service.submit(
        actor, db_project.id,
        run_request(conversation.id, job.id, cv_revision_id=cv.id, key=f"queued-{uuid.uuid4()}"),
    ))
    archive = tmp_path / "queued-interrupted.tar.gz"
    result = backup.create_backup(_args(migrated_engine, bucket, archive))
    assert result["status"] == "created"
    with sessions() as db:
        interrupted = db.get(Run, queued.id)
        assert interrupted.status == "interrupted"
        assert interrupted.finished_at is not None
        last_event = db.scalar(
            select(RunEvent.event_type).where(RunEvent.run_id == queued.id)
            .order_by(RunEvent.sequence.desc()).limit(1)
        )
        assert last_event == "run_interrupted"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_backend_bridge_loss_interrupts_native_run_preserves_completed_output_and_requires_manual_retry(
    migrated_engine, recovery_bucket
):
    client, bucket = recovery_bucket
    sessions = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        db_project = project(db, "Synthetic crash recovery")
        conversation = conversation_session(db, db_project.id)
        cv, job = revisions(db, db_project.id)
        provider_config(db, db_project.id)
    service_module = __import__("job_search_platform.services.runs", fromlist=["RunService"])
    service = service_module.RunService(sessions)
    completed = await service.submit(
        actor, db_project.id,
        run_request(conversation.id, job.id, cv_revision_id=cv.id, key=f"completed-{uuid.uuid4()}"),
    )
    output = b"%PDF-1.4\nsynthetic previously published output\n%%EOF"
    file_id = uuid.uuid4()
    key = f"projects/{db_project.id}/files/{file_id}"
    digest = hashlib.sha256(output).hexdigest()
    client.put_object(Bucket=bucket, Key=key, Body=output, Metadata={"sha256": digest})
    with sessions.begin() as db:
        completed_row = db.get(Run, completed.id)
        completed_row.status = "completed"
        completed_row.finished_at = datetime.now(timezone.utc)
        stored = StoredFile(
            id=file_id, project_id=db_project.id, kind="generated_document", publication_state="published",
            storage_key=key, checksum_sha256=digest, size_bytes=len(output),
            mime_type="application/pdf", display_name="completed-synthetic.pdf",
        )
        document = Document(project_id=db_project.id, document_type="cover_letter", title="Synthetic completed output")
        db.add_all([stored, document])
        db.flush()
        revision = DocumentRevision(
            project_id=db_project.id, document_id=document.id, revision=1, file_id=file_id,
            source_cv_revision_id=cv.id, source_job_revision_id=job.id,
            content_markdown="Synthetic completed document preview.",
        )
        db.add(revision)
        db.flush()
        db.add(RunArtifact(
            project_id=db_project.id, run_id=completed.id, file_id=file_id,
            document_revision_id=revision.id, lease_owner="synthetic-completed-lease",
        ))

    active_request = run_request(
        conversation.id, job.id, cv_revision_id=cv.id, key=f"native-active-{uuid.uuid4()}"
    )
    active = await service.submit(actor, db_project.id, active_request)
    queue_module = __import__("job_search_platform.workers.queue", fromlist=["PostgresRunQueue"])
    queue = queue_module.PostgresRunQueue(sessions)
    lease_owner = f"core10-{uuid.uuid4()}"
    claimed = await asyncio.to_thread(queue.claim_next, lease_owner)
    assert claimed is not None and claimed.id == active.id

    runtime_config = json.loads((Path.home() / ".cache" / "job-search-platform" / "hermes-runtime.json").read_text())
    runtime_root = Path.home() / ".cache" / "job-search-platform" / "hermes-proofs" / f"core10-{uuid.uuid4()}"
    runtime = HermesRuntime(
        runtime_config["image"], environment=Path(runtime_config["environment"]),
        hermes_source=Path(runtime_config["hermes"]["source"]),
        career_ops_source=Path(runtime_config["career-ops"]["source"]), workspace_root=runtime_root,
    )
    workspace = runtime_root / str(db_project.id) / str(active.id)
    workspace.mkdir(parents=True)
    native = None
    try:
        native = await runtime.start_project(db_project.id, workspace)
        await runtime._request(
            native, "tool", name="terminal",
            command="sleep 90; printf synthetic-native-finished > /workspace/native-finished.txt",
            background=True,
        )
        container_filters = [
            "ps", "-aq", "--no-trunc", "--filter", f"label=platform.project={db_project.id}",
            "--filter", f"label=platform.run={active.id}", "--filter", f"label=platform.instance={runtime.instance_id}",
            "--filter", "label=platform.task=CORE-03",
        ]
        assert (await runtime._docker(*container_filters)).strip(), "actual isolated native execution container was not created"
        from job_search_platform.workers.supervisor import WorkerSupervisor, process_birth

        created_at = process_birth(native.process.pid)
        assert created_at is not None
        with sessions.begin() as db:
            row = db.get(Run, active.id)
            row.execution_pid = native.process.pid
            row.execution_created_at = created_at
            row.sandbox_id = str(workspace)
            row.adapter_instance_id = runtime.instance_id

        # Simulate abrupt backend/bridge loss. Startup reconciliation has the
        # persisted exact process and container identities and must stop them.
        native.process.kill()
        await native.process.wait()
        supervisor = WorkerSupervisor(sessions, queue, object(), runtime)
        await supervisor.reconcile_startup()
        with sessions() as db:
            interrupted = db.get(Run, active.id)
            assert interrupted.status == "interrupted"
            assert interrupted.finished_at is not None
            assert db.get(Run, completed.id).status == "completed"
            assert db.get(StoredFile, file_id).publication_state == "published"
            assert db.get(RunArtifact, (completed.id, file_id)) is not None
        response = client.get_object(Bucket=bucket, Key=key)
        assert response["Body"].read() == output
        assert not (workspace / "native-finished.txt").exists()
        assert not (await runtime._docker(*container_filters)).strip()
        with sessions() as db:
            assert db.scalar(select(Run.id).where(Run.status == "queued")) is None

        manual_retry = await service.submit(
            actor, db_project.id,
            active_request.model_copy(update={"retry_of_id": active.id, "idempotency_key": f"manual-{uuid.uuid4()}"}),
        )
        assert manual_retry.id != active.id
        assert manual_retry.retry_of_id == active.id
        assert manual_retry.status == "queued"
    finally:
        if native is not None:
            try:
                await runtime.close(db_project.id)
            finally:
                shutil.rmtree(runtime_root, ignore_errors=True)
