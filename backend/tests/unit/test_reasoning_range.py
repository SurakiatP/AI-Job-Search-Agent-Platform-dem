import asyncio

import pytest

from job_search_platform.integrations.hermes_runtime import reasoning_effort
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
