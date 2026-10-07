"""Owner-only immutable configuration revisions; credentials stay in Keychain."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from sqlalchemy import func, select

from job_search_platform.db.models import Project, ProviderConfiguration, ToolConnectorConfiguration
from job_search_platform.db.repositories import Repositories
from job_search_platform.integrations.hermes_runtime import ProviderConfig
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    ProviderSettingsView, ProviderConnectionTestView, ToolConnectorView, ToolConnectorSettingsView,
)
from job_search_platform.services.errors import ServiceError

@dataclass(frozen=True)
class ProviderSpec:
    id: str  # platform id stored in provider_configurations
    label: str
    hermes_id: str  # id handed to AIAgent(provider=...)
    default_base_url: str
    transport: str = "openai"  # "openai" or "anthropic" (Messages API) for probe/model listing
    models_path: str = "/models"
    probe_path: str | None = None  # defaults to models_path
    auth: str = "bearer"  # bearer | x-api-key | x-goog-api-key
    requires_base_url: bool = False
    local: bool = False
    key_optional: bool = False


_SPECS = (
    # "openai" is a legacy Hermes alias of openrouter; the real OpenAI API id is "openai-api".
    ProviderSpec("openai", "OpenAI", "openai-api", "https://api.openai.com/v1"),
    ProviderSpec("anthropic", "Anthropic", "anthropic", "https://api.anthropic.com", "anthropic",
                 "/v1/models?limit=1000", "/v1/models?limit=1", "x-api-key"),
    ProviderSpec("openrouter", "OpenRouter", "openrouter", "https://openrouter.ai/api/v1", probe_path="/key"),
    ProviderSpec("gemini", "Google AI Studio", "gemini", "https://generativelanguage.googleapis.com/v1beta",
                 auth="x-goog-api-key"),
    ProviderSpec("deepseek", "DeepSeek", "deepseek", "https://api.deepseek.com/v1"),
    ProviderSpec("xai", "xAI", "xai", "https://api.x.ai/v1"),
    ProviderSpec("zai", "Z.AI / GLM", "zai", "https://api.z.ai/api/paas/v4"),
    ProviderSpec("kimi-coding", "Kimi / Moonshot", "kimi-coding", "https://api.moonshot.ai/v1"),
    ProviderSpec("alibaba", "Qwen Cloud", "alibaba", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
    ProviderSpec("minimax", "MiniMax", "minimax", "https://api.minimax.io/anthropic", "anthropic",
                 "/v1/models?limit=1000", "/v1/models?limit=1", "x-api-key"),
    ProviderSpec("nvidia", "NVIDIA NIM", "nvidia", "https://integrate.api.nvidia.com/v1"),
    ProviderSpec("huggingface", "Hugging Face", "huggingface", "https://router.huggingface.co/v1"),
    ProviderSpec("ai-gateway", "Vercel AI Gateway", "ai-gateway", "https://ai-gateway.vercel.sh/v1"),
    ProviderSpec("lmstudio", "LM Studio", "lmstudio", "http://127.0.0.1:1234/v1", local=True, key_optional=True),
    ProviderSpec("custom", "Custom (OpenAI-compatible)", "custom", "", requires_base_url=True),
)
PROVIDERS = {spec.id: spec for spec in _SPECS}
_BY_HERMES_ID = {spec.hermes_id: spec for spec in _SPECS}
NO_KEY_PLACEHOLDER = "not-required"
MAX_MODELS_BYTES = 1024 * 1024
MAX_MODELS = 500
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def normalize_base_url(value: str) -> str:
    """Return a safe canonical base URL or raise invalid_base_url."""
    value = value.strip()
    try:
        parsed = urlsplit(value)
        host, _ = parsed.hostname, parsed.port
    except ValueError:
        raise ServiceError("invalid_base_url") from None
    if (not value or len(value) > 512 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value)
            or not host or "@" in parsed.netloc or "?" in value or "#" in value
            or not (parsed.scheme == "https" or (parsed.scheme == "http" and host.lower() in _LOOPBACK_HOSTS))):
        raise ServiceError("invalid_base_url", fields={"base_url": "invalid"})
    value = value.rstrip("/")
    for suffix in ("/chat/completions", "/completions"):
        if value.endswith(suffix):
            value = value[:-len(suffix)].rstrip("/")
            break
    return value


def effective_base_url(spec: ProviderSpec, override: str | None) -> str:
    if override and override.strip():
        return normalize_base_url(override)
    if spec.requires_base_url:
        raise ServiceError("invalid_base_url", fields={"base_url": "invalid"})
    return spec.default_base_url


def provider_catalog() -> list[dict]:
    return [{"id": s.id, "label": s.label, "default_base_url": s.default_base_url,
             "requires_base_url": s.requires_base_url, "local": s.local, "key_optional": s.key_optional}
            for s in _SPECS]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _get(url: str, headers: dict, max_bytes: int) -> tuple[int, bytes]:
    """The only outbound call: no redirects, no proxies, 8s timeout, bounded body."""
    opener = build_opener(NoRedirect(), ProxyHandler({}))
    with opener.open(Request(url, headers=headers, method="GET"), timeout=8) as response:
        return response.status, response.read(max_bytes + 1)


def _auth_headers(spec: ProviderSpec, key: str) -> dict:
    if spec.auth == "x-api-key":
        return {"x-api-key": key, "anthropic-version": "2023-06-01"}
    if spec.auth == "x-goog-api-key":
        return {"x-goog-api-key": key}
    return {"Authorization": "Bearer " + key}


def probe_provider(config: ProviderConfig) -> bool:
    spec = _BY_HERMES_ID[config.provider]
    status, _ = _get(config.base_url + (spec.probe_path or spec.models_path), _auth_headers(spec, config.api_key), 1024)
    return status == 200


def fetch_models(spec: ProviderSpec, base_url: str, key: str) -> list[dict]:
    status, body = _get(base_url + spec.models_path, _auth_headers(spec, key), MAX_MODELS_BYTES)
    if status != 200 or len(body) > MAX_MODELS_BYTES:
        raise ValueError
    payload = json.loads(body)
    items = payload.get("data") if isinstance(payload.get("data"), list) else payload.get("models")
    models = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        # OpenAI/Anthropic/OpenRouter use `id`; Gemini native uses `name` ("models/<id>").
        model_id = item.get("id") or item.get("name")
        if not isinstance(model_id, str) or not model_id.strip():
            continue
        model_id = model_id.removeprefix("models/")
        name = item.get("display_name") or item.get("displayName") or (item.get("name") if item.get("id") else None)
        models[model_id] = {"id": model_id, "name": name if isinstance(name, str) and name != model_id else None}
    return sorted(models.values(), key=lambda m: m["id"])[:MAX_MODELS]


class Settings:
    def __init__(self, sessions, secret_store, *, connection_tester=None):
        self.sessions, self.secrets = sessions, secret_store
        self.connection_tester = connection_tester or probe_provider

    @staticmethod
    def _current(db, project_id):
        return db.scalar(select(ProviderConfiguration).where(
            ProviderConfiguration.project_id == project_id).order_by(ProviderConfiguration.revision.desc()).limit(1))

    @staticmethod
    def _view(row):
        spec = PROVIDERS.get(row.provider)
        restored = row.secret_reference.startswith("restored-unconfigured:")
        return ProviderSettingsView(
            provider=row.provider, model=row.model, configured=not restored, revision=row.revision,
            masked_secret=None if restored else "••••••••", provider_label=spec.label if spec else None,
            base_url=row.base_url or (spec.default_base_url if spec else None) or None)

    async def get_provider(self, actor, project_id):
        def view():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
                row = self._current(db, project_id)
                return ProviderSettingsView(configured=False) if row is None else self._view(row)
        return await asyncio.to_thread(view)

    async def save_provider(self, actor, project_id, request):
        spec = PROVIDERS.get(request.provider)
        if spec is None:
            raise ServiceError("unsupported_provider")
        def authorize_first():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
        await asyncio.to_thread(authorize_first)
        base_url = effective_base_url(spec, request.base_url)
        stored_base_url = base_url if request.base_url and request.base_url.strip() else None
        key = request.credential.get_secret_value() if request.credential else None
        if key is None:
            if not spec.key_optional:
                raise ServiceError("credential_required")
            key = NO_KEY_PLACEHOLDER
        try:
            reference = await asyncio.to_thread(self.secrets.put, key)
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        def save():
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                    raise ServiceError("not_found")
                revision = db.scalar(select(func.coalesce(func.max(ProviderConfiguration.revision), 0)).where(
                    ProviderConfiguration.project_id == project_id)) + 1
                db.add(ProviderConfiguration(project_id=project_id, revision=revision, provider=request.provider,
                                            model=request.model, base_url=stored_base_url, secret_reference=reference))
            return ProviderSettingsView(provider=request.provider, model=request.model, configured=True,
                                        revision=revision, masked_secret="••••••••", provider_label=spec.label,
                                        base_url=base_url or None)
        try:
            return await asyncio.to_thread(save)
        except Exception as error:
            try:
                await asyncio.to_thread(self.secrets.delete, reference)
            except Exception:
                pass
            if isinstance(error, ServiceError):
                raise error
            raise ServiceError("settings_save_failed", retryable=True) from None

    async def trusted_provider(self, project_id, *, configuration_id=None):
        def read():
            with self.sessions() as db:
                row = self._current(db, project_id) if configuration_id is None else db.scalar(
                    select(ProviderConfiguration).where(ProviderConfiguration.project_id == project_id,
                                                         ProviderConfiguration.id == configuration_id))
                if row is None or row.secret_reference.startswith("restored-unconfigured:"):
                    raise ServiceError("provider_not_configured")
                if row.provider not in PROVIDERS:
                    raise ServiceError("unsupported_provider")
                return PROVIDERS[row.provider], row.model, row.base_url, row.secret_reference
        spec, model, base_url, reference = await asyncio.to_thread(read)
        try:
            key = await asyncio.to_thread(self.secrets.get, reference)
            if not isinstance(key, str) or not key:
                raise ValueError
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        return ProviderConfig(spec.hermes_id, model, base_url or spec.default_base_url, key)

    async def list_models(self, actor, project_id, request):
        spec = PROVIDERS.get(request.provider)
        if spec is None:
            raise ServiceError("unsupported_provider")
        def read():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
                row = self._current(db, project_id)
                return None if row is None else (row.provider, row.base_url, row.secret_reference)
        stored = await asyncio.to_thread(read)
        base_url = effective_base_url(spec, request.base_url)
        key = request.credential.get_secret_value() if request.credential else None
        if key is None:
            if stored and stored[0] == spec.id and not stored[2].startswith("restored-unconfigured:") \
                    and (stored[1] or spec.default_base_url) == base_url:
                try:
                    key = await asyncio.to_thread(self.secrets.get, stored[2])
                except Exception:
                    raise ServiceError("secret_store_unavailable") from None
            elif spec.key_optional:
                key = NO_KEY_PLACEHOLDER
            else:
                raise ServiceError("credential_required")
        try:
            return await asyncio.wait_for(asyncio.to_thread(fetch_models, spec, base_url, key), timeout=12)
        except Exception:
            raise ServiceError("provider_models_unavailable", retryable=True) from None

    async def test_provider(self, actor, project_id):
        await self.get_provider(actor, project_id)
        started = time.monotonic()
        status, message = "failed", "settings.connection_failed"
        try:
            config = await self.trusted_provider(project_id)
            passed = await asyncio.wait_for(asyncio.to_thread(self.connection_tester, config), timeout=12)
            if passed is True:
                status, message = "succeeded", "settings.connection_succeeded"
        except ServiceError as error:
            status, message = "unavailable", error.message_key
        except Exception:
            pass
        return ProviderConnectionTestView(status=status, message_key=message,
                                          checked_at=datetime.now(timezone.utc),
                                          duration_ms=min(30000, int((time.monotonic()-started)*1000)))

    async def get_tools(self, actor, project_id):
        def view():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
                row = db.scalar(select(ToolConnectorConfiguration).where(
                    ToolConnectorConfiguration.project_id == project_id,
                    ToolConnectorConfiguration.adapter_key == "career_ops").order_by(
                    ToolConnectorConfiguration.revision.desc()).limit(1))
                return ToolConnectorSettingsView(connectors=(ToolConnectorView(
                    adapter="career_ops", enabled=row.enabled if row else True,
                    revision=row.revision if row else 0,
                    updated_at=row.updated_at if row else datetime.now(timezone.utc)),))
        return await asyncio.to_thread(view)

    async def save_tool(self, actor, project_id, adapter, request):
        if adapter != "career_ops":
            raise ServiceError("unsupported_connector")
        def save():
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                    raise ServiceError("not_found")
                revision = db.scalar(select(func.coalesce(func.max(ToolConnectorConfiguration.revision), 0)).where(
                    ToolConnectorConfiguration.project_id == project_id,
                    ToolConnectorConfiguration.adapter_key == adapter)) + 1
                row = ToolConnectorConfiguration(project_id=project_id, adapter_key=adapter,
                                                 revision=revision, enabled=request.enabled)
                db.add(row)
                db.flush()
                view = ToolConnectorView(adapter=adapter, enabled=row.enabled,
                                         revision=row.revision, updated_at=row.updated_at)
            return view
        return await asyncio.to_thread(save)
