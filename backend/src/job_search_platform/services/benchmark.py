"""Admin benchmark: run evals/gold holdout v1 for one app task against a model+effort, in a background thread.

Synthetic data only. The model goes through LiteLLM like evals/gold/run_bench.py does (temporary `gold-*` alias, removed
at the end; the master key is read from env/file and never logged). One benchmark at a time per process.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import statistics
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from ..db.models import BenchmarkRun, TaskModelSetting
from ..integrations.hermes_runtime import env_effort
from .contracts import AdminBenchmark, AdminBenchmarkCase, AdminBenchmarkSummary
from .errors import ServiceError

# app operation -> gold task. document_ocr / interview_grade / interview_report have no gold task.
TASK_OF = {"evaluate_job": "evaluate", "draft_documents": "draft", "extract_experience": "extract",
           "tailor_cv": "tailor", "apply_prepare": "apply", "interview_generate": "practice"}
SUPPORTED_OPERATIONS = set(TASK_OF)
MAX_TOKENS = 16000
RED_DROP = 2.0  # quality points below the baseline that turn the verdict red

_LOCK = threading.Lock()  # ponytail: per process; a second uvicorn worker could run its own benchmark at the same time
_swept: set[str] = set()
_thread: threading.Thread | None = None  # last job thread (tests join it)
_rb = None


def _gold():
    """run_bench.py loaded by path, so the backend does not need evals to be a package."""
    global _rb
    if _rb is None:
        path = Path(os.environ.get("BENCH_GOLD_DIR") or Path(__file__).resolve().parents[4] / "evals" / "gold") / "run_bench.py"
        spec = importlib.util.spec_from_file_location("gold_run_bench", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _rb = module
    return _rb


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sweep(session) -> None:
    """First call per database in this process: rows left queued/running by a dead process become failed."""
    bind = session.get_bind().url.render_as_string(hide_password=True)
    if bind in _swept:
        return
    session.execute(update(BenchmarkRun).where(BenchmarkRun.status.in_(("queued", "running")))
                    .values(status="failed", verdict="na", finished_at=_now()))
    session.commit()
    session.expire_all()  # the bulk update bypassed rows this session already holds
    _swept.add(bind)


def _view(row: BenchmarkRun) -> AdminBenchmark:
    summary = dict(row.summary or {})
    baseline = summary.pop("baseline", None)
    return AdminBenchmark(
        id=row.id, operation=row.operation, model=row.model, effort=row.effort, status=row.status,
        cases=[AdminBenchmarkCase(**c) for c in row.cases or []],
        summary=AdminBenchmarkSummary(**summary) if summary else None,
        baseline=AdminBenchmarkSummary(**baseline) if baseline else None,
        verdict=row.verdict or "na", created_by=str(row.created_by or ""), started_at=row.started_at, finished_at=row.finished_at)


def get(session, benchmark_id: UUID) -> AdminBenchmark:
    _sweep(session)
    row = session.get(BenchmarkRun, benchmark_id, populate_existing=True)  # the job thread updates it from other sessions
    if row is None:
        raise ServiceError("not_found")
    return _view(row)


def list_for(session, operation: str | None = None) -> list[AdminBenchmark]:
    _sweep(session)
    stmt = select(BenchmarkRun).order_by(BenchmarkRun.started_at.desc())
    if operation:
        stmt = stmt.where(BenchmarkRun.operation == operation)
    return [_view(r) for r in session.scalars(stmt.limit(200).execution_options(populate_existing=True))]


def latest_for_pair(session, operation: str, model: str, effort: str) -> AdminBenchmark | None:
    _sweep(session)
    row = session.scalars(select(BenchmarkRun).where(
        BenchmarkRun.operation == operation, BenchmarkRun.model == model, BenchmarkRun.effort == effort,
        BenchmarkRun.status == "done").order_by(BenchmarkRun.finished_at.desc()).limit(1)
        .execution_options(populate_existing=True)).first()
    return _view(row) if row else None


def current_pair(session, operation: str) -> tuple[str, str]:
    """Stored task setting, else the env default (AI_MODEL_<OP> / AI_ANALYZE_MODEL, AI_REASONING_<OP>)."""
    row = session.get(TaskModelSetting, operation)
    if row is not None:
        return row.model, row.effort
    model = os.environ.get("AI_MODEL_" + operation.upper(), "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", model):
        model = os.environ.get("AI_ANALYZE_MODEL") or "ai-analyze"
    return model, env_effort(os.environ, operation)


def start(session, actor_id, operation: str, model: str, effort: str) -> AdminBenchmark:
    global _thread
    if operation not in SUPPORTED_OPERATIONS:
        raise ServiceError("not_found")
    _sweep(session)
    if not _LOCK.acquire(blocking=False):
        raise ServiceError("benchmark_busy")
    try:
        data = json.loads(_gold().HOLDOUT.read_text())
        row = BenchmarkRun(operation=operation, model=model, effort=effort, status="queued", created_by=actor_id, started_at=_now(),
                           cases=[{"id": c["id"], "state": "pending"} for c in data["cases"][TASK_OF[operation]]])
        session.add(row)
        session.commit()
        view = _view(row)
        _thread = threading.Thread(target=_job, args=(sessionmaker(bind=session.get_bind(), expire_on_commit=False),
                                                      row.id, actor_id, data), daemon=True)
        _thread.start()
    except BaseException:
        _LOCK.release()
        raise
    return view


# ---- background job ---------------------------------------------------------------------------------------------

def _price(factory, model: str):
    """(per-1M price dict {in,out,cache}, from_manual) or (None, False). Our model_prices first, OpenRouter list price second."""
    try:
        from . import pricing  # created by another task; lazy so this module works without it
        with factory() as db:
            p = pricing.price_for(db, model)
        if p is not None:
            if isinstance(p, tuple):
                p = dict(zip(("price_in", "price_out", "price_cache", "source"), p))
            get_ = (lambda k: p.get(k)) if isinstance(p, dict) else (lambda k: getattr(p, k, None))
            pin, pout = get_("price_in"), get_("price_out")
            if pin is not None and pout is not None:
                pc = get_("price_cache")
                return ({"in": float(pin), "out": float(pout), "cache": float(pin if pc is None else pc)}, get_("source") == "manual")
    except Exception:
        pass
    try:
        return _gold().prices([model])[model], False
    except Exception:
        return None, False


def _master_key() -> str:
    rb = _gold()
    key = (os.environ.get("LITELLM_MASTER_KEY") or "").strip()
    if not key and rb.KEYFILE.is_file():
        key = rb.KEYFILE.read_text().strip()
    return key or (os.environ.get("LITELLM_API_KEY") or "").strip()


class _Sink:
    """run_bench's `sink`: every finished case updates the row (own short transaction) and starts the next one."""

    def __init__(self, factory, row_id):
        self.factory, self.row_id, self.results = factory, row_id, []

    def append(self, result: dict) -> None:
        self.results.append(result)
        bad = "error" in result or bool(result.get("truncated"))
        with self.factory() as db, db.begin():
            row = db.get(BenchmarkRun, self.row_id, with_for_update=True)
            cases = [dict(c) for c in row.cases]
            nxt = False
            for c in cases:
                if c["id"] == result["case"]:
                    c["state"] = "bad" if bad else "ok"
                elif not nxt and c["state"] == "pending":
                    c["state"], nxt = "running", True
            row.cases = cases


def _summary(results: list[dict], price, manual: bool) -> dict:
    rb = _gold()
    times = [r["total_s"] for r in results if r.get("total_s")]
    cost = statistics.mean(r.get("cost_usd", 0) for r in results) if price else None
    return {"quality": round(statistics.mean(r["quality"] for r in results), 1),
            "p50_seconds": round(rb.pct(times, .5), 2) if times else 0.0, "p95_seconds": round(rb.pct(times, .95), 2) if times else 0.0,
            "cost_per_call_usd": cost, "cost_has_manual": bool(manual and price),
            "errors": sum("error" in r for r in results), "truncations": sum(bool(r.get("truncated")) for r in results)}


def _verdict(summary: dict, baseline: dict | None) -> str:
    if summary["errors"] > 0 or (baseline is not None and summary["quality"] < baseline["quality"] - RED_DROP):
        return "red"
    return "green"


def _measure(factory, row_id: UUID, operation: str, model: str, effort: str, data: dict) -> dict:
    """Run the task's cases for one row; leaves LiteLLM as it found it. Returns the summary dict."""
    rb, key = _gold(), _master_key()
    task = TASK_OF[operation]
    cases = data["cases"][task]
    with factory() as db, db.begin():
        db.execute(update(BenchmarkRun).where(BenchmarkRun.id == row_id).values(status="running", started_at=_now()))
    price, manual = _price(factory, model)
    existing = {x["model_name"] for x in rb.api("GET", "/model/info", key=key)["data"]}
    alias, created = model, None
    if model not in existing:  # an OpenRouter id: register it temporarily, as run_bench does
        alias = "gold-" + re.sub(r"[^a-z0-9]+", "-", model.lower()) + "-" + uuid4().hex[:6]
        rb.api("POST", "/model/new", {"model_name": alias, "litellm_params": {"model": "openrouter/" + model, "api_key": "os.environ/OPENROUTER_API_KEY"}}, key)
        created = alias
    try:
        if created:
            created = next(x["model_info"]["id"] for x in rb.api("GET", "/model/info", key=key)["data"] if x["model_name"] == alias)
        sink = _Sink(factory, row_id)
        with factory() as db, db.begin():  # first case shows as running
            row = db.get(BenchmarkRun, row_id)
            row.cases = [{**c, "state": "running"} if i == 0 else c for i, c in enumerate(row.cases)]
        try:
            rb.call(alias, "Reply OK", "OK", key, 200)  # warm-up, not counted
        except Exception:
            pass
        rb.worker(model, alias, [(task, c) for c in cases], data, key, price or {"in": 0, "out": 0, "cache": 0},
                  MAX_TOKENS, sink, threading.Lock(), lambda line: None, effort)
    finally:
        if created:
            try:
                rb.api("POST", "/model/delete", {"id": created}, key)
            except Exception:
                pass
    return _summary(sink.results, price, manual)


def _finish(factory, row_id: UUID, status: str, summary: dict | None = None, verdict: str = "na") -> None:
    with factory() as db, db.begin():
        db.execute(update(BenchmarkRun).where(BenchmarkRun.id == row_id)
                   .values(status=status, summary=summary, verdict=verdict, finished_at=_now()))


def _job(factory, row_id: UUID, actor_id, data: dict) -> None:
    baseline_id = None
    try:
        with factory() as db:
            row = db.get(BenchmarkRun, row_id)
            operation, model, effort = row.operation, row.model, row.effort
            cur = current_pair(db, operation)
            base = latest_for_pair(db, operation, *cur)
            if base is None and cur != (model, effort):  # no finished run of the current pair: measure it first, as its own row
                baseline = BenchmarkRun(operation=operation, model=cur[0], effort=cur[1], status="queued", created_by=actor_id, started_at=_now(),
                                        cases=[{"id": c["id"], "state": "pending"} for c in data["cases"][TASK_OF[operation]]])
                db.add(baseline)
                db.commit()
                baseline_id = baseline.id
            base_summary = base.summary.model_dump() if base and base.summary else None
        if baseline_id:
            base_summary = _measure(factory, baseline_id, operation, cur[0], cur[1], data)
            _finish(factory, baseline_id, "done", base_summary, _verdict(base_summary, None))
        summary = _measure(factory, row_id, operation, model, effort, data)
        _finish(factory, row_id, "done", {**summary, "baseline": base_summary}, _verdict(summary, base_summary))
    except Exception:
        for rid in (baseline_id, row_id):
            if rid:
                with factory() as db, db.begin():
                    db.execute(update(BenchmarkRun).where(BenchmarkRun.id == rid, BenchmarkRun.status.in_(("queued", "running")))
                               .values(status="failed", verdict="na", finished_at=_now()))
    finally:
        _LOCK.release()
