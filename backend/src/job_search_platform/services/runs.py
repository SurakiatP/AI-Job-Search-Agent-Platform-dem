"""Durable run submission and owner/grant-scoped run access."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import (
    ConversationSession,
    CVRevision,
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
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor,
    RunEvent,
    RunEventData,
    RunEventView,
    RunRequest,
    RunView,
)
from job_search_platform.services.errors import ServiceError

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

        # Resolve an omitted CV against the durable idempotency row on replay, so
        # a later current-CV change cannot turn a valid replay into a conflict.
        cv_id = (
            retry_source.cv_revision_id
            if retry_source is not None
            else previous.cv_revision_id
            if previous is not None and request.cv_revision_id is None
            else request.cv_revision_id
        )
        if cv_id is None:
            cv = db.scalar(
                select(CVRevision)
                .where(CVRevision.project_id == project_id)
                .order_by(CVRevision.revision.desc())
                .limit(1)
                .with_for_update()
            )
            if cv is None:
                raise ServiceError("cv_required")
            cv_id = cv.id
        cv = db.scalar(
            select(CVRevision).where(
                CVRevision.project_id == project_id, CVRevision.id == cv_id
            )
        )
        if cv is None:
            raise ServiceError("not_found")

        job_id = retry_source.job_revision_id if retry_source is not None else request.job_revision_id
        job = db.scalar(
            select(JobRevision).where(
                JobRevision.project_id == project_id, JobRevision.id == job_id
            )
        )
        if job is None:
            raise ServiceError("not_found")
        session_id = retry_source.session_id if retry_source is not None else request.session_id
        if db.scalar(
            select(ConversationSession.id).where(
                ConversationSession.project_id == project_id,
                ConversationSession.id == session_id,
            )
        ) is None:
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
                or request.job_revision_id != retry_source.job_revision_id
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
                }
            )
        from job_search_platform.db.repositories import Repositories

        digest = Repositories.request_digest(canonical_request, resolved_cv_revision_id=cv_id)
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
            .where(ProviderConfiguration.project_id == project_id)
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
            run = self._visible_run(db, project_id, run_id)
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
            run = self._visible_run(db, project_id, run_id)
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
                self._visible_run(db, project_id, run_id)
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
    def _visible_run(db: Session, project_id: UUID, run_id: UUID) -> Run:
        run = db.scalar(
            select(Run).where(Run.project_id == project_id, Run.id == run_id)
        )
        if run is None:
            raise ServiceError("not_found")
        return run

    @staticmethod
    def _result_file_ids(db: Session, run: Run) -> tuple[UUID, ...]:
        return tuple(
            db.scalars(
                select(RunArtifact.file_id)
                .join(
                    StoredFile,
                    (StoredFile.project_id == RunArtifact.project_id)
                    & (StoredFile.id == RunArtifact.file_id),
                )
                .where(RunArtifact.project_id == run.project_id, RunArtifact.run_id == run.id)
                .where(StoredFile.publication_state == "published")
                .order_by(RunArtifact.file_id)
            ).all()
        )
