import asyncio
import base64
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
import parse_document  # noqa: E402


class _Opener:
    def __init__(self, texts):
        self.texts, self.requests = list(texts), []

    def open(self, request, timeout):
        self.requests.append(json.loads(request.data))
        body = json.dumps({"choices": [{"message": {"content": self.texts.pop(0)}}]}).encode()
        return io.BytesIO(body)


def _gateway(opener, key="k"):
    return GatewaySettings("http://gw", key, "ai-analyze", "d", opener)


class _ByImageOpener(_Opener):
    """Pages are sent in parallel, so answer by image content, not by arrival order."""

    def __init__(self, texts):
        self.texts, self.requests = texts, []

    def open(self, request, timeout):
        body = json.loads(request.data)
        self.requests.append(body)
        uri = body["messages"][0]["content"][1]["image_url"]["url"]
        text = self.texts[base64.b64decode(uri.split(",", 1)[1])]
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": text}}]}).encode())


def test_transcribe_joins_pages_and_deletes_images(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_MODEL_DOCUMENT_OCR", raising=False)
    pages = [tmp_path / "page-1.jpg", tmp_path / "page-2.jpg"]
    for number, page in enumerate(pages, 1):
        page.write_bytes(b"\xff\xd8fake%d" % number)
    opener = _ByImageOpener({b"\xff\xd8fake1": "page one", b"\xff\xd8fake2": "page two"})
    text = asyncio.run(transcribe_pages(_gateway(opener), pages))
    assert text == "page one\n\npage two"
    assert [p.exists() for p in pages] == [False, False]
    assert opener.requests[0]["temperature"] == 0 and opener.requests[0]["model"] == "ai-analyze"
    assert opener.requests[0]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_model_override_and_failure_code(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_MODEL_DOCUMENT_OCR", "vision-x")
    page = tmp_path / "page-1.jpg"
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
    (tmp_path / "staging/page-1.jpg").write_bytes(b"x")
    scan = ParsedInput("", "pdf", "0" * 64, ("staging/page-1.jpg",))
    with pytest.raises(ServiceError) as error:  # no text-layer fallback exists
        asyncio.run(with_vision_text(scan, tmp_path, lambda: _gateway(_Opener([]), key=None)))
    assert error.value.code == "ocr_unavailable"
    assert not (tmp_path / "staging/page-1.jpg").exists()
    bad = ParsedInput("", "pdf", "0" * 64, ("staging/../x.jpg",))
    with pytest.raises(ServiceError):
        asyncio.run(with_vision_text(bad, tmp_path, lambda: _gateway(_Opener([]))))


def test_png_pages_are_sent_as_png(tmp_path):
    page = tmp_path / "page-1.png"
    page.write_bytes(b"\x89PNG\r\n\x1a\nx")
    opener = _Opener(["ok"])
    asyncio.run(transcribe_pages(_gateway(opener), [page]))
    assert opener.requests[0]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")


def _inputs(tmp_path, monkeypatch, name, body):
    root = tmp_path / "inputs"
    root.mkdir(exist_ok=True)
    (root / name).write_bytes(body)
    real = Path
    monkeypatch.setattr(parse_document, "Path", lambda value: real(str(value).replace("/workspace", str(tmp_path))))
    monkeypatch.setattr(parse_document, "STAGING", tmp_path / "staging")
    return root / name


def test_every_kind_goes_to_pages_never_text(tmp_path, monkeypatch):
    rendered = []
    monkeypatch.setattr(parse_document, "render_pdf", lambda pdf: rendered.append(pdf.name) or ["staging/page-1.png"])
    # PDF with bytes before the header (BOM, blank lines) is still a PDF
    pdf = _inputs(tmp_path, monkeypatch, "cv.pdf", b"\xef\xbb\xbf\r\n  %PDF-1.4\n...")
    assert parse_document.parse(pdf) == {"pages": ["staging/page-1.png"], "kind": "pdf", "sha256": parse_document.hashlib.sha256(pdf.read_bytes()).hexdigest()}
    monkeypatch.setattr(parse_document, "html_to_pdf", lambda body, out: out.write_bytes(b"%PDF"))
    txt = _inputs(tmp_path, monkeypatch, "cv.txt", "สวัสดี <b>".encode())
    assert parse_document.parse(txt)["kind"] == "text" and rendered[-1] == "doc.pdf"
    assert not (tmp_path / "staging/doc.pdf").exists()


def test_rejections(tmp_path, monkeypatch):
    for name, body, code in (("a.txt", b"  \n", "empty_input"), ("a.txt", b"a\0b", "unsupported_input"),
                             ("a.bin", b"plain", "unsupported_input"), ("a.docx", b"PK\x03\x04junk", "document_invalid"),
                             ("a.txt", b"x" * 300_001, "document_too_many_pages")):
        with pytest.raises(ValueError, match=code):
            parse_document.parse(_inputs(tmp_path, monkeypatch, name, body))


def test_page_cap_and_password_pdf(tmp_path, monkeypatch):
    def fake(out):
        return lambda cmd, timeout: type("R", (), {"stdout": out})()
    monkeypatch.setattr(parse_document, "_run", fake("Pages:          11\n"))
    with pytest.raises(ValueError, match="document_too_many_pages"):
        parse_document._page_info(tmp_path / "x.pdf")

    def locked(cmd, timeout):
        raise ValueError("document_encrypted")
    monkeypatch.setattr(parse_document, "_run", locked)
    with pytest.raises(ValueError, match="document_encrypted"):
        parse_document._page_info(tmp_path / "x.pdf")


def test_no_text_sentinel_means_empty_page():
    import io, json
    from job_search_platform.services import ocr

    class Opener:
        def open(self, request, timeout):
            return io.BytesIO(json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": "NO_TEXT"}}]}).encode())

    class Gateway:
        opener = Opener()
        def provider_config(self, op):
            return type("C", (), {"model": "m", "base_url": "http://x/v1", "api_key": "k"})()

    assert ocr._call(Gateway(), b"x") == ""
