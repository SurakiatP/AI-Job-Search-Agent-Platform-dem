"""Vision OCR: the only way document text is read.

The sandbox renders every upload (PDF, DOCX, TXT) to page pictures, PNG or JPEG (infra/hermes/parse_document.py); only here,
on the host, are they sent as data URIs, one request per page, to a multimodal model through LiteLLM. The host never parses
the untrusted document itself.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
from pathlib import Path
from urllib.request import Request

from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.integrations.hermes_runtime import ParsedInput, reasoning_effort
from job_search_platform.services.errors import ServiceError

log = logging.getLogger(__name__)
PAGE_PATH = re.compile(r"staging/page-([1-9]|10)\.(png|jpg)")
MAX_CONCURRENT_PAGES = 5
MAX_TEXT_BYTES = 1024 * 1024
MAX_PAGE_BYTES = 4 * 1024 * 1024
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
PAGE_TIMEOUT_SECONDS = 90
PROMPT = ("Transcribe all visible text in this document page exactly as written. Keep the reading order and every "
          "Thai tone mark and vowel sign. Do not summarise, translate, correct or add anything. "
          "Output plain text or Markdown only, with no commentary. If the page has no readable text, output exactly NO_TEXT and nothing else.")
NO_TEXT = "NO_TEXT"
OCR_TOTAL_SECONDS = 45  # 10 pages, 5 at a time; runtime start + render (<= 45 s) + this stays near 90 s, under typical 100 s proxy limits


def _call(gateway: GatewaySettings, image: bytes) -> str:
    config = gateway.provider_config("document_ocr")
    mime = "image/png" if image[:4] == b"\x89PNG" else "image/jpeg"
    uri = f"data:{mime};base64," + base64.b64encode(image).decode()
    body = {"model": config.model, "temperature": 0, "max_tokens": 8192, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": uri}}]}]}
    effort = reasoning_effort(os.environ, "document_ocr")
    if effort == "none":
        body["reasoning"] = {"enabled": False}
    elif effort and effort != "default":
        body["reasoning"] = {"effort": effort}
    request = Request(config.base_url + "/chat/completions", data=json.dumps(body).encode(), method="POST",
                      headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"})
    with gateway.opener.open(request, timeout=PAGE_TIMEOUT_SECONDS) as response:
        choice = json.loads(response.read(MAX_RESPONSE_BYTES))["choices"][0]
    if choice.get("finish_reason") == "length":  # cut off (often all tokens spent on reasoning): never keep half a page
        raise ValueError("ocr_truncated")
    content = choice["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("ocr_response_invalid")
    content = content.strip()
    # Models sometimes describe an empty page instead of staying silent; only the sentinel counts as "no text".
    return "" if content.strip("`*_ .\n").upper() == NO_TEXT else content


async def transcribe_pages(gateway: GatewaySettings, image_paths: list[Path]) -> str:
    """One request per page, run in parallel (results keep page order); page texts are joined by a blank line. Deletes the image files."""
    gateway._key()  # gateway_unconfigured stays its own error
    try:
        for path in image_paths:
            if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_PAGE_BYTES:
                raise ServiceError("ocr_unavailable", retryable=True)
        try:
            gate = asyncio.Semaphore(MAX_CONCURRENT_PAGES)

            async def one(path: Path) -> str:
                async with gate:
                    return await asyncio.to_thread(_call, gateway, path.read_bytes())

            parts = await asyncio.wait_for(asyncio.gather(*(one(path) for path in image_paths)), OCR_TOTAL_SECONDS)
        except Exception:
            raise ServiceError("ocr_unavailable", retryable=True) from None
    finally:
        for path in image_paths:
            path.unlink(missing_ok=True)
    text = "\n\n".join(part for part in parts if part).replace("\x00", "")
    if not text.strip():
        raise ServiceError("empty_input")
    # ponytail: cut at the byte cap instead of failing; a 4-page CV never gets near it.
    return text.encode()[:MAX_TEXT_BYTES].decode(errors="ignore")


MAX_PREVIEW_BYTES = 10 * 1024 * 1024


def read_preview(root: Path, name: str) -> bytes | None:
    """The sandbox's rendered DOCX PDF, or None when absent, oversized or not a PDF. The file is never trusted beyond its header."""
    path = root / name
    if name != "staging/preview.pdf" or path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_PREVIEW_BYTES:
        return None
    body = path.read_bytes()
    return body if body.startswith(b"%PDF-") else None


async def with_vision_text(parsed: ParsedInput, workspace: Path, gateway) -> ParsedInput:
    """Shared by upload and run-time parsing: turn the sandbox's page pictures into text."""
    if not getattr(parsed, "pages", None):  # test doubles return bare objects
        return parsed
    root = workspace.resolve(strict=True)
    paths = [root / name for name in parsed.pages]
    preview = read_preview(root, parsed.preview) if parsed.preview else None
    if parsed.preview:
        (root / parsed.preview).unlink(missing_ok=True)
    try:
        gateway = gateway()  # callable, so tests and plain flows never read gateway settings early
        if any(not PAGE_PATH.fullmatch(name) or not path.resolve().is_relative_to(root) for name, path in zip(parsed.pages, paths)):
            raise ServiceError("document_invalid")
        if not gateway.api_key:
            raise ServiceError("ocr_unavailable")  # no text-layer fallback exists
        text = await transcribe_pages(gateway, paths)
    finally:
        for path in paths:
            path.unlink(missing_ok=True)
    log.info("cv_text_source=ocr pages=%d", len(paths))
    return ParsedInput(text, parsed.kind, parsed.sha256, preview_pdf=preview)
