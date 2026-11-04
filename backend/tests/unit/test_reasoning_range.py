import asyncio

import pytest

from job_search_platform.integrations.hermes_runtime import BRIDGE_DEFAULT_EFFORT, env_effort, reasoning_effort
from job_search_platform.services.ocr import transcribe_pages
from test_ocr_fallback import _gateway, _Opener


@pytest.mark.parametrize("raw,sent", [
    ("none", {"enabled": False}), ("minimal", {"effort": "minimal"}), ("low", {"effort": "low"}),
    ("medium", {"effort": "medium"}), ("high", {"effort": "high"}), ("default", None),
    ("garbage", None), ("", None)])
def test_ocr_reasoning_field(tmp_path, monkeypatch, raw, sent):
    monkeypatch.setenv("AI_REASONING_DOCUMENT_OCR", raw)
    page = tmp_path / "ocr-1.jpg"
    page.write_bytes(b"x")
    opener = _Opener(["ok"])
    asyncio.run(transcribe_pages(_gateway(opener), [page]))
    assert opener.requests[0].get("reasoning") == sent and opener.requests[0]["max_tokens"] == 8192


def test_effort_helper():
    assert reasoning_effort({"AI_REASONING_TAILOR_CV": " None "}, "tailor_cv") == "none"
    assert reasoning_effort({"AI_REASONING_TAILOR_CV": "x"}, "tailor_cv") is None


def test_env_effort_reports_the_bridge_default_and_matches_the_bridge(monkeypatch):
    import json, os, pathlib
    monkeypatch.delenv("PLATFORM_REASONING", raising=False)
    src = (pathlib.Path(__file__).parents[3] / "infra/hermes/native_bridge.py").read_text()
    ns = {"os": os, "json": json}
    exec(src[src.index("REASONING = {"):src.index("CAREER_OPS_FILES")], ns)
    ran = {op: v["extra_body"]["reasoning"]["effort"] for op, v in ns["REASONING"].items()}
    assert ran == BRIDGE_DEFAULT_EFFORT  # what the bridge runs with no setting is what the console reports
    assert env_effort({}, "interview_grade") == "low" and env_effort({}, "tailor_cv") == "default"
    assert env_effort({"AI_REASONING_INTERVIEW_GRADE": "default"}, "interview_grade") == "default"
    assert env_effort({"AI_REASONING_INTERVIEW_GRADE": "high"}, "interview_grade") == "high"


def test_bridge_none_maps_to_disabled(monkeypatch):
    import json, os, pathlib
    monkeypatch.setenv("PLATFORM_REASONING", '{"tailor_cv": "none", "interview_grade": "minimal"}')
    src = (pathlib.Path(__file__).parents[3] / "infra/hermes/native_bridge.py").read_text()
    ns = {"os": os, "json": json}
    exec(src[src.index("REASONING = {"):src.index("CAREER_OPS_FILES")], ns)  # bridge runs on import; take only the reasoning block
    assert ns["_wire_reasoning"](ns["REASONING"]["tailor_cv"]) == {"enabled": False}
    assert ns["REASONING"]["tailor_cv"] == {"extra_body": {"reasoning": {"enabled": False}}}
    assert ns["_wire_reasoning"](ns["REASONING"]["interview_grade"]) == {"enabled": True, "effort": "minimal"}


def test_ocr_truncated_reply_is_an_error():
    import io, json
    from job_search_platform.services import ocr

    class Opener:
        def open(self, request, timeout):
            return io.BytesIO(json.dumps({"choices": [{"finish_reason": "length", "message": {"content": "half"}}]}).encode())

    class Gateway:
        opener = Opener()
        def provider_config(self, op):
            return type("C", (), {"model": "m", "base_url": "http://x/v1", "api_key": "k"})()

    import pytest
    with pytest.raises(ValueError, match="ocr_truncated"):
        ocr._call(Gateway(), b"x")


def test_bridge_usage_input_includes_cached_tokens():
    import pathlib
    from types import SimpleNamespace
    src = (pathlib.Path(__file__).parents[3] / "infra/hermes/native_bridge.py").read_text()
    ns = {}
    exec(src[src.index("def _usage(agent)"):src.index("def _system_message")], ns)  # bridge runs on import; take only this function
    agent = SimpleNamespace(model="m", session_input_tokens=200, session_output_tokens=50, session_cache_read_tokens=800,
                            session_cache_write_tokens=100, session_api_calls=3)
    usage = ns["_usage"](agent)
    assert usage["input_tokens"] == 1100 and usage["cached_tokens"] == 800  # whole prompt, cache hits inside it
    from decimal import Decimal
    from job_search_platform.services.pricing import cost_usd
    price = (Decimal(1), Decimal(2), Decimal("0.1"), "manual")
    assert cost_usd(price, usage["input_tokens"], 50, usage["cached_tokens"]) == Decimal("0.00048000")  # 300*1 + 800*0.1 + 50*2 per 1M
