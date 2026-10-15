# Observability Metrics (WP1 part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Prometheus metrics from the app on a loopback-only listener, and add Prometheus and Grafana to the dev compose stack, with one provisioned dashboard and alert rules.

**Architecture:**
- `integrations/metrics.py` owns every metric object and the `observe_*` helpers. These are called from three existing places: `RequestLogMiddleware`, the `tracing` LLM helpers, and the run executor.
- A `ScrapeCollector` reads database and Meilisearch values at scrape time and caches them for 30 s.
- `prometheus_client.start_http_server` serves the default registry on `METRICS_HOST:METRICS_PORT` from the app lifespan.
- Prometheus scrapes it from compose through `host.docker.internal`, and Grafana is provisioned from files in `infra/grafana/`.

**Tech Stack:** Python 3.12, `prometheus_client` 0.26.0, FastAPI, SQLAlchemy 2, Docker Compose, Prometheus 3.15.0, Grafana OSS 13.2.4.

**Spec:** `docs/superpowers/specs/2026-10-15-observability-metrics-design.md` (decisions O1–O9).

## Global Constraints

**Process and repo rules**
- Every shell command starts with `rtk`. Work from the worktree `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/metrics` on branch `feat/observability-metrics`.
- Write code and docs in English. The one exception is `docs/demo/tor-roadmap.md`, which is in Thai.
- Test data is synthetic. Tests never print secrets, and metric labels never contain user ids, emails, query strings or raw paths.
- Never run `scripts/local_infra.py start` without the owner's `.env`. Never recreate other compose services.
- Never touch the database `jobsearch_platform_core02` or the Meilisearch index `jobs` from tests.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Test commands, run from the worktree root. Integration tests need `CORE02_PRIVATE_DIR=/Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003`.
  - unit: `rtk uv run --locked --project backend pytest backend/tests/unit -q`
  - one file: `rtk uv run --locked --project backend pytest <file> -q`

**Metrics**
- Every metric name starts with `jsp_`. Names, types and labels follow the spec's two metric tables exactly.
- HTTP labels:
  - `route` is `scope["route"].path`, or `other` when no route matched;
  - `method` is one of GET, HEAD, POST, PUT, PATCH, DELETE or OPTIONS, else `OTHER`;
  - `status_class` is `"{status // 100}xx"`;
  - `model` is cut to 100 characters, and a missing value becomes `unknown`.
- `observe_*` functions never raise.
- Scrape-time values are computed at most once every 30 s. A failure sets `jsp_db_up 0` or `jsp_search_up 0`, omits the dependent series, and never fails the scrape.

**Listener**
- `METRICS_PORT` unset means no listener.
- `METRICS_HOST` defaults to `127.0.0.1`. Any non-loopback host makes startup fail with `ValueError("metrics_host_not_loopback")`.
- The main FastAPI app has no `/metrics` route.

**Images, ports and Grafana**
- Images are pinned by digest:
  - `prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e`
  - `grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f`
- Ports bind to loopback only: Prometheus `127.0.0.1:59090:9090`, Grafana `127.0.0.1:53300:3000`. The app's metrics port is `59464`.
- Prometheus retention is `15d`. Grafana runs with anonymous access off, sign-up off and analytics off. Its admin password comes from the private dir file `grafana-admin-password`, mode 0600.

## Review Focus

Each item below is a failure a reasonable operator would hit, and its test lives in the task that owns the code.
1. **A slow or dead database during a scrape.** `/metrics` still answers quickly and reports `jsp_db_up 0`. The scrape must not hang on Postgres. The 2 s `statement_timeout` and `connect_timeout` apply. Tested in Task 3.
2. **Concurrent scrapes**, for example Prometheus plus a person running curl. The database is queried once per 30 s, not once per scrape. Tested in Task 3.
3. **`ingest_runs.per_board` holding unexpected shapes.** This covers the `index` key, non-dict values, missing counts and an old run with no crawl keys. The collector skips them and never raises. Tested in Task 3.
4. **A greenhouse board that fails on every run while the other boards succeed**, which is normal and already true today. It must not trip `SourceFailing`. A source counts as `ok` if any of its boards is ok in the run. Tested in Task 3.
5. **A request to a path no route matches** (scanners, typos). It adds no new label value: its route is `other`. Tested in Task 2.

---

### Task 1: `prometheus_client` and the metrics module

**Files:**
- Modify: `backend/pyproject.toml`, `backend/uv.lock`, `requirements.txt`, `docs/engineering/dependencies.md`
- Create: `backend/src/job_search_platform/integrations/metrics.py`
- Test: `backend/tests/unit/test_metrics.py`

**Interfaces:**
- Produces, in `integrations/metrics.py`:
  - module-level metric objects in the default registry: `HTTP_REQUESTS`, `HTTP_DURATION`, `RUNS`, `RUN_DURATION`, `LLM_REQUESTS`, `LLM_DURATION`, `LLM_TOKENS`;
  - `observe_request(method: str, route: str | None, status: int, seconds: float) -> None`;
  - `observe_run(operation: str | None, outcome: str | None, seconds: float) -> None`;
  - `observe_llm(kind: str, model: str | None, seconds: float, input_tokens: int | None, output_tokens: int | None) -> None`.

- [ ] **Step 1: Add the dependency**

```bash
rtk uv add --project backend "prometheus-client==0.26.0"
rtk uv export --locked --project backend --no-dev --no-emit-project --format requirements-txt > requirements.txt
```

`backend/pyproject.toml` must list `"prometheus-client==0.26.0"` in alphabetical order. If `uv add` writes `>=`, change it to `==` and run `rtk uv lock --project backend`.

- [ ] **Step 2: Audit it**

```bash
rtk uv export --locked --project backend --all-groups --no-emit-project --format requirements-txt -o "$TMPDIR/jsp-req.txt"
rtk uv run --locked --project backend pip-audit --strict --disable-pip -r "$TMPDIR/jsp-req.txt"
```

Expected: `No known vulnerabilities found`. If the audit finds anything, stop and report BLOCKED.

Then append this to `docs/engineering/dependencies.md`, using the real UTC date and time:

```markdown
## prometheus-client (2026-10-15)

- `prometheus-client==0.26.0` (Apache-2.0, pure Python, no required dependencies). App metrics for WP1 observability (spec 2026-10-15-observability-metrics-design.md).
- `pip-audit --strict` over the exported all-groups requirements (<date time UTC>): 0 advisories.
```

- [ ] **Step 3: Write the failing tests** `backend/tests/unit/test_metrics.py`

```python
"""WP1 observability: in-process metric helpers (spec: Metrics, Recorded in-process). No network."""
from __future__ import annotations

from prometheus_client import REGISTRY

from job_search_platform.integrations import metrics


def _value(name, **labels):
    return REGISTRY.get_sample_value(name, labels) or 0.0


def test_request_uses_route_template_and_status_class():
    before = _value("jsp_http_requests_total", method="GET", route="/api/v1/projects/{project_id}", status_class="2xx")
    metrics.observe_request("GET", "/api/v1/projects/{project_id}", 204, 0.01)
    after = _value("jsp_http_requests_total", method="GET", route="/api/v1/projects/{project_id}", status_class="2xx")
    assert after == before + 1
    assert _value("jsp_http_request_duration_seconds_count", method="GET", route="/api/v1/projects/{project_id}") >= 1


def test_unmatched_route_and_unknown_method_are_bucketed():
    before = _value("jsp_http_requests_total", method="OTHER", route="other", status_class="4xx")
    metrics.observe_request("BREW", None, 404, 0.001)
    metrics.observe_request("brew", "", 418, 0.001)
    assert _value("jsp_http_requests_total", method="OTHER", route="other", status_class="4xx") == before + 2


def test_run_outcome_and_duration():
    before = _value("jsp_runs_total", operation="evaluate", outcome="completed")
    metrics.observe_run("evaluate", "completed", 2.5)
    metrics.observe_run(None, None, 1.0)
    assert _value("jsp_runs_total", operation="evaluate", outcome="completed") == before + 1
    assert _value("jsp_runs_total", operation="unknown", outcome="error") >= 1
    assert _value("jsp_run_duration_seconds_count", operation="evaluate") >= 1


def test_llm_counts_tokens_only_when_reported():
    model = "m" * 150
    cut = "m" * 100
    before_in = _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="input")
    metrics.observe_llm("jev", model, 0.5, 30, None)
    assert _value("jsp_llm_requests_total", kind="jev", model=cut) >= 1
    assert _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="input") == before_in + 30
    assert _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="output") == 0.0
    metrics.observe_llm("agent_round", None, 0.1, None, None)
    assert _value("jsp_llm_requests_total", kind="agent_round", model="unknown") >= 1


def test_observers_never_raise():
    metrics.observe_request(None, None, "bad", "slow")  # type: ignore[arg-type]
    metrics.observe_run("x", "y", float("nan"))
    metrics.observe_llm("jev", "m", -1, -5, "many")  # type: ignore[arg-type]
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_metrics.py -q`
Expected: collection error, `cannot import name 'metrics'`.

- [ ] **Step 5: Implement** `backend/src/job_search_platform/integrations/metrics.py`

```python
"""Prometheus metrics (WP1 observability). Labels never carry user ids, emails, query strings or raw paths.

observe_* helpers never raise: metrics must not break a request, a run or an LLM call.
"""
from __future__ import annotations

import logging
import math

from prometheus_client import Counter, Histogram

logger = logging.getLogger(__name__)

_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})
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
        RUNS.labels(operation, outcome if isinstance(outcome, str) and outcome else "error").inc()
        if (value := _seconds(seconds)) is not None:
            RUN_DURATION.labels(operation).observe(value)
    except Exception:
        logger.debug("metric_dropped")


def observe_llm(kind: str, model: str | None, seconds: float, input_tokens: int | None,
                output_tokens: int | None) -> None:
    try:
        model = _model(model)
        LLM_REQUESTS.labels(kind, model).inc()
        if (value := _seconds(seconds)) is not None:
            LLM_DURATION.labels(kind, model).observe(value)
        for direction, tokens in (("input", input_tokens), ("output", output_tokens)):
            if isinstance(tokens, int) and not isinstance(tokens, bool) and tokens > 0:
                LLM_TOKENS.labels(kind, model, direction).inc(tokens)
    except Exception:
        logger.debug("metric_dropped")
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_metrics.py backend/tests/unit/test_requirements_export.py -q`, then the whole unit suite.
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/pyproject.toml backend/uv.lock requirements.txt docs/engineering/dependencies.md backend/src/job_search_platform/integrations/metrics.py backend/tests/unit/test_metrics.py
rtk git commit -m "feat(metrics): prometheus_client and in-process metric helpers (WP1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hooks in the request middleware, the LLM tracing helpers and the run executor

**Files:**
- Modify: `backend/src/job_search_platform/integrations/logging.py` (`RequestLogMiddleware.__call__`, the `finally` block)
- Modify: `backend/src/job_search_platform/integrations/tracing.py` (`llm_round`, `jev_decision`)
- Modify: `backend/src/job_search_platform/workers/executor.py` (`RunExecutor.execute`, plus a new method `_record_metrics`)
- Test: `backend/tests/unit/test_metrics_hooks.py`

**Interfaces:**
- Consumes: Task 1's `metrics.observe_request`, `observe_run` and `observe_llm`.
- Produces: `RunExecutor._record_metrics(run, began: float) -> None`. It reads the run's final status with `self.sessions()`, then calls `metrics.observe_run`. It never raises.

- [ ] **Step 1: Write the failing tests** `backend/tests/unit/test_metrics_hooks.py`

```python
"""WP1 observability hooks: middleware, LLM tracing helpers, run executor. Synthetic values only."""
from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from job_search_platform.integrations import tracing
from job_search_platform.integrations.logging import RequestLogMiddleware
from job_search_platform.workers.executor import RunExecutor


def _value(name, **labels):
    return REGISTRY.get_sample_value(name, labels) or 0.0


def _app():
    app = FastAPI()

    @app.get("/items/{item_id}")
    async def item(item_id: str):
        return {"id": item_id}

    app.add_middleware(RequestLogMiddleware)
    return app


def test_middleware_records_route_template_not_raw_path():
    labels = {"method": "GET", "route": "/items/{item_id}", "status_class": "2xx"}
    before = _value("jsp_http_requests_total", **labels)
    with TestClient(_app()) as client:
        client.get("/items/alice@example.test")
        client.get("/items/42?q=secret")
    assert _value("jsp_http_requests_total", **labels) == before + 2
    sample_labels = {s.labels.get("route") for m in REGISTRY.collect() for s in m.samples}
    assert not any(r and ("alice" in r or "secret" in r or "42" in r) for r in sample_labels)


def test_middleware_unmatched_path_is_other():
    labels = {"method": "GET", "route": "other", "status_class": "4xx"}
    before = _value("jsp_http_requests_total", **labels)
    with TestClient(_app()) as client:
        client.get("/wp-login.php")
    assert _value("jsp_http_requests_total", **labels) == before + 1


def test_llm_helpers_record_metrics():
    before = _value("jsp_llm_requests_total", kind="agent_round", model="ai-analyze")
    tracing.llm_round(run_id="r1", model="ai-analyze", latency_ms=1500, input_tokens=10, output_tokens=5)
    assert _value("jsp_llm_requests_total", kind="agent_round", model="ai-analyze") == before + 1
    before = _value("jsp_llm_tokens_total", kind="jev", model="jev-model", direction="output")
    tracing.jev_decision(model="jev-model", served_model=None, latency_ms=200,
                         usage={"input_tokens": 3, "output_tokens": 7})
    assert _value("jsp_llm_tokens_total", kind="jev", model="jev-model", direction="output") == before + 7


class _Sessions:
    def __init__(self, status=None, fail=False):
        self.status, self.fail = status, fail

    def __call__(self):
        outer = self

        class _Db:
            def __enter__(self):
                if outer.fail:
                    raise RuntimeError("db down")
                return self

            def __exit__(self, *exc):
                return False

            def get(self, model, key):
                return SimpleNamespace(status=outer.status)

        return _Db()


def _executor(sessions):
    executor = RunExecutor.__new__(RunExecutor)  # only _record_metrics is exercised
    executor.sessions = sessions
    return executor


def test_executor_records_final_status():
    run = SimpleNamespace(id=uuid.uuid4(), operation="evaluate")
    before = _value("jsp_runs_total", operation="evaluate", outcome="completed")
    _executor(_Sessions("completed"))._record_metrics(run, time.monotonic() - 3)
    assert _value("jsp_runs_total", operation="evaluate", outcome="completed") == before + 1


def test_executor_metrics_never_raise_when_db_fails():
    run = SimpleNamespace(id=uuid.uuid4(), operation="evaluate")
    before = _value("jsp_runs_total", operation="evaluate", outcome="error")
    _executor(_Sessions(fail=True))._record_metrics(run, time.monotonic())
    assert _value("jsp_runs_total", operation="evaluate", outcome="error") == before + 1
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_metrics_hooks.py -q`
Expected: FAIL. No samples are recorded yet, and `RunExecutor` has no `_record_metrics`.

- [ ] **Step 3: Implement**

`integrations/logging.py`: import with `from job_search_platform.integrations import metrics`. Replace the `finally` block of `RequestLogMiddleware.__call__` with:

```python
        finally:
            route = getattr(scope.get("route"), "path", None)
            duration = time.perf_counter() - started
            _log.info("request", extra={"method": scope["method"], "route": route or "unmatched", "status": status,
                                        "duration_ms": round(duration * 1000, 1)})
            metrics.observe_request(scope["method"], route, status, duration)
            _request_id.reset(token)
```

Before you edit, check `integrations/metrics.py` for any import of `logging.py` that would make a cycle. The `metrics` module must only import the stdlib logging module and `prometheus_client`.

`integrations/tracing.py`: add `from job_search_platform.integrations import metrics`. In `llm_round`, make this the first line of the function body, before the `try`:

```python
    metrics.observe_llm("agent_round", model, latency_ms / 1000, input_tokens, output_tokens)
```

In `jev_decision`, put these as the first lines of the body, before the `try`. Keep the existing `try` block below them unchanged:

```python
    usage_dict = usage if isinstance(usage, dict) else {}
    metrics.observe_llm("jev", model, latency_ms / 1000, _count(usage_dict.get("input_tokens")),
                        _count(usage_dict.get("output_tokens")))
```

`workers/executor.py`: add `from job_search_platform.integrations import metrics` next to the `tracing` import.

In `execute`, set `began = time.monotonic()` as the first statement. In the outer `finally:` block, after `await asyncio.gather(monitor, return_exceptions=True)`, add `self._record_metrics(run, began)`. Then add this method to `RunExecutor`, right after `execute`:

```python
    def _record_metrics(self, run: Run, began: float) -> None:
        """One run metric with the run's final status; a short read, never raises (WP1 observability)."""
        outcome = None
        try:
            with self.sessions() as db:
                row = db.get(Run, run.id)
                outcome = getattr(row, "status", None)
        except Exception:
            outcome = None
        metrics.observe_run(getattr(run, "operation", None), outcome, time.monotonic() - began)
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit -q`
Expected: all PASS. `test_tracing.py` and the logging tests must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/integrations/logging.py backend/src/job_search_platform/integrations/tracing.py backend/src/job_search_platform/workers/executor.py backend/tests/unit/test_metrics_hooks.py
rtk git commit -m "feat(metrics): request, LLM and run metrics from existing hooks (WP1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scrape-time collector, the loopback listener and the lifespan wiring

**Files:**
- Modify: `backend/src/job_search_platform/integrations/metrics.py` (add the collector and the listener)
- Modify: `backend/src/job_search_platform/config.py` (`metrics_port`, `metrics_host`)
- Modify: `backend/src/job_search_platform/main.py` (lifespan)
- Test: `backend/tests/unit/test_metrics_collector.py`, `backend/tests/integration/test_metrics_listener.py`

**Interfaces:**
- Consumes: the `IngestRun`, `JobPosting` and `Run` models; `meili.client()`; `config.meili_index()`.
- Produces:
  - `config.metrics_port() -> int | None` and `config.metrics_host() -> str`. The host function raises `ValueError("metrics_host_not_loopback")`;
  - `metrics.source_of(key: str) -> str | None`;
  - `metrics.ScrapeCollector(sessions, search_probe, *, clock=time.monotonic, ttl=30.0)`. It is a `prometheus_client` collector with `collect()` and `describe() -> []`;
  - `metrics.meili_probe() -> int`, which returns the document count of the `jobs` index and raises on failure;
  - `metrics.start_listener(host: str, port: int, sessions, search_probe) -> Callable[[], None]`. It returns a stop function.

Spec clarification, ruling recorded here: a source's state in a run is `ok` if any of its boards is `ok`. It is `failed` if none is ok and at least one failed. Otherwise it is `skipped`. Its row counts are summed over its boards. A source's last success is the `finished_at` of the newest of the last 200 finished runs in which that source was `ok`.

- [ ] **Step 1: Write the failing unit tests** `backend/tests/unit/test_metrics_collector.py`

```python
"""WP1 observability: scrape-time collector, source grouping, cache and failure rules. Fake sessions only."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from prometheus_client import CollectorRegistry

from job_search_platform import config
from job_search_platform.integrations import metrics


@pytest.mark.parametrize("key,source", [
    ("freehire:-", "freehire"), ("greenhouse:agoda", "greenhouse"), ("lever:x", "lever"),
    ("smartrecruiters:y", "smartrecruiters"), ("crawl:jobtopgun", "jobtopgun"), ("crawl:jobbkk", "jobbkk"),
    ("index", None), ("", None), ("crawl:", None), ("unknown:z", None),
])
def test_source_of(key, source):
    assert metrics.source_of(key) == source


T1 = datetime(2026, 10, 15, 3, tzinfo=timezone.utc)
T0 = datetime(2026, 10, 15, 2, tzinfo=timezone.utc)
RUNS = [  # newest first
    SimpleNamespace(status="partial", finished_at=T1, per_board={
        "greenhouse:a": {"state": "failed", "error": "status_500"},
        "greenhouse:b": {"state": "ok", "fetched": 3, "created": 1, "deleted": 0},
        "crawl:jobbkk": {"state": "failed", "error": "http_429", "fetched": 2, "created": 2, "deleted": 0},
        "index": {"state": "ok"}, "freehire:-": "garbage"}),
    SimpleNamespace(status="ok", finished_at=T0, per_board={
        "crawl:jobbkk": {"state": "ok", "fetched": 5, "created": 5, "deleted": 1}}),
]


class _Db:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, 0

    def __call__(self):
        return self

    def __enter__(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("db down")
        return self

    def __exit__(self, *exc):
        return False


def _collector(db, probe=lambda: 1234, clock=None):
    collector = metrics.ScrapeCollector(db, probe, clock=clock or (lambda: 0.0), ttl=30.0)
    collector._query = lambda session: {  # the SQL is covered by the integration test
        "runs_in_state": {"queued": 2, "running": 1}, "postings": {"jobbkk": 7, "greenhouse": 3},
        "last_run": {"ok": T0.timestamp(), "partial": T1.timestamp()}, "recent_runs": RUNS}
    registry = CollectorRegistry()
    registry.register(collector)
    return collector, registry


def test_collector_reports_sources_with_any_ok_rule():
    _, registry = _collector(_Db())
    get = registry.get_sample_value
    assert get("jsp_db_up") == 1 and get("jsp_search_up") == 1 and get("jsp_search_documents") == 1234
    assert get("jsp_runs_in_state", {"status": "queued"}) == 2
    assert get("jsp_job_postings", {"source": "jobbkk"}) == 7
    assert get("jsp_ingest_source_state", {"source": "greenhouse", "state": "ok"}) == 1
    assert get("jsp_ingest_source_state", {"source": "greenhouse", "state": "failed"}) == 0
    assert get("jsp_ingest_source_state", {"source": "jobbkk", "state": "failed"}) == 1
    assert get("jsp_ingest_source_rows", {"source": "greenhouse", "kind": "fetched"}) == 3
    assert get("jsp_ingest_source_last_success_timestamp_seconds", {"source": "jobbkk"}) == T0.timestamp()
    assert get("jsp_ingest_source_last_success_timestamp_seconds", {"source": "greenhouse"}) == T1.timestamp()
    assert get("jsp_ingest_last_run_timestamp_seconds", {"status": "partial"}) == T1.timestamp()
    assert get("jsp_ingest_source_state", {"source": "index", "state": "ok"}) is None


def test_collector_caches_for_ttl():
    now = [0.0]
    db = _Db()
    _, registry = _collector(db, clock=lambda: now[0])
    registry.get_sample_value("jsp_db_up")
    registry.get_sample_value("jsp_db_up")
    now[0] = 29.0
    registry.get_sample_value("jsp_db_up")
    assert db.calls == 1
    now[0] = 31.0
    registry.get_sample_value("jsp_db_up")
    assert db.calls == 2


def test_db_failure_reports_down_and_omits_series():
    _, registry = _collector(_Db(fail=True))
    assert registry.get_sample_value("jsp_db_up") == 0
    assert registry.get_sample_value("jsp_runs_in_state", {"status": "queued"}) is None
    assert registry.get_sample_value("jsp_search_up") == 1


def test_search_failure_reports_down():
    def broken():
        raise OSError("refused")
    _, registry = _collector(_Db(), probe=broken)
    assert registry.get_sample_value("jsp_search_up") == 0
    assert registry.get_sample_value("jsp_search_documents") is None
    assert registry.get_sample_value("jsp_db_up") == 1


def test_metrics_config(monkeypatch):
    monkeypatch.delenv("METRICS_PORT", raising=False)
    monkeypatch.delenv("METRICS_HOST", raising=False)
    assert config.metrics_port() is None and config.metrics_host() == "127.0.0.1"
    monkeypatch.setenv("METRICS_PORT", "59464")
    monkeypatch.setenv("METRICS_HOST", "::1")
    assert config.metrics_port() == 59464 and config.metrics_host() == "::1"
    for bad in ("0.0.0.0", "192.168.1.5", "example.test", "::"):
        monkeypatch.setenv("METRICS_HOST", bad)
        with pytest.raises(ValueError, match="metrics_host_not_loopback"):
            config.metrics_host()
```

- [ ] **Step 2: Write the failing integration tests** `backend/tests/integration/test_metrics_listener.py`

```python
"""WP1 observability: real SQL over a migrated database, and the loopback listener serving the registry."""
from __future__ import annotations

import socket
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import IngestRun, JobPosting
from job_search_platform.integrations import metrics
from job_search_platform.main import create_app

NOW = datetime.now(timezone.utc)


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _posting(source, ext, canonical=None):
    return JobPosting(id=uuid.uuid4(), source=source, external_id=ext, slug=f"{source}-{ext}", title="Engineer",
                      source_url=f"https://example.test/{ext}", first_seen_at=NOW, last_seen_at=NOW,
                      content_hash="h", updated_at=NOW, canonical_id=canonical)


@pytest.mark.integration
def test_collector_sql_against_migrated_database(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        first = _posting("jobbkk", "1")
        db.add(first)
        db.flush()
        db.add_all([_posting("jobbkk", "2"), _posting("greenhouse", "3", canonical=first.id)])
        db.add(IngestRun(id=uuid.uuid4(), started_at=NOW - timedelta(minutes=5), finished_at=NOW, status="ok",
                         per_board={"crawl:jobbkk": {"state": "ok", "fetched": 2, "created": 2, "deleted": 0}}))
    collector = metrics.ScrapeCollector(sessions, lambda: 0)
    values = {(s.name, tuple(sorted(s.labels.items()))): s.value for m in collector.collect() for s in m.samples}
    assert values[("jsp_db_up", ())] == 1
    assert values[("jsp_job_postings", (("source", "jobbkk"),))] == 2
    assert ("jsp_job_postings", (("source", "greenhouse"),)) not in values  # non-canonical rows are excluded
    assert values[("jsp_ingest_source_state", (("source", "jobbkk"), ("state", "ok")))] == 1


class _Async:
    async def start(self):
        pass

    async def close(self):
        pass

    async def reconcile_pending(self):
        pass


def test_listener_serves_registry_on_loopback_and_app_has_no_metrics_route(monkeypatch):
    port = _free_port()
    monkeypatch.setenv("METRICS_PORT", str(port))
    monkeypatch.setattr(metrics, "meili_probe", lambda: 5)
    services = Services(sessions=lambda: (_ for _ in ()).throw(RuntimeError("no db")), owner_sessions=None,
                        files=_Async(), documents=None, runs=None, grants=None, settings=None, approvals=None,
                        supervisor=_Async(), runtime=_Async(), queue=None)
    with TestClient(create_app(services)) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/metrics").status_code == 404  # never on the app port
        body = urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=5).read().decode()
        assert 'jsp_http_requests_total{method="GET",route="/api/v1/health",status_class="2xx"}' in body
        assert "jsp_db_up 0.0" in body and "jsp_search_documents 5.0" in body
    with pytest.raises(OSError):
        urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=2)  # stopped with the app


def test_bad_metrics_host_fails_startup(monkeypatch):
    monkeypatch.setenv("METRICS_PORT", str(_free_port()))
    monkeypatch.setenv("METRICS_HOST", "0.0.0.0")
    services = Services(sessions=None, owner_sessions=None, files=_Async(), documents=None, runs=None, grants=None,
                        settings=None, approvals=None, supervisor=_Async(), runtime=_Async(), queue=None)
    with pytest.raises(ValueError, match="metrics_host_not_loopback"):
        with TestClient(create_app(services)):
            pass
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_metrics_collector.py backend/tests/integration/test_metrics_listener.py -q` with `CORE02_PRIVATE_DIR` set.
Expected: FAIL. `source_of`, `ScrapeCollector`, `metrics_port` and the listener do not exist yet.

- [ ] **Step 4: Implement**

`config.py`: add `import ipaddress`, then:

```python
def metrics_port() -> int | None:
    value = _env("METRICS_PORT", "")
    return int(value) if value else None


def metrics_host() -> str:
    """Loopback only: the metrics listener has no auth and must never be reachable from outside (WP1, spec O4)."""
    host = _env("METRICS_HOST", "127.0.0.1")
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise ValueError("metrics_host_not_loopback")
    return host
```

`integrations/metrics.py`: add these imports.

```python
import threading
import time
from collections.abc import Callable

from prometheus_client import REGISTRY, start_http_server
from prometheus_client.core import GaugeMetricFamily
from sqlalchemy import func, select, text
```

Then add:

```python
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
        with self._lock:
            now = self._clock()
            if self._at is None or now - self._at >= self._ttl:
                self._families, self._at = self._build(), now
            return list(self._families)

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

    stats = meili.client().request("GET", f"/indexes/{meili.quote(config.meili_index())}/stats")
    return int(stats["numberOfDocuments"])


def start_listener(host: str, port: int, sessions, search_probe: Callable[[], int]) -> Callable[[], None]:
    """Serve the default registry on host:port (loopback, checked by config); returns a stop function."""
    collector = ScrapeCollector(sessions, search_probe)
    REGISTRY.register(collector)
    server, thread = start_http_server(port, addr=host)

    def stop() -> None:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        REGISTRY.unregister(collector)

    return stop
```

Notes for the implementer:
- `meili.quote` already exists in `integrations/meili.py`.
- In `start_http_server` 0.26.0, check that it returns `(server, thread)`. If the installed version returns `None`, use `prometheus_client.exposition.ThreadingWSGIServer` the way `start_http_server` does internally, and report the deviation.

`main.py`, inside `lifespan`, right after `app.state.services = current`:

```python
            metrics_port = config.metrics_port()
            stop_metrics = (metrics.start_listener(config.metrics_host(), metrics_port, current.sessions,
                                                   metrics.meili_probe) if metrics_port else None)
```

Stop the listener first in the `finally` of the inner `try`, before `supervisor.close()`:

```python
            finally:
                if stop_metrics is not None:
                    stop_metrics()
                supervisor_stopped = False
```

Two placement rules:
- Read `config.metrics_host()` before anything that has to be cleaned up, so a bad host fails startup cleanly. If the current structure makes that hard, call `config.metrics_host()` once at the very top of `lifespan`.
- `stop_metrics` must be defined on every path that reaches the inner `finally`.

Add `from job_search_platform.integrations import metrics`, and `config` if it is not imported yet.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit backend/tests/integration/test_metrics_listener.py backend/tests/integration/test_application_startup.py -q` with `CORE02_PRIVATE_DIR` set.
Expected: all PASS, except the known baseline failure `test_application_startup.py::test_actual_built_frontend_with_production_rest_upload_and_session_restore`. If that test fails, report it by name.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/integrations/metrics.py backend/src/job_search_platform/config.py backend/src/job_search_platform/main.py backend/tests/unit/test_metrics_collector.py backend/tests/integration/test_metrics_listener.py
rtk git commit -m "feat(metrics): scrape-time collector and loopback listener (WP1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prometheus and Grafana services, scrape config, alert rules and the dashboard

**Files:**
- Modify: `infra/compose.yaml` (two services, two volumes, one secret)
- Modify: `scripts/local_infra.py` (the `SECRETS` entry)
- Create: `infra/prometheus/prometheus.yml`, `infra/prometheus/rules.yml`
- Create: `infra/grafana/provisioning/datasources/prometheus.yml`, `infra/grafana/provisioning/dashboards/dashboards.yml`, `infra/grafana/dashboards/platform-overview.json`
- Test: `backend/tests/unit/test_observability_infra.py`

**Interfaces:**
- Consumes: the metric names from Tasks 1–3, through the default `REGISTRY`.

- [ ] **Step 1: Write the failing tests** `backend/tests/unit/test_observability_infra.py`

```python
"""WP1 observability infra: pinning, loopback ports, secrets, and dashboard/rules referencing real metrics."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from prometheus_client import REGISTRY

from job_search_platform.integrations import metrics  # noqa: F401  registers the jsp_ metrics

ROOT = Path(__file__).resolve().parents[3]
PROM_IMAGE = "prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e"
GRAFANA_IMAGE = "grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f"
SCRAPE_TIME = {"jsp_db_up", "jsp_runs_in_state", "jsp_job_postings", "jsp_ingest_last_run_timestamp_seconds",
               "jsp_ingest_source_last_success_timestamp_seconds", "jsp_ingest_source_state",
               "jsp_ingest_source_rows", "jsp_search_up", "jsp_search_documents"}


def _compose():
    return yaml.safe_load((ROOT / "infra/compose.yaml").read_text())


def test_services_pinned_and_loopback_only():
    services = _compose()["services"]
    prom, grafana = services["prometheus"], services["grafana"]
    assert prom["image"] == PROM_IMAGE and grafana["image"] == GRAFANA_IMAGE
    assert prom["ports"] == ["127.0.0.1:59090:9090"] and grafana["ports"] == ["127.0.0.1:53300:3000"]
    assert "--storage.tsdb.retention.time=15d" in prom["command"]
    assert "host.docker.internal:host-gateway" in prom["extra_hosts"]
    env = grafana["environment"]
    for key in ("GF_AUTH_ANONYMOUS_ENABLED", "GF_USERS_ALLOW_SIGN_UP", "GF_ANALYTICS_REPORTING_ENABLED",
                "GF_ANALYTICS_CHECK_FOR_UPDATES"):
        assert str(env[key]).lower() == "false"
    assert env["GF_SECURITY_ADMIN_PASSWORD__FILE"] == "/run/secrets/grafana-admin-password"
    assert "grafana-admin-password" in grafana["secrets"]
    assert "grafana-admin-password" in _compose()["secrets"]


def test_admin_password_generated_by_local_infra():
    source = (ROOT / "scripts/local_infra.py").read_text()
    assert '"grafana-admin-password": lambda: secrets.token_urlsafe(24)' in source


def _known_metrics() -> set[str]:
    names = set(SCRAPE_TIME)
    for family in REGISTRY.collect():
        names.add(family.name)
        names.update(sample.name for sample in family.samples)
    return names


def _referenced(text: str) -> set[str]:
    return set(re.findall(r"\bjsp_[a-z_]+", text))


def test_dashboard_and_rules_reference_existing_metrics():
    known = _known_metrics()
    dashboard = (ROOT / "infra/grafana/dashboards/platform-overview.json").read_text()
    json.loads(dashboard)
    rules = (ROOT / "infra/prometheus/rules.yml").read_text()
    missing = {name for name in _referenced(dashboard) | _referenced(rules)
               if name not in known and re.sub(r"_(bucket|count|sum)$", "", name) not in known}
    assert not missing, missing
    alerts = {r["alert"] for g in yaml.safe_load(rules)["groups"] for r in g["rules"]}
    assert alerts == {"AppDown", "DatabaseDown", "SearchDown", "IngestStale", "SourceFailing", "SourceSilent",
                      "HighErrorRate", "RunsStuckQueued"}


def _docker() -> bool:
    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


@pytest.mark.skipif(not _docker(), reason="docker unavailable")
def test_promtool_accepts_config_and_rules():
    result = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{ROOT / 'infra/prometheus'}:/etc/prometheus:ro",
         PROM_IMAGE, "check", "config", "/etc/prometheus/prometheus.yml"],
        capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_observability_infra.py -q`
Expected: FAIL with `KeyError: 'prometheus'`.

- [ ] **Step 3: Write the infra files**

`infra/compose.yaml`: add these two services after `mailpit`, in the same comment style as the `meilisearch` service.

```yaml
  prometheus:
    # prom/prometheus v3.15.0 (Apache-2.0), multi-arch index digest. WP1 observability: scrapes the app's loopback metrics listener.
    image: prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e
    restart: unless-stopped
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=15d
      - --web.listen-address=0.0.0.0:9090
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./prometheus:/etc/prometheus:ro
      - prometheus-data:/prometheus
    ports:
      - "127.0.0.1:59090:9090"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:9090/-/ready"]
      interval: 10s
      timeout: 5s
      retries: 12
    labels:
      com.job-search-platform.task: observability

  grafana:
    # grafana/grafana v13.2.4 (OSS edition, AGPL-3.0; grafana/grafana-oss stopped at 13.0.2), multi-arch index digest. Unmodified, separate service.
    image: grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f
    restart: unless-stopped
    depends_on:
      - prometheus
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD__FILE: /run/secrets/grafana-admin-password
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
      GF_ANALYTICS_CHECK_FOR_UPDATES: "false"
      GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES: "false"
      GF_NEWS_NEWS_FEED_ENABLED: "false"
    secrets:
      - grafana-admin-password
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    ports:
      - "127.0.0.1:53300:3000"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 12
    labels:
      com.job-search-platform.task: observability
```

Under `volumes:`, add `prometheus-data` and `grafana-data`, each labelled `com.job-search-platform.task: observability` in the same style as `meili-data`.

Under `secrets:`, add:

```yaml
  grafana-admin-password:
    file: ${CORE02_PRIVATE_DIR:?Set CORE02_PRIVATE_DIR using scripts/local_infra.py start}/grafana-admin-password
```

`scripts/local_infra.py`: add `"grafana-admin-password": lambda: secrets.token_urlsafe(24),` to `SECRETS`, after `"meili-master-key"`.

`infra/prometheus/prometheus.yml`:

```yaml
# WP1 observability (spec 2026-10-15-observability-metrics-design.md). The app runs on the host with METRICS_PORT=59464.
global:
  scrape_interval: 30s
  evaluation_interval: 30s
rule_files:
  - /etc/prometheus/rules.yml
scrape_configs:
  - job_name: app
    static_configs:
      - targets: ["host.docker.internal:59464"]
  - job_name: prometheus
    static_configs:
      - targets: ["127.0.0.1:9090"]
```

`infra/prometheus/rules.yml`:

```yaml
# Visible in the Prometheus UI (Alerts); no Alertmanager until a server exists (spec O6).
groups:
  - name: platform
    rules:
      - alert: AppDown
        expr: up{job="app"} == 0
        for: 5m
        annotations: {summary: "The app's metrics listener is not answering."}
      - alert: DatabaseDown
        expr: jsp_db_up == 0
        for: 5m
        annotations: {summary: "The app cannot read PostgreSQL."}
      - alert: SearchDown
        expr: jsp_search_up == 0
        for: 10m
        annotations: {summary: "Meilisearch is unreachable; job search returns job_source_unavailable."}
      - alert: IngestStale
        expr: time() - max(jsp_ingest_last_run_timestamp_seconds) > 2 * 3600
        for: 15m
        annotations: {summary: "No ingest run finished in 2 hours (is the hourly launchd/systemd job installed?)."}
      - alert: SourceFailing
        expr: jsp_ingest_source_state{state="failed"} == 1
        for: 3h
        annotations: {summary: "Source {{ $labels.source }} failed in every run for 3 hours."}
      - alert: SourceSilent
        expr: time() - jsp_ingest_source_last_success_timestamp_seconds > 6 * 3600
        for: 15m
        annotations: {summary: "Source {{ $labels.source }} has not succeeded for 6 hours."}
      - alert: HighErrorRate
        expr: |
          sum(rate(jsp_http_requests_total{status_class="5xx"}[10m])) / sum(rate(jsp_http_requests_total[10m])) > 0.05
          and sum(rate(jsp_http_requests_total[10m])) > 1
        for: 10m
        annotations: {summary: "More than 5% of HTTP requests failed with 5xx."}
      - alert: RunsStuckQueued
        expr: jsp_runs_in_state{status="queued"} > 0 and on() sum(increase(jsp_runs_total[30m])) == 0
        for: 30m
        annotations: {summary: "Runs are queued but none finished in 30 minutes."}
```

`infra/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

`infra/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: platform
    folder: Job Search Platform
    type: file
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

`infra/grafana/dashboards/platform-overview.json`: write a Grafana dashboard JSON with these fields:
- `"uid": "platform-overview"`, `"title": "Platform overview"`, `"schemaVersion": 39`, `"refresh": "30s"`, and `"time": {"from": "now-6h", "to": "now"}`;
- every panel's datasource is `{"type": "prometheus", "uid": "prometheus"}`;
- six `row` panels in the spec's order: Health, HTTP, Runs, LLM, Job sources and Process.

Under each row, put these panels with these exact PromQL expressions:

| Row | Panel (type) | Expression |
|---|---|---|
| Health | Database (stat) | `jsp_db_up` |
| Health | Search (stat) | `jsp_search_up` |
| Health | App scrape (stat) | `up{job="app"}` |
| HTTP | Requests/s by class (timeseries) | `sum by (status_class) (rate(jsp_http_requests_total[5m]))` |
| HTTP | Latency p50/p95/p99 (timeseries) | `histogram_quantile(0.5, sum by (le) (rate(jsp_http_request_duration_seconds_bucket[5m])))`, plus the same with 0.95 and 0.99 |
| HTTP | 5xx ratio (timeseries) | `sum(rate(jsp_http_requests_total{status_class="5xx"}[5m])) / sum(rate(jsp_http_requests_total[5m]))` |
| HTTP | Top routes (table) | `topk(10, sum by (route) (rate(jsp_http_requests_total[15m])))` |
| Runs | Runs by state (timeseries) | `jsp_runs_in_state` |
| Runs | Completions by outcome (timeseries) | `sum by (outcome) (increase(jsp_runs_total[1h]))` |
| Runs | Run p95 by operation (timeseries) | `histogram_quantile(0.95, sum by (le, operation) (rate(jsp_run_duration_seconds_bucket[1h])))` |
| LLM | Calls/s (timeseries) | `sum by (kind, model) (rate(jsp_llm_requests_total[5m]))` |
| LLM | LLM p95 (timeseries) | `histogram_quantile(0.95, sum by (le, kind, model) (rate(jsp_llm_duration_seconds_bucket[15m])))` |
| LLM | Tokens/s (timeseries) | `sum by (direction) (rate(jsp_llm_tokens_total[5m]))` |
| Job sources | Hours since last success (bargauge) | `(time() - jsp_ingest_source_last_success_timestamp_seconds) / 3600` |
| Job sources | Latest state (table) | `jsp_ingest_source_state == 1` |
| Job sources | Rows in latest run (table) | `jsp_ingest_source_rows` |
| Job sources | Postings by source (bargauge) | `jsp_job_postings` |
| Job sources | Search documents (stat) | `jsp_search_documents` |
| Process | Resident memory (timeseries) | `process_resident_memory_bytes{job="app"}` |
| Process | CPU (timeseries) | `rate(process_cpu_seconds_total{job="app"}[5m])` |
| Process | Open FDs (timeseries) | `process_open_fds{job="app"}` |

Give each panel a unique integer `id` and a `gridPos`. Lay panels out in a 24-wide grid: three or four panels per row, each 6–8 wide and 8 high. Do not add template variables.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_observability_infra.py backend/tests/unit/test_meili_infra.py -q`
Expected: all PASS. The promtool test runs if Docker is up and pulls the pinned image. If it pulls an image, say so in the report.

Also run `rtk docker run --rm --entrypoint promtool -v "$PWD/infra/prometheus:/etc/prometheus:ro" prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e check rules /etc/prometheus/rules.yml`.
Expected: `SUCCESS: 8 rules found`.

Do not start or recreate any compose service in this task.

- [ ] **Step 5: Commit**

```bash
rtk git add infra/compose.yaml scripts/local_infra.py infra/prometheus infra/grafana backend/tests/unit/test_observability_infra.py
rtk git commit -m "feat(metrics): Prometheus and Grafana services, alert rules, platform dashboard (WP1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/engineering/local-operation.md`, `infra/AGENTS.md`, `backend/AGENTS.md`, `docs/adr/ADR-015-python-stack-deviation.md`, `docs/demo/tor-roadmap.md`

- [ ] **Step 1: Write the docs**

1. `docs/engineering/local-operation.md`: add a section `## Metrics and Grafana`. It covers:
   - **Enable:** set `METRICS_PORT=59464`. `METRICS_HOST` defaults to `127.0.0.1`, and a non-loopback host refuses to start.
   - **Metrics URL:** `http://127.0.0.1:59464/metrics`. The listener runs separately from the app port and is never proxied.
   - **Start only the two services**, through the existing helper, so the compose environment matches the rest of the stack. Warn the reader never to start compose without `.env` (LEARNINGS 2026-10-15):

     ```
     uv run --env-file .env --locked --project backend python -c "import sys; from pathlib import Path; sys.path.insert(0, 'scripts'); import local_infra as li; p = Path('<private dir>'); li.ensure_credentials(p); li._compose(['up', '--detach', '--no-deps', 'prometheus', 'grafana'], p, Path('<minio source dir>'), timeout=600)"
     ```
   - **Credentials:** `ensure_credentials` in the command above creates `grafana-admin-password` (mode 0600) when it is missing, and leaves existing files alone.
   - **URLs:**
     - Prometheus `http://127.0.0.1:59090`, which shows the alerts under Alerts;
     - Grafana `http://127.0.0.1:53300`, user `admin`, password in `$CORE02_PRIVATE_DIR/grafana-admin-password`, dashboard "Platform overview".
   - **Alerts:** one line per alert. `IngestStale` and `SourceSilent` fire while the hourly job is not installed.

   Before writing the start command, read `scripts/local_infra.py`. Document only commands that exist.
2. `infra/AGENTS.md`: add the `prometheus` and `grafana` services, the `infra/prometheus/` and `infra/grafana/` files, the ports, and the secret.
3. `backend/AGENTS.md`:
   - in the `integrations/` bullet, add `metrics.py` (`observe_*`, `ScrapeCollector`, `start_listener`);
   - mention `METRICS_PORT`/`METRICS_HOST` next to `MEILI_URL` in `config.py`.
4. `docs/adr/ADR-015-python-stack-deviation.md`:
   - change the Observability row's "Adopted" cell to `OpenTelemetry tracing to self-hosted Langfuse; Prometheus (prometheus_client) + Grafana in the dev compose stack`;
   - change its Status cell to `Complies (local; production deploy in WP1 part 2)`;
   - remove "Prometheus/Grafana" from the "Gaps not covered" bullet.
5. `docs/demo/tor-roadmap.md` (Thai): add or update one bullet saying WP1 part 1 is done. It covers metrics, Prometheus and Grafana on the machine, the "Platform overview" dashboard, and alerts visible in the UI. It also says IaC and branding/domain are still to come. Keep the file's format.

- [ ] **Step 2: Check**

Run: `rtk grep -n "METRICS_PORT\|53300\|59090" docs/engineering/local-operation.md infra/AGENTS.md backend/AGENTS.md && rtk grep -n "Prometheus" docs/adr/ADR-015-python-stack-deviation.md docs/demo/tor-roadmap.md`
Expected: matches in every file.

- [ ] **Step 3: Commit**

```bash
rtk git add docs/engineering/local-operation.md infra/AGENTS.md backend/AGENTS.md docs/adr/ADR-015-python-stack-deviation.md docs/demo/tor-roadmap.md
rtk git commit -m "docs(metrics): metrics and Grafana operation, AGENTS.md, ADR-015, roadmap (WP1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 (controller only, after the final review): image scans, full suite and live smoke

These steps are not dispatched to an implementer.

- [ ] **Step 1: Trivy.** Run `trivy image --scanners vuln --severity HIGH,CRITICAL` on both pinned images and record the counts in `docs/engineering/dependencies.md` under a `## Prometheus and Grafana images (2026-10-15)` entry. A Critical or High finding goes to the owner before merge.
- [ ] **Step 2: Full suite.** Run `rtk uv run --locked --project backend pytest backend/tests -q` with `CORE02_PRIVATE_DIR` set. Expected: all pass except the known baseline.
- [ ] **Step 3: Live smoke.**
  - Load the owner's `.env` and make sure the `grafana-admin-password` file exists. Generate it through `local_infra.ensure_credentials`, which only creates missing files.
  - Start only `prometheus` and `grafana` with `--no-deps`, through `local_infra._compose` under `uv run --env-file .env`. This is the command documented in Task 5.
  - Run a throwaway app instance with `METRICS_PORT=59464`. It must point at a throwaway database, never the owner's.
  - Check that the Prometheus target `app` is `up`, that `/api/v1/rules` lists 8 rules, and that the Grafana API shows the dashboard and returns data for `jsp_db_up`.
  - Stop the throwaway app afterwards.
  - Record the results.
