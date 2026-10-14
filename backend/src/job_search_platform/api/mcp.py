"""Project-scoped MCP tools over the official Streamable HTTP transport."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

from mcp.server.caching import CacheHint
from mcp.server.extension import Extension, MethodBinding
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError
from mcp.types import CallToolResult, TextContent
from mcp_types import RequestParams
from pydantic import ValidationError
from sqlalchemy import func, select
from starlette.applications import Starlette
from starlette.responses import JSONResponse

from job_search_platform.api.mcp_tasks import TASKS_EXTENSION, client_declares_tasks, created_task, task_view
from job_search_platform.db.models import Run, RunEvent
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import Actor, Operation, RunView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolRuns
from job_search_platform.services.skills import SKILL_BY_ID, SKILLS, Skill

_DEFAULT_HOSTS = ["127.0.0.1", "localhost"]
_MAX_RESOURCE_BYTES = 200_000
_SAFE_SERVICE_ERRORS = {
    "forbidden",
    "idempotency_conflict",
    "not_found",
    "unauthorized",
    "gateway_unconfigured",
    "cv_required",
    "cv_unavailable",
    "connector_disabled",
    "job_removed",
    "queue_full",
    "submission_rate_limited",
    "document_busy",
    "apply_pack_required",
    "already_applied",
    "application_not_applied",
}


def _error(exc: ServiceError) -> MCPError:
    code = exc.code if exc.code in _SAFE_SERVICE_ERRORS else "request_rejected"
    return MCPError(-32001, code)


def _run_result(run: RunView) -> dict[str, Any]:
    result: dict[str, Any] = {
        "run_id": str(run.id),
        "status": run.status,
        "operation": run.operation,
        "created_at": run.created_at.isoformat(),
    }
    if run.evaluation_result is not None:
        result["evaluation_resource"] = f"job-search://runs/{run.id}/evaluation"
    return result


def _token_from_headers(headers: Any) -> str:
    authorization_header = next(
        (value for key, value in (headers or {}).items() if key.lower() == "authorization"),
        "",
    )
    scheme, separator, token = authorization_header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token or token.strip() != token:
        raise MCPError(-32001, "unauthorized")
    return token


class _BearerAuthenticationMiddleware:
    """Authenticate every HTTP operation without binding identity to MCP sessions."""

    def __init__(self, app: Any, grants: Any, resource: str | None = None, resource_metadata_url: str | None = None) -> None:
        self.app = app
        self.grants = grants
        self.resource = resource
        self.resource_metadata_url = resource_metadata_url

    def _unauthorized(self, token_sent: bool) -> JSONResponse:
        headers = {"Cache-Control": "no-store"}
        if self.resource_metadata_url:
            value = f'Bearer resource_metadata="{self.resource_metadata_url}"'
            headers["WWW-Authenticate"] = value + (', error="invalid_token"' if token_sent else "")
        else:
            headers["WWW-Authenticate"] = "Bearer"
        return JSONResponse({"error": "unauthorized"}, status_code=401, headers=headers)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        authorization_values = [
            value.decode("latin-1")
            for key, value in scope.get("headers", ())
            if key.decode("latin-1").lower() == "authorization"
        ]
        authorization_header = authorization_values[0] if len(authorization_values) == 1 else ""
        scheme, separator, token = authorization_header.partition(" ")
        if not separator or scheme.lower() != "bearer" or not token or token.strip() != token:
            response = self._unauthorized(False)
            await response(scope, receive, send)
            return
        try:
            actor = await self.grants.authenticate(token, resource=self.resource)
        except ServiceError:
            response = self._unauthorized(True)
            await response(scope, receive, send)
            return
        except Exception:
            response = JSONResponse({"error": "request_rejected"}, status_code=503, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)
            return
        if actor.kind != "grant" or actor.project_id is None:
            response = self._unauthorized(True)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


async def _authenticate_headers(headers: Any, grants: Any, resource: str | None = None) -> Actor:
    try:
        actor = await grants.authenticate(_token_from_headers(headers), resource=resource)
    except ServiceError as exc:
        raise _error(exc) from None
    except Exception:
        raise MCPError(-32000, "request_failed") from None
    if actor.kind != "grant" or actor.project_id is None:
        raise MCPError(-32001, "unauthorized")
    return actor


async def _authenticate(ctx: Context[Any, Any], grants: Any, resource: str | None = None) -> Actor:
    return await _authenticate_headers(ctx.headers, grants, resource)


_TASK_SKILLS = frozenset(skill.id for skill in SKILLS if skill.kind == "task")
_TERMINAL_RUN_STATUSES = frozenset({"completed", "failed", "cancelled", "interrupted"})
_LIST_HINT = CacheHint(ttl_ms=3_600_000, scope="public")
_CACHE_HINTS = {"tools/list": _LIST_HINT, "prompts/list": _LIST_HINT, "resources/templates/list": _LIST_HINT}


def _owner_origin(services: Any) -> str:
    return getattr(getattr(services, "owner_sessions", None), "public_origin", None) or "http://127.0.0.1:8000"


async def _run_result_with_artifacts(services: Any, actor: Actor, run_id: UUID) -> tuple[RunView, dict[str, Any]]:
    """The get_run payload: run status plus published document resources from this run."""
    run = await services.runs.get(actor, actor.project_id, run_id)
    result = _run_result(run)
    documents = await services.documents.list_ready(actor, actor.project_id)
    resources = [f"job-search://documents/{document.id}" for document in documents if document.source_run_id == run.id]
    if resources:
        result["artifact_resources"] = resources
    return run, result


_TASK_NOT_FOUND = "Failed to retrieve task: Task not found"
_TASK_VERSIONS = frozenset({"2026-07-28"})


class _TaskParams(RequestParams):
    task_id: str


class _TaskUpdateParams(_TaskParams):
    input_responses: dict[str, Any] = {}


class _TasksExtension(Extension):
    """io.modelcontextprotocol/tasks over durable runs. Owner decisions stay in the owner app (ADR-001, FR-A05)."""

    identifier = TASKS_EXTENSION

    def __init__(self, services: Any, resource: str | None, intake: ProtocolRuns) -> None:
        self.services, self.resource, self.intake = services, resource, intake

    async def _actor(self, ctx: Any) -> Actor:
        return await _authenticate_headers(getattr(ctx.request, "headers", None), self.services.grants, self.resource)

    @staticmethod
    def _require_capability(ctx: Any) -> None:
        if not client_declares_tasks(ctx.session.client_capabilities):
            raise MCPError(-32021, "Missing required client capability",
                           {"requiredCapabilities": {"extensions": {TASKS_EXTENSION: {}}}})

    def _last_updated(self, run: RunView) -> datetime:
        if run.finished_at is not None:
            return run.finished_at
        with self.services.sessions() as db:
            newest = db.scalar(select(func.max(RunEvent.created_at)).where(
                RunEvent.project_id == run.project_id, RunEvent.run_id == run.id))
        return newest or run.created_at

    async def _view(self, actor: Actor, task_id: str) -> dict[str, Any]:
        try:
            run, result = await _run_result_with_artifacts(self.services, actor, UUID(task_id))
        except ValueError:
            raise MCPError(-32602, _TASK_NOT_FOUND) from None
        except ServiceError as exc:
            if exc.code == "not_found":
                raise MCPError(-32602, _TASK_NOT_FOUND) from None
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        last = await asyncio.to_thread(self._last_updated, run)
        return task_view(run, last, _owner_origin(self.services), result=result)

    async def intercept_tool_call(self, params: Any, ctx: Any, call_next: Any) -> Any:
        if params.name not in _TASK_SKILLS or not client_declares_tasks(ctx.session.client_capabilities):
            return await call_next(ctx)
        actor = await self._actor(ctx)
        if "results:read" not in actor.capabilities:
            return await call_next(ctx)  # it could never read the task back
        skill = SKILL_BY_ID[params.name]
        try:
            request = skill.input_model.model_validate((params.arguments or {})["request"])
            run = await self.intake.submit(actor, skill.id, request)
        except ServiceError as exc:
            raise _error(exc) from None
        except (KeyError, ValidationError):
            raise MCPError(-32602, "invalid_parameters") from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return {"resultType": "task", **created_task(task_view(run, run.created_at, _owner_origin(self.services)))}

    def methods(self) -> tuple[MethodBinding, ...]:
        return (
            MethodBinding("tasks/get", _TaskParams, self._get, protocol_versions=_TASK_VERSIONS),
            MethodBinding("tasks/update", _TaskUpdateParams, self._update, protocol_versions=_TASK_VERSIONS),
            MethodBinding("tasks/cancel", _TaskParams, self._cancel, protocol_versions=_TASK_VERSIONS),
        )

    async def _get(self, ctx: Any, params: _TaskParams) -> dict[str, Any]:
        self._require_capability(ctx)
        return {"resultType": "complete", **await self._view(await self._actor(ctx), params.task_id)}

    async def _update(self, ctx: Any, params: _TaskUpdateParams) -> dict[str, Any]:
        # Owner questions and approvals are answered in the owner app, never by the agent.
        self._require_capability(ctx)
        await self._view(await self._actor(ctx), params.task_id)
        return {"resultType": "complete"}

    async def _cancel(self, ctx: Any, params: _TaskParams) -> dict[str, Any]:
        self._require_capability(ctx)
        actor = await self._actor(ctx)
        await self._view(actor, params.task_id)
        try:
            await self.services.runs.cancel(actor, actor.project_id, UUID(params.task_id))
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return {"resultType": "complete"}

def create_mcp_server(services: Any, resource: str | None = None) -> MCPServer:
    """Build one stateless official MCP server bound to shared backend services."""
    intake = ProtocolRuns(services.sessions)
    server = MCPServer(
        name="Job Search Platform",
        version="0.1.0",
        instructions="Use project-granted tools to evaluate job postings and draft application documents.",
        extensions=[_TasksExtension(services, resource, intake)],
        cache_hints=_CACHE_HINTS,
    )

    async def sanitize_invalid_tool_arguments(ctx: Any, call_next: Any) -> Any:
        if ctx.method == "tools/call":
            params = ctx.params or {}
            name = params.get("name")
            arguments = params.get("arguments") or {}
            invalid = False
            try:
                skill = SKILL_BY_ID.get(name)
                if skill is not None:
                    invalid = set(arguments) != {"request"}
                    if not invalid:
                        skill.input_model.model_validate(arguments["request"])
                elif name in {"get_run", "cancel_run"}:
                    invalid = set(arguments) != {"run_id"}
                    if not invalid:
                        UUID(str(arguments["run_id"]))
                elif name == "list_results":
                    invalid = bool(arguments)
            except (ValidationError, TypeError, ValueError):
                invalid = True
            if invalid:
                return CallToolResult(
                    content=[TextContent(text="invalid_parameters")],
                    is_error=True,
                )
        return await call_next(ctx)

    # This official SDK middleware runs before tools/call parameter validation,
    # so pydantic's otherwise detailed error text never reaches the model.
    server.middleware.append(sanitize_invalid_tool_arguments)

    def require_arguments(ctx: Context[Any, Any], expected: set[str]) -> None:
        params = ctx.request_context.params or {}
        arguments = params.get("arguments") or {}
        if set(arguments) != expected:
            raise MCPError(-32602, "invalid_parameters")

    async def submit(
        operation: Operation,
        request: Any,
        ctx: Context[Any, Any],
    ) -> dict[str, Any]:
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            run = await intake.submit(actor, operation, request)
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return _run_result(run)

    def skill_tool(skill: Skill):
        async def tool(request, ctx: Context[Any, Any]) -> dict[str, Any]:
            require_arguments(ctx, {"request"})
            if skill.kind == "direct":
                actor = await _authenticate(ctx, services.grants, resource)
                try:
                    return await skill.handler(services, actor, request)
                except ServiceError as exc:
                    raise _error(exc) from None
                except Exception:
                    raise MCPError(-32000, "request_failed") from None
            return await submit(skill.id, request, ctx)
        # The SDK derives the input schema from the signature, so bind the declared model.
        tool.__annotations__["request"] = skill.input_model
        tool.__name__ = tool.__qualname__ = skill.id
        return tool

    for skill in SKILLS:
        server.add_tool(skill_tool(skill), name=skill.id, description=skill.description, structured_output=True)

    @server.tool(
        name="get_run",
        description="Read the authorized status and generated result references for a run.",
        structured_output=True,
    )
    async def get_run(run_id: UUID, ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, {"run_id"})
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            return (await _run_result_with_artifacts(services, actor, run_id))[1]
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None

    @server.tool(
        name="cancel_run",
        description="Request cancellation of a run created by this still-valid grant; running work may remain pending.",
        structured_output=True,
    )
    async def cancel_run(run_id: UUID, ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, {"run_id"})
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            run = await services.runs.cancel(actor, actor.project_id, run_id)
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        result = _run_result(run)
        result["cancellation_pending"] = run.status in {"running", "waiting_approval"}
        return result

    @server.tool(
        name="list_results",
        description="List published generated documents and completed evaluation reports for this Project.",
        structured_output=True,
    )
    async def list_results(ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, set())
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            documents = await services.documents.list_ready(actor, actor.project_id)
            with services.sessions.begin() as db:
                authorize(db, actor, actor.project_id, "results:read", "run")
                runs = tuple(db.scalars(
                    select(Run)
                    .where(
                        Run.project_id == actor.project_id,
                        Run.status == "completed",
                        Run.evaluation_result.is_not(None),
                    )
                    .order_by(Run.created_at.desc(), Run.id)
                ).all())
            return {
                "documents": [
                    {
                        "document_id": str(document.id),
                        "title": document.title,
                        "resource": f"job-search://documents/{document.id}",
                    }
                    for document in documents
                ],
                "evaluations": [
                    {
                        "run_id": str(run.id),
                        "resource": f"job-search://runs/{run.id}/evaluation",
                    }
                    for run in runs
                ],
            }
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None

    @server.resource(
        "job-search://runs/{run_id}/evaluation",
        name="evaluation_report",
        description="A generated evaluation report. Requires results:read on the owning Project.",
        mime_type="text/markdown",
    )
    async def evaluation_resource(run_id: str, ctx: Context[Any, Any]) -> str:
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            run = await services.runs.get(actor, actor.project_id, UUID(run_id))
        except (ServiceError, ValueError) as exc:
            if isinstance(exc, ServiceError):
                raise _error(exc) from None
            raise MCPError(-32001, "not_found") from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        if run.evaluation_result is None or run.status != "completed":
            raise MCPError(-32001, "not_found")
        report = run.evaluation_result.report_markdown
        if len(report.encode("utf-8")) > _MAX_RESOURCE_BYTES:
            raise MCPError(-32001, "resource_too_large")
        return report

    @server.resource(
        "job-search://documents/{document_id}",
        name="generated_document",
        description="A published generated document. Requires results:read on the owning Project.",
        mime_type="text/markdown",
    )
    async def document_resource(document_id: str, ctx: Context[Any, Any]) -> str:
        actor = await _authenticate(ctx, services.grants, resource)
        try:
            document = await services.documents.get(actor, actor.project_id, UUID(document_id))
        except (ServiceError, ValueError) as exc:
            if isinstance(exc, ServiceError):
                raise _error(exc) from None
            raise MCPError(-32001, "not_found") from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        content = document.content_markdown
        if not content or len(content.encode("utf-8")) > _MAX_RESOURCE_BYTES:
            raise MCPError(-32001, "not_found" if not content else "resource_too_large")
        return content

    return server


def create_mcp_app(
    services: Any,
    *,
    allowed_hosts: list[str] | None = None,
    allowed_origins: list[str] | None = None,
    resource: str | None = None,
    resource_metadata_url: str | None = None,
) -> Starlette:
    """Return the official MCP Streamable HTTP ASGI app, mounted by the shared listener."""
    hosts = list(_DEFAULT_HOSTS if allowed_hosts is None else allowed_hosts)
    origins = list(() if allowed_origins is None else allowed_origins)
    if any(not value or "*" in value for value in [*hosts, *origins]):
        raise ValueError("mcp_transport_allowlist_must_be_exact")
    server = create_mcp_server(services, resource)
    app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        host="127.0.0.1",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=hosts,
            allowed_origins=origins,
        ),
    )
    app.add_middleware(_BearerAuthenticationMiddleware, grants=services.grants, resource=resource,
                       resource_metadata_url=resource_metadata_url)
    return app


@asynccontextmanager
async def mcp_lifespan_context(app: Starlette):
    """Enter the official SDK app lifespan from the root shared-listener lifespan."""
    async with app.router.lifespan_context(app):
        yield
