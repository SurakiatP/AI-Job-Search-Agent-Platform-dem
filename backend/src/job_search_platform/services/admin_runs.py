"""Admin AI runs: list, detail, cancel, retry. Metadata only (PDPA): never snapshots, payloads or event text."""
from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, exists, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import aggregate_order_by

from job_search_platform.db.models import LlmCall, Project, Run
from job_search_platform.db.models import RunEvent as RunEventRow
from job_search_platform.services import admin_audit
from job_search_platform.services.admin_audit import _decode
from job_search_platform.services.admin_users import short_id
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService

PAGE = 50
_KEY = re.compile(r"[a-z][a-z0-9_.]{0,119}")
_FAILURE_EVENTS = ("run_failed", "run_interrupted")
_CANCELLABLE = {"queued", "running", "waiting_approval", "needs_input"}


def _key(value: str | None) -> str | None:
    """A locale-style code or nothing; anything shaped like text is dropped."""
    return value if value and _KEY.fullmatch(value) else None


def _num(value) -> float | None:
    return None if value is None else float(value)


def _query():
    calls = (select(LlmCall.run_id.label("run_id"),
                    func.sum(LlmCall.input_tokens).label("input_tokens"),
                    func.sum(LlmCall.output_tokens).label("output_tokens"),
                    func.sum(LlmCall.cached_tokens).label("cached_tokens"),
                    func.sum(LlmCall.cost_usd).label("cost_usd"),
                    func.bool_or(LlmCall.price_source == "manual").label("manual"),
                    func.count().label("n"),
                    func.array_agg(aggregate_order_by(LlmCall.model, LlmCall.created_at.desc())).label("models"))
             .where(LlmCall.run_id.is_not(None)).group_by(LlmCall.run_id).subquery())
    snap = Run.config_snapshot
    snapshot_model = func.coalesce(snap["model"].as_string(), snap["gateway"]["analyze_model"].as_string())
    failure = (select(RunEventRow.public_data["message_key"].as_string())
               .where(RunEventRow.run_id == Run.id, RunEventRow.event_type.in_(_FAILURE_EVENTS))
               .order_by(RunEventRow.sequence.desc()).limit(1).correlate(Run).scalar_subquery())
    started = (select(func.min(RunEventRow.created_at))
               .where(RunEventRow.run_id == Run.id, RunEventRow.event_type == "run_started")
               .correlate(Run).scalar_subquery())
    query = (select(Run, Project.user_id, calls, snapshot_model.label("snapshot_model"),
                    func.coalesce(snap["effort"].as_string(), snap["gateway"]["effort"].as_string()).label("effort"),
                    started.label("started_at"), failure.label("failure"))
             .join(Project, Project.id == Run.project_id)
             .outerjoin(calls, calls.c.run_id == Run.id))
    return query, calls, snapshot_model


def _item(row) -> dict:
    run = row.Run
    models = row.models or []
    finished = run.finished_at
    return {
        "id": run.id, "user_id": row.user_id,
        "user_short_id": None if row.user_id is None else short_id(row.user_id),
        "operation": run.operation, "status": run.status,
        "model": models[0] if models else row.snapshot_model, "effort": row.effort,
        "created_at": run.created_at, "started_at": row.started_at, "finished_at": finished,
        "duration_seconds": None if finished is None else max(0.0, (finished - run.created_at).total_seconds()),
        "input_tokens": int(row.input_tokens or 0), "output_tokens": int(row.output_tokens or 0),
        "cached_tokens": int(row.cached_tokens or 0),
        "cost_usd": _num(row.cost_usd) if row.n else None, "cost_is_manual": bool(row.manual),
        "failure_key": (_key(row.failure) or "errors.run_failed") if run.status in {"failed", "interrupted"} else None,
        "retry_of_id": run.retry_of_id,
    }


def list_runs(db, filters: dict, cursor: str | None = None, limit: int = PAGE) -> dict:
    """Newest first. filters: status, operation, model, since, until."""
    query, _calls, snapshot_model = _query()
    if filters.get("status"):
        query = query.where(Run.status == filters["status"])
    if filters.get("operation"):
        query = query.where(Run.operation == filters["operation"])
    if filters.get("model"):
        model = filters["model"]
        any_call = exists().where(LlmCall.run_id == Run.id)
        query = query.where(or_(exists().where(LlmCall.run_id == Run.id, LlmCall.model == model),
                                and_(~any_call, snapshot_model == model)))
    if filters.get("since"):
        query = query.where(Run.created_at >= filters["since"])
    if filters.get("until"):
        query = query.where(Run.created_at < filters["until"])
    if cursor:
        query = query.where(tuple_(Run.created_at, Run.id) < tuple_(*_decode(cursor)))
    rows = db.execute(query.order_by(Run.created_at.desc(), Run.id.desc()).limit(limit + 1)).all()
    page = rows[:limit]
    last = page[-1].Run if len(rows) > limit else None
    nxt = base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.id}".encode()).decode() if last else None
    return {"items": [_item(r) for r in page], "next_cursor": nxt}


def detail(db, run_id: UUID) -> dict:
    query, _calls, _model = _query()
    row = db.execute(query.where(Run.id == run_id)).first()
    if row is None:
        raise ServiceError("not_found")
    events = db.scalars(select(RunEventRow).where(RunEventRow.run_id == run_id).order_by(RunEventRow.sequence)).all()
    calls = db.scalars(select(LlmCall).where(LlmCall.run_id == run_id).order_by(LlmCall.created_at, LlmCall.id)).all()
    return {
        "run": _item(row),
        "events": [{"sequence": e.sequence, "event_type": e.event_type, "step": e.public_data.get("step"),
                    "status": e.public_data.get("status"), "message_key": _key(e.public_data.get("message_key")),
                    "model": e.public_data.get("model"), "latency_ms": e.public_data.get("latency_ms"),
                    "input_tokens": e.public_data.get("input_tokens"), "output_tokens": e.public_data.get("output_tokens"),
                    "created_at": e.created_at} for e in events],
        "calls": [{"operation": c.operation, "model": c.model, "input_tokens": c.input_tokens,
                   "output_tokens": c.output_tokens, "cached_tokens": c.cached_tokens, "api_calls": c.api_calls,
                   "latency_ms": c.latency_ms or 0, "price_source": c.price_source, "cost_usd": _num(c.cost_usd),
                   "created_at": c.created_at} for c in calls],
    }


def cancel(db, actor_id: UUID, run_id: UUID) -> dict:
    """Reuses the owner's cancel logic. Queued runs end now; running ones get a cancel request the worker honours."""
    run = db.scalar(select(Run).where(Run.id == run_id))
    if run is None:
        raise ServiceError("not_found")
    db.scalar(select(Project).where(Project.id == run.project_id).with_for_update())  # same lock order as RunService.cancel
    run = db.scalar(select(Run).where(Run.id == run_id).with_for_update())
    if run.status not in _CANCELLABLE:
        raise ServiceError("run_finished")
    RunService.cancel_locked(db, run, datetime.now(timezone.utc))
    admin_audit.record(db, actor_id, "run.cancel", "run", run_id, {"operation": run.operation, "status": run.status})
    return detail(db, run_id)
