"""Owner-only immutable configuration revisions; credentials stay in Keychain."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import time
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

PROVIDERS = {
    "openai": ("https://api.openai.com/v1", "https://api.openai.com/v1/models"),
    "anthropic": ("https://api.anthropic.com", "https://api.anthropic.com/v1/models?limit=1"),
    "openrouter": ("https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/key"),
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe_provider(config: ProviderConfig) -> bool:
    headers = {"Authorization": "Bearer " + config.api_key}
    if config.provider == "anthropic":
        headers = {"x-api-key": config.api_key, "anthropic-version": "2023-06-01"}
    request = Request(PROVIDERS[config.provider][1], headers=headers, method="GET")
    opener = build_opener(NoRedirect(), ProxyHandler({}))
    with opener.open(request, timeout=10) as response:
        response.read(1024)
        return response.status == 200


class Settings:
    def __init__(self, sessions, secret_store, *, connection_tester=None):
        self.sessions, self.secrets = sessions, secret_store
        self.connection_tester = connection_tester or probe_provider

    @staticmethod
    def _current(db, project_id):
        return db.scalar(select(ProviderConfiguration).where(
            ProviderConfiguration.project_id == project_id).order_by(ProviderConfiguration.revision.desc()).limit(1))

    async def get_provider(self, actor, project_id):
        def view():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
                row = self._current(db, project_id)
                return ProviderSettingsView(configured=False) if row is None else ProviderSettingsView(
                    provider=row.provider, model=row.model, configured=True,
                    revision=row.revision, masked_secret="••••••••")
        return await asyncio.to_thread(view)

    async def save_provider(self, actor, project_id, request):
        if request.provider not in PROVIDERS:
            raise ServiceError("unsupported_provider")
        def authorize_first():
            with self.sessions() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                Repositories.project(db, project_id)
        await asyncio.to_thread(authorize_first)
        try:
            reference = await asyncio.to_thread(self.secrets.put, request.credential.get_secret_value())
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        def save():
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "manage", "provider_settings")
                if db.scalar(select(Project).where(Project.id == project_id).with_for_update()) is None:
                    raise ServiceError("not_found")
                revision = db.scalar(select(func.coalesce(func.max(ProviderConfiguration.revision), 0)).where(
                    ProviderConfiguration.project_id == project_id)) + 1
                db.add(ProviderConfiguration(project_id=project_id, revision=revision,
                                            provider=request.provider, model=request.model, secret_reference=reference))
            return ProviderSettingsView(provider=request.provider, model=request.model,
                                        configured=True, revision=revision, masked_secret="••••••••")
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
                if row is None:
                    raise ServiceError("provider_not_configured")
                if row.provider not in PROVIDERS:
                    raise ServiceError("unsupported_provider")
                return row.provider, row.model, row.secret_reference
        provider, model, reference = await asyncio.to_thread(read)
        try:
            key = await asyncio.to_thread(self.secrets.get, reference)
            if not isinstance(key, str) or not key:
                raise ValueError
        except Exception:
            raise ServiceError("secret_store_unavailable") from None
        return ProviderConfig(provider, model, PROVIDERS[provider][0], key)

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
