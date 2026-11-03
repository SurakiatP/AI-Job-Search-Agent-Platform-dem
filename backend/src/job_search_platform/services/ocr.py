"""Vision fallback for CVs without a usable text layer.

The sandbox renders PDF pages to JPEG files (infra/hermes/parse_document.py); only here, on the host, are the
pictures sent as data URIs to a multimodal model through LiteLLM. The host never parses the untrusted PDF itself.
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
PAGE_PATH = re.compile(r"staging/ocr-[1-4]\.jpg")
MAX_TEXT_BYTES = 1024 * 1024
MAX_PAGE_BYTES = 4 * 1024 * 1024
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
PAGE_TIMEOUT_SECONDS = 90
PROMPT = ("Transcribe all visible text in this document page exactly as written. Keep the reading order and every "
          "Thai tone mark and vowel sign. Do not summarise, translate, correct or add anything. "
          "Output plain text or Markdown only, with no commentary.")


def _call(gateway: GatewaySettings, image: bytes) -> str:
    config = gateway.provider_config("document_ocr")
    uri = "data:image/jpeg;base64," + base64.b64encode(image).decode()
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
    return content.strip()


async def transcribe_pages(gateway: GatewaySettings, image_paths: list[Path]) -> str:
    """One request per page, run in order; page texts are joined by a blank line. Deletes the image files."""
    gateway._key()  # gateway_unconfigured stays its own error
    parts: list[str] = []
    try:
        for path in image_paths:
            if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_PAGE_BYTES:
                raise ServiceError("ocr_unavailable", retryable=True)
            try:
                parts.append(await asyncio.to_thread(_call, gateway, path.read_bytes()))
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


async def with_vision_text(parsed: ParsedInput, workspace: Path, gateway) -> ParsedInput:
    """Shared by upload and run-time parsing: turn a needs_vision parse result into a normal one."""
    if not getattr(parsed, "needs_vision", None):  # test doubles return bare objects
        return parsed
    root = workspace.resolve(strict=True)
    gateway = gateway()  # callable, so plain text parses never read gateway settings
    if not gateway.api_key:
        # No vision model available: behave as before OCR existed.
        for name in parsed.pages:
            (root / name).unlink(missing_ok=True)
        raise ServiceError("scanned_pdf_unsupported")
    paths = [root / name for name in parsed.pages]
    if any(not PAGE_PATH.fullmatch(name) or not (root / name).resolve().is_relative_to(root) for name in parsed.pages):
        raise ServiceError("document_invalid")
    text = await transcribe_pages(gateway, paths)
    log.info("cv_text_source=ocr reason=%s pages=%d", parsed.needs_vision, len(paths))
    return ParsedInput(text, parsed.kind, parsed.sha256)
