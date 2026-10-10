"""One-use owner approvals bound to exact project data and immutable revisions."""
from __future__ import annotations

import hashlib
import json
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import (
    CV, Approval, CVRevision, DocumentRevision, Grant, JobApplicationStatus, Project, ProjectPreference, Run, StoredFile,
)
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import Actor, ApprovalRequest, ApprovalView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import accrue_active_time, actor_scope, append_event, lock_current_grant
from job_search_platform.workers.queue import PostgresRunQueue

APPROVAL_TTL = timedelta(hours=24)
BUDGET_TZ = ZoneInfo("Asia/Bangkok")


def budget_day_start(now: datetime) -> datetime:
    """UTC instant of the most recent 00:00 Asia/Bangkok at or before now."""
    local = _utc(now).astimezone(BUDGET_TZ)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


class ApprovalService:
    """Persist approval records and apply only their exact owner-approved change."""

    def __init__(self, sessions: sessionmaker[Session]):
        self.sessions = sessions

    def request(
        self,
        actor: Actor,
        project_id: UUID,
        run_id: UUID,
        request: ApprovalRequest,
        *,
        now: datetime | None = None,
    ) -> ApprovalView:
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "request", "approval")
            if request.action == "submit_application":
                raise ServiceError("forbidden")  # only the apply_submit run itself asks, from the executor
            if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            lock_current_grant(db, actor, project_id, now)
            run = db.scalar(
                select(Run)
                .where(Run.project_id == project_id, Run.id == run_id)
                .with_for_update()
            )
            if run is None:
                raise ServiceError("not_found")
            if actor.kind == "grant" and run.actor_scope != actor_scope(actor):
                raise ServiceError("forbidden")
            if run.status == "waiting_approval":
                old = db.scalar(
                    select(Approval).where(
                        Approval.project_id == project_id,
                        Approval.run_id == run_id,
                        Approval.action == request.action,
                        Approval.revision_id == request.revision_id,
                        Approval.expected_cv_revision_id == request.expected_cv_revision_id,
                        Approval.target_file_id == request.target_file_id,
                        Approval.target_run_id == request.target_run_id,
                    )
                )
                if old is not None and old.consumed_at is None:
                    return _view(old)
                raise ServiceError("approval_already_pending")
            if run.status != "running" or run.cancellation_requested_at is not None:
                raise ServiceError("run_not_approvable")
            return self._open(db, run, request, now)

    def promote_cv_direct(self, actor: Actor, project_id: UUID, revision_id: UUID, expected_cv_revision_id: UUID) -> None:
        """Owner is the approver: apply the promote_cv change at once, with the same checks as an approved request."""
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "resolve", "approval")
            if actor.kind != "owner":
                raise ServiceError("forbidden")
            if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            _, file_id = self._resolve_change(db, project_id, ApprovalRequest(
                action="promote_cv", revision_id=revision_id, expected_cv_revision_id=expected_cv_revision_id))
            _append_cv_revision(db, project_id, expected_cv_revision_id, file_id)

    def request_submission(self, run_id: UUID, lease_owner: str, *, now: datetime | None = None) -> ApprovalView:
        """Executor side: the running apply_submit run asks the owner to record its pack as applied.
        No run enters waiting_approval on its own elsewhere, so this is the one place that does."""
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            project_id = db.scalar(select(Run.project_id).where(Run.id == run_id))
            if project_id is None or db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            run = db.scalar(select(Run).where(Run.project_id == project_id, Run.id == run_id).with_for_update())
            if (run is None or run.operation != "apply_submit" or run.status != "running"
                    or run.lease_owner != lease_owner):
                raise ServiceError("lease_lost")
            if run.cancellation_requested_at is not None:
                raise ServiceError("cancellation_requested")
            request = ApprovalRequest(action="submit_application", target_run_id=UUID(run.input_snapshot["pack_run_id"]))
            view = self._open(db, run, request, now)
            # The project row lock above also serializes the budget count against the approve below.
            limit = db.scalar(select(ProjectPreference.submit_autopilot_daily_limit).where(
                ProjectPreference.project_id == project_id))
            if limit is None or not self._creator_is_current(db, run, now):
                return view  # no autopilot: stays waiting, goes stale under the usual rules
            pack = db.scalar(select(Run.result_payload).where(Run.project_id == project_id, Run.id == request.target_run_id))
            if not isinstance(pack, dict) or pack.get("state") != "ready" or pack.get("missing_required"):
                return view
            used = db.scalar(select(func.count()).select_from(Approval).where(
                Approval.project_id == project_id, Approval.action == "submit_application",
                Approval.decided_by == "autopilot", Approval.decision == "approve",
                Approval.consumed_at >= budget_day_start(now)))
            if used >= limit:
                return view
            approval = db.get(Approval, view.id)
            approval.consumed_at, approval.decision, approval.decided_by = now, "approve", "autopilot"
            append_event(db, run, "run_progress", {"step": "autopilot_approved"}, now=now)
            self._finish_submission(db, approval, run, "approve", now)
            db.flush()
            return _view(approval)

    def _open(self, db: Session, run: Run, request: ApprovalRequest, now: datetime) -> ApprovalView:
        change, _ = self._resolve_change(db, run.project_id, request)
        approval = Approval(
            project_id=run.project_id,
            run_id=run.id,
            action=request.action,
            revision_id=request.revision_id,
            expected_cv_revision_id=request.expected_cv_revision_id,
            target_file_id=request.target_file_id,
            target_run_id=request.target_run_id,
            change_digest=_digest(change),
            token_hash=hashlib.sha256(secrets.token_bytes(32)).digest(),
            expires_at=now + APPROVAL_TTL,
        )
        db.add(approval)
        db.flush()
        accrue_active_time(run, now)
        run.status = "waiting_approval"
        run.active_started_at = None
        append_event(
            db,
            run,
            "approval_requested",
            {
                "status": "waiting_approval",
                "message_key": "approvals.requested",
                "approval_id": approval.id,
            },
            now=now,
        )
        return _view(approval)

    def resolve(
        self,
        actor: Actor,
        project_id: UUID,
        approval_id: UUID,
        decision: str,
        *,
        now: datetime | None = None,
    ) -> ApprovalView:
        """Record a one-use decision. Approved deletions remain durable pending work."""
        if decision not in {"approve", "reject"}:
            raise ServiceError("invalid_approval_decision")
        now = _utc(now or datetime.now(timezone.utc))
        expired = False
        result: ApprovalView | None = None
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "resolve", "approval")
            if actor.kind != "owner":
                raise ServiceError("forbidden")
            if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            approval = db.scalar(
                select(Approval)
                .where(Approval.project_id == project_id, Approval.id == approval_id)
                .with_for_update()
            )
            if approval is None:
                raise ServiceError("not_found")
            if approval.consumed_at is not None:
                if approval.decision == decision:
                    return _view(approval)
                raise ServiceError("approval_consumed")
            if _utc(approval.expires_at) <= now:
                approval.consumed_at = now
                approval.decision = "reject"  # expiry: nobody decided, decided_by stays NULL
                approval.applied_at = now
                self._fail_approval(db, approval, "approval_expired", "errors.approval_expired", now)
                expired = True
                result = _view(approval)
            else:
                run = db.scalar(
                    select(Run)
                    .where(Run.project_id == project_id, Run.id == approval.run_id)
                    .with_for_update()
                )
                if run is None:
                    raise ServiceError("not_found")
                if run.status != "waiting_approval":
                    raise ServiceError("approval_stale")
                if not self._creator_is_current(db, run, now):
                    raise ServiceError("approval_stale")
                request = ApprovalRequest(
                    action=approval.action,
                    revision_id=approval.revision_id,
                    expected_cv_revision_id=approval.expected_cv_revision_id,
                    target_file_id=approval.target_file_id,
                    target_run_id=approval.target_run_id,
                )
                try:
                    change, target_file_id = self._resolve_change(db, project_id, request)
                except ServiceError as exc:
                    if approval.action == "submit_application" and exc.code in {"apply_pack_required", "already_applied"}:
                        raise ServiceError("approval_stale") from None
                    raise
                if _digest(change) != approval.change_digest:
                    raise ServiceError("approval_stale")
                if decision == "approve" and approval.action == "promote_cv":
                    _append_cv_revision(db, project_id, approval.expected_cv_revision_id, target_file_id)

                approval.consumed_at = now
                approval.decision = decision
                approval.decided_by = "owner"
                if approval.action == "submit_application":
                    self._finish_submission(db, approval, run, decision, now)
                elif decision == "reject":
                    approval.applied_at = now
                    run.status = "failed"
                    run.finished_at = now
                    PostgresRunQueue._clear_lease(run)
                    append_event(
                        db,
                        run,
                        "approval_rejected",
                        {"status": "failed", "message_key": "errors.approval_rejected", "approval_id": approval.id},
                        now=now,
                    )
                else:
                    if approval.action == "promote_cv":
                        # The approved new revision and applied marker commit together.
                        approval.applied_at = now
                    elif approval.action == "delete_document_revision" and target_file_id is None:
                        approval.applied_at = now
                    # Deletion effects stay queued until CORE08/FILE01 coordinates
                    # availability marking with the external object-store deletion.
                    run.status = "queued"
                    run.lease_owner = None
                    run.lease_expires_at = None
                    run.heartbeat_at = None
                    run.active_started_at = None
                    append_event(
                        db,
                        run,
                        "approval_approved",
                        {"status": "queued", "message_key": "approvals.approved", "approval_id": approval.id},
                        now=now,
                    )
                db.flush()
                result = _view(approval)
        if expired:
            raise ServiceError("approval_expired")
        assert result is not None
        return result

    @staticmethod
    def _finish_submission(db: Session, approval: Approval, run: Run, decision: str, now: datetime) -> None:
        """No external effect exists to queue: approve records applied and completes the run, reject cancels it."""
        approval.applied_at = now
        run.finished_at = now
        PostgresRunQueue._clear_lease(run)
        if decision == "reject":
            run.status = "cancelled"
            append_event(db, run, "approval_rejected",
                         {"status": "cancelled", "message_key": "errors.approval_rejected", "approval_id": approval.id}, now=now)
            return
        job_id = db.scalar(select(Run.job_revision_id).where(Run.project_id == run.project_id, Run.id == approval.target_run_id))
        row = db.get(JobApplicationStatus, (run.project_id, job_id))
        if row is None:
            db.add(JobApplicationStatus(project_id=run.project_id, job_revision_id=job_id, status="applied"))
        else:
            row.status = "applied"
        run.status = "completed"
        run.result_payload = {"kind": "apply_submit", "state": "recorded",
                              "pack_run_id": str(approval.target_run_id), "job_revision_id": str(job_id)}
        append_event(db, run, "approval_approved",
                     {"status": "completed", "message_key": "approvals.approved", "approval_id": approval.id}, now=now)
        append_event(db, run, "application_recorded",
                     {"status": "completed", "message_key": "applications.recorded"}, now=now)
        append_event(db, run, "run_completed", {"status": "completed"}, now=now)

    def apply_pending_deletion(
        self,
        project_id: UUID,
        approval_id: UUID,
        delete_object: Callable[[UUID, str], None],
        *,
        now: datetime | None = None,
    ) -> ApprovalView:
        """Make the target unavailable, delete outside DB locks, then mark applied.

        The callback receives only a scoped file UUID and opaque storage key. It must
        be idempotent so a process crash between deletion and `applied_at` can retry.
        """
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            approval = db.scalar(
                select(Approval)
                .where(Approval.project_id == project_id, Approval.id == approval_id)
                .with_for_update()
            )
            if approval is None:
                raise ServiceError("not_found")
            if approval.decision != "approve" or approval.action not in {
                "delete_document_revision",
                "delete_file",
            }:
                raise ServiceError("approval_not_applicable")
            if approval.applied_at is not None:
                return _view(approval)
            request = ApprovalRequest(
                action=approval.action,
                revision_id=approval.revision_id,
                expected_cv_revision_id=approval.expected_cv_revision_id,
                target_file_id=approval.target_file_id,
            )
            change, file_id = self._resolve_change(db, project_id, request, allow_unavailable=True)
            if _digest(change) != approval.change_digest or file_id is None:
                raise ServiceError("approval_stale")
            file = db.scalar(
                select(StoredFile)
                .where(StoredFile.project_id == project_id, StoredFile.id == file_id)
                .with_for_update()
            )
            if file is None:
                raise ServiceError("approval_stale")
            file.publication_state = "unavailable"
            storage_key = file.storage_key
        # No network/object-store operation is performed while holding DB locks.
        delete_object(file_id, storage_key)
        with self.sessions.begin() as db:
            approval = db.scalar(
                select(Approval)
                .where(Approval.project_id == project_id, Approval.id == approval_id)
                .with_for_update()
            )
            if approval is None:
                raise ServiceError("not_found")
            if approval.applied_at is None:
                approval.applied_at = now
            return _view(approval)

    def get(self, actor: Actor, project_id: UUID, approval_id: UUID) -> ApprovalView:
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "read", "approval")
            approval = db.scalar(
                select(Approval).where(
                    Approval.project_id == project_id, Approval.id == approval_id
                )
            )
            if approval is None:
                raise ServiceError("not_found")
            if actor.kind == "grant":
                run = db.scalar(select(Run).where(Run.project_id == project_id, Run.id == approval.run_id))
                if run is None or run.actor_scope != actor_scope(actor):
                    raise ServiceError("forbidden")
            return _view(approval)

    def _resolve_change(
        self,
        db: Session,
        project_id: UUID,
        request: ApprovalRequest,
        *,
        allow_unavailable: bool = False,
    ) -> tuple[dict[str, object], UUID | None]:
        if request.action == "promote_cv":
            revision = db.scalar(
                select(DocumentRevision).where(
                    DocumentRevision.project_id == project_id,
                    DocumentRevision.id == request.revision_id,
                )
            )
            if revision is None or revision.file_id is None:
                raise ServiceError("not_found")
            file = self._file(db, project_id, revision.file_id, allow_unavailable)
            current = _latest_in_cv_of(db, project_id, request.expected_cv_revision_id)
            if current is None or current.id != request.expected_cv_revision_id:
                raise ServiceError("approval_stale")
            return (
                {
                    "action": request.action,
                    "revision_id": str(revision.id),
                    "file_id": str(file.id),
                    "checksum_sha256": file.checksum_sha256,
                    "expected_cv_revision_id": str(request.expected_cv_revision_id),
                },
                file.id,
            )
        if request.action == "delete_document_revision":
            revision = db.scalar(
                select(DocumentRevision).where(
                    DocumentRevision.project_id == project_id,
                    DocumentRevision.id == request.revision_id,
                )
            )
            if revision is None:
                raise ServiceError("not_found")
            file = self._file(db, project_id, revision.file_id, allow_unavailable) if revision.file_id else None
            if file is not None:
                self._ensure_unshared(db, project_id, file.id, except_revision_id=revision.id)
            return (
                {
                    "action": request.action,
                    "revision_id": str(revision.id),
                    "document_id": str(revision.document_id),
                    "revision_number": revision.revision,
                    "file_id": str(file.id) if file else None,
                    "checksum_sha256": file.checksum_sha256 if file else None,
                },
                file.id if file else None,
            )
        if request.action == "submit_application":
            pack = db.scalar(select(Run).where(Run.project_id == project_id, Run.id == request.target_run_id))
            payload = None if pack is None else pack.result_payload
            if (pack is None or pack.operation != "apply_prepare" or pack.status != "completed"
                    or not isinstance(payload, dict) or payload.get("state") != "ready"):
                raise ServiceError("apply_pack_required")
            if db.scalar(select(JobApplicationStatus.status).where(
                    JobApplicationStatus.project_id == project_id,
                    JobApplicationStatus.job_revision_id == pack.job_revision_id)) == "applied":
                raise ServiceError("already_applied")
            return ({"action": request.action, "target_run_id": str(pack.id), "job_revision_id": str(pack.job_revision_id),
                     "pack_digest": _digest(payload)}, None)
        file = self._file(db, project_id, request.target_file_id, allow_unavailable)
        self._ensure_unshared(db, project_id, file.id)
        return (
            {
                "action": request.action,
                "file_id": str(file.id),
                "checksum_sha256": file.checksum_sha256,
                "kind": file.kind,
            },
            file.id,
        )

    @staticmethod
    def _file(db: Session, project_id: UUID, file_id: UUID, allow_unavailable: bool) -> StoredFile:
        file = db.scalar(
            select(StoredFile).where(
                StoredFile.project_id == project_id,
                StoredFile.id == file_id,
                StoredFile.publication_state.in_(("published", "unavailable"))
                if allow_unavailable
                else StoredFile.publication_state == "published",
            )
        )
        if file is None:
            raise ServiceError("not_found")
        return file

    @staticmethod
    def _ensure_unshared(
        db: Session,
        project_id: UUID,
        file_id: UUID,
        *,
        except_revision_id: UUID | None = None,
    ) -> None:
        cv_ref = db.scalar(
            select(CVRevision.id).where(CVRevision.project_id == project_id, CVRevision.file_id == file_id).limit(1)
        )
        doc_query = select(DocumentRevision.id).where(
            DocumentRevision.project_id == project_id,
            DocumentRevision.file_id == file_id,
        )
        if except_revision_id is not None:
            doc_query = doc_query.where(DocumentRevision.id != except_revision_id)
        if cv_ref is not None or db.scalar(doc_query.limit(1)) is not None:
            raise ServiceError("file_in_use")

    @staticmethod
    def _fail_approval(
        db: Session,
        approval: Approval,
        event_type: str,
        message_key: str,
        now: datetime,
    ) -> None:
        run = db.scalar(
            select(Run)
            .where(Run.project_id == approval.project_id, Run.id == approval.run_id)
            .with_for_update()
        )
        if run is not None and run.status == "waiting_approval":
            run.status = "failed"
            run.finished_at = now
            PostgresRunQueue._clear_lease(run)
            append_event(
                db,
                run,
                event_type,
                {"status": "failed", "message_key": message_key, "approval_id": approval.id},
                now=now,
            )

    @staticmethod
    def _creator_is_current(db: Session, run: Run, now: datetime) -> bool:
        if run.actor_scope == "owner":
            return True
        if not run.actor_scope.startswith("grant:"):
            return False
        try:
            grant_id = UUID(run.actor_scope.removeprefix("grant:"))
        except ValueError:
            return False
        return (
            db.scalar(
                select(Grant.id)
                .where(
                    Grant.id == grant_id,
                    Grant.project_id == run.project_id,
                    Grant.revoked_at.is_(None),
                    Grant.expires_at > now,
                )
                .with_for_update()
            )
            is not None
        )


def _digest(value: dict[str, object]) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _view(approval: Approval) -> ApprovalView:
    return ApprovalView(
        id=approval.id,
        run_id=approval.run_id,
        action=approval.action,
        revision_id=approval.revision_id,
        expected_cv_revision_id=approval.expected_cv_revision_id,
        target_file_id=approval.target_file_id,
        target_run_id=approval.target_run_id,
        change_digest=approval.change_digest,
        expires_at=approval.expires_at,
        consumed_at=approval.consumed_at,
        decision=approval.decision,
        applied_at=approval.applied_at,
        decided_by=approval.decided_by,
    )


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _latest_in_cv_of(db: Session, project_id: UUID, revision_id: UUID | None, *, lock: bool = False):
    """Newest revision of the CV that owns revision_id (None when that revision is unknown)."""
    cv_id = db.scalar(select(CVRevision.cv_id).join(CV, (CV.project_id == CVRevision.project_id) & (CV.id == CVRevision.cv_id))
                      .where(CVRevision.project_id == project_id, CVRevision.id == revision_id, CV.removed_at.is_(None)))
    if cv_id is None:
        return None
    query = select(CVRevision).where(CVRevision.cv_id == cv_id).order_by(CVRevision.revision.desc()).limit(1)
    return db.scalar(query.with_for_update() if lock else query)


def _append_cv_revision(db: Session, project_id: UUID, expected_id: UUID, file_id: UUID) -> None:
    """Add file_id as the next revision of the CV, only if expected_id is still that CV's newest revision."""
    current = _latest_in_cv_of(db, project_id, expected_id, lock=True)
    if current is None or current.id != expected_id:
        raise ServiceError("approval_stale")
    next_revision = db.scalar(
        select(func.coalesce(func.max(CVRevision.revision), 0) + 1).where(CVRevision.cv_id == current.cv_id)) or 1
    db.add(CVRevision(project_id=project_id, cv_id=current.cv_id, revision=next_revision, file_id=file_id))
