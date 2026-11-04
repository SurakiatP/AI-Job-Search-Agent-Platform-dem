"""AI models service: price resolution, manual price validation, apply rule, catalog cache. No network, no database."""
from __future__ import annotations

import pytest

from job_search_platform.services import ai_models
from job_search_platform.services.errors import ServiceError

ITEM = {"id": "acme/fast", "name": "Acme Fast", "context_length": 1000,
        "pricing": {"prompt": "0.00000015", "completion": "0.0000006", "input_cache_read": "0.00000003"}}


def test_openrouter_price_is_per_million_and_negative_means_unknown():
    assert ai_models.resolve_price("acme/fast", [ITEM], {}) == {"price_in": 0.15, "price_out": 0.6, "price_cache": 0.03, "source": "openrouter"}
    router = {"id": "openrouter/auto", "pricing": {"prompt": "-1", "completion": "-1"}}
    assert ai_models.resolve_price("openrouter/auto", [router], {}) is None
    assert ai_models.resolve_price("acme/fast", [{**ITEM, "pricing": {"prompt": "x", "completion": "1"}}], {}) is None


def test_resolution_order_is_openrouter_then_litellm_then_none():
    ll = {"acme/fast": {"price_in": 9.0, "price_out": 9.0, "price_cache": None, "source": "litellm"},
          "only/litellm": {"price_in": 1.0, "price_out": 2.0, "price_cache": None, "source": "litellm"}}
    assert ai_models.resolve_price("acme/fast", [ITEM], ll)["source"] == "openrouter"
    assert ai_models.resolve_price("only/litellm", [ITEM], ll)["source"] == "litellm"
    assert ai_models.resolve_price("nobody", [ITEM], ll) is None


def test_manual_price_rules():
    ok = ai_models.manual_price(1, 2, None, False)
    assert ok == {"price_in": 1.0, "price_out": 2.0, "price_cache": None, "source": "manual"}  # empty cache stays null
    assert ai_models.manual_price(0, 0, 0, True)["price_in"] == 0
    for bad in [(-1, 2, None, False), (1, -0.1, None, False), (1, 2, -1, False), ("1", 2, None, False), (None, 2, None, False),
                (True, 2, None, False), (float("nan"), 2, None, False), (0, 2, None, False), (1, 0, None, False), (1, 2, 0, False)]:
        with pytest.raises(ServiceError) as err:
            ai_models.manual_price(*bad)
        assert err.value.code == "price_invalid", bad


@pytest.mark.parametrize("verdict,confirm,allowed", [
    (None, None, False), (None, ai_models.CONFIRM, False),  # no finished test: never
    ("green", None, True),
    ("red", None, False), ("red", "wrong", False), ("red", ai_models.CONFIRM, True),
    ("na", None, False), ("na", ai_models.CONFIRM, True)])
def test_apply_rule(verdict, confirm, allowed):
    if allowed:
        ai_models.check_gate(verdict, confirm)
    else:
        with pytest.raises(ServiceError) as err:
            ai_models.check_gate(verdict, confirm)
        assert err.value.code == "benchmark_required"


def test_catalog_is_cached_and_failure_is_503(monkeypatch):
    ai_models._cache.update(at=0.0, items=None)
    calls = []

    def http(method, url, body=None, token=None, local=False):
        calls.append(url)
        return {"data": [ITEM, {"no_id": True}]}
    monkeypatch.setattr(ai_models, "_http", http)
    assert [i["id"] for i in ai_models.catalog_items()] == ["acme/fast"]
    ai_models.catalog_items()
    assert calls == [ai_models.OPENROUTER_URL]
    ai_models._cache.update(at=0.0, items=None)
    monkeypatch.setattr(ai_models, "_http", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    with pytest.raises(ServiceError) as err:
        ai_models.catalog_items()
    assert err.value.code == "service_unavailable"
    ai_models._cache.update(at=0.0, items=None)


def test_current_pair_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("AI_ANALYZE_MODEL", "ai-analyze")
    monkeypatch.setenv("AI_MODEL_TAILOR_CV", "acme/fast")
    monkeypatch.setenv("AI_REASONING_TAILOR_CV", "HIGH")
    assert ai_models.current_pair("tailor_cv", None) == ("acme/fast", "high", "env")
    assert ai_models.current_pair("evaluate_job", None) == ("ai-analyze", "default", "env")
    assert ai_models.current_pair("interview_grade", None)[1] == "low"  # the bridge's real default, not "default"
