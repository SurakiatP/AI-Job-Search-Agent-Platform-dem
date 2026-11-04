"""Per-task model/effort routing, bridge reasoning precedence and per-call cost math. Synthetic data only."""
import importlib.util
import os
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.integrations.hermes_runtime import _usage
from job_search_platform.services.pricing import cost_usd, price_for, record_call

BRIDGE = Path(__file__).resolve().parents[3] / "infra" / "hermes" / "native_bridge.py"


def _gateway():
    return GatewaySettings("http://x", "k", "ai-analyze", "jev")


def test_task_override_beats_env_and_env_beats_default(monkeypatch):
    monkeypatch.setenv("AI_MODEL_TAILOR_CV", "env-model")
    monkeypatch.setenv("AI_REASONING_TAILOR_CV", "high")
    monkeypatch.setenv("AI_REASONING_EVALUATE_JOB", "low")
    g = _gateway().with_tasks({"tailor_cv": ("db-model", "minimal")})
    assert (g.provider_config("tailor_cv").model, g.provider_config("tailor_cv").effort) == ("db-model", "minimal")
    assert g.provider_config("evaluate_job").effort == "low"          # no row: env effort
    assert _gateway().provider_config("tailor_cv").model == "env-model"  # no rows at all: env model
    assert _gateway().provider_config("tailor_cv").effort == "high"
    assert _gateway().provider_config("apply_prepare").effort is None
    monkeypatch.delenv("AI_MODEL_TAILOR_CV")
    assert _gateway().provider_config("tailor_cv").model == "ai-analyze"


def test_bad_task_row_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("AI_MODEL_TAILOR_CV", "env-model")
    g = _gateway().with_tasks({"tailor_cv": ("bad name!", "turbo")})
    config = g.provider_config("tailor_cv")
    assert config.model == "env-model" and config.effort is None
    assert _gateway().with_tasks({}).tasks == {}


def test_default_effort_row_is_passed_through():
    assert _gateway().with_tasks({"tailor_cv": ("m", "default")}).provider_config("tailor_cv").effort == "default"


def test_usage_carries_cached_tokens_and_api_calls():
    out = _usage({"model": "m", "input_tokens": 10, "output_tokens": 2, "cached_tokens": 4, "api_calls": 3})
    assert (out["cached_tokens"], out["api_calls"]) == (4, 3)
    assert _usage({"model": "m", "cached_tokens": -1, "api_calls": True})["cached_tokens"] is None


def _bridge():
    source = BRIDGE.read_text()
    namespace = {"os": os, "json": __import__("json")}
    exec(source[source.index("REASONING = {"):source.index("CAREER_OPS_FILES")], namespace)  # the reasoning block only
    return namespace


def test_bridge_payload_effort_beats_env_and_interview_defaults(monkeypatch):
    monkeypatch.setenv("PLATFORM_REASONING", '{"interview_grade": "high", "tailor_cv": "low"}')
    ns = _bridge()
    effort = lambda value: ns["_reasoning_for"]("interview_grade", value)["extra_body"]["reasoning"]  # noqa: E731
    assert effort("minimal") == {"effort": "minimal"}           # payload wins over env "high"
    assert effort("none") == {"enabled": False}
    assert ns["_reasoning_for"]("interview_grade", "default") is None   # default: no override at all
    assert ns["_reasoning_for"]("interview_grade", None)["extra_body"]["reasoning"] == {"effort": "high"}  # env
    assert ns["_reasoning_for"]("interview_grade", "turbo")["extra_body"]["reasoning"] == {"effort": "high"}
    assert ns["_reasoning_for"]("evaluate_job", None) is None   # nothing set anywhere
    assert ns["_wire_reasoning"](ns["_reasoning_for"]("tailor_cv", "high")) == {"enabled": True, "effort": "high"}


def test_bridge_usage_reports_cache_reads_and_api_calls():
    source = BRIDGE.read_text()
    namespace = {}
    exec(source[source.index("def _usage("):source.index("def _system_message")], namespace)
    agent = SimpleNamespace(model="m", session_input_tokens=100, session_output_tokens=7,
                            session_cache_read_tokens=60, session_api_calls=4)
    assert namespace["_usage"](agent) == {"model": "m", "input_tokens": 100, "output_tokens": 7,
                                          "cached_tokens": 60, "api_calls": 4}
    assert namespace["_usage"](SimpleNamespace(model="m"))["cached_tokens"] is None


def D(x):
    return Decimal(str(x))


@pytest.mark.parametrize("price, tokens, expected", [
    ((D(3), D(15), D(0.3), "openrouter"), (1_000_000, 100_000, 400_000), D("3.42")),
    ((D(3), D(15), None, "litellm"), (1_000_000, 100_000, 400_000), D("4.50000000")),     # no cache price: input price
    ((D(0), D(0), D(0), "manual"), (1_000_000, 1_000_000, 0), D("0")),                  # free
    (None, (1_000, 1_000, 0), None),                                                      # unpriced
])
def test_cost_math(price, tokens, expected):
    got = cost_usd(price, *tokens)
    assert (got is None) if expected is None else got == expected.quantize(Decimal("0.00000001"))


def test_cost_counts_cached_input_at_the_cache_price():
    # (600k * 3 + 400k * 0.3 + 100k * 15) / 1M = 1.8 + 0.12 + 1.5
    assert cost_usd((D(3), D(15), D(0.3), "manual"), 1_000_000, 100_000, 400_000) == D("3.42000000")


class _Db:
    """Just enough Session for price_for/record_call: one price row, rows added are kept."""
    def __init__(self, rows, project_user=None):
        self.rows, self.added, self.project_user = rows, [], project_user

    def scalars(self, statement):
        wanted = set(next(iter(statement._where_criteria)).right.value)
        return [r for r in self.rows if r.model in wanted]

    def scalar(self, statement):
        return self.project_user

    def add(self, row):
        self.added.append(row)


def _row(model, **kw):
    return SimpleNamespace(model=model, price_in=D(1), price_out=D(2), price_cache=None, source="manual", is_free=False, **kw)


def test_price_for_normalises_the_openrouter_prefix_and_free_models():
    assert price_for(_Db([_row("openrouter/a/b")]), "a/b")[:2] == (D(1), D(2))
    assert price_for(_Db([_row("a/b")]), "openrouter/a/b")[:2] == (D(1), D(2))
    assert price_for(_Db([_row("a/b")]), "other") is None
    assert price_for(_Db([_row("a/b", )]), "a/b")[3] == "manual"
    free = _row("f")
    free.is_free = True
    assert price_for(_Db([free]), "f") == (D(0), D(0), D(0), "manual")


def test_record_call_snapshots_the_price_and_leaves_unpriced_cost_null():
    db = _Db([_row("m")])
    row = record_call(db, operation="tailor_cv", model="m", input_tokens=1000, output_tokens=500, cached_tokens=None,
                      api_calls=None, latency_ms=12, user_id=None)
    assert (row.price_in, row.price_out, row.price_source, row.api_calls) == (D(1), D(2), "manual", 1)
    assert row.cost_usd == D("0.00200000")
    bare = record_call(db, operation="tailor_cv", model="unknown", input_tokens=5, output_tokens=5)
    assert bare.cost_usd is None and bare.price_in is None and bare.price_source is None


def test_ocr_call_uses_the_task_effort_and_reports_usage_once_per_page():
    import io
    import json
    from job_search_platform.services import ocr

    sent, seen = [], []

    class Opener:
        def open(self, request, timeout):
            sent.append(json.loads(request.data))
            return io.BytesIO(json.dumps({"model": "upstream", "choices": [{"finish_reason": "stop", "message": {"content": "hi"}}],
                                          "usage": {"prompt_tokens": 50, "completion_tokens": 5,
                                                    "prompt_tokens_details": {"cached_tokens": 10}}}).encode())

    gateway = GatewaySettings("http://gw", "k", "ai-analyze", "d", Opener()).with_tasks({"document_ocr": ("ocr-model", "low")})
    assert ocr._call(gateway, b"x", lambda *args: seen.append(args)) == "hi"
    assert sent[0]["model"] == "ocr-model" and sent[0]["reasoning"] == {"effort": "low"}
    assert seen[0][:2] == ("ocr-model", {"prompt_tokens": 50, "completion_tokens": 5, "prompt_tokens_details": {"cached_tokens": 10}})
