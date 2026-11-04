"""Admin console numbers, aggregated live from runs, llm_calls and owner_sessions (indexed on their time column).

Metadata only (PDPA): counts, durations, tokens, cost, operation names, model names, short user ids. No content.
Day, week and weekday buckets follow Asia/Bangkok (a fixed UTC+7 since 1920, so a bucket index is plain arithmetic).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import Integer, cast, func, literal_column, select

from job_search_platform.db.models import (
    A2APushConfig, IngestRun, LlmCall, OwnerSession, Project, Run, User, WebhookDelivery, WebhookEndpoint,
)
from job_search_platform.services import admin_audit
from job_search_platform.services.admin_users import short_id
from job_search_platform.services.errors import ServiceError

BKK = timezone(timedelta(hours=7))
DAY, WEEK = 86400, 7 * 86400
# range -> (window seconds or None for "since start", bucket seconds)
RANGES = {"1m": (60, 5), "5m": (300, 15), "10m": (600, 30), "15m": (900, 60), "30m": (1800, 60), "1h": (3600, 120),
          "4h": (14400, 600), "10h": (36000, 1800), "7d": (7 * DAY, DAY), "30d": (30 * DAY, DAY),
          "90d": (90 * DAY, DAY), "all": (None, WEEK)}  # ponytail: "all" stays weekly; the spec's monthly step after 2 years is not built
WIDGETS = ("trend", "attention", "weekday", "speed", "tasks", "activity", "models")
DEFAULT_PREFS = {"widgets": ["trend", "attention", "weekday", "speed", "tasks"], "thb_rate": 35.0}
SPEED_TARGET_SECONDS = 30
SPEED_TARGET_SHARE = 0.9
FAILED_WINDOW = timedelta(hours=24)
ERROR_CODE = re.compile(r"[A-Za-z0-9_.:-]{1,40}")


@dataclass(frozen=True)
class Window:
    start: datetime
    end: datetime
    bucket: int  # seconds

    @property
    def count(self) -> int:
        return int((self.end - self.start).total_seconds() // self.bucket)

    def previous(self) -> "Window":
        return Window(self.start - (self.end - self.start), self.start, self.bucket)

    def bucket_start(self, index: int) -> datetime:
        return self.start + timedelta(seconds=index * self.bucket)


def _midnight(moment: datetime) -> datetime:
    return moment.astimezone(BKK).replace(hour=0, minute=0, second=0, microsecond=0)


def _utc(start: datetime, end: datetime, bucket: int) -> Window:
    return Window(start.astimezone(timezone.utc), end.astimezone(timezone.utc), bucket)


def window(range_: str, now: datetime, first_seen: datetime | None = None) -> Window:
    """The current window of a range, aligned to whole buckets (days and weeks start at Bangkok midnight)."""
    if range_ not in RANGES:
        raise ServiceError("invalid_range")
    span, bucket = RANGES[range_]
    if span is None:  # since start: whole Bangkok weeks (Monday first) from the first record to this week's end
        monday = _midnight(now) - timedelta(days=now.astimezone(BKK).weekday())
        first = _midnight(first_seen or now)
        return _utc(first - timedelta(days=first.weekday()), monday + timedelta(seconds=WEEK), bucket)
    if bucket < DAY:
        end = datetime.fromtimestamp((int(now.timestamp() // bucket) + 1) * bucket, timezone.utc)
    else:
        end = _midnight(now) + timedelta(days=1)
    return _utc(end - timedelta(seconds=span), end, bucket)


def _bkk(column):
    return func.timezone(literal_column("'Asia/Bangkok'"), column)


def _index(column, w: Window):
    """SQL bucket number of a timestamp. Numbers are inlined so SELECT and GROUP BY render the same text."""
    return cast(func.floor((func.extract("epoch", column) - int(w.start.timestamp())) / w.bucket), Integer)


def _in(column, w: Window):
    return (column >= w.start, column < w.end)


def _f(value) -> float:
    return float(value or 0)


def _first_seen(db) -> datetime | None:
    first = [db.scalar(select(func.min(Run.created_at))), db.scalar(select(func.min(LlmCall.created_at)))]
    first = [f for f in first if f is not None]
    return min(first) if first else None


def _totals(db, w: Window) -> dict:
    runs, failed = db.execute(select(func.count(), func.count().filter(Run.status == "failed"))
                              .where(*_in(Run.created_at, w))).one()
    users = db.scalar(select(func.count(func.distinct(OwnerSession.user_id))).where(*_in(OwnerSession.last_seen_at, w)))
    cost = db.scalar(select(func.sum(LlmCall.cost_usd)).where(*_in(LlmCall.created_at, w)))
    return {"runs": runs, "active_users": users, "failure_rate": failed / runs if runs else 0.0, "cost_usd": _f(cost)}


def _series(db, w: Window) -> list[dict]:
    n = w.count
    points = [{"start": w.bucket_start(k), "runs": 0, "failures": 0, "active_users": 0, "cost_usd": 0.0} for k in range(n)]
    i = _index(Run.created_at, w)
    for k, runs, failed in db.execute(select(i, func.count(), func.count().filter(Run.status == "failed"))
                                      .where(*_in(Run.created_at, w)).group_by(i)):
        points[k]["runs"], points[k]["failures"] = runs, failed
    i = _index(OwnerSession.last_seen_at, w)
    for k, users in db.execute(select(i, func.count(func.distinct(OwnerSession.user_id)))
                               .where(*_in(OwnerSession.last_seen_at, w)).group_by(i)):
        points[k]["active_users"] = users
    i = _index(LlmCall.created_at, w)
    for k, cost in db.execute(select(i, func.sum(LlmCall.cost_usd)).where(*_in(LlmCall.created_at, w)).group_by(i)):
        points[k]["cost_usd"] = _f(cost)
    return points


def _has_manual(db, w: Window) -> bool:
    return bool(db.scalar(select(func.count()).select_from(LlmCall).where(*_in(LlmCall.created_at, w), LlmCall.price_source == "manual")))


def _weekday(db, now: datetime) -> list[float]:
    """Average runs per weekday over the last 90 Bangkok days, Sunday first (the Postgres dow order)."""
    w = window("90d", now)
    dow = func.extract("dow", _bkk(Run.created_at))
    counts = {int(d): n for d, n in db.execute(select(dow, func.count()).where(*_in(Run.created_at, w)).group_by(dow))}
    days = [0] * 7
    for k in range(90):
        days[(w.bucket_start(k).astimezone(BKK).weekday() + 1) % 7] += 1
    return [round(counts.get(d, 0) / days[d], 2) for d in range(7)]


def _speed(db, w: Window) -> dict:
    done, quick = db.execute(select(
        func.count(), func.count().filter((Run.finished_at - Run.created_at) <= timedelta(seconds=SPEED_TARGET_SECONDS)))
        .where(*_in(Run.created_at, w), Run.status == "completed", Run.finished_at.isnot(None))).one()
    return {"within_30s_ratio": quick / done if done else None, "target": SPEED_TARGET_SHARE}


def _top_tasks(db, w: Window) -> list[dict]:
    seconds = func.extract("epoch", Run.finished_at - Run.created_at)
    rows = db.execute(select(
        Run.operation, func.count(), func.count().filter(Run.status == "failed"),
        func.percentile_cont(0.5).within_group(seconds).filter(Run.finished_at.isnot(None)))
        .where(*_in(Run.created_at, w)).group_by(Run.operation).order_by(func.count().desc(), Run.operation).limit(10)).all()
    cost = dict(db.execute(select(LlmCall.operation, func.sum(LlmCall.cost_usd)).where(*_in(LlmCall.created_at, w))
                           .group_by(LlmCall.operation)).all())
    return [{"operation": op, "runs": n, "failure_rate": failed / n, "p50_seconds": None if p50 is None else round(float(p50), 1),
             "cost_usd": _f(cost.get(op))} for op, n, failed, p50 in rows]


def _cost_by_model(db, w: Window) -> list[dict]:
    total = func.coalesce(func.sum(LlmCall.cost_usd), 0)
    rows = db.execute(select(LlmCall.model, func.count(), total, func.count().filter(LlmCall.price_source == "manual"))
                      .where(*_in(LlmCall.created_at, w)).group_by(LlmCall.model).order_by(total.desc(), LlmCall.model).limit(10)).all()
    return [{"model": m, "calls": n, "cost_usd": _f(c), "has_manual": manual > 0} for m, n, c, manual in rows]


def _code(value) -> str | None:
    return None if value is None else (value if isinstance(value, str) and ERROR_CODE.fullmatch(value) else "error")


def _boards(per_board) -> dict[str, dict]:
    """Boards of one ingest run (the index step excluded): state complete|partial|failed, counts, error code only."""
    out = {}
    for key, entry in (per_board or {}).items() if isinstance(per_board, dict) else ():
        if key == "index" or not isinstance(entry, dict):
            continue
        state = {"ok": "complete", "failed": "failed"}.get(entry.get("state"), "partial")  # skipped = partial
        n = lambda name: entry[name] if isinstance(entry.get(name), int) and not isinstance(entry.get(name), bool) else 0  # noqa: E731
        out[str(key)[:80]] = {"status": state, "jobs_total": n("fetched"), "jobs_new": n("created"), "error_code": _code(entry.get("error"))}
    return out


def ingest_history(db, runs: int = 24) -> list[dict]:
    """Latest entry of every board from the newest finished runs, plus each earlier non-complete entry."""
    seen, items = set(), []
    for run in db.scalars(select(IngestRun).where(IngestRun.status != "running").order_by(IngestRun.started_at.desc()).limit(runs)):
        for board, entry in _boards(run.per_board).items():
            if board not in seen or entry["status"] != "complete":
                items.append({"board": board, "at": run.finished_at or run.started_at, **entry})
            seen.add(board)
    return items


def _attention(db, now: datetime, components: dict) -> list[dict]:
    items = []
    rows = db.execute(select(Run.operation, func.count()).where(Run.status == "failed", Run.created_at >= now - FAILED_WINDOW)
                      .group_by(Run.operation).order_by(func.count().desc(), Run.operation)).all()
    for op, n in rows:
        items.append({"kind": "failed_runs", "severity": "bad", "title_key": "attention.failed_runs",
                      "params": {"count": n, "operation": op, "hours": 24}, "target": f"/admin/runs?status=failed&operation={op}"})
    for name, state in components.items():
        if state == "down":
            items.append({"kind": "health_down", "severity": "bad", "title_key": "attention.health_down",
                          "params": {"component": name}, "target": "/admin/system"})
    latest = db.scalar(select(IngestRun).where(IngestRun.status != "running").order_by(IngestRun.started_at.desc()).limit(1))
    for board, entry in _boards(latest.per_board if latest else None).items():
        if entry["status"] != "complete":
            kind = "ingest_failed" if entry["status"] == "failed" else "ingest_partial"
            params = {"board": board, **({"error": entry["error_code"]} if entry["error_code"] else {})}
            items.append({"kind": kind, "severity": "warn", "title_key": f"attention.{kind}", "params": params, "target": "/admin/system"})
    dead = db.scalar(select(func.count()).select_from(WebhookDelivery).where(WebhookDelivery.status == "dead"))
    if dead:
        items.append({"kind": "dead_webhooks", "severity": "warn", "title_key": "attention.dead_webhooks",
                      "params": {"count": dead}, "target": "/admin/system"})
    return items


def _activity(db) -> list[dict]:
    return [{**item, "actor_email": item["actor_email"] or ""} for item in admin_audit.list(db, limit=5)["items"]]


def overview(db, range_: str, now: datetime, components: dict) -> dict:
    """The whole Overview payload (AdminOverview). components: {postgres, object_store, llm_gateway, sandbox} -> ok|down."""
    w = window(range_, now, _first_seen(db) if range_ == "all" else None)
    compare = range_ != "all"
    cur, prev = _totals(db, w), (_totals(db, w.previous()) if compare else None)
    kpis = {name: {"value": cur[name], "previous": prev[name] if prev else None} for name in cur}
    kpis["cost_has_manual"] = _has_manual(db, w)
    return {
        "range": range_, "bucket_seconds": w.bucket, "generated_at": now, "compare": compare, "kpis": kpis,
        "series": _series(db, w), "previous_series": _series(db, w.previous()) if compare else [],
        "attention": _attention(db, now, components), "health": {"components": components},
        "weekday": _weekday(db, now), "speed": _speed(db, w), "top_tasks": _top_tasks(db, w),
        "cost_by_model": _cost_by_model(db, w), "activity": _activity(db),
    }


def csv_rows(db, range_: str, now: datetime) -> list[list]:
    """Bucket rows only: no user identifiers, no content."""
    w = window(range_, now, _first_seen(db) if range_ == "all" else None)
    return [[p["start"].isoformat(), p["runs"], p["failures"], p["active_users"], f'{p["cost_usd"]:.6f}'] for p in _series(db, w)]


def bucket(db, range_: str, metric: str, start: datetime) -> dict:
    """Per-task breakdown of one trend bucket. Each part is that task's value of the metric."""
    if range_ not in RANGES:
        raise ServiceError("invalid_range")
    start = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
    end = start + timedelta(seconds=RANGES[range_][1])
    in_run, in_call = (Run.created_at >= start, Run.created_at < end), (LlmCall.created_at >= start, LlmCall.created_at < end)
    if metric == "cost_usd":
        parts = [(op, _f(v)) for op, v in db.execute(select(LlmCall.operation, func.sum(LlmCall.cost_usd)).where(*in_call).group_by(LlmCall.operation))]
        value = sum(v for _, v in parts)
    elif metric == "active_users":
        parts = [(op, n) for op, n in db.execute(select(Run.operation, func.count(func.distinct(Project.user_id)))
                                                  .join(Project, Project.id == Run.project_id).where(*in_run).group_by(Run.operation))]
        value = db.scalar(select(func.count(func.distinct(OwnerSession.user_id)))
                          .where(OwnerSession.last_seen_at >= start, OwnerSession.last_seen_at < end))
    else:
        rows = db.execute(select(Run.operation, func.count(), func.count().filter(Run.status == "failed")).where(*in_run).group_by(Run.operation)).all()
        total, failed = sum(r[1] for r in rows), sum(r[2] for r in rows)
        if metric == "runs":
            parts, value = [(op, n) for op, n, _ in rows], total
        else:
            parts, value = [(op, f / n) for op, n, f in rows], (failed / total if total else 0.0)
    parts.sort(key=lambda p: (-p[1], p[0]))
    return {"range": range_, "metric": metric, "start": start, "end": end, "value": float(value),
            "parts": [{"operation": op, "value": float(v)} for op, v in parts if v]}


def get_prefs(db, user_id: UUID) -> dict:
    stored = db.scalar(select(User.admin_prefs).where(User.id == user_id)) or {}
    return {"widgets": stored.get("widgets", DEFAULT_PREFS["widgets"]), "thb_rate": stored.get("thb_rate", DEFAULT_PREFS["thb_rate"])}


def set_prefs(db, user_id: UUID, widgets: list[str], thb_rate: float) -> dict:
    if any(w not in WIDGETS for w in widgets):
        raise ServiceError("invalid_prefs")
    user = db.get(User, user_id)
    if user is None:
        raise ServiceError("not_found")
    user.admin_prefs = {"widgets": list(dict.fromkeys(widgets)), "thb_rate": thb_rate}
    return get_prefs(db, user_id)


def _usage_row(key: str, requests: int, tin, tout, tcache, cost, costed: int, manual: int) -> dict:
    return {"key": key, "requests": requests, "input_tokens": int(tin or 0), "output_tokens": int(tout or 0),
            "cached_tokens": int(tcache or 0), "cost_usd": _f(cost) if costed else None,
            "cost_per_request_usd": _f(cost) / costed if costed else None, "has_manual": manual > 0,
            "uncosted_requests": requests - costed}


def usage(db, range_: str, group_by: str, now: datetime) -> dict:
    w = window(range_, now, _first_seen(db) if range_ == "all" else None)
    key = {"task": LlmCall.operation, "model": LlmCall.model, "user": LlmCall.user_id,
           "day": func.to_char(func.date_trunc("day", _bkk(LlmCall.created_at)), literal_column("'YYYY-MM-DD'"))}[group_by]
    fields = (func.count(), func.sum(LlmCall.input_tokens), func.sum(LlmCall.output_tokens), func.sum(LlmCall.cached_tokens),
              func.sum(LlmCall.cost_usd), func.count(LlmCall.cost_usd), func.count().filter(LlmCall.price_source == "manual"))
    query = select(key, *fields).where(*_in(LlmCall.created_at, w)).group_by(key)
    query = query.order_by(key) if group_by == "day" else query.order_by(func.coalesce(func.sum(LlmCall.cost_usd), 0).desc(), func.count().desc()).limit(200)
    rows = [_usage_row("" if k is None else (short_id(k) if group_by == "user" else k), *rest) for k, *rest in db.execute(query)]
    total = db.execute(select(*fields).where(*_in(LlmCall.created_at, w))).one()
    return {"range": range_, "group_by": group_by, "generated_at": now, "totals": _usage_row("all", *total), "rows": rows}


def webhook_counts(db) -> dict:
    counts = dict(db.execute(select(WebhookDelivery.status, func.count()).group_by(WebhookDelivery.status)).all())
    return {name: counts.get(name, 0) for name in ("pending", "delivered", "dead")}


def webhook_deliveries(db, status: str | None = None, delivery_id: UUID | None = None, limit: int = 100) -> list[dict]:
    """Endpoint host only: never the URL, secret or payload."""
    query = (select(WebhookDelivery, Project.user_id, WebhookEndpoint.url, A2APushConfig.url)
             .join(Project, Project.id == WebhookDelivery.project_id)
             .outerjoin(WebhookEndpoint, WebhookEndpoint.id == WebhookDelivery.endpoint_id)
             .outerjoin(A2APushConfig, A2APushConfig.id == WebhookDelivery.push_config_id)
             .order_by(WebhookDelivery.created_at.desc(), WebhookDelivery.id).limit(limit))
    if status:
        query = query.where(WebhookDelivery.status == status)
    if delivery_id:
        query = query.where(WebhookDelivery.id == delivery_id)
    out = []
    for d, user_id, endpoint_url, push_url in db.execute(query):
        try:
            host = urlsplit(endpoint_url or push_url or "").hostname
        except ValueError:
            host = None
        out.append({"id": d.id, "user_short_id": short_id(user_id) if user_id else None, "host": host, "event_type": d.event_type,
                    "status": d.status, "attempts": d.attempts, "last_status_code": d.last_status_code,
                    "created_at": d.created_at, "delivered_at": d.delivered_at})
    return out
