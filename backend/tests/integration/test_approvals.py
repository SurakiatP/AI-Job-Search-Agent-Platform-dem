"""Approval revision, expiry, replay, and concurrent owner-decision regressions."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from uuid import uuid4
from pathlib import Path
import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, session
from job_search_platform.db.models import CV, Approval, CVRevision, Document, DocumentRevision, Grant, Run, StoredFile
from job_search_platform.services.approvals import ApprovalService
from job_search_platform.services.contracts import ApprovalRequest, RunRequest
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue
from job_search_platform.workers.supervisor import WorkerSupervisor
from job_search_platform.integrations.hermes_runtime import HermesRuntime


def test_restart_keeps_pending_approval_valid_without_requeue(db_session, tmp_path):
    factory, p, creator, owner_actor, current_cv, run = _setup(db_session)
    revision_id, _ = _document_revision(factory, p.id)
    approvals = ApprovalService(factory)
    approval = approvals.request(creator, p.id, run.id, ApprovalRequest(
        action="promote_cv", revision_id=revision_id, expected_cv_revision_id=current_cv.id,
    ))
    config = json.loads((Path.home() / ".cache/job-search-platform/hermes-runtime.json").read_text())
    runtime = HermesRuntime(
        config["image"], environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]), workspace_root=tmp_path,
    )
    queue = PostgresRunQueue(factory)
    asyncio.run(WorkerSupervisor(factory, queue, object(), runtime).reconcile_startup())
    with factory() as db:
        assert db.get(Run, run.id).status == "waiting_approval"
    approvals.resolve(owner_actor, p.id, approval.id, "reject")  # still valid: no approval_stale
    with factory() as db:
        latest_cv = db.scalar(select(CVRevision).where(CVRevision.project_id == p.id).order_by(CVRevision.revision.desc()))
        assert latest_cv.id == current_cv.id
    assert queue.claim_next("synthetic-stale-approval") is None


def _factory(db_session):
    return sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)


def _submit(service, actor, project_id, request):
    return asyncio.run(service.submit(actor, project_id, request))


def _setup(db_session, *, capability="documents:draft"):
    p = project(db_session, "Approval test")
    creator, _ = grant(db_session, p.id, capabilities=(capability, "results:read"))
    owner_actor = owner(db_session)
    chat = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    factory = _factory(db_session)
    request = RunRequest(
        session_id=chat.id,
        operation="draft_documents",
        cv_revision_id=cv.id,
        job_revision_id=job.id,
        output_language="en",
        idempotency_key=f"approval-{uuid4()}",
    )
    run = _submit(RunService(factory), creator, p.id, request)
    claimed = PostgresRunQueue(factory).claim_next("approval-worker")
    assert claimed is not None and claimed.id == run.id
    return factory, p, creator, owner_actor, cv, run


def _document_revision(factory, project_id):
    with factory.begin() as db:
        document = Document(project_id=project_id, document_type="cover_letter", title="Synthetic draft")
        file = StoredFile(
            project_id=project_id,
            kind="generated_document",
            publication_state="published",
            storage_key=f"synthetic/{uuid4().hex}",
            checksum_sha256="a" * 64,
            size_bytes=12,
            mime_type="text/plain",
            display_name="draft.txt",
        )
        db.add_all([document, file])
        db.flush()
        revision = DocumentRevision(
            project_id=project_id,
            document_id=document.id,
            revision=1,
            file_id=file.id,
        )
        db.add(revision)
        db.flush()
        return revision.id, file.id


def test_approval_promotes_exact_revision_once_and_owner_decisions_race_safely(db_session):
    factory, p, creator, owner_actor, current_cv, run = _setup(db_session)
    revision_id, file_id = _document_revision(factory, p.id)
    service = ApprovalService(factory)
    request = ApprovalRequest(
        action="promote_cv",
        revision_id=revision_id,
        expected_cv_revision_id=current_cv.id,
    )
    with factory.begin() as db:
        active_started = db.get(Run, run.id).active_started_at
    requested_at = active_started + timedelta(seconds=5)
    approval = service.request(creator, p.id, run.id, request, now=requested_at)
    with pytest.raises(ServiceError, match="forbidden"):
        service.resolve(creator, p.id, approval.id, "approve")

    barrier = Barrier(2)

    def resolve():
        barrier.wait()
        return service.resolve(owner_actor, p.id, approval.id, "approve", now=requested_at + timedelta(minutes=30))

    with ThreadPoolExecutor(max_workers=2) as pool:
        resolved = list(pool.map(lambda _: resolve(), range(2)))
    assert resolved[0].id == resolved[1].id == approval.id
    assert resolved[0].decision == "approve"
    assert resolved[0].applied_at is not None
    with factory.begin() as db:
        promoted = db.scalar(
            select(CVRevision).where(CVRevision.project_id == p.id, CVRevision.file_id == file_id)
        )
        assert promoted is not None and promoted.revision == 2
        assert db.scalar(select(func.count()).select_from(CVRevision).where(CVRevision.project_id == p.id)) == 2
        persisted_run = db.get(Run, run.id)
        assert persisted_run.status == "queued"
        assert persisted_run.active_seconds == pytest.approx(5.0, abs=0.1)
        row = db.get(Approval, approval.id)
        assert row.consumed_at is not None and row.applied_at is not None


def test_cv_approval_cannot_promote_into_a_removed_cv(db_session):
    factory, p, creator, owner_actor, current_cv, run = _setup(db_session)
    revision_id, _ = _document_revision(factory, p.id)
    service = ApprovalService(factory)
    pending = service.request(creator, p.id, run.id, ApprovalRequest(
        action="promote_cv", revision_id=revision_id, expected_cv_revision_id=current_cv.id))
    with factory.begin() as db:
        db.get(CV, current_cv.cv_id).removed_at = datetime.now(timezone.utc)
    with pytest.raises(ServiceError, match="approval_stale"):
        service.resolve(owner_actor, p.id, pending.id, "approve")


def test_stale_cv_approval_cannot_promote_and_expiry_fails_run_durably(db_session):
    factory, p, creator, owner_actor, current_cv, run = _setup(db_session)
    revision_id, _ = _document_revision(factory, p.id)
    service = ApprovalService(factory)
    request = ApprovalRequest(
        action="promote_cv",
        revision_id=revision_id,
        expected_cv_revision_id=current_cv.id,
    )
    stale = service.request(creator, p.id, run.id, request)
    with factory.begin() as db:
        db.add(CVRevision(project_id=p.id, cv_id=current_cv.cv_id, revision=2))
    with pytest.raises(ServiceError, match="approval_stale"):
        service.resolve(owner_actor, p.id, stale.id, "approve")
    with factory.begin() as db:
        assert db.get(Approval, stale.id).consumed_at is None
        # Stale request must not alter current revision or the waiting run.
        assert db.get(Run, run.id).status == "waiting_approval"

    # Resolve expiry on a separate run because the stale request remains pending.
    p2 = project(db_session, "Expiry test")
    creator2, _ = grant(db_session, p2.id, capabilities=("documents:draft", "results:read"))
    chat = session(db_session, p2.id)
    cv2, job2 = revisions(db_session, p2.id)
    provider_config(db_session, p2.id)
    db_session.commit()
    run2 = _submit(RunService(factory),
        creator2,
        p2.id,
        RunRequest(
            session_id=chat.id,
            operation="draft_documents",
            cv_revision_id=cv2.id,
            job_revision_id=job2.id,
            output_language="en",
            idempotency_key="approval-expiry",
        ),
    )
    PostgresRunQueue(factory).claim_next("expiry-worker")
    revision2, _ = _document_revision(factory, p2.id)
    pending = service.request(
        creator2,
        p2.id,
        run2.id,
        ApprovalRequest(action="delete_document_revision", revision_id=revision2),
    )
    future = datetime.now(timezone.utc) + timedelta(hours=24, seconds=1)
    with pytest.raises(ServiceError, match="approval_expired"):
        service.resolve(owner_actor, p2.id, pending.id, "approve", now=future)
    with factory.begin() as db:
        row = db.get(Approval, pending.id)
        assert row.consumed_at is not None and row.decision == "reject"
        assert db.get(Run, run2.id).status == "failed"


def test_approved_deletion_is_unavailable_before_idempotent_external_callback(db_session):
    factory, p, creator, owner_actor, _, run = _setup(db_session)
    revision_id, file_id = _document_revision(factory, p.id)
    service = ApprovalService(factory)
    pending = service.request(
        creator,
        p.id,
        run.id,
        ApprovalRequest(action="delete_document_revision", revision_id=revision_id),
    )
    approved = service.resolve(owner_actor, p.id, pending.id, "approve")
    assert approved.applied_at is None
    deleted = []

    def delete_object(target_id, storage_key):
        deleted.append((target_id, storage_key))

    applied = service.apply_pending_deletion(p.id, pending.id, delete_object)
    assert applied.applied_at is not None
    assert len(deleted) == 1
    assert deleted[0][0] == file_id
    assert deleted[0][1].startswith("synthetic/")
    with factory.begin() as db:
        assert db.get(StoredFile, file_id).publication_state == "unavailable"
        assert db.get(Run, run.id).status == "queued"


def test_revoking_creator_grant_invalidates_pending_approval(db_session):
    factory, p, creator, owner_actor, _, run = _setup(db_session)
    revision_id, _ = _document_revision(factory, p.id)
    service = ApprovalService(factory)
    approval = service.request(
        creator,
        p.id,
        run.id,
        ApprovalRequest(action="delete_document_revision", revision_id=revision_id),
    )
    with factory.begin() as db:
        grant_row = db.get(Grant, creator.grant_id)
        grant_row.revoked_at = datetime.now(timezone.utc)
    with pytest.raises(ServiceError, match="approval_stale"):
        service.resolve(owner_actor, p.id, approval.id, "approve")
    with factory.begin() as db:
        assert db.get(Approval, approval.id).consumed_at is None
