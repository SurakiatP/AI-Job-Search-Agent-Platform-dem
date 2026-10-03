"""PostgreSQL queue claims, worker leases, and execution-budget accounting."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import Approval, Grant, OwnerSession, Project, Run
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import MAX_ACTIVE_SECONDS, MAX_TOOL_CALLS, accrue_active_time, append_event

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
                select(Run.id, Run.project_id, Run.actor_scope)
                .where(Run.status == "queued")
                .order_by(Run.created_at, Run.id)
                .limit(100)
            ).all()
            for run_id, project_id, scope in candidates:
                if project_id in active_projects:
                    continue
                if len(active_projects) >= MAX_ACTIVE_PROJECTS:
                    break
                project = db.scalar(
                    select(Project).where(Project.id == project_id).with_for_update()
                )
                if project is None:
                    continue
                creator_is_current = self._scope_is_current(db, scope, project_id, now)
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
        """Renew a still-live lease and accrue precise elapsed execution seconds."""
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            run = self._leased_run(db, run_id, lease_owner, now)
            accrued = self._elapsed(run, now)
            if run.active_seconds + accrued >= MAX_ACTIVE_SECONDS:
                self._fail(db, run, "errors.active_time_limit", now)
            else:
                accrue_active_time(run, now)
                run.heartbeat_at = now
                run.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
            db.flush()
            return run

    def reserve_tool_call(self, run_id: UUID, lease_owner: str, *, now: datetime | None = None) -> int:
        """Atomically reserve a tool call before its external side effect begins."""
        now = _utc(now or datetime.now(timezone.utc))
        limited: str | None = None
        reserved = 0
        with self.sessions.begin() as db:
            run = self._leased_run(db, run_id, lease_owner, now)
            if run.active_seconds + self._elapsed(run, now) >= MAX_ACTIVE_SECONDS:
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
        self,
        run_id: UUID,
        lease_owner: str,
        status: str,
        *,
        message_key: str | None = None,
        artifact_ids: tuple[UUID, ...] = (),
        now: datetime | None = None,
    ) -> Run:
        """Persist one terminal outcome after the executor has stopped."""
        if status not in {"completed", "failed", "cancelled", "interrupted"}:
            raise ValueError("invalid_terminal_status")
        now = _utc(now or datetime.now(timezone.utc))
        with self.sessions.begin() as db:
            run = self._leased_run(db, run_id, lease_owner, now)
            if run.status in {"completed", "failed", "cancelled", "interrupted"}:
                raise ServiceError("terminal_run")
            accrue_active_time(run, now)
            run.status = status
            run.finished_at = now
            self._clear_lease(run)
            event_type = f"run_{status}"
            data: dict[str, object] = {"status": status, "artifact_ids": artifact_ids}
            if message_key:
                data["message_key"] = message_key
            append_event(db, run, event_type, data, now=now)
            return run

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
    def _scope_is_current(db: Session, scope: str, project_id: UUID, now: datetime) -> bool:
        if scope == "owner":
            return (
                db.scalar(
                    select(OwnerSession.id)
                    .where(
                        OwnerSession.revoked_at.is_(None),
                        OwnerSession.expires_at > now,
                    )
                    .limit(1)
                    .with_for_update()
                )
                is not None
            )
        if not scope.startswith("grant:"):
            return False
        try:
            grant_id = UUID(scope.removeprefix("grant:"))
        except ValueError:
            return False
        return (
            db.scalar(
                select(Grant.id)
                .where(
                    Grant.id == grant_id,
                    Grant.project_id == project_id,
                    Grant.revoked_at.is_(None),
                    Grant.expires_at > now,
                )
                .limit(1)
                .with_for_update()
            )
            is not None
        )

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
