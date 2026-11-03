import asyncio
import io
import json
import sys
from pathlib import Path

import pytest

from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.integrations.hermes_runtime import ParsedInput
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.ocr import transcribe_pages, with_vision_text

sys.path.insert(0, str(Path(__file__).parents[3] / "infra/hermes"))
from parse_document import broken_thai  # noqa: E402


class _Opener:
    def __init__(self, texts):
        self.texts, self.requests = list(texts), []

    def open(self, request, timeout):
        self.requests.append(json.loads(request.data))
        body = json.dumps({"choices": [{"message": {"content": self.texts.pop(0)}}]}).encode()
        return io.BytesIO(body)


def _gateway(opener, key="k"):
    return GatewaySettings("http://gw", key, "ai-analyze", "d", opener)


def test_broken_thai_detection():
    assert broken_thai("กขคงจ" * 60)  # consonants, no marks
    assert not broken_thai("สวัสดีครับ ผู้สมัครงานที่มีประสบการณ์ " * 15)
    assert not broken_thai("plain english " * 100)
    assert not broken_thai("กขค")  # too short to judge


def test_transcribe_joins_pages_and_deletes_images(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_MODEL_DOCUMENT_OCR", raising=False)
    pages = [tmp_path / "ocr-1.jpg", tmp_path / "ocr-2.jpg"]
    for page in pages:
        page.write_bytes(b"\xff\xd8fake")
    opener = _Opener(["page one", "page two"])
    text = asyncio.run(transcribe_pages(_gateway(opener), pages))
    assert text == "page one\n\npage two"
    assert [p.exists() for p in pages] == [False, False]
    assert opener.requests[0]["temperature"] == 0 and opener.requests[0]["model"] == "ai-analyze"
    assert opener.requests[0]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_model_override_and_failure_code(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_MODEL_DOCUMENT_OCR", "vision-x")
    page = tmp_path / "ocr-1.jpg"
    page.write_bytes(b"x")
    opener = _Opener(["ok"])
    asyncio.run(transcribe_pages(_gateway(opener), [page]))
    assert opener.requests[0]["model"] == "vision-x"
    page.write_bytes(b"x")
    with pytest.raises(ServiceError) as error:  # empty opener -> IndexError -> ocr_unavailable
        asyncio.run(transcribe_pages(_gateway(_Opener([])), [page]))
    assert error.value.code == "ocr_unavailable" and error.value.retryable
    assert not page.exists()


def test_with_vision_text_passthrough_and_no_key(tmp_path):
    plain = ParsedInput("hello", "pdf", "0" * 64)
    assert asyncio.run(with_vision_text(plain, tmp_path, lambda: None)) is plain
    (tmp_path / "staging").mkdir()
    (tmp_path / "staging/ocr-1.jpg").write_bytes(b"x")
    scan = ParsedInput("", "pdf", "0" * 64, "scanned_pdf", ("staging/ocr-1.jpg",))
    with pytest.raises(ServiceError) as error:
        asyncio.run(with_vision_text(scan, tmp_path, lambda: _gateway(_Opener([]), key=None)))
    assert error.value.code == "scanned_pdf_unsupported"
    bad = ParsedInput("", "pdf", "0" * 64, "scanned_pdf", ("staging/../x.jpg",))
    with pytest.raises(ServiceError):
        asyncio.run(with_vision_text(bad, tmp_path, lambda: _gateway(_Opener([]))))
