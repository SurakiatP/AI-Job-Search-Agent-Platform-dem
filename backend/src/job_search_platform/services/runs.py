"""Durable run submission and owner/grant-scoped run access."""
from __future__ import annotations

import asyncio
import hashlib
import json
from uuid import uuid4
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import (
    ConversationSession,
    CV,
    CVRevision,
    CVRevisionText,
    Document,
    DocumentRevision,
    Grant,
    JobRevision,
    Project,
    ProviderConfiguration,
    Run,
    RunArtifact,
    StoredFile,
    ToolConnectorConfiguration,
)
from job_search_platform.db.models import (
    RunEvent as RunEventRow,
)
from job_search_platform.integrations.jev import JEV_MODEL
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor,
    DocumentEdit,
    MatchRunRequest,
    RunEvent,
    RunEventData,
    RunEventView,
    RunRequest,
    RunView,
)
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.skill_coverage import METHOD as SKILL_METHOD

MAX_QUEUED_PER_PROJECT = 10
MAX_EXTERNAL_SUBMISSIONS_PER_HOUR = 20
MAX_ACTIVE_SECONDS = 15 * 60
MAX_TOOL_CALLS = 30
EVENT_TYPES = frozenset(
    {
        "run_queued",
        "run_started",
        "run_progress",
        "run_waiting_approval",
        "run_resumed",
        "run_cancel_requested",
        "run_cancelled",
        "run_completed",
        "run_failed",
        "run_interrupted",
        "approval_requested",
        "approval_approved",
        "approval_rejected",
        "approval_expired",
    }
)


def actor_scope(actor: Actor) -> str:
    """Stable idempotency scope: one owner across sessions, each grant per token."""
    if actor.kind == "owner" and actor.owner_session_id is not None:
        return "owner"
    if actor.kind == "grant" and actor.grant_id is not None:
        return f"grant:{actor.grant_id}"
    raise ServiceError("unauthorized")


def run_view(run: Run, *, result_file_ids: tuple[UUID, ...] = (), job_removed: bool = False) -> RunView:
    return RunView(
        id=run.id,
        project_id=run.project_id,
        session_id=run.session_id,
        job_revision_id=run.job_revision_id,
        operation=run.operation,
        status=run.status,
        output_language=run.output_language,
        result_file_ids=result_file_ids,
        evaluation_result=run.evaluation_result,
        result_payload=run.result_payload,
        created_at=run.created_at,
        finished_at=run.finished_at,
        retry_of_id=run.retry_of_id,
        job_removed=job_removed,
    )


def append_event(
    db: Session,
    run: Run,
    event_type: str,
    data: dict[str, Any] | RunEventData,
    *,
    now: datetime | None = None,
) -> RunEventRow:
    """Insert one public, typed event while the caller holds the run row lock."""
    if event_type not in EVENT_TYPES:
        raise ServiceError("invalid_event_type")
    try:
        public = data if isinstance(data, RunEventData) else RunEventData.model_validate(data)
    except Exception as exc:
        raise ServiceError("invalid_event_data") from exc
    last = db.scalar(
        select(func.max(RunEventRow.sequence)).where(RunEventRow.run_id == run.id)
    ) or 0
    event = RunEventRow(
        project_id=run.project_id,
        run_id=run.id,
        sequence=last + 1,
        event_type=event_type,
        public_data=public.model_dump(mode="json"),
        created_at=now or datetime.now(timezone.utc),
    )
    db.add(event)
    db.flush()
    return event


def accrue_active_time(run: Run, now: datetime) -> None:
    """Accrue execution time, then move the durable interval start forward."""
    if run.active_started_at is None:
        return
    started = _utc(run.active_started_at)
    elapsed = max(0.0, (now - started).total_seconds())
    run.active_seconds += elapsed
    run.active_started_at = now


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def lock_current_grant(db: Session, actor: Actor, project_id: UUID, now: datetime) -> None:
    """Hold a current grant row through commit to serialize work with revocation."""
    if actor.kind != "grant":
        return
    grant = db.scalar(
        select(Grant)
        .where(Grant.id == actor.grant_id, Grant.project_id == project_id)
        .with_for_update()
    )
    if grant is None or grant.revoked_at is not None or _utc(grant.expires_at) <= now:
        raise ServiceError("unauthorized")


def live_tailored_document(db: Session, project_id: UUID, job_revision_id: UUID | None) -> Document | None:
    """The job's live (untrashed) tailored CV document, newest revision first."""
    if job_revision_id is None:
        return None
    return db.scalar(
        select(Document).where(
            Document.project_id == project_id, Document.document_type == "cv", Document.trashed_at.is_(None),
            Document.id.in_(select(DocumentRevision.document_id).where(
                DocumentRevision.project_id == project_id, DocumentRevision.source_job_revision_id == job_revision_id)))
        .order_by(select(func.max(DocumentRevision.created_at)).where(
            DocumentRevision.project_id == project_id, DocumentRevision.document_id == Document.id)
            .correlate(Document).scalar_subquery().desc()).limit(1))


class RunService:
    """PostgreSQL-backed run lifecycle. Each public operation owns its transaction."""

    def __init__(self, sessions: sessionmaker[Session]):
        self.sessions = sessions

    async def submit(self, actor: Actor, project_id: UUID, request: RunRequest) -> RunView:
        return await asyncio.to_thread(self._submit_sync, actor, project_id, request)

    def _submit_sync(self, actor: Actor, project_id: UUID, request: RunRequest) -> RunView:
        now = datetime.now(timezone.utc)
        scope = actor_scope(actor)
        with self.sessions.begin() as db:
            return self._submit_in_transaction(db, actor, project_id, request, now=now, scope=scope)

    def _submit_in_transaction(
        self, db: Session, actor: Actor, project_id: UUID, request: RunRequest,
        *, now: datetime, scope: str,
    ) -> RunView:
        authorize(db, actor, project_id, "write", request.operation)
        if actor.kind != "owner" and request.owner_instructions:
            raise ServiceError("unauthorized")
        project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
        if project is None:
            raise ServiceError("not_found")
        lock_current_grant(db, actor, project_id, now)

        previous = db.scalar(
            select(Run)
            .where(
                Run.project_id == project_id,
                Run.actor_scope == scope,
                Run.idempotency_key == request.idempotency_key,
            )
            .with_for_update()
        )
        retry_source = self._retry_source(db, project_id, request.retry_of_id) if request.retry_of_id else None

        session_id = retry_source.session_id if retry_source is not None else request.session_id
        session = db.scalar(
            select(ConversationSession).where(
                ConversationSession.project_id == project_id,
                ConversationSession.id == session_id,
                ConversationSession.removed_at.is_(None),
            )
        )
        if session is None:
            raise ServiceError("not_found")

        # Resolve an omitted CV against the durable idempotency row on replay, so
        # a later current-CV change cannot turn a valid replay into a conflict.
        job_id = retry_source.job_revision_id if retry_source is not None else request.job_revision_id
        if session.cv_revision_id is not None:
            # A paired session fixes the pair; a request may only repeat it.
            if (
                request.cv_revision_id not in {None, session.cv_revision_id}
                or request.job_revision_id not in {None, session.job_revision_id}
                or (request.cv_id is not None and request.cv_id != db.scalar(
                    select(CVRevision.cv_id).where(CVRevision.id == session.cv_revision_id)))
            ):
                raise ServiceError("session_pair_mismatch")
            cv_id, job_id = session.cv_revision_id, session.job_revision_id
        else:
            cv_id = (
                retry_source.cv_revision_id
                if retry_source is not None
                else previous.cv_revision_id
                if previous is not None and request.cv_revision_id is None and request.cv_id is None
                else request.cv_revision_id
            )
            if cv_id is None:
                from job_search_platform.db.repositories import Repositories as _Repos

                cv_id = _Repos.latest_cv_revision(db, project_id, request.cv_id).id
        cv = db.scalar(
            select(CVRevision).where(
                CVRevision.project_id == project_id, CVRevision.id == cv_id
            )
        )
        if cv is None or job_id is None:
            raise ServiceError("not_found" if cv is None else "job_required")
        job = db.scalar(
            select(JobRevision).where(
                JobRevision.project_id == project_id, JobRevision.id == job_id
            )
        )
        if job is None:
            raise ServiceError("not_found")
        canonical_request = request
        if retry_source is not None:
            source_owner_instructions = retry_source.input_snapshot.get("owner_instructions")
            if actor.kind == "grant" and source_owner_instructions:
                raise ServiceError("forbidden")
            supplied_owner_instructions = request.owner_instructions or None
            if (
                "owner_instructions" in request.model_fields_set
                and supplied_owner_instructions != source_owner_instructions
            ):
                raise ServiceError("retry_input_mismatch")
            if (
                request.session_id != retry_source.session_id
                or request.operation != retry_source.operation
                or request.job_revision_id not in {None, retry_source.job_revision_id}
                or request.output_language != retry_source.output_language
                or request.cv_revision_id not in {None, retry_source.cv_revision_id}
            ):
                raise ServiceError("retry_input_mismatch")
            canonical_request = request.model_copy(
                update={
                    "session_id": retry_source.session_id,
                    "operation": retry_source.operation,
                    "cv_revision_id": retry_source.cv_revision_id,
                    "job_revision_id": retry_source.job_revision_id,
                    "output_language": retry_source.output_language,
                    "owner_instructions": source_owner_instructions,
                    "document_id": UUID(retry_source.input_snapshot["document_id"])
                    if retry_source.input_snapshot.get("document_id") else None,
                    "draft_kind": retry_source.input_snapshot.get("draft_kind"),
                    "tailor_mode": retry_source.input_snapshot.get("tailor_mode"),
                }
            )
        if canonical_request.draft_kind is not None and actor.kind != "owner":
            raise ServiceError("forbidden")
        is_tailor = canonical_request.operation == "tailor_cv"
        tailor_mode = (canonical_request.tailor_mode or "autopilot") if is_tailor else None
        if tailor_mode == "interactive" and actor.kind != "owner":
            raise ServiceError("forbidden")
        # A tailor run appends to the job's live tailored CV document, like a draft of its kind.
        auto_kind = "cv" if is_tailor else canonical_request.draft_kind
        previous_draft = None
        revise_id = canonical_request.document_id
        if (
            revise_id is None and auto_kind is not None and previous is None
            and session.job_revision_id is not None
        ):
            # One live document per draft kind and paired job: append a revision to it.
            revise_id = db.scalar(
                select(Document.id)
                .where(
                    Document.project_id == project_id,
                    Document.document_type == auto_kind,
                    Document.trashed_at.is_(None),
                    Document.id.in_(
                        select(DocumentRevision.document_id).where(
                            DocumentRevision.project_id == project_id,
                            DocumentRevision.source_job_revision_id == session.job_revision_id,
                        )
                    ),
                )
                .order_by(
                    select(func.max(DocumentRevision.created_at))
                    .where(DocumentRevision.project_id == project_id, DocumentRevision.document_id == Document.id)
                    .correlate(Document).scalar_subquery().desc()
                )
                .limit(1)
            )
        if revise_id is not None:
            if canonical_request.operation not in {"draft_documents", "tailor_cv"} or (
                not is_tailor and (actor.kind != "owner" or (
                    retry_source is None and request.document_id is None and canonical_request.draft_kind is None))
            ) or (is_tailor and actor.kind != "owner" and request.document_id is not None):
                raise ServiceError("forbidden")
            document = db.scalar(select(Document).where(
                Document.project_id == project_id, Document.id == revise_id))
            if document is None or document.trashed_at is not None:
                raise ServiceError("not_found")
            # A paired session may only revise documents drafted for its own job.
            if session.job_revision_id is not None and session.job_revision_id not in db.scalars(
                    select(DocumentRevision.source_job_revision_id).where(
                        DocumentRevision.project_id == project_id, DocumentRevision.document_id == document.id)).all():
                raise ServiceError("not_found")
            previous_draft = db.scalar(
                select(DocumentRevision.content_markdown)
                .where(DocumentRevision.project_id == project_id, DocumentRevision.document_id == document.id)
                .order_by(DocumentRevision.revision.desc()).limit(1))
        from job_search_platform.db.repositories import Repositories

        digest = Repositories.request_digest(
            canonical_request, resolved_cv_revision_id=cv_id, resolved_job_revision_id=job.id)
        if previous is not None:
            if previous.request_digest != digest:
                raise ServiceError("idempotency_conflict")
            return self._authorized_view(db, actor, previous)

        # Replays above stay valid; a removed job cannot start new work.
        if job.removed_at is not None:
            raise ServiceError("job_removed")
        if retry_source is not None and retry_source.status not in {"failed", "cancelled", "interrupted"}:
            raise ServiceError("retry_not_allowed")
        queued = db.scalar(
            select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued"
            )
        ) or 0
        if queued >= MAX_QUEUED_PER_PROJECT:
            raise ServiceError("queue_full", retryable=True)

        if actor.kind == "grant":
            # The grant row is already locked above, serializing this rolling quota.
            recent = db.scalar(
                select(func.count()).select_from(Run).where(
                    Run.actor_scope == scope,
                    Run.created_at >= now - timedelta(hours=1),
                )
            ) or 0
            if recent >= MAX_EXTERNAL_SUBMISSIONS_PER_HOUR:
                raise ServiceError("submission_rate_limited", retryable=True)

        provider_config = db.scalar(
            select(ProviderConfiguration)
            .where(ProviderConfiguration.project_id.is_(None))
            .order_by(ProviderConfiguration.revision.desc())
            .limit(1)
        )
        if provider_config is None or provider_config.secret_reference.startswith("restored-unconfigured:"):
            raise ServiceError("provider_configuration_required")
        connector = db.scalar(
            select(ToolConnectorConfiguration)
            .where(ToolConnectorConfiguration.project_id == project_id)
            .order_by(ToolConnectorConfiguration.revision.desc())
            .limit(1)
        )
        if connector is not None and not connector.enabled:
            raise ServiceError("connector_disabled")
        cv_file = None
        if cv.file_id is not None:
            cv_file = db.scalar(
                select(StoredFile).where(
                    StoredFile.project_id == project_id,
                    StoredFile.id == cv.file_id,
                    StoredFile.publication_state == "published",
                )
            )
            if cv_file is None:
                raise ServiceError("cv_unavailable")

        run = Run(
            project_id=project_id,
            actor_scope=scope,
            idempotency_key=request.idempotency_key,
            request_digest=digest,
            session_id=session_id,
            operation=retry_source.operation if retry_source is not None else request.operation,
            cv_revision_id=cv_id,
            job_revision_id=job.id,
            provider_configuration_id=provider_config.id,
            input_snapshot={
                "cv_revision_id": str(cv_id),
                "cv_file_id": str(cv.file_id) if cv.file_id else None,
                "job_revision_id": str(job.id),
                **(
                    {"owner_instructions": canonical_request.owner_instructions}
                    if canonical_request.owner_instructions
                    else {}
                ),
                **(
                    {"document_id": str(revise_id),
                     "previous_draft": (previous_draft or "")[:20000]}
                    if revise_id
                    else {}
                ),
                **({"draft_kind": canonical_request.draft_kind} if canonical_request.draft_kind else {}),
                **({"tailor_mode": tailor_mode} if tailor_mode else {}),
                "job": {
                    "title": job.title,
                    "company": job.company,
                    "source_url": job.source_url,
                    "description": job.description,
                },
            },
            config_snapshot={
                "provider_configuration_id": str(provider_config.id),
                "provider": provider_config.provider,
                "model": provider_config.model,
                "revision": provider_config.revision,
                "secret_reference": provider_config.secret_reference,
                "connector": {
                    "adapter_key": connector.adapter_key if connector else "career_ops",
                    "revision": connector.revision if connector else None,
                    "enabled": connector.enabled if connector else True,
                },
            },
            output_language=retry_source.output_language if retry_source is not None else request.output_language,
            status="queued",
            retry_of_id=retry_source.id if retry_source is not None else None,
            created_at=now,
        )
        db.add(run)
        db.flush()
        append_event(db, run, "run_queued", {"status": "queued"}, now=now)
        return self._authorized_view(db, actor, run)

    async def submit_export(
        self, actor: Actor, project_id: UUID, document_id: UUID, edit: DocumentEdit
    ) -> RunView:
        """Owner-only manual edit: queue a non-LLM run that exports the text and appends a revision."""
        return await asyncio.to_thread(self._submit_export_sync, actor, project_id, document_id, edit)

    def _submit_export_sync(
        self, actor: Actor, project_id: UUID, document_id: UUID, edit: DocumentEdit
    ) -> RunView:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "document")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            document = db.scalar(select(Document).where(
                Document.project_id == project_id, Document.id == document_id).with_for_update())
            if document is None or document.trashed_at is not None:
                raise ServiceError("not_found")
            latest = db.scalar(
                select(DocumentRevision)
                .join(StoredFile, (StoredFile.project_id == DocumentRevision.project_id) & (StoredFile.id == DocumentRevision.file_id))
                .where(DocumentRevision.project_id == project_id, DocumentRevision.document_id == document_id,
                       StoredFile.publication_state == "published")
                .order_by(DocumentRevision.revision.desc()).limit(1))
            # The producing run supplies the session / CV / job / provider the new run row must reference.
            source = db.scalar(
                select(Run).join(RunArtifact, (RunArtifact.project_id == Run.project_id) & (RunArtifact.run_id == Run.id))
                .where(RunArtifact.project_id == project_id,
                       RunArtifact.document_revision_id == (latest.id if latest else None)))
            if latest is None or source is None:
                raise ServiceError("document_source_unavailable")
            busy = db.scalar(
                select(func.count()).select_from(Run).where(
                    Run.project_id == project_id,
                    Run.operation.in_(("draft_documents", "export_document")),
                    Run.status.in_(("queued", "running", "waiting_approval")),
                    Run.input_snapshot["document_id"].as_string() == str(document_id),
                )
            ) or 0
            if busy:
                raise ServiceError("document_busy")
            queued = db.scalar(select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued")) or 0
            if queued >= MAX_QUEUED_PER_PROJECT:
                raise ServiceError("queue_full", retryable=True)
            output_format = edit.format
            if output_format is None:
                mime = db.scalar(select(StoredFile.mime_type).where(
                    StoredFile.project_id == project_id, StoredFile.id == latest.file_id)) or ""
                output_format = "docx" if mime.endswith("wordprocessingml.document") else "pdf"
            return self._queue_export(db, actor, source, document, output_format, edit.content_markdown, now)

    def _queue_export(self, db: Session, actor: Actor, source: Run, document: Document | None, output_format: str,
                      markdown: str, now: datetime, *, title: str = "", document_type: str = "cv") -> RunView:
        """Queue a non-LLM export run that inherits session/CV/job/provider from `source`; no document means a new one."""
        key = uuid4().hex
        run = Run(
            project_id=source.project_id,
            actor_scope="owner",
            idempotency_key=key,
            request_digest=hashlib.sha256(json.dumps(
                {"export_document": str(document.id) if document else key, "key": key}).encode()).hexdigest(),
            session_id=source.session_id,
            operation="export_document",
            cv_revision_id=source.cv_revision_id,
            job_revision_id=source.job_revision_id,
            provider_configuration_id=source.provider_configuration_id,
            input_snapshot={
                **({"document_id": str(document.id)} if document else {}),
                "export_format": output_format,
                "export_title": document.title if document else title,
                "export_document_type": document.document_type if document else document_type,
                "export_content_markdown": markdown,
            },
            config_snapshot={},
            output_language=source.output_language,
            status="queued",
            created_at=now,
        )
        db.add(run)
        db.flush()
        append_event(db, run, "run_queued", {"status": "queued"}, now=now)
        return self._authorized_view(db, actor, run)

    async def submit_restore(self, actor: Actor, project_id: UUID, document_id: UUID, revision_id: UUID) -> RunView:
        """Owner-only undo: re-export an earlier revision's Markdown as a new revision of the same document."""
        if actor.kind != "owner":
            raise ServiceError("forbidden")

        def load() -> str:
            with self.sessions() as db:
                authorize(db, actor, project_id, "write", "document")
                content = db.scalar(select(DocumentRevision.content_markdown).where(
                    DocumentRevision.project_id == project_id, DocumentRevision.document_id == document_id,
                    DocumentRevision.id == revision_id))
            if not content:
                raise ServiceError("not_found")
            return content

        content = await asyncio.to_thread(load)
        return await self.submit_export(actor, project_id, document_id, DocumentEdit(content_markdown=content))

    async def submit_tailor_apply(self, actor: Actor, project_id: UUID, run_id: UUID, proposal_ids: list[int]) -> RunView:
        """Owner-only: apply chosen interactive proposals (evidence re-checked as one batch) via an export run."""
        return await asyncio.to_thread(self._tailor_apply_sync, actor, project_id, run_id, proposal_ids)

    def _tailor_apply_sync(self, actor: Actor, project_id: UUID, run_id: UUID, proposal_ids: list[int]) -> RunView:
        from job_search_platform.services import tailoring
        from job_search_platform.services.evidence import EvidencedEdit, require_evidence

        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "document")
            run = db.scalar(select(Run).where(Run.project_id == project_id, Run.id == run_id))
            payload = None if run is None else run.result_payload
            if (run is None or run.operation != "tailor_cv" or run.status != "completed"
                    or not isinstance(payload, dict) or payload.get("mode") != "interactive"):
                raise ServiceError("not_found")
            by_id = {item["id"]: item for item in payload.get("proposals", [])}
            chosen = [by_id.get(pid) for pid in dict.fromkeys(proposal_ids)]
            if any(item is None or item.get("status") != "proposed" for item in chosen):
                raise ServiceError("evidence_required")
            edits = [{"find": item["find"], "text": item["text"], "evidence_ids": item["evidence_ids"]} for item in chosen]
            try:
                require_evidence(db, project_id, [EvidencedEdit(text=e["text"], evidence_ids=e["evidence_ids"]) for e in edits])
            except ValueError:
                raise ServiceError("evidence_required") from None
            base_id = payload.get("base_revision_id")
            base = db.scalar(select(DocumentRevision.content_markdown).where(
                DocumentRevision.project_id == project_id, DocumentRevision.id == UUID(base_id))) if base_id else None
            if base is None:
                base = db.scalar(select(CVRevisionText.text).where(CVRevisionText.cv_revision_id == run.cv_revision_id))
            if base is None:
                raise ServiceError("document_source_unavailable")
            text, applied = tailoring.apply_edits(base, edits)
            if not applied:
                raise ServiceError("tailor_nothing_to_apply")
            document = live_tailored_document(db, project_id, run.job_revision_id)
            title = f"CV — {(run.input_snapshot.get('job') or {}).get('title', 'job')}"[:300]
            if document is None:
                busy = db.scalar(select(func.count()).select_from(Run).where(
                    Run.project_id == project_id, Run.operation == "export_document", Run.job_revision_id == run.job_revision_id,
                    Run.status.in_(("queued", "running", "waiting_approval")),
                    Run.input_snapshot["export_document_type"].as_string() == "cv"))
                if busy:
                    raise ServiceError("document_busy")
                return self._queue_export(db, actor, run, None, "pdf", text, now, title=title)
            document_id = document.id
        return self._submit_export_sync(actor, project_id, document_id, DocumentEdit(content_markdown=text, format="pdf"))

    async def submit_profile(self, actor: Actor, project_id: UUID, cv_id: UUID) -> RunView | None:
        """Owner-only: queue a non-LLM run that stores the CV's skill names; None when already profiled."""
        return await asyncio.to_thread(self._submit_profile_sync, actor, project_id, cv_id)

    def _submit_profile_sync(self, actor: Actor, project_id: UUID, cv_id: UUID) -> RunView | None:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "cv")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            if db.scalar(select(CV.id).where(CV.project_id == project_id, CV.id == cv_id,
                                             CV.removed_at.is_(None))) is None:
                raise ServiceError("not_found")
            latest = db.scalar(
                select(CVRevision)
                .join(StoredFile, (StoredFile.project_id == CVRevision.project_id) & (StoredFile.id == CVRevision.file_id))
                .where(CVRevision.project_id == project_id, CVRevision.cv_id == cv_id,
                       StoredFile.publication_state == "published")
                .order_by(CVRevision.revision.desc()).limit(1))
            if latest is None:
                raise ServiceError("not_found")
            if (latest.skill_profile or {}).get("method") == SKILL_METHOD:
                return None
            active = db.scalar(select(Run).where(
                Run.project_id == project_id, Run.operation == "profile_cv", Run.cv_revision_id == latest.id,
                Run.status.in_(("queued", "running"))).limit(1))
            if active is not None:
                return self._authorized_view(db, actor, active)
            queued = db.scalar(select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued")) or 0
            if queued >= MAX_QUEUED_PER_PROJECT:
                raise ServiceError("queue_full", retryable=True)
            key = uuid4().hex
            # No session, job or provider: the run only parses the CV inside the sandbox.
            run = Run(
                project_id=project_id, actor_scope="owner", idempotency_key=key,
                request_digest=hashlib.sha256(json.dumps({"profile_cv": str(latest.id), "key": key}).encode()).hexdigest(),
                operation="profile_cv", cv_revision_id=latest.id,
                input_snapshot={"cv_file_id": str(latest.file_id)}, config_snapshot={},
                output_language="en", status="queued", created_at=now)
            db.add(run)
            db.flush()
            append_event(db, run, "run_queued", {"status": "queued"}, now=now)
            return self._authorized_view(db, actor, run)

    async def submit_extract(self, actor: Actor, project_id: UUID, cv_id: UUID, *, automatic: bool = False) -> RunView | None:
        """Owner-only: queue LLM extraction of the CV's latest revision into the experience bank.
        Automatic (upload) triggers skip revisions already extracted; None then."""
        return await asyncio.to_thread(self._submit_extract_sync, actor, project_id, cv_id, automatic)

    def _submit_extract_sync(self, actor: Actor, project_id: UUID, cv_id: UUID, automatic: bool) -> RunView | None:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "cv")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            latest = db.scalar(
                select(CVRevision)
                .join(CV, (CV.project_id == CVRevision.project_id) & (CV.id == CVRevision.cv_id))
                .join(StoredFile, (StoredFile.project_id == CVRevision.project_id) & (StoredFile.id == CVRevision.file_id))
                .where(CVRevision.project_id == project_id, CVRevision.cv_id == cv_id, CV.removed_at.is_(None),
                       StoredFile.publication_state == "published")
                .order_by(CVRevision.revision.desc()).limit(1))
            if latest is None:
                raise ServiceError("not_found")
            existing = db.scalars(select(Run).where(
                Run.project_id == project_id, Run.operation == "extract_experience", Run.cv_revision_id == latest.id,
                Run.status.in_(("queued", "running", "completed")))).all()
            active = next((run for run in existing if run.status != "completed"), None)
            if active is not None:
                return self._authorized_view(db, actor, active)
            if automatic and existing:
                return None
            queued = db.scalar(select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued")) or 0
            if queued >= MAX_QUEUED_PER_PROJECT:
                raise ServiceError("queue_full", retryable=True)
            config = db.scalar(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))
                               .order_by(ProviderConfiguration.revision.desc()).limit(1))
            if config is None or config.secret_reference.startswith("restored-unconfigured:"):
                raise ServiceError("provider_configuration_required")
            key = uuid4().hex
            run = Run(
                project_id=project_id, actor_scope="owner", idempotency_key=key,
                request_digest=hashlib.sha256(json.dumps({"extract_experience": str(latest.id), "key": key}).encode()).hexdigest(),
                operation="extract_experience", cv_revision_id=latest.id, provider_configuration_id=config.id,
                input_snapshot={"cv_file_id": str(latest.file_id)},
                config_snapshot={"provider_configuration_id": str(config.id)},
                output_language="en", status="queued", created_at=now)
            db.add(run)
            db.flush()
            append_event(db, run, "run_queued", {"status": "queued"}, now=now)
            return self._authorized_view(db, actor, run)

    async def submit_match(self, actor: Actor, project_id: UUID, request: MatchRunRequest) -> RunView:
        """Owner-only: queue a Jev scoring run for one CV revision and one job-search pool."""
        return await asyncio.to_thread(self._submit_match_sync, actor, project_id, request)

    def _submit_match_sync(self, actor: Actor, project_id: UUID, request: MatchRunRequest) -> RunView:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        snapshot = request.model_dump(mode="json")
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "cv")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            revision = db.scalar(select(CVRevision).join(CV, (CV.project_id == CVRevision.project_id) & (CV.id == CVRevision.cv_id))
                                 .where(CVRevision.project_id == project_id, CVRevision.id == request.cv_revision_id,
                                        CV.removed_at.is_(None)))
            if revision is None:
                raise ServiceError("not_found")
            config = db.scalar(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))
                               .order_by(ProviderConfiguration.revision.desc()).limit(1))
            if config is None or config.provider != "openrouter" or config.secret_reference.startswith("restored-unconfigured:"):
                raise ServiceError("jev_unavailable")
            for active in db.scalars(select(Run).where(
                    Run.project_id == project_id, Run.operation == "match_jobs", Run.cv_revision_id == revision.id,
                    Run.status.in_(("queued", "running")))).all():
                if active.input_snapshot == snapshot:
                    return self._authorized_view(db, actor, active)
            for stale in db.scalars(select(Run).where(  # superseded filters: running ones are left to the claim watchdog
                    Run.project_id == project_id, Run.operation == "match_jobs", Run.cv_revision_id == revision.id,
                    Run.status == "queued").with_for_update()):
                stale.status = "cancelled"
                stale.finished_at = now
                append_event(db, stale, "run_cancelled", {"status": "cancelled"}, now=now)
            db.flush()
            queued = db.scalar(select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued")) or 0
            if queued >= MAX_QUEUED_PER_PROJECT:
                raise ServiceError("queue_full", retryable=True)
            key = uuid4().hex
            run = Run(project_id=project_id, actor_scope="owner", idempotency_key=key,
                      request_digest=hashlib.sha256(json.dumps({"match_jobs": snapshot, "key": key}, sort_keys=True).encode()).hexdigest(),
                      operation="match_jobs", cv_revision_id=revision.id, provider_configuration_id=config.id,
                      input_snapshot=snapshot, config_snapshot={"model": JEV_MODEL},
                      output_language="en", status="queued", created_at=now)
            db.add(run)
            db.flush()
            append_event(db, run, "run_queued", {"status": "queued"}, now=now)
            return self._authorized_view(db, actor, run)

    @staticmethod
    def _retry_source(db: Session, project_id: UUID, retry_of_id: UUID) -> Run:
        source = db.scalar(
            select(Run).where(Run.project_id == project_id, Run.id == retry_of_id).with_for_update()
        )
        if source is None:
            raise ServiceError("not_found")
        if source.status not in {"failed", "cancelled", "interrupted"}:
            raise ServiceError("retry_not_allowed")
        return source

    async def get(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView:
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "results:read", "run")
            run = self._visible_run(db, project_id, run_id, actor)
            return self._authorized_view(db, actor, run)

    async def cancel(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView:
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "cancel", "run")
            project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
            if project is None:
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
            if run.status in {"completed", "failed", "cancelled", "interrupted"}:
                return self._authorized_view(db, actor, run)
            if run.status == "queued":
                run.status = "cancelled"
                run.finished_at = now
                append_event(db, run, "run_cancelled", {"status": "cancelled"}, now=now)
            elif run.cancellation_requested_at is None:
                run.cancellation_requested_at = now
                append_event(db, run, "run_cancel_requested", {"status": run.status}, now=now)
            return self._authorized_view(db, actor, run)

    async def events(
        self, actor: Actor, project_id: UUID, run_id: UUID, after: int
    ) -> AsyncIterator[RunEvent]:
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "results:read", "event")
            run = self._visible_run(db, project_id, run_id, actor)
            rows = db.scalars(
                select(RunEventRow)
                .where(RunEventRow.project_id == project_id, RunEventRow.run_id == run.id, RunEventRow.sequence > after)
                .order_by(RunEventRow.sequence)
            ).all()
            result = [
                RunEventView(
                    sequence=row.sequence,
                    event_type=row.event_type,
                    data=RunEventData.model_validate(row.public_data),
                    created_at=row.created_at,
                )
                for row in rows
            ]
        for event in result:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "results:read", "event")
                self._visible_run(db, project_id, run_id, actor)
            yield event

    def _authorized_view(self, db: Session, actor: Actor, run: Run) -> RunView:
        try:
            authorize(db, actor, run.project_id, "results:read", "run")
        except ServiceError as exc:
            if exc.code != "forbidden":
                raise
            return run_view(run).model_copy(
                update={"evaluation_result": None, "result_file_ids": ()}
            )
        job_removed = db.scalar(
            select(JobRevision.removed_at).where(
                JobRevision.project_id == run.project_id, JobRevision.id == run.job_revision_id
            )
        ) is not None
        return run_view(run, result_file_ids=self._result_file_ids(db, run), job_removed=job_removed)

    @staticmethod
    def _visible_run(db: Session, project_id: UUID, run_id: UUID, actor: Actor | None = None) -> Run:
        run = db.scalar(
            select(Run).where(Run.project_id == project_id, Run.id == run_id)
        )
        # Manual-edit export runs are owner-only; grants (REST, MCP, A2A) never see them.
        if run is None or (actor is not None and actor.kind != "owner" and run.operation in {"export_document", "profile_cv", "match_jobs", "extract_experience"}):
            raise ServiceError("not_found")
        return run

    @staticmethod
    def _result_file_ids(db: Session, run: Run) -> tuple[UUID, ...]:
        query = (
            select(RunArtifact.file_id)
            .join(
                StoredFile,
                (StoredFile.project_id == RunArtifact.project_id)
                & (StoredFile.id == RunArtifact.file_id),
            )
            .where(RunArtifact.project_id == run.project_id, RunArtifact.run_id == run.id)
            .where(StoredFile.publication_state == "published")
            .order_by(RunArtifact.file_id)
        )
        # Trashed drafts drop out of run results for everyone; the owner finds them in the trash view.
        query = query.where(~select(DocumentRevision.id).join(
            Document,
            (Document.project_id == DocumentRevision.project_id) & (Document.id == DocumentRevision.document_id),
        ).where(
            DocumentRevision.project_id == RunArtifact.project_id,
            DocumentRevision.id == RunArtifact.document_revision_id,
            Document.trashed_at.is_not(None),
        ).exists())
        return tuple(db.scalars(query).all())
