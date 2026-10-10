"""LiteLLM gateway: the only LLM endpoint the app talks to. The app key never leaves this object."""
from __future__ import annotations

import asyncio
import json
import os
import stat
from dataclasses import dataclass, field
from pathlib import Path
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from job_search_platform.integrations.hermes_runtime import ProviderConfig
from job_search_platform.integrations.jev import JevClient
from job_search_platform.services.contracts import GatewayStatusView
from job_search_platform.services.errors import ServiceError

DEFAULT_BASE_URL = "http://127.0.0.1:4000"
STATUS_TIMEOUT_SECONDS = 3
MAX_MODELS_BYTES = 1_000_000


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = build_opener(_NoRedirect(), ProxyHandler({}))


def default_private_dir() -> Path:
    return Path(os.environ.get("CORE02_PRIVATE_DIR", str(Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003")))


def _key_file(private_dir: Path) -> str | None:
    path = private_dir / "litellm_app_key"
    try:
        if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
            return None
        return path.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


@dataclass(frozen=True)
class GatewaySettings:
    base_url: str
    api_key: str | None = field(repr=False)
    analyze_model: str
    decision_model: str
    opener: object = field(default=_OPENER, repr=False, compare=False)

    @classmethod
    def from_env(cls, private_dir: Path | None = None) -> "GatewaySettings":
        env = os.environ
        key = (env.get("LITELLM_API_KEY") or "").strip() or _key_file(private_dir or default_private_dir())
        return cls((env.get("LITELLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"), key,
                   env.get("AI_ANALYZE_MODEL") or "ai-analyze",
                   env.get("AI_DECISION_MODEL") or "typesafe/jev-1.13")

    def _key(self) -> str:
        if not self.api_key:
            raise ServiceError("gateway_unconfigured")
        return self.api_key

    def provider_config(self) -> ProviderConfig:
        return ProviderConfig("custom", self.analyze_model, self.base_url + "/v1", self._key())

    def jev_client(self) -> JevClient:
        return JevClient(self._key(), url=self.base_url + "/jev/decisions", model=self.decision_model)

    def snapshot(self) -> dict:
        return {"gateway": {"analyze_model": self.analyze_model, "decision_model": self.decision_model}}

    def _models(self) -> list[str]:
        request = Request(self.base_url + "/v1/models", headers={"Authorization": f"Bearer {self.api_key}"}, method="GET")
        with self.opener.open(request, timeout=STATUS_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise ValueError
            data = json.loads(response.read(MAX_MODELS_BYTES))["data"]
        return sorted({item["id"] for item in data if isinstance(item, dict) and isinstance(item.get("id"), str)})

    async def status(self) -> GatewayStatusView:
        configured = bool(self.api_key)
        models, reachable = [], False
        if configured:
            try:
                models, reachable = await asyncio.to_thread(self._models), True
            except Exception:
                pass
        return GatewayStatusView(configured=configured, reachable=reachable,
                                 base_url=self.base_url if configured else None,
                                 analyze_model=self.analyze_model, decision_model=self.decision_model, models=models)
