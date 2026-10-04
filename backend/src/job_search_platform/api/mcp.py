"""Project-scoped MCP tools over the official Streamable HTTP transport."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Literal
from uuid import UUID

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError
from mcp.types import CallToolResult, TextContent
from pydantic import ValidationError
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.responses import JSONResponse

from job_search_platform.db.models import Run
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import Actor, RunView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns

_DEFAULT_HOSTS = ["127.0.0.1", "localhost"]
_MAX_RESOURCE_BYTES = 200_000
_SAFE_SERVICE_ERRORS = {
    "forbidden",
    "idempotency_conflict",
    "not_found",
    "unauthorized",
    "provider_configuration_required",
    "cv_required",
    "cv_unavailable",
    "connector_disabled",
    "queue_full",
    "submission_rate_limited",
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


def _token_from_context(ctx: Context[Any, Any]) -> str:
    authorization_header = next(
        (value for key, value in ctx.headers.items() if key.lower() == "authorization"),
        "",
    )
    scheme, separator, token = authorization_header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token or token.strip() != token:
        raise MCPError(-32001, "unauthorized")
    return token


class _BearerAuthenticationMiddleware:
    """Authenticate every HTTP operation without binding identity to MCP sessions."""

    def __init__(self, app: Any, grants: Any) -> None:
        self.app = app
        self.grants = grants

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
            response = JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)
            return
        try:
            actor = await self.grants.authenticate(token)
        except ServiceError:
            response = JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)
            return
        except Exception:
            response = JSONResponse({"error": "request_rejected"}, status_code=503, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)
            return
        if actor.kind != "grant" or actor.project_id is None:
            response = JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


async def _authenticate(ctx: Context[Any, Any], grants: Any) -> Actor:
    try:
        actor = await grants.authenticate(_token_from_context(ctx))
    except ServiceError as exc:
        raise _error(exc) from None
    except Exception:
        raise MCPError(-32000, "request_failed") from None
    if actor.kind != "grant" or actor.project_id is None:
        raise MCPError(-32001, "unauthorized")
    return actor


def create_mcp_server(services: Any) -> MCPServer:
    """Build one stateless official MCP server bound to shared backend services."""
    server = MCPServer(
        name="Job Search Platform",
        version="0.1.0",
        instructions="Use project-granted tools to evaluate job postings and draft application documents.",
    )
    intake = ProtocolRuns(services.sessions)

    async def sanitize_invalid_tool_arguments(ctx: Any, call_next: Any) -> Any:
        if ctx.method == "tools/call":
            params = ctx.params or {}
            name = params.get("name")
            arguments = params.get("arguments") or {}
            invalid = False
            try:
                if name in {"evaluate_job", "draft_documents"}:
                    invalid = set(arguments) != {"request"}
                    if not invalid:
                        ProtocolJobInput.model_validate(arguments["request"])
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
        operation: Literal["evaluate_job", "draft_documents"],
        request: ProtocolJobInput,
        ctx: Context[Any, Any],
    ) -> dict[str, Any]:
        actor = await _authenticate(ctx, services.grants)
        try:
            run = await intake.submit(actor, operation, request)
        except ServiceError as exc:
            raise _error(exc) from None
        except Exception:
            raise MCPError(-32000, "request_failed") from None
        return _run_result(run)

    @server.tool(
        name="evaluate_job",
        description="Evaluate one supplied job posting or same-Project job revision against the current CV.",
        structured_output=True,
    )
    async def evaluate_job(request: ProtocolJobInput, ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, {"request"})
        return await submit("evaluate_job", request, ctx)

    @server.tool(
        name="draft_documents",
        description="Draft application documents for one supplied job posting or same-Project job revision.",
        structured_output=True,
    )
    async def draft_documents(request: ProtocolJobInput, ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, {"request"})
        return await submit("draft_documents", request, ctx)

    @server.tool(
        name="get_run",
        description="Read the authorized status and generated result references for a run.",
        structured_output=True,
    )
    async def get_run(run_id: UUID, ctx: Context[Any, Any]) -> dict[str, Any]:
        require_arguments(ctx, {"run_id"})
        actor = await _authenticate(ctx, services.grants)
        try:
            run = await services.runs.get(actor, actor.project_id, run_id)
            result = _run_result(run)
            documents = await services.documents.list_ready(actor, actor.project_id)
            resources = [
                f"job-search://documents/{document.id}"
                for document in documents
                if document.source_run_id == run.id
            ]
            if resources:
                result["artifact_resources"] = resources
            return result
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
        actor = await _authenticate(ctx, services.grants)
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
        actor = await _authenticate(ctx, services.grants)
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
        actor = await _authenticate(ctx, services.grants)
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
        actor = await _authenticate(ctx, services.grants)
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
) -> Starlette:
    """Return the official MCP Streamable HTTP ASGI app, mounted by the shared listener."""
    hosts = list(_DEFAULT_HOSTS if allowed_hosts is None else allowed_hosts)
    origins = list(() if allowed_origins is None else allowed_origins)
    if any(not value or "*" in value for value in [*hosts, *origins]):
        raise ValueError("mcp_transport_allowlist_must_be_exact")
    server = create_mcp_server(services)
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
    app.add_middleware(_BearerAuthenticationMiddleware, grants=services.grants)
    return app


@asynccontextmanager
async def mcp_lifespan_context(app: Starlette):
    """Enter the official SDK app lifespan from the root shared-listener lifespan."""
    async with app.router.lifespan_context(app):
        yield
