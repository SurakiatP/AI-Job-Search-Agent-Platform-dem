"""Benchmark row lifecycle against PostgreSQL; the LiteLLM call and scorer are faked, so no model is contacted."""
import threading
import urllib.error
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import BenchmarkRun, TaskModelSetting
from job_search_platform.services import benchmark
from job_search_platform.services.errors import ServiceError

pytestmark = pytest.mark.integration
OP = "extract_experience"  # gold task "extract", 20 holdout cases


class Fake:
    """Replaces run_bench's network edges. quality[model] is the score every case gets."""

    def __init__(self, rb, quality, fail=(), gate=None):
        self.quality, self.fail, self.gate, self.calls, self.registered, self.removed = quality, set(fail), gate, [], [], []
        self.seen = []  # case states seen while the 3rd real case was being answered

    def api(self, method, path, body=None, key=None, timeout=30):
        if path == "/model/info":
            return {"data": [{"model_name": "ai-analyze", "model_info": {"id": "id-ai"}}] + [
                {"model_name": a, "model_info": {"id": "id-" + a}} for a in self.registered]}
        if path == "/model/new":
            self.registered.append(body["model_name"])
        if path == "/model/delete":
            self.removed.append(body["id"])
        return {}

    def call(self, alias, system, prompt, key, max_tokens, reasoning=None, timeout=180):
        self.calls.append((alias, reasoning))
        if alias in self.fail:
            raise urllib.error.URLError("down")
        if self.gate:
            self.gate[0].set()
            self.gate[1].wait(10)
        return {"total_s": 2.0, "first_token_s": 1.0, "first_text_s": 1.0, "text": alias, "prompt_tokens": 1000,
                "completion_tokens": 100, "reasoning_tokens": 0, "cached_tokens": 0, "finish": "stop"}


@pytest.fixture
def bench(monkeypatch):
    rb = benchmark._gold()
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-test-master")
    monkeypatch.setenv("AI_ANALYZE_MODEL", "ai-analyze")
    monkeypatch.delenv("AI_MODEL_EXTRACT_EXPERIENCE", raising=False)
    monkeypatch.delenv("AI_REASONING_EXTRACT_EXPERIENCE", raising=False)
    monkeypatch.setattr(rb.time, "sleep", lambda s: None)
    monkeypatch.setattr(rb, "prices", lambda models: {m: {"in": 1.0, "out": 2.0, "cache": 0.5} for m in models})
    monkeypatch.setattr(benchmark, "_price", lambda factory, model: ({"in": 1.0, "out": 2.0, "cache": 0.5}, False))

    def install(quality, **kw):
        fake = Fake(rb, quality, **kw)
        monkeypatch.setattr(rb, "api", fake.api)
        monkeypatch.setattr(rb, "call", fake.call)
        monkeypatch.setitem(rb.SCORERS, "extract", lambda raw, *a: (next(q for k, q in quality.items() if k in raw), {}))
        return fake
    return install


def run(db, model, effort, actor=None):
    view = benchmark.start(db, actor or uuid4(), OP, model, effort)
    benchmark._thread.join(30)
    assert not benchmark._thread.is_alive()
    return view


def test_baseline_is_measured_first_then_green(migrated_engine, bench):
    fake = bench({"ai-analyze": 80.0, "model-b": 79.0})
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        queued = run(db, "x/model-b", "high")
        assert queued.status == "queued" and len(queued.cases) == 20 and {c.state for c in queued.cases} == {"pending"}
        rows = benchmark.list_for(db, OP)
        assert len(rows) == 2  # the current pair got its own row
        mine = benchmark.get(db, queued.id)
        base = next(r for r in rows if r.id != queued.id)
        assert (base.model, base.effort, base.status, base.verdict) == ("ai-analyze", "default", "done", "green")
        assert base.baseline is None and base.summary.quality == 80.0 and base.summary.cost_per_call_usd == pytest.approx(0.0012)
        assert (mine.status, mine.verdict, mine.summary.quality) == ("done", "green", 79.0)
        assert mine.baseline == base.summary and mine.finished_at and {c.state for c in mine.cases} == {"ok"}
        assert benchmark.latest_for_pair(db, OP, "x/model-b", "high").id == mine.id
        assert benchmark.latest_for_pair(db, OP, "x/model-b", "low") is None
    assert len(fake.registered) == 1 and len(fake.removed) == 1  # only the OpenRouter id got a temporary alias
    assert ("ai-analyze", {"effort": "high"}) not in fake.calls and any(c[1] == {"effort": "high"} for c in fake.calls)


def test_quality_drop_over_two_points_is_red_and_existing_baseline_is_reused(migrated_engine, bench):
    bench({"ai-analyze": 80.0, "model-c": 70.0})
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        run(db, "ai-analyze", "default")  # the pair itself, no earlier baseline: errors only
        assert benchmark.list_for(db, OP)[0].verdict == "green"
        red = benchmark.get(db, run(db, "x/model-c", "low").id)
        assert red.verdict == "red" and red.baseline.quality == 80.0
        assert len(benchmark.list_for(db, OP)) == 2  # baseline reused, not run again


def test_stored_task_setting_is_the_current_pair(migrated_engine, bench):
    bench({"model-a": 60.0, "model-b": 60.0})
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        db.add(TaskModelSetting(operation=OP, model="x/model-a", effort="low"))
        db.commit()
        view = benchmark.get(db, run(db, "x/model-b", "low").id)
        assert view.verdict == "green" and view.baseline.quality == 60.0
        assert {(r.model, r.effort) for r in benchmark.list_for(db, OP)} == {("x/model-a", "low"), ("x/model-b", "low")}


def test_any_error_is_red_and_counted(migrated_engine, bench):
    bench({"ai-analyze": 50.0, "model-d": 90.0}, fail=[])
    fake_fail = lambda alias: alias.startswith("gold-x-model-d")
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        rb = benchmark._gold()
        good = rb.call
        rb.call = lambda alias, *a, **k: (_ for _ in ()).throw(urllib.error.URLError("down")) if fake_fail(alias) else good(alias, *a, **k)
        try:
            view = benchmark.get(db, run(db, "x/model-d", "low").id)
        finally:
            rb.call = good
        assert view.verdict == "red" and view.summary.errors == 20 and view.status == "done"
        assert {c.state for c in view.cases} == {"bad"}


def test_cases_move_pending_running_ok_while_the_run_is_busy(migrated_engine, bench):
    started, release = threading.Event(), threading.Event()
    bench({"ai-analyze": 80.0}, gate=(started, release))
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        db.add(TaskModelSetting(operation=OP, model="ai-analyze", effort="default"))
        db.commit()
        view = benchmark.start(db, uuid4(), OP, "ai-analyze", "default")
        assert started.wait(10)
        live = benchmark.get(db, view.id)
        assert live.status == "running" and [c.state for c in live.cases][:2] == ["running", "pending"]
        with pytest.raises(ServiceError) as err:
            benchmark.start(db, uuid4(), OP, "ai-analyze", "default")
        assert err.value.code == "benchmark_busy"
        release.set()
        benchmark._thread.join(30)
        done = benchmark.get(db, view.id)
        assert done.status == "done" and {c.state for c in done.cases} == {"ok"}


def test_rows_left_running_by_a_dead_process_become_failed(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory() as db:
        row = BenchmarkRun(operation=OP, model="m/x", effort="low", status="running", cases=[{"id": "e1", "state": "running"}])
        db.add(row)
        db.commit()
        got = benchmark.get(db, row.id)
        assert (got.status, got.verdict) == ("failed", "na") and got.finished_at


def test_job_crash_marks_rows_failed_and_frees_the_lock(migrated_engine, bench, monkeypatch):
    bench({"ai-analyze": 1.0})
    monkeypatch.setattr(benchmark, "_master_key", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    with sessionmaker(migrated_engine, expire_on_commit=False)() as db:
        view = benchmark.get(db, run(db, "ai-analyze", "low").id)
        assert view.status == "failed" and view.verdict == "na"
        assert benchmark._LOCK.acquire(blocking=False)
        benchmark._LOCK.release()
