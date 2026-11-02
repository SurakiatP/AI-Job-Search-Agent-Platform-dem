"""WP1 observability hooks: middleware, LLM tracing helpers, run executor. Synthetic values only."""
from __future__ import annotations

import asyncio
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
    asyncio.run(_executor(_Sessions("completed"))._record_metrics(run, time.monotonic() - 3))
    assert _value("jsp_runs_total", operation="evaluate", outcome="completed") == before + 1


def test_executor_metrics_never_raise_when_db_fails():
    run = SimpleNamespace(id=uuid.uuid4(), operation="evaluate")
    before = _value("jsp_runs_total", operation="evaluate", outcome="error")
    asyncio.run(_executor(_Sessions(fail=True))._record_metrics(run, time.monotonic()))
    assert _value("jsp_runs_total", operation="evaluate", outcome="error") == before + 1


def test_failed_run_logs_the_cause_without_the_error_text(caplog):
    """A run that fails must leave its error type and place in the log, never the message (it may hold secrets)."""
    executor = RunExecutor.__new__(RunExecutor)
    finished = []
    executor.queue = SimpleNamespace(finish=lambda *a, **k: finished.append((a, k)))
    run = SimpleNamespace(id=uuid.uuid4(), operation="profile_cv")

    async def go():
        try:
            raise ConnectionError("https://gateway.example.test/v1?key=sk-synthetic-secret")
        except ConnectionError:
            await executor._finish_after_stop(run, "lease", "failed", "errors.execution_failed")

    with caplog.at_level("ERROR", logger="job_search_platform.workers.executor"):
        asyncio.run(go())
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "run_failed" in text and "profile_cv" in text and "ConnectionError" in text
    assert "test_metrics_hooks.py" in text  # where it was raised
    assert "sk-synthetic-secret" not in text and "gateway.example.test" not in text
    assert finished  # the run is still finished as before
