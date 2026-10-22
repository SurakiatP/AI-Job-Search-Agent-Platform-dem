"""Owner-only tool connector settings. LLM access is the LiteLLM gateway (integrations/gateway.py)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import func, select

from job_search_platform.db.models import Project, ToolConnectorConfiguration
from job_search_platform.db.repositories import Repositories
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import ToolConnectorView, ToolConnectorSettingsView
from job_search_platform.services.errors import ServiceError


class Settings:
    def __init__(self, sessions):
        self.sessions = sessions

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
