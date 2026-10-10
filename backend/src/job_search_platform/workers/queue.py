"""PostgreSQL queue claims, worker leases, and execution-budget accounting."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import Approval, Grant, OwnerSession, Project, Run
from job_search_platform.services.contracts import EvaluationResult
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import MAX_ACTIVE_SECONDS, MAX_TOOL_CALLS, accrue_active_time, append_event
from job_search_platform.services.skills import SKILL_BY_ID

GLOBAL_CLAIM_LOCK = 728_006
MAX_ACTIVE_PROJECTS = 2
DEFAULT_LEASE_SECONDS = 45


class PostgresRunQueue:
    """Only durable database operations; execution itself always happens after commit."""

    def __init__(self, sessions: sessionmaker[Session], *, lease_seconds: int = DEFAULT_LEASE_SECONDS):
        if lease_seconds < 5:
            raise ValueError("lease_seconds_too_short")
        self.sessions = sessions
        self.lease_seconds = lease_seconds

    def claim_next(self, lease_owner: str) -> Run | None:
        """Claim at most one queued run and commit its lease before returning it."""
        if not lease_owner or len(lease_owner) > 200:
            raise ValueError("invalid_lease_owner")
        now = datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": GLOBAL_CLAIM_LOCK})
            self._expire_approvals(db, now)
            active_projects = set(
                db.scalars(
                    select(Run.project_id).distinct().where(
                        Run.status.in_(("running", "waiting_approval"))
                    )
                ).all()
            )
            candidates = db.execute(
                select(Run.id, Run.project_id, Run.actor_scope, Run.operation)
                .where(Run.status == "queued")
                .order_by(Run.created_at, Run.id)
                .limit(100)
            ).all()
            for run_id, project_id, scope, operation in candidates:
                if project_id in active_projects:
                    continue
                if len(active_projects) >= MAX_ACTIVE_PROJECTS:
                    break
                project = db.scalar(
                    select(Project).where(Project.id == project_id).with_for_update()
                )
                if project is None:
                    continue
                creator_is_current = self._scope_is_current(db, scope, project_id, now, operation)
                # Project-first matches submission admission lock order; skip rows
                # another transaction changed while this dispatcher was selecting.
                run = db.scalar(
                    select(Run)
                    .where(Run.id == run_id, Run.status == "queued")
                    .with_for_update(skip_locked=True)
                )
                if run is None:
                    continue
                if not creator_is_current:
                    run.status = "failed"
                    run.finished_at = now
                    append_event(
                        db,
                        run,
                        "run_failed",
                        {"status": "failed", "message_key": "errors.authorization_expired"},
                        now=now,
                    )
                    continue
                run.status = "running"
                run.lease_owner = lease_owner
                run.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
                run.heartbeat_at = now
                run.active_started_at = now
                append_event(db, run, "run_started", {"status": "running"}, now=now)
                db.flush()
                active_projects.add(project_id)
                return run
            return None

    def heartbeat(self, run_id: UUID, lease_owner: str, *, now: datetime | None = None) -> Run:
        """Renew a live authorized claim; failed rows tell the supervisor to stop."""
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            run, creator_current = self._execution_run(db, run_id, lease_owner, now)
            if not creator_current:
                self._fail(db, run, "errors.creator_unavailable", now)
            elif run.cancellation_requested_at is not None:
                # Retain the live claim while the executor proves cessation.
                # Cancellation still denies every subsequent native tool call.
                accrue_active_time(run, now)
                run.heartbeat_at = now
                run.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
            elif run.active_seconds + self._elapsed(run, now) >= MAX_ACTIVE_SECONDS:
                self._fail(db, run, "errors.active_time_limit", now)
            else:
                accrue_active_time(run, now)
                run.heartbeat_at = now
                run.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
            db.flush()
            return run
    def reserve_tool_call(self, run_id: UUID, lease_owner: str, *, now: datetime | None = None) -> int:
        """Reserve before a side effect under project, creator and run locks."""
        now = _utc(now or datetime.now(timezone.utc))
        limited: str | None = None
        reserved = 0
        with self.sessions.begin() as db:
            run, creator_current = self._execution_run(db, run_id, lease_owner, now)
            if run.cancellation_requested_at is not None:
                limited = "cancellation_requested"
            elif not creator_current:
                self._fail(db, run, "errors.creator_unavailable", now)
                limited = "creator_unavailable"
            elif run.active_seconds + self._elapsed(run, now) >= MAX_ACTIVE_SECONDS:
                self._fail(db, run, "errors.active_time_limit", now)
                limited = "active_time_limit"
            elif run.tool_calls >= MAX_TOOL_CALLS:
                self._fail(db, run, "errors.tool_call_limit", now)
                limited = "tool_call_limit"
            else:
                run.tool_calls += 1
                run.heartbeat_at = now
                run.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
                reserved = run.tool_calls
        if limited:
            raise ServiceError(limited)
        return reserved
    def finish(
        self, run_id: UUID, lease_owner: str, status: str, *,
        message_key: str | None = None, artifact_ids: tuple[UUID, ...] = (),
        evaluation_result: EvaluationResult | dict | None = None,
        now: datetime | None = None,
    ) -> Run:
        """Atomically publish a validated report and terminal event after real stop."""
        if status not in {"completed", "failed", "cancelled", "interrupted"}:
            raise ValueError("invalid_terminal_status")
        report = None
        if evaluation_result is not None:
            if status != "completed":
                raise ServiceError("native_response_invalid")
            try:
                report = EvaluationResult.model_validate(evaluation_result).model_dump(mode="json")
            except (ValidationError, TypeError, ValueError):
                raise ServiceError("native_response_invalid") from None
        now = _utc(now or datetime.now(timezone.utc))
        denied: str | None = None
        with self.sessions.begin() as db:
            if status == "completed":
                run, creator_current = self._execution_run(db, run_id, lease_owner, now)
                if run.cancellation_requested_at is not None:
                    denied = "cancellation_requested"
                elif not creator_current:
                    self._fail(db, run, "errors.creator_unavailable", now)
                    denied = "creator_unavailable"
                if report is not None and run.operation != "evaluate_job":
                    raise ServiceError("native_response_invalid")
            else:
                run = self._leased_run(db, run_id, lease_owner, now)
            if denied is None:
                accrue_active_time(run, now)
                if report is not None:
                    run.evaluation_result = report
                run.status = status
                run.finished_at = now
                self._clear_lease(run)
                data: dict[str, object] = {"status": status, "artifact_ids": artifact_ids}
                if message_key:
                    data["message_key"] = message_key
                append_event(db, run, f"run_{status}", data, now=now)
        if denied:
            raise ServiceError(denied)
        return run
    def _execution_run(self, db: Session, run_id: UUID, lease_owner: str,
                       now: datetime) -> tuple[Run, bool]:
        identity = db.execute(select(Run.project_id, Run.actor_scope, Run.operation)
                              .where(Run.id == run_id)).one_or_none()
        if identity is None:
            raise ServiceError("not_found")
        project_id, scope, operation = identity
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        creator_current = self._scope_is_current(db, scope, project_id, now, operation)
        return self._leased_run(db, run_id, lease_owner, now), creator_current

    def _leased_run(self, db: Session, run_id: UUID, lease_owner: str, now: datetime) -> Run:
        run = db.scalar(select(Run).where(Run.id == run_id).with_for_update())
        if run is None:
            raise ServiceError("not_found")
        if (
            run.status != "running"
            or run.lease_owner != lease_owner
            or run.lease_expires_at is None
            or _utc(run.lease_expires_at) <= now
        ):
            raise ServiceError("lease_lost")
        return run

    @staticmethod
    def _scope_is_current(db: Session, scope: str, project_id: UUID, now: datetime,
                          operation: str | None = None) -> bool:
        if scope == "owner":
            return db.scalar(select(OwnerSession.id).where(
                OwnerSession.revoked_at.is_(None), OwnerSession.expires_at > now,
            ).limit(1).with_for_update()) is not None
        if not scope.startswith("grant:"):
            return False
        try:
            grant_id = UUID(scope.removeprefix("grant:"))
        except ValueError:
            return False
        creator = db.scalar(select(Grant).where(
            Grant.id == grant_id, Grant.project_id == project_id,
            Grant.revoked_at.is_(None), Grant.expires_at > now,
        ).execution_options(populate_existing=True).with_for_update())
        if creator is None:
            return False
        if operation is None:
            return True
        skill = SKILL_BY_ID.get(operation)
        return skill is not None and skill.capability in creator.capabilities
    @staticmethod
    def _elapsed(run: Run, now: datetime) -> float:
        if run.active_started_at is None:
            return 0.0
        return max(0.0, (now - _utc(run.active_started_at)).total_seconds())

    def _fail(self, db: Session, run: Run, message_key: str, now: datetime) -> None:
        accrue_active_time(run, now)
        run.status = "failed"
        run.finished_at = now
        self._clear_lease(run)
        append_event(db, run, "run_failed", {"status": "failed", "message_key": message_key}, now=now)

    @staticmethod
    def _clear_lease(run: Run) -> None:
        run.lease_owner = None
        run.lease_expires_at = None
        run.heartbeat_at = None
        run.active_started_at = None

    @staticmethod
    def _expire_approvals(db: Session, now: datetime) -> None:
        due = db.scalars(
            select(Approval)
            .where(Approval.consumed_at.is_(None), Approval.expires_at <= now)
            .with_for_update(skip_locked=True)
        ).all()
        for approval in due:
            run = db.scalar(
                select(Run)
                .where(Run.project_id == approval.project_id, Run.id == approval.run_id)
                .with_for_update()
            )
            if run is None or run.status != "waiting_approval":
                continue
            approval.consumed_at = now
            approval.decision = "reject"
            approval.applied_at = now
            run.status = "failed"
            run.finished_at = now
            PostgresRunQueue._clear_lease(run)
            append_event(
                db,
                run,
                "approval_expired",
                {
                    "status": "failed",
                    "message_key": "errors.approval_expired",
                    "approval_id": approval.id,
                },
                now=now,
            )


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
