"""Prometheus metrics (WP1 observability). Labels never carry user ids, emails, query strings or raw paths.

observe_* helpers never raise: metrics must not break a request, a run or an LLM call.
"""
from __future__ import annotations

import logging
import math
import threading
import time
from collections.abc import Callable

from prometheus_client import REGISTRY, Counter, Histogram, start_http_server
from prometheus_client.core import GaugeMetricFamily
from sqlalchemy import func, select, text

logger = logging.getLogger(__name__)

_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})
_KINDS = frozenset({"agent_round", "jev"})
_OUTCOMES = frozenset({"completed", "failed", "cancelled", "interrupted", "waiting_approval", "needs_input"})
_MODEL_MAX = 100

HTTP_REQUESTS = Counter("jsp_http_requests_total", "HTTP requests", ["method", "route", "status_class"])
HTTP_DURATION = Histogram("jsp_http_request_duration_seconds", "HTTP request duration", ["method", "route"])
RUNS = Counter("jsp_runs_total", "Agent runs finished executing", ["operation", "outcome"])
RUN_DURATION = Histogram("jsp_run_duration_seconds", "Agent run execution time", ["operation"],
                         buckets=(1, 5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600))
LLM_REQUESTS = Counter("jsp_llm_requests_total", "LLM calls", ["kind", "model"])
LLM_DURATION = Histogram("jsp_llm_duration_seconds", "LLM call duration", ["kind", "model"],
                         buckets=(0.25, 0.5, 1, 2, 5, 10, 20, 40, 80, 160))
LLM_TOKENS = Counter("jsp_llm_tokens_total", "LLM tokens reported by the provider", ["kind", "model", "direction"])


def _seconds(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) and value >= 0 else None


def _model(value) -> str:
    return value[:_MODEL_MAX] if isinstance(value, str) and value else "unknown"


def observe_request(method: str, route: str | None, status: int, seconds: float) -> None:
    try:
        method = method.upper() if isinstance(method, str) and method.upper() in _METHODS else "OTHER"
        route = route if isinstance(route, str) and route else "other"
        status_class = f"{status // 100}xx" if isinstance(status, int) and 100 <= status < 600 else "5xx"
        HTTP_REQUESTS.labels(method, route, status_class).inc()
        if (value := _seconds(seconds)) is not None:
            HTTP_DURATION.labels(method, route).observe(value)
    except Exception:
        logger.debug("metric_dropped")


def observe_run(operation: str | None, outcome: str | None, seconds: float) -> None:
    try:
        operation = operation if isinstance(operation, str) and operation else "unknown"
        RUNS.labels(operation, outcome if outcome in _OUTCOMES else "error").inc()
        if (value := _seconds(seconds)) is not None:
            RUN_DURATION.labels(operation).observe(value)
    except Exception:
        logger.debug("metric_dropped")


def observe_llm(kind: str, model: str | None, seconds: float, input_tokens: int | None,
                output_tokens: int | None) -> None:
    try:
        model = _model(model)
        kind = kind if kind in _KINDS else "unknown"
        LLM_REQUESTS.labels(kind, model).inc()
        if (value := _seconds(seconds)) is not None:
            LLM_DURATION.labels(kind, model).observe(value)
        for direction, tokens in (("input", input_tokens), ("output", output_tokens)):
            if isinstance(tokens, int) and not isinstance(tokens, bool) and tokens > 0:
                LLM_TOKENS.labels(kind, model, direction).inc(tokens)
    except Exception:
        logger.debug("metric_dropped")


_ATS = frozenset({"freehire", "greenhouse", "lever", "smartrecruiters"})
_CRAWLED = frozenset({"jobtopgun", "jobbkk"})
_ROW_KINDS = ("fetched", "created", "deleted")
_STATES = ("ok", "failed", "skipped")
RECENT_RUNS = 200  # ~8 days of hourly runs: enough to find each source's last success


def source_of(key: str) -> str | None:
    """per_board key -> source label; ATS boards collapse to their source so board tokens never become labels."""
    head, _, tail = key.partition(":") if isinstance(key, str) else ("", "", "")
    if head == "crawl":
        return tail if tail in _CRAWLED else None
    return head if head in _ATS and tail else None


def _source_states(per_board) -> dict[str, dict]:
    """Per source: state (any board ok -> ok; none ok and any failed -> failed; else skipped) and summed rows."""
    grouped: dict[str, dict] = {}
    for key, entry in (per_board or {}).items() if isinstance(per_board, dict) else ():
        source = source_of(key)
        if source is None or not isinstance(entry, dict):
            continue
        item = grouped.setdefault(source, {"states": set(), "rows": dict.fromkeys(_ROW_KINDS, 0)})
        item["states"].add(entry.get("state"))
        for kind in _ROW_KINDS:
            value = entry.get(kind)
            if isinstance(value, int) and not isinstance(value, bool):
                item["rows"][kind] += value
    for item in grouped.values():
        states = item.pop("states")
        item["state"] = "ok" if "ok" in states else "failed" if "failed" in states else "skipped"
    return grouped


class ScrapeCollector:
    """Database and search values computed at scrape time, at most once per ttl; a failure reports *_up 0."""

    def __init__(self, sessions, search_probe: Callable[[], int], *, clock=time.monotonic, ttl: float = 30.0):
        self._sessions, self._probe, self._clock, self._ttl = sessions, search_probe, clock, ttl
        self._lock = threading.Lock()
        self._at: float | None = None
        self._families: list = []

    def describe(self):
        return []

    def collect(self):
        if not self._lock.acquire(blocking=False):  # a rebuild is running: never queue behind it
            return list(self._families) or [
                GaugeMetricFamily("jsp_db_up", "Database reachable at the last scrape", value=0),
                GaugeMetricFamily("jsp_search_up", "Search index reachable at the last scrape", value=0)]
        try:
            now = self._clock()
            if self._at is None or now - self._at >= self._ttl:
                self._families, self._at = self._build(), now
            return list(self._families)
        finally:
            self._lock.release()

    def _query(self, db) -> dict:
        from job_search_platform.db.models import IngestRun, JobPosting, Run  # lazy: keeps import light

        db.execute(text("SET LOCAL statement_timeout = '2s'"))
        return {
            "runs_in_state": dict(db.execute(select(Run.status, func.count()).group_by(Run.status)).all()),
            "postings": dict(db.execute(select(JobPosting.source, func.count())
                                        .where(JobPosting.canonical_id.is_(None)).group_by(JobPosting.source)).all()),
            "last_run": {status: at.timestamp() for status, at in db.execute(
                select(IngestRun.status, func.max(IngestRun.finished_at))
                .where(IngestRun.finished_at.is_not(None)).group_by(IngestRun.status)).all() if at},
            "recent_runs": list(db.scalars(select(IngestRun).where(IngestRun.finished_at.is_not(None))
                                           .order_by(IngestRun.finished_at.desc()).limit(RECENT_RUNS))),
        }

    def _build(self) -> list:
        families = []
        try:
            with self._sessions() as db:
                data = self._query(db)
        except Exception:
            data = None
        families.append(GaugeMetricFamily("jsp_db_up", "Database reachable at the last scrape",
                                          value=0 if data is None else 1))
        if data is not None:
            families.extend(self._db_families(data))
        try:
            documents = int(self._probe())
        except Exception:
            documents = None
        families.append(GaugeMetricFamily("jsp_search_up", "Search index reachable at the last scrape",
                                          value=0 if documents is None else 1))
        if documents is not None:
            families.append(GaugeMetricFamily("jsp_search_documents", "Documents in the job search index",
                                              value=documents))
        return families

    @staticmethod
    def _db_families(data: dict) -> list:
        in_state = GaugeMetricFamily("jsp_runs_in_state", "Agent runs by status", labels=["status"])
        for status, count in data["runs_in_state"].items():
            in_state.add_metric([str(status)], count)
        postings = GaugeMetricFamily("jsp_job_postings", "Canonical job postings by source", labels=["source"])
        for source, count in data["postings"].items():
            postings.add_metric([str(source)], count)
        last_run = GaugeMetricFamily("jsp_ingest_last_run_timestamp_seconds", "Latest finished ingest run",
                                     labels=["status"])
        for status, at in data["last_run"].items():
            last_run.add_metric([str(status)], at)
        state = GaugeMetricFamily("jsp_ingest_source_state", "Source state in the latest run",
                                  labels=["source", "state"])
        rows = GaugeMetricFamily("jsp_ingest_source_rows", "Source rows in the latest run", labels=["source", "kind"])
        success = GaugeMetricFamily("jsp_ingest_source_last_success_timestamp_seconds",
                                    "Latest run in which the source was ok", labels=["source"])
        runs = data["recent_runs"]
        latest = _source_states(runs[0].per_board) if runs else {}
        for source, item in latest.items():
            for name in _STATES:
                state.add_metric([source, name], 1 if item["state"] == name else 0)
            for kind, value in item["rows"].items():
                rows.add_metric([source, kind], value)
        seen: set[str] = set()
        for run in runs:
            for source, item in _source_states(run.per_board).items():
                if source not in seen and item["state"] == "ok" and run.finished_at is not None:
                    seen.add(source)
                    success.add_metric([source], run.finished_at.timestamp())
        return [in_state, postings, last_run, state, rows, success]


def meili_probe() -> int:
    """Document count of the job index; raises when Meilisearch or its key is unavailable."""
    from job_search_platform import config
    from job_search_platform.integrations import meili

    stats = meili.client().request("GET", f"/indexes/{meili.quote(config.meili_index())}/stats",
                                    timeout=2)
    return int(stats["numberOfDocuments"])


def start_listener(host: str, port: int, sessions, search_probe: Callable[[], int], *,
                   base_engine=None) -> Callable[[], None]:
    """Serve the default registry on host:port (loopback, checked by config); returns a stop function."""
    engine = None
    if base_engine is not None:  # dedicated 1-connection pool: a scrape never waits long or starves the app pool
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        engine = create_engine(base_engine.url, pool_size=1, max_overflow=0, pool_timeout=2, pool_pre_ping=True,
                               connect_args={"connect_timeout": 2})
        sessions = sessionmaker(engine, expire_on_commit=False)
    collector = ScrapeCollector(sessions, search_probe)
    server, thread = start_http_server(port, addr=host)  # bind first: a failure must not leave a registration
    REGISTRY.register(collector)

    def stop() -> None:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        REGISTRY.unregister(collector)
        if engine is not None:
            engine.dispose()

    return stop
