"""Telegram Bot API client (TOR FR-J05): fixed host, no proxy or redirects, bounded body, token never logged.

The token is the private-dir file ``telegram-bot-token``; without it the feature is off."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

from job_search_platform.integrations.gateway import default_private_dir, read_private_file

API = "https://api.telegram.org"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
DEADLINE_SECONDS = 15
MAX_BODY = 1_000_000

# httpx logs every request URL at INFO and the URL carries the bot token.
for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)


class TelegramError(Exception):
    """``kind`` is ``blocked`` (user blocked the bot or chat is gone: unlink) or ``transient`` (retry later)."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


def load_token(private_dir: Path | None = None) -> str | None:
    return read_private_file(private_dir or default_private_dir(), "telegram-bot-token")


class TelegramClient:
    def __init__(self, token: str, *, transport: httpx.BaseTransport | None = None):
        self._token = token
        self._transport = transport
        self._username: str | None = None

    def __repr__(self) -> str:
        return "TelegramClient()"

    def _call(self, method: str, payload: dict) -> object:
        started = time.monotonic()
        try:
            with httpx.Client(transport=self._transport, trust_env=False, follow_redirects=False, timeout=TIMEOUT) as client:
                with client.stream("POST", f"{API}/bot{self._token}/{method}", json=payload) as response:
                    body = b""
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BODY or time.monotonic() - started > DEADLINE_SECONDS:
                            raise TelegramError("transient")
            data = json.loads(body)
        except TelegramError:
            raise
        except (httpx.HTTPError, ValueError):  # the message of an httpx error may carry the URL, so drop it
            raise TelegramError("transient") from None
        if not isinstance(data, dict):
            raise TelegramError("transient")
        if response.status_code == 200 and data.get("ok") is True:
            return data.get("result")
        description = str(data.get("description", "")).lower()
        if response.status_code == 403 or (response.status_code == 400 and "chat not found" in description):
            raise TelegramError("blocked")
        raise TelegramError("transient")

    def bot_username(self) -> str:
        if self._username is None:
            result = self._call("getMe", {})
            username = result.get("username") if isinstance(result, dict) else None
            if not isinstance(username, str) or not username:
                raise TelegramError("transient")
            self._username = username
        return self._username

    def get_updates(self, offset: int | None) -> list[dict]:
        payload: dict = {"timeout": 0, "allowed_updates": ["message"]}
        if offset is not None:
            payload["offset"] = offset
        result = self._call("getUpdates", payload)
        return [item for item in result if isinstance(item, dict)] if isinstance(result, list) else []

    def send_message(self, chat_id: int, text: str) -> None:
        self._call("sendMessage", {"chat_id": chat_id, "text": text, "link_preview_options": {"is_disabled": True}})
