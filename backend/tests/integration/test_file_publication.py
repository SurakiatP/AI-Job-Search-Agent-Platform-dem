from __future__ import annotations

import hashlib
import json
import os
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import boto3
import pytest
from botocore.config import Config
from sqlalchemy import event, select
from sqlalchemy.orm import Session, sessionmaker

from helpers import grant, owner, project, provider_config, revisions, session
from job_search_platform.db.models import (
    CVRevision,
    Document,
    DocumentRevision,
    Grant,
    Run,
    RunArtifact,
    StoredFile,
)
from job_search_platform.integrations.hermes_runtime import ParsedInput
from job_search_platform.integrations.hermes_runtime import HermesRuntime
from job_search_platform.integrations.object_store import S3ObjectStore
from job_search_platform.services.documents import Artifacts, Documents, _lease_matches
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.files import Files, StorageCommitError


def _secret(name: str) -> str:
    private_dir = Path(
        os.environ.get(
            "CORE02_PRIVATE_DIR",
            Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003",
        )
    )
    path = private_dir / name
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise RuntimeError("test_infrastructure_credentials_unavailable")
    return path.read_text(encoding="utf-8").strip()


@pytest.mark.parametrize(
    ("persisted_owner", "manifest_owner"),
    [
        ("", ""),
        ("", "synthetic-worker"),
        ("synthetic-worker", ""),
        (" ", " "),
    ],
)
def test_blank_lease_owner_cannot_establish_publication_provenance(
    persisted_owner: str, manifest_owner: str
):
    now = datetime.now(timezone.utc)
    run = Run(lease_owner=persisted_owner, lease_expires_at=now + timedelta(minutes=1))

    assert not _lease_matches(run, manifest_owner, now, require_unexpired=True)


@pytest.fixture
def private_bucket():
    port = int(os.environ.get("CORE02_MINIO_PORT", "59000"))
    client = boto3.client(
        "s3",
        endpoint_url=f"http://127.0.0.1:{port}",
        aws_access_key_id=_secret("minio-access-key"),
        aws_secret_access_key=_secret("minio-secret-key"),
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    bucket = f"jsp-core05-{os.urandom(12).hex()}"
    client.create_bucket(Bucket=bucket)
    yield S3ObjectStore(client, bucket), client, bucket
    response = client.list_objects_v2(Bucket=bucket)
    for item in response.get("Contents", []):
        client.delete_object(Bucket=bucket, Key=item["Key"])
    client.delete_bucket(Bucket=bucket)


class _SyntheticSandboxParser:
    """Only synthetic bytes enter this test parser; production uses HermesRuntime."""

    def __init__(self, workspace: Path) -> None:
        self.projects = {}
        self.workspace = workspace

    async def parse_input(self, project_id: UUID, path: str) -> ParsedInput:
        body = (self.projects[project_id].workspace / path).read_bytes()
        kind = "pdf" if body.startswith(b"%PDF-") else "docx" if body.startswith(b"PK\x03\x04") else "text"
        text = "Synthetic parsed CV" if kind != "text" else body.decode("utf-8")
        return ParsedInput(text, kind, hashlib.sha256(body).hexdigest())


@pytest.fixture
def publication_context(db_session, private_bucket, tmp_path):
    store, client, bucket = private_bucket
    actor = owner(db_session)
    project_row = project(db_session)
    workspace = tmp_path / "parse-workspace"
    (workspace / "inputs").mkdir(parents=True)
    parser = _SyntheticSandboxParser(workspace)
    parser.projects[project_row.id] = type("Project", (), {"workspace": workspace})()
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    files = Files(sessions, store, parser)
    return db_session, sessions, actor, project_row.id, files, store, client, bucket, tmp_path


@pytest.mark.integration
@pytest.mark.asyncio
async def test_upload_uses_a_dedicated_real_native_parse_runtime(publication_context):
    _db, _sessions, actor, project_id, files, _store, _client, _bucket, _tmp = publication_context
    metadata = Path.home() / ".cache" / "job-search-platform" / "hermes-runtime.json"
    if metadata.is_symlink() or not metadata.is_file():
        pytest.fail("verified_native_runtime_metadata_unavailable")
    config = json.loads(metadata.read_text(encoding="utf-8"))
    parser = HermesRuntime(
        config["image"],
        environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
    )
    files.parser = parser
    body = Path(__file__).resolve().parents[1] / "fixtures" / "synthetic_cv.txt"

    uploaded = await files.upload(
        actor,
        project_id,
        _bytes(body.read_bytes()),
        "text/plain",
        "synthetic-cv.txt",
    )

    assert uploaded.publication_state == "published"
    assert uploaded.kind == "cv_original"
    assert parser.projects == {}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_upload_publishes_only_after_private_s3_round_trip(publication_context):
    db, sessions, actor, project_id, files, store, client, bucket, _tmp = publication_context
    body = b"Synthetic CV for CORE-05\n"

    uploaded = await files.upload(actor, project_id, _bytes(body), "text/plain", "synthetic-cv.txt")

    assert uploaded.publication_state == "published"
    row = db.get(StoredFile, uploaded.id)
    stored = client.get_object(Bucket=bucket, Key=row.storage_key)["Body"].read()
    assert stored == body
    assert hashlib.sha256(stored).hexdigest() == uploaded.checksum_sha256
    assert len(await files.list_ready(actor, project_id)) == 1
    assert db.scalar(select(CVRevision).where(CVRevision.project_id == project_id)).file_id == uploaded.id
    anonymous = boto3.client(
        "s3",
        endpoint_url=client.meta.endpoint_url,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    with pytest.raises(Exception):
        anonymous.get_object(Bucket=bucket, Key=row.storage_key)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_uploads_get_distinct_immutable_cv_revisions(publication_context):
    db, _sessions, actor, project_id, files, _store, _client, _bucket, _tmp = publication_context

    results = await asyncio.gather(
        files.upload(actor, project_id, _bytes(b"Synthetic CV one\n"), "text/plain", "one.txt"),
        files.upload(actor, project_id, _bytes(b"Synthetic CV two\n"), "text/plain", "two.txt"),
    )

    assert all(result.publication_state == "published" for result in results)
    revisions_for_project = list(
        db.scalars(
            select(CVRevision)
            .where(CVRevision.project_id == project_id)
            .order_by(CVRevision.revision)
        )
    )
    assert [revision.revision for revision in revisions_for_project] == [1, 2]
    assert {revision.file_id for revision in revisions_for_project} == {result.id for result in results}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_ready_commit_failure_keeps_object_inaccessible_until_verified_reconcile(
    publication_context,
):
    db, _sessions, actor, project_id, files, _store, _client, _bucket, _tmp = publication_context
    body = b"Synthetic CV with failed ready commit\n"

    def fail_published_commit(_conn, _cursor, statement, _parameters, _context, _many) -> None:
        if statement.lstrip().upper().startswith("UPDATE FILES "):
            raise RuntimeError("injected_synthetic_commit_failure")

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", fail_published_commit)
    try:
        with pytest.raises(StorageCommitError):
            await files.upload(actor, project_id, _bytes(body), "text/plain", "cv.txt")
    finally:
        event.remove(engine, "before_cursor_execute", fail_published_commit)

    pending = db.scalar(
        select(StoredFile).where(
            StoredFile.project_id == project_id,
            StoredFile.publication_state == "pending",
        )
    )
    assert pending is not None
    assert await files.list_ready(actor, project_id) == []
    assert await files.reconcile_pending() == 1
    assert [row.id for row in await files.list_ready(actor, project_id)] == [pending.id]
    assert db.scalar(
        select(CVRevision).where(CVRevision.project_id == project_id, CVRevision.file_id == pending.id)
    ) is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_grant_cannot_read_raw_upload_or_learn_its_metadata(publication_context):
    db, _sessions, owner_actor, project_id, files, _store, _client, _bucket, _tmp = publication_context
    uploaded = await files.upload(
        owner_actor, project_id, _bytes(b"private synthetic CV\n"), "text/plain", "private.txt"
    )
    grant_actor, _ = grant(db, project_id, capabilities=("results:read",))
    db.commit()

    assert await files.list_ready(grant_actor, project_id) == []
    with pytest.raises(ServiceError) as error:
        async for _chunk in files.download_stream(grant_actor, project_id, uploaded.id):
            pass
    assert error.value.code == "forbidden"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_foreign_project_grant_cannot_list_or_read_any_files(publication_context):
    db, _sessions, owner_actor, project_id, files, _store, _client, _bucket, _tmp = publication_context
    await files.upload(
        owner_actor, project_id, _bytes(b"Synthetic scoped CV\n"), "text/plain", "cv.txt"
    )
    foreign = project(db, "Other Synthetic Project")
    grant_actor, _ = grant(db, project_id, capabilities=("results:read",))
    db.commit()

    with pytest.raises(ServiceError) as error:
        await files.list_ready(grant_actor, foreign.id)
    assert error.value.code == "not_found"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_reconcile_missing_object_marks_unavailable_and_keeps_revision_reference(
    publication_context,
):
    db, _sessions, actor, project_id, files, _store, client, bucket, _tmp = publication_context
    uploaded = await files.upload(actor, project_id, _bytes(b"missing object CV\n"), "text/plain", "cv.txt")
    row = db.get(StoredFile, uploaded.id)
    client.delete_object(Bucket=bucket, Key=row.storage_key)
    row.publication_state = "pending"
    db.commit()

    assert await files.reconcile_pending() == 0
    db.refresh(row)
    assert row.publication_state == "unavailable"
    assert db.scalar(
        select(CVRevision.id).where(
            CVRevision.project_id == project_id, CVRevision.file_id == uploaded.id
        )
    ) is not None
    with pytest.raises(ServiceError) as error:
        async for _chunk in files.download_stream(actor, project_id, uploaded.id):
            pass
    assert error.value.code == "not_found"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_corrupt_object_is_never_streamed_and_file_history_is_preserved(
    publication_context,
):
    db, _sessions, actor, project_id, files, _store, client, bucket, _tmp = publication_context
    uploaded = await files.upload(
        actor, project_id, _bytes(b"original synthetic bytes\n"), "text/plain", "cv.txt"
    )
    row = db.get(StoredFile, uploaded.id)
    client.put_object(Bucket=bucket, Key=row.storage_key, Body=b"corrupted synthetic data\n")

    with pytest.raises(ServiceError) as error:
        async for _chunk in files.download_stream(actor, project_id, uploaded.id):
            pass

    assert error.value.code == "file_integrity_failed"
    db.refresh(row)
    assert row.publication_state == "unavailable"
    assert db.scalar(
        select(CVRevision.id).where(
            CVRevision.project_id == project_id, CVRevision.file_id == uploaded.id
        )
    ) is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_artifact_publish_validates_staging_and_separates_generated_cv_from_base_cv(
    publication_context,
):
    db, sessions, owner_actor, project_id, files, store, _client, _bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    body = b"%PDF-1.7\nSynthetic generated CV\n%%EOF\n"
    output = staging / "cv-draft.pdf"
    output.write_bytes(body)
    manifest = _manifest(staging, output, cv.id, run.job_revision_id)
    artifacts = Artifacts(sessions, store, lambda _project_id, _run_id: staging)

    published = await artifacts.publish(project_id, run.id, manifest)

    assert len(published) == 1
    assert published[0].kind == "generated_document"
    assert published[0].mime_type == "application/pdf"
    assert published[0].publication_state == "published"
    revision = db.scalar(
        select(DocumentRevision).where(
            DocumentRevision.project_id == project_id,
            DocumentRevision.file_id == published[0].id,
        )
    )
    document = db.get(Document, revision.document_id)
    assert document.document_type == "cv"
    assert revision.source_cv_revision_id == cv.id
    assert db.scalar(select(RunArtifact).where(RunArtifact.run_id == run.id)).file_id == published[0].id
    assert len(list(db.scalars(select(CVRevision).where(CVRevision.project_id == project_id)))) == 1
    docs = await Documents(sessions, store).list_ready(owner_actor, project_id)
    assert len(docs) == 1 and docs[0].document_type == "cv"
    assert b"".join([chunk async for chunk in files.download_stream(owner_actor, project_id, published[0].id)]) == body


@pytest.mark.integration
@pytest.mark.asyncio
async def test_running_draft_without_a_lease_cannot_publish_artifact(publication_context):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.lease_owner = None
    run.lease_expires_at = None
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\nsynthetic unclaimed output\n%%EOF\n")
    manifest = _manifest(staging, output, cv.id, run.job_revision_id)

    with pytest.raises(ServiceError) as error:
        await Artifacts(sessions, store, lambda _project_id, _run_id: staging).publish(
            project_id, run.id, manifest
        )

    assert error.value.code == "run_not_publishable"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_artifact_symlink_is_rejected_before_any_object_or_metadata_publication(
    publication_context,
):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF-1.7\nprivate synthetic output\n%%EOF\n")
    link = staging / "escaped.pdf"
    link.symlink_to(outside)
    manifest = _manifest(staging, link, cv.id, run.job_revision_id)
    artifacts = Artifacts(sessions, store, lambda _project_id, _run_id: staging)

    with pytest.raises(ServiceError) as error:
        await artifacts.publish(project_id, run.id, manifest)

    assert error.value.code == "artifact_path_invalid"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_artifact_hardlink_and_manifest_traversal_are_rejected(publication_context):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF-1.7\nsynthetic output\n%%EOF\n")
    hardlink = staging / "linked.pdf"
    os.link(outside, hardlink)
    artifacts = Artifacts(sessions, store, lambda _project_id, _run_id: staging)

    with pytest.raises(ServiceError) as hardlink_error:
        await artifacts.publish(
            project_id,
            run.id,
            _manifest(staging, hardlink, cv.id, run.job_revision_id),
        )
    assert hardlink_error.value.code == "artifact_path_invalid"

    traversal = _manifest(staging, hardlink, cv.id, run.job_revision_id)
    traversal["files"][0]["path"] = "../outside.pdf"
    with pytest.raises(ServiceError) as traversal_error:
        await artifacts.publish(project_id, run.id, traversal)
    assert traversal_error.value.code == "artifact_manifest_invalid"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancelled_run_cannot_publish_staged_output(publication_context):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.cancellation_requested_at = datetime.now(timezone.utc)
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\nsynthetic cancelled output\n%%EOF\n")
    manifest = _manifest(staging, output, cv.id, run.job_revision_id)

    with pytest.raises(ServiceError) as error:
        await Artifacts(sessions, store, lambda _project_id, _run_id: staging).publish(
            project_id, run.id, manifest
        )

    assert error.value.code == "run_not_publishable"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_expired_claim_cannot_reserve_artifact_metadata(publication_context):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.lease_owner = "synthetic-worker-1"
    run.lease_expires_at = datetime.now(timezone.utc).replace(microsecond=0)
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\nexpired lease output\n%%EOF\n")
    manifest = _manifest(
        staging, output, cv.id, run.job_revision_id, lease_owner="synthetic-worker-1"
    )

    with pytest.raises(ServiceError) as error:
        await Artifacts(sessions, store, lambda _project_id, _run_id: staging).publish(
            project_id, run.id, manifest
        )

    assert error.value.code == "run_not_publishable"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_artifact_claim_owner_must_match_persisted_run_lease(publication_context):
    db, sessions, _owner_actor, project_id, _files, store, client, bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.lease_owner = "synthetic-worker-current"
    run.lease_expires_at = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=5)
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\nwrong worker output\n%%EOF\n")
    manifest = _manifest(
        staging, output, cv.id, run.job_revision_id, lease_owner="synthetic-worker-old"
    )

    with pytest.raises(ServiceError) as error:
        await Artifacts(sessions, store, lambda _project_id, _run_id: staging).publish(
            project_id, run.id, manifest
        )

    assert error.value.code == "run_not_publishable"
    assert db.scalar(select(StoredFile).where(StoredFile.project_id == project_id)) is None
    assert client.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_lease_expiring_after_object_write_leaves_pending_output_unavailable(
    publication_context,
):
    db, sessions, owner_actor, project_id, files, store, _client, _bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.lease_owner = "synthetic-worker-current"
    run.lease_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\noutput from current worker\n%%EOF\n")
    manifest = _manifest(
        staging, output, cv.id, run.job_revision_id, lease_owner="synthetic-worker-current"
    )

    class ExpireLeaseAfterWrite:
        async def put(self, key: str, body: bytes, checksum: str) -> None:
            await store.put(key, body, checksum)
            with sessions.begin() as active_db:
                active_run = active_db.scalar(
                    select(Run).where(Run.project_id == project_id, Run.id == run.id).with_for_update()
                )
                active_run.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    with pytest.raises(StorageCommitError):
        await Artifacts(
            sessions,
            ExpireLeaseAfterWrite(),
            lambda _project_id, _run_id: staging,
        ).publish(project_id, run.id, manifest)

    pending = db.scalar(
        select(StoredFile).where(
            StoredFile.project_id == project_id,
            StoredFile.kind == "generated_document",
            StoredFile.publication_state == "pending",
        )
    )
    assert pending is not None
    association = db.scalar(select(RunArtifact).where(RunArtifact.file_id == pending.id))
    assert association.lease_owner == "synthetic-worker-current"
    assert await files.reconcile_pending() == 0
    db.refresh(pending)
    assert pending.publication_state == "unavailable"
    assert await Documents(sessions, store).list_ready(owner_actor, project_id) == []


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_status", ["failed", "cancelled", "interrupted"])
async def test_terminal_run_output_stays_unavailable_after_object_write(
    publication_context, terminal_status
):
    db, sessions, owner_actor, project_id, files, store, _client, _bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    run.lease_owner = "synthetic-worker-current"
    run.lease_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.commit()
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    output = staging / "cv.pdf"
    output.write_bytes(b"%PDF-1.7\nterminal synthetic output\n%%EOF\n")
    manifest = _manifest(
        staging, output, cv.id, run.job_revision_id, lease_owner="synthetic-worker-current"
    )

    class TerminalRunAfterWrite:
        async def put(self, key: str, body: bytes, checksum: str) -> None:
            await store.put(key, body, checksum)
            with sessions.begin() as active_db:
                active_run = active_db.scalar(
                    select(Run).where(Run.project_id == project_id, Run.id == run.id).with_for_update()
                )
                active_run.status = terminal_status
                if terminal_status == "cancelled":
                    active_run.cancellation_requested_at = datetime.now(timezone.utc)

    with pytest.raises(StorageCommitError):
        await Artifacts(
            sessions,
            TerminalRunAfterWrite(),
            lambda _project_id, _run_id: staging,
        ).publish(project_id, run.id, manifest)

    pending = db.scalar(
        select(StoredFile).where(
            StoredFile.project_id == project_id,
            StoredFile.kind == "generated_document",
            StoredFile.publication_state == "pending",
        )
    )
    assert pending is not None
    assert await files.reconcile_pending() == 0
    db.refresh(pending)
    assert pending.publication_state == "unavailable"
    assert await Documents(sessions, store).list_ready(owner_actor, project_id) == []


@pytest.mark.integration
@pytest.mark.asyncio
async def test_results_grant_is_rechecked_between_generated_file_chunks(publication_context):
    db, sessions, _owner_actor, project_id, files, store, _client, _bucket, tmp_path = publication_context
    run, cv = _draft_run(db, project_id)
    staging = tmp_path / "staging" / str(project_id) / str(run.id)
    staging.mkdir(parents=True)
    body = b"%PDF-1.7\n" + b"x" * (70 * 1024) + b"\n%%EOF\n"
    output = staging / "cover-letter.pdf"
    output.write_bytes(body)
    manifest = _manifest(
        staging,
        output,
        cv.id,
        run.job_revision_id,
        document_type="cover_letter",
        title="Synthetic cover letter",
    )
    await Artifacts(sessions, store, lambda _project_id, _run_id: staging).publish(
        project_id, run.id, manifest
    )
    generated = db.scalar(
        select(StoredFile).where(
            StoredFile.project_id == project_id, StoredFile.kind == "generated_document"
        )
    )
    grant_actor, grant_row = grant(db, project_id, capabilities=("results:read",))
    db.commit()
    stream = files.download_stream(grant_actor, project_id, generated.id)
    assert len(await anext(stream)) == 64 * 1024
    grant_row.revoked_at = datetime.now(timezone.utc)
    db.commit()

    with pytest.raises(ServiceError) as error:
        await anext(stream)
    assert error.value.code == "unauthorized"
    await stream.aclose()


def _bytes(body: bytes):
    import io

    return io.BytesIO(body)


def _draft_run(db: Session, project_id: UUID):
    cv, job = revisions(db, project_id)
    owner_actor = owner(db)
    session_row = session(db, project_id)
    config = provider_config(db, project_id)
    run = Run(
        project_id=project_id,
        actor_scope=str(owner_actor.owner_session_id),
        idempotency_key=f"core05-{os.urandom(6).hex()}",
        request_digest=hashlib.sha256(os.urandom(16)).hexdigest(),
        session_id=session_row.id,
        operation="draft_documents",
        cv_revision_id=cv.id,
        job_revision_id=job.id,
        provider_configuration_id=config.id,
        input_snapshot={"cv_revision_id": str(cv.id), "job_revision_id": str(job.id)},
        config_snapshot={"provider": "synthetic", "model": "test-model"},
        output_language="en",
        status="running",
        lease_owner="synthetic-worker-current",
        lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(run)
    db.commit()
    return run, cv


def _manifest(
    staging: Path,
    output: Path,
    cv_revision_id: UUID,
    job_revision_id: UUID,
    *,
    document_type: str = "cv",
    title: str = "Synthetic generated CV",
    lease_owner: str | None = "synthetic-worker-current",
):
    body = output.read_bytes()
    manifest = {
        "staging_dir": str(staging),
        "files": [
            {
                "path": output.name,
                "document_type": document_type,
                "title": title,
                "display_name": output.name,
                "mime_type": "application/pdf",
                "sha256": hashlib.sha256(body).hexdigest(),
                "source_cv_revision_id": str(cv_revision_id),
                "source_job_revision_id": str(job_revision_id),
            }
        ],
    }
    if lease_owner is not None:
        manifest["lease_owner"] = lease_owner
    return manifest
