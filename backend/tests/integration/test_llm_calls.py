"""A native round writes one llm_calls row priced at call time. Synthetic data only."""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from job_search_platform.db.models import LlmCall, ModelPrice
from test_agent_applications import _good, _prepare
from test_cv_tailoring import _execute_next, _setup
from test_rest_api import api_context  # noqa: F401
from test_run_telemetry import _UsageRuntime


def _rows(ctx, run_id):
    with ctx.sessions() as db:
        return list(db.scalars(select(LlmCall).where(LlmCall.run_id == run_id)))


@pytest.mark.integration
def test_round_writes_a_priced_llm_call_row_and_later_price_changes_do_not_rewrite_it(api_context):
    ctx = api_context
    with ctx.sessions.begin() as db:
        db.merge(ModelPrice(model="openrouter/synthetic/priced", price_in=Decimal("3"), price_out=Decimal("15"),
                            price_cache=Decimal("0.3"), source="manual", is_free=False))
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    usage = {"model": "synthetic/priced", "input_tokens": 1000, "output_tokens": 200, "cached_tokens": 400, "api_calls": 3}
    runtime = _UsageRuntime(ctx.tmp_path / "ws", [_good(facts)], usage=usage)
    run_id = _prepare(ctx, csrf, pid, session_).json()["id"]
    _execute_next(ctx, runtime)
    (row,) = _rows(ctx, run_id)
    assert (row.model, row.input_tokens, row.output_tokens, row.cached_tokens, row.api_calls) == ("synthetic/priced", 1000, 200, 400, 3)
    assert (row.price_in, row.price_out, row.price_cache, row.price_source) == (Decimal("3"), Decimal("15"), Decimal("0.3"), "manual")
    # (600 * 3 + 400 * 0.3 + 200 * 15) / 1M
    assert row.cost_usd == Decimal("0.00492000") and row.user_id is not None and 0 <= row.latency_ms <= 3_600_000
    with ctx.sessions.begin() as db:
        db.get(ModelPrice, "openrouter/synthetic/priced").price_in = Decimal("99")
    (again,) = _rows(ctx, run_id)
    assert again.price_in == Decimal("3") and again.cost_usd == Decimal("0.00492000")


@pytest.mark.integration
def test_unpriced_model_gets_a_row_without_cost(api_context):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _UsageRuntime(ctx.tmp_path / "ws", [_good(facts)], usage={"model": "synthetic/unpriced", "input_tokens": 5, "output_tokens": 1})
    run_id = _prepare(ctx, csrf, pid, session_).json()["id"]
    _execute_next(ctx, runtime)
    (row,) = _rows(ctx, run_id)
    assert row.cost_usd is None and row.price_source is None and row.api_calls == 1 and row.cached_tokens == 0
