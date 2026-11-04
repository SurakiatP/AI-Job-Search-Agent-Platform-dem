"""LiteLLM gateway: the only LLM endpoint the app talks to. The app key never leaves this object."""
from __future__ import annotations

import asyncio
import json
import os
import re
import stat
from dataclasses import dataclass, field, replace
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from job_search_platform.config import secret_file_forbidden_bits
from job_search_platform.integrations.hermes_runtime import EFFORTS, ProviderConfig, reasoning_effort
from job_search_platform.integrations.jev import JevClient
from job_search_platform.services.contracts import GatewayStatusView
from job_search_platform.services.errors import ServiceError

DEFAULT_BASE_URL = "http://127.0.0.1:54000"
STATUS_TIMEOUT_SECONDS = 3
MAX_MODELS_BYTES = 1_000_000


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = build_opener(_NoRedirect(), ProxyHandler({}))


def default_private_dir() -> Path:
    return Path(os.environ.get("CORE02_PRIVATE_DIR") or Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003")


def _without_userinfo(url: str) -> str:
    parts = urlsplit(url)
    return parts._replace(netloc=parts.netloc.rpartition("@")[2]).geturl()


def read_private_file(private_dir: Path, name: str) -> str | None:
    """Stripped contents of an owner-only regular file in the private dir, else None."""
    path = private_dir / name
    try:
        if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & secret_file_forbidden_bits():
            return None
        return path.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None

LEGACY_ALIAS = "ai-analyze"  # the old gateway alias; LiteLLM still knows it, but the app shows and records real model names


def default_model_id(env=os.environ) -> str:
    """The model behind every task without its own AI_MODEL_<TASK>: AI_ANALYZE_MODEL, else the upstream model of
    AI_ANALYZE_UPSTREAM_MODEL (its LiteLLM name, without openrouter/), else openai/gpt-6-luna. Matches infra/litellm/seed.py."""
    explicit = (env.get("AI_ANALYZE_MODEL") or "").strip()
    if explicit and explicit != LEGACY_ALIAS:
        return explicit
    return (env.get("AI_ANALYZE_UPSTREAM_MODEL") or "").strip().removeprefix("openrouter/") or "openai/gpt-6-luna"


def real_model(name: str, env=os.environ) -> str:
    """Old runs and settings may still say ai-analyze; show the model it stands for."""
    return default_model_id(env) if name == LEGACY_ALIAS else name



@dataclass(frozen=True)
class GatewaySettings:
    base_url: str
    api_key: str | None = field(repr=False)
    analyze_model: str
    decision_model: str
    opener: object = field(default=_OPENER, repr=False, compare=False)
    # {operation: (model, effort)} from the admin console; wins over AI_MODEL_<OP> / AI_REASONING_<OP>.
    tasks: dict = field(default_factory=dict, repr=False, compare=False)

    @classmethod
    def from_env(cls, private_dir: Path | None = None) -> "GatewaySettings":
        env = os.environ
        key = (env.get("LITELLM_API_KEY") or "").strip() or read_private_file(private_dir or default_private_dir(), "litellm_app_key")
        return cls((env.get("LITELLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"), key,
                   default_model_id(env),
                   env.get("AI_DECISION_MODEL") or "typesafe/jev-1.13")

    def _key(self) -> str:
        if not self.api_key:
            raise ServiceError("gateway_unconfigured")
        return self.api_key

    def with_tasks(self, tasks: dict) -> "GatewaySettings":
        return replace(self, tasks=dict(tasks or {}))

    def provider_config(self, operation: str | None = None) -> ProviderConfig:
        """Per-task override (model, effort) first, then AI_MODEL_<OPERATION> / AI_REASONING_<OPERATION>
        (a LiteLLM model name), then the default analyze model."""
        op = operation or ""
        set_model, set_effort = self.tasks.get(op) or (None, None)
        model = str(set_model or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", model):
            model = os.environ.get("AI_MODEL_" + op.upper(), "").strip()
        if not re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", model):
            model = self.analyze_model
        effort = str(set_effort or "").strip().lower()
        if effort not in EFFORTS:
            effort = reasoning_effort(os.environ, op) if op else None
        return ProviderConfig("custom", model, self.base_url + "/v1", self._key(), effort)

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
        return sorted({item["id"] for item in data if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"] != LEGACY_ALIAS})  # the old alias is the default model under another name

    async def status(self) -> GatewayStatusView:
        configured = bool(self.api_key)
        models, reachable = [], False
        if configured:
            try:
                models, reachable = await asyncio.to_thread(self._models), True
            except Exception:
                pass
        return GatewayStatusView(configured=configured, reachable=reachable,
                                 base_url=_without_userinfo(self.base_url) if configured else None,
                                 analyze_model=self.analyze_model, decision_model=self.decision_model, models=models)
