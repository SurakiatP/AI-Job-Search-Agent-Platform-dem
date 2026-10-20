"""Project-scoped A2A routes backed by the platform's durable Runs."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any, AsyncIterator, Sequence
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from a2a.server.context import ServerCallContext
from a2a.server.request_handlers.request_handler import RequestHandler
from a2a.server.routes import (
    DefaultServerCallContextBuilder,
    add_a2a_routes_to_fastapi,
    create_agent_card_routes,
    create_jsonrpc_routes,
    create_rest_routes,
)
from a2a.types import (
    Artifact,
    AgentCard,
    CancelTaskRequest,
    DeleteTaskPushNotificationConfigRequest,
    GetExtendedAgentCardRequest,
    GetTaskPushNotificationConfigRequest,
    GetTaskRequest,
    Message,
    Part,
    ListTaskPushNotificationConfigsRequest,
    ListTaskPushNotificationConfigsResponse,
    ListTasksRequest,
    ListTasksResponse,
    SendMessageRequest,
    SubscribeToTaskRequest,
    Task,
    TaskArtifactUpdateEvent,
    TaskPushNotificationConfig,
    TaskState,
    TaskStatusUpdateEvent,
)
from a2a.utils.errors import (
    A2AError,
    InvalidParamsError,
    TaskNotFoundError,
    UnsupportedOperationError,
)
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from google.protobuf.json_format import MessageToDict, ParseDict
from starlette.middleware.trustedhost import TrustedHostMiddleware

from job_search_platform.api.dependencies import Services
from job_search_platform.services.a2a_state import _STATES as _RUN_STATUSES, context_id, task_state
from job_search_platform.services.contracts import Actor, RunView
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.protocol_runs import ProtocolRuns
from job_search_platform.services.runs import run_view
from job_search_platform.services.skills import SKILL_BY_ID, SKILLS, Skill

_CARD_PATH = "/.well-known/agent-card.json"
_MAX_ARTIFACT_BYTES = 200_000
_TERMINAL = frozenset({"cancelled", "completed", "failed", "interrupted"})  # needs_input is resting, not terminal
_RESTING = frozenset({"waiting_approval", "needs_input"})  # a stream ends here; the client may subscribe again
_POLL_SECONDS = 0.5  # same cadence as the REST run event stream (api/sse.py)
# ponytail: a blocking SendMessage holds one request open at most this long, then returns the Task as it is
# (still working); the caller follows up with GetTask. Raise it if real runs take longer.
_BLOCK_SECONDS = 600
_TEXT_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")


def _usable(actor: Actor) -> list[Skill]:
    return [skill for skill in SKILLS if skill.capability in actor.capabilities]


def _guide(skills: Sequence[Skill], *, mismatch: bool = False) -> Message:
    """Plain instructions for LLM agents. Built only from our own skill list, never from the caller's text."""
    lines = [f"The request for {skills[0].id} did not match its input schema. Send it again in this form."] if mismatch else [
        "This agent runs job-search skills. Send one message whose text is only this JSON:"]
    lines += ['{"skill": "<skill id>", "request": {...}}',
              "The request must match the skill's input schema below. For task skills use a new idempotency_key "
              "(any unique text) per job; the reply comes when the work is done.", ""]
    for skill in skills:
        schema = json.dumps(skill.input_model.model_json_schema(), separators=(",", ":"))
        lines += [f"## {skill.id}", skill.description, f"Input schema: {schema}", ""]
    if not skills:
        lines.append("This access token allows no skills. Ask the owner for a token with more permissions.")
    return _protobuf(Message, {"messageId": str(uuid4()), "role": "ROLE_AGENT", "parts": [{"text": "\n".join(lines).strip()}]})


def _protobuf(message_type: type, value: dict[str, Any]):
    return ParseDict(value, message_type())


def _safe_errors(app: FastAPI) -> None:
    """Replace SDK error bodies that may contain rejected protocol input."""

    class SanitizeA2AErrors:
        def __init__(self, inner: Any) -> None:
            self.inner = inner

        async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
            if scope.get("type") != "http":
                await self.inner(scope, receive, send)
                return

            response_start: dict[str, Any] | None = None
            response_body: list[bytes] = []
            content_type = ""

            async def capture(message: dict[str, Any]) -> None:
                nonlocal response_start, content_type
                if message["type"] == "http.response.start":
                    response_start = message
                    content_type = next(
                        (
                            value.decode("latin-1").lower()
                            for key, value in message.get("headers", [])
                            if key.lower() == b"content-type"
                        ),
                        "",
                    )
                    return
                if message["type"] != "http.response.body":
                    await send(message)
                    return
                if "text/event-stream" in content_type:
                    # Streams pass through unbuffered; their only error events are the
                    # handler's fixed A2AError messages, never reflected input (FR-P04).
                    if response_start is not None:
                        await send(response_start)
                        response_start = None
                    await send(message)
                    return
                response_body.append(message.get("body", b""))
                if message.get("more_body", False):
                    return
                assert response_start is not None
                body = b"".join(response_body)
                status = response_start["status"]
                is_json = "application/json" in content_type
                has_error = False
                if is_json and status < 400:
                    try:
                        has_error = isinstance(json.loads(body), dict) and "error" in json.loads(body)
                    except (ValueError, UnicodeDecodeError):
                        has_error = False
                if status >= 400 and is_json:
                    body = json.dumps({"error": "request_rejected"}, separators=(",", ":")).encode()
                    headers = [
                        (key, value)
                        for key, value in response_start.get("headers", [])
                        if key.lower() not in {b"content-length", b"content-type"}
                    ]
                    headers.extend(
                        [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
                    )
                    response_start["headers"] = headers
                elif has_error:
                    body = json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": None,
                            "error": {"code": -32000, "message": "request_rejected"},
                        },
                        separators=(",", ":"),
                    ).encode()
                    response_start["status"] = 200
                    headers = [
                        (key, value)
                        for key, value in response_start.get("headers", [])
                        if key.lower() not in {b"content-length", b"content-type"}
                    ]
                    headers.extend(
                        [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
                    )
                    response_start["headers"] = headers
                await send(response_start)
                await send({"type": "http.response.body", "body": body})

            await self.inner(scope, receive, capture)

    app.add_middleware(SanitizeA2AErrors)


class _BearerMiddleware:
    """Authenticate each protocol HTTP request; the SDK card stays public."""

    def __init__(self, app: Any, grants: Any) -> None:
        self.app = app
        self.grants = grants

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path.endswith(_CARD_PATH):
            await self.app(scope, receive, send)
            return
        headers = scope.get("headers", [])
        values = [value for key, value in headers if key.lower() == b"authorization"]
        if len(values) != 1:
            await JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        scheme, _, token = values[0].decode("latin-1").partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            await JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        try:
            actor = await self.grants.authenticate(token)
        except ServiceError:
            await JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        except Exception:
            await JSONResponse({"error": "request_rejected"}, status_code=503, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        if actor.kind != "grant" or actor.project_id is None:
            await JSONResponse({"error": "unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        scope.setdefault("state", {})["a2a_authorization"] = values[0].decode("latin-1")
        await self.app(scope, receive, send)


class _ContextBuilder(DefaultServerCallContextBuilder):
    def build(self, request: Request) -> ServerCallContext:
        return ServerCallContext(
            state={
                "authorization": request.scope.get("state", {}).get("a2a_authorization", ""),
                "headers": {"A2A-Version": request.headers.get("A2A-Version", "")},
            }
        )


class _A2APayloadLogFilter(logging.Filter):
    """Drop SDK request diagnostics that may serialize rejected input or ids."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name not in {
            "a2a.server.routes.jsonrpc_dispatcher",
            "a2a.server.routes.rest_dispatcher",
        }


class _PlatformRequestHandler(RequestHandler):
    def __init__(self, services: Services, *, base_url: str) -> None:
        self.services = services
        self.intake = ProtocolRuns(services.sessions)
        self.base_url = base_url.rstrip("/")

    async def _actor(self, context: ServerCallContext, capability: str | None = None) -> Actor:
        authorization = context.state.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise A2AError("unauthorized")
        try:
            actor = await self.services.grants.authenticate(token.strip())
        except ServiceError:
            raise A2AError("unauthorized") from None
        except Exception:
            raise A2AError("request_rejected") from None
        if actor.kind != "grant" or actor.project_id is None:
            raise A2AError("unauthorized")
        if capability is not None and capability not in actor.capabilities:
            raise A2AError("forbidden")
        return actor

    @staticmethod
    def _check_tenant(tenant: str) -> None:
        if tenant:
            raise A2AError("request_rejected")

    @staticmethod
    def _task_state(status: str) -> tuple[str, dict[str, Any]]:
        return task_state(status)

    def _task(self, run: RunView, *, cancellation_requested: bool = False) -> Task:
        state, metadata = self._task_state(run.status)
        metadata.update({"operation": run.operation})
        if cancellation_requested:
            metadata["cancellation_requested"] = True
        status: dict[str, Any] = {
            "state": state,
            "timestamp": (run.finished_at or run.created_at).astimezone(UTC).isoformat().replace("+00:00", "Z"),
        }
        if run.status == "waiting_approval":
            status["message"] = {
                "role": "ROLE_AGENT",
                "parts": [{"text": "Owner approval is required in the platform."}],
            }
        elif run.status == "needs_input":
            status["message"] = {
                "role": "ROLE_AGENT",
                "parts": [{"text": "Owner input is required in the platform."}],
            }
        elif run.status == "interrupted":
            status["message"] = {"role": "ROLE_AGENT", "parts": [{"text": "Run interrupted."}]}
        return _protobuf(
            Task,
            {
                "id": str(run.id),
                "contextId": context_id(run.id),
                "status": status,
                "metadata": metadata,
            },
        )

    async def _task_with_artifacts(self, run: RunView, actor: Actor) -> Task:
        task = self._task(run)
        if run.status != "completed":
            return task
        artifacts: list[dict[str, Any]] = []
        if run.evaluation_result is not None:
            artifacts.append(
                {
                    "artifactId": f"evaluation-{run.id}",
                    "name": "Evaluation report",
                    "parts": [
                        {
                            "data": {
                                "uri": f"{self.base_url}/artifacts/evaluations/{run.id}",
                                "media_type": "text/markdown",
                            }
                        }
                    ],
                }
            )
        try:
            documents = await self.services.documents.list_ready(actor, actor.project_id)
        except ServiceError as exc:
            raise A2AError("forbidden") from None
        for document in documents:
            if document.source_run_id == run.id:
                artifacts.append(
                    {
                        "artifactId": f"document-{document.id}",
                        "name": document.title,
                        "parts": [
                            {
                                "data": {
                                    "uri": f"{self.base_url}/artifacts/documents/{document.id}",
                                    "media_type": "text/markdown",
                                }
                            }
                        ],
                    }
                )
        if artifacts:
            task.artifacts.extend(_protobuf(Artifact, item) for item in artifacts)
        return task

    @staticmethod
    def _not_found() -> TaskNotFoundError:
        return TaskNotFoundError("Task not found")

    async def _text_request(self, text: str, context: ServerCallContext) -> tuple[Skill, Actor, Any] | Message:
        """LLM agents send text. Skill JSON in the text runs the skill; anything else gets a guide, never an echo."""
        actor = await self._actor(context)
        body = _TEXT_FENCE.sub("", text).strip()
        try:
            parsed = json.loads(body)
        except ValueError:
            parsed = None
        if not (isinstance(parsed, dict) and set(parsed) == {"skill", "request"} and parsed["skill"] in SKILL_BY_ID
                and SKILL_BY_ID[parsed["skill"]].capability in actor.capabilities):
            return _guide(_usable(actor))
        skill = SKILL_BY_ID[parsed["skill"]]
        try:
            return skill, actor, skill.input_model.model_validate(parsed["request"])
        except Exception:
            return _guide([skill], mismatch=True)

    async def on_message_send(self, params: SendMessageRequest, context: ServerCallContext) -> Task | Message:
        return await self._send(params, context, wait=True)

    async def _send(self, params: SendMessageRequest, context: ServerCallContext, *, wait: bool) -> Task | Message:
        message = params.message
        if message is None:
            raise A2AError("request_rejected")
        self._check_tenant(params.tenant)
        if message.role != 1 or len(message.parts) != 1 or message.parts[0].WhichOneof("content") not in {"data", "text"}:
            raise A2AError("request_rejected")
        if message.parts[0].WhichOneof("content") == "text":
            parsed = await self._text_request(message.parts[0].text, context)
            if isinstance(parsed, Message):
                return parsed
            skill, actor, request = parsed
        else:
            try:
                metadata = MessageToDict(message.metadata, preserving_proto_field_name=True) if message.HasField("metadata") else {}
                if set(metadata) != {"skill_id"} or metadata["skill_id"] not in SKILL_BY_ID:
                    raise ValueError("invalid skill")
                skill = SKILL_BY_ID[metadata["skill_id"]]
                actor = await self._actor(context, skill.capability)
                payload = MessageToDict(message.parts[0].data, preserving_proto_field_name=True)
                request = skill.input_model.model_validate(payload)
            except A2AError:
                raise
            except Exception:
                raise A2AError("request_rejected") from None
        if skill.kind == "direct":
            try:
                output = await skill.handler(self.services, actor, request)
            except Exception:
                raise A2AError("request_rejected") from None
            return _protobuf(Message, {
                "messageId": str(uuid4()), "role": "ROLE_AGENT", "parts": [{"data": output}],
            })
        try:
            run = await self.intake.submit(actor, skill.id, request)
        except ServiceError as exc:
            raise A2AError("request_rejected") from None
        except Exception as exc:
            raise A2AError("request_rejected") from None
        configuration = params.configuration if params.HasField("configuration") else None
        if not wait or (configuration is not None and configuration.return_immediately) or "results:read" not in actor.capabilities:
            return self._task(run)
        return await self._wait(context, run.id)

    async def _wait(self, context: ServerCallContext, run_id: UUID) -> Task:
        """A2A 1.0 blocking SendMessage: wait until the run ends or waits for its owner, then answer with the report text."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _BLOCK_SECONDS
        actor, run = await self._current(context, run_id)
        while run.status not in _TERMINAL | _RESTING and loop.time() < deadline:
            await asyncio.sleep(_POLL_SECONDS)
            actor, run = await self._current(context, run_id)
        task = await self._task_with_artifacts(run, actor)
        for artifact in task.artifacts:
            text = await self._artifact_text(actor, artifact.artifact_id)
            if text:
                artifact.parts.append(_protobuf(Part, {"text": text, "mediaType": "text/markdown"}))
        return task

    async def _artifact_text(self, actor: Actor, artifact_id: str) -> str | None:
        """Same checks and size cap as the /artifacts download routes."""
        kind, _, raw = artifact_id.partition("-")
        try:
            if kind == "evaluation":
                result = (await self.services.runs.get(actor, actor.project_id, UUID(raw))).evaluation_result
                text = result.report_markdown if result else None
            else:
                text = (await self.services.documents.get(actor, actor.project_id, UUID(raw))).content_markdown
        except (ServiceError, ValueError):
            return None
        return text if text and len(text.encode("utf-8")) <= _MAX_ARTIFACT_BYTES else None

    async def on_message_send_stream(self, params: SendMessageRequest, context: ServerCallContext) -> AsyncIterator[Any]:
        # Following a run needs results access; check before a run is created.
        await self._actor(context, "results:read")
        result = await self._send(params, context, wait=False)
        if isinstance(result, Message):
            yield result
            return
        async for event in self._follow(context, UUID(result.id)):
            yield event

    async def _current(self, context: ServerCallContext, run_id: UUID) -> tuple[Actor, RunView]:
        # Re-authenticate on every poll so a revoked or narrowed grant ends the stream.
        actor = await self._actor(context, "results:read")
        try:
            return actor, await self.services.runs.get(actor, actor.project_id, run_id)
        except ServiceError:
            raise self._not_found() from None
        except Exception:
            raise A2AError("request_rejected") from None

    async def _follow(self, context: ServerCallContext, run_id: UUID) -> AsyncIterator[Any]:
        """Snapshot, then status changes until the run ends or newly waits for its owner (FR-P04)."""
        actor, run = await self._current(context, run_id)
        yield await self._task_with_artifacts(run, actor)
        last = run.status
        while run.status not in _TERMINAL:
            await asyncio.sleep(_POLL_SECONDS)
            actor, run = await self._current(context, run_id)
            if run.status == last:
                continue
            last = run.status
            task = self._task(run)
            if run.status == "completed":
                for artifact in (await self._task_with_artifacts(run, actor)).artifacts:
                    yield TaskArtifactUpdateEvent(task_id=task.id, context_id=task.context_id, artifact=artifact, last_chunk=True)
            yield TaskStatusUpdateEvent(task_id=task.id, context_id=task.context_id, status=task.status, metadata=task.metadata)
            if run.status in _RESTING:
                return

    async def on_get_task(self, params: GetTaskRequest, context: ServerCallContext) -> Task | None:
        self._check_tenant(params.tenant)
        actor = await self._actor(context, "results:read")
        try:
            run_id = UUID(params.id)
            run = await self.services.runs.get(actor, actor.project_id, run_id)
        except (ValueError, ServiceError) as exc:
            raise self._not_found() from None
        except Exception as exc:
            raise A2AError("request_rejected") from None
        return await self._task_with_artifacts(run, actor)

    async def on_cancel_task(self, params: CancelTaskRequest, context: ServerCallContext) -> Task:
        self._check_tenant(params.tenant)
        actor = await self._actor(context)
        try:
            run_id = UUID(params.id)
            run = await self.services.runs.cancel(actor, actor.project_id, run_id)
        except (ValueError, ServiceError) as exc:
            raise self._not_found() from None
        except Exception as exc:
            raise A2AError("request_rejected") from None
        if run.status not in _TERMINAL:
            deadline = asyncio.get_running_loop().time() + 1.0
            while asyncio.get_running_loop().time() < deadline:
                await asyncio.sleep(0.05)
                actor = await self._actor(context)
                try:
                    run = await self.services.runs.cancel(actor, actor.project_id, run_id)
                except ServiceError as exc:
                    raise self._not_found() from None
                if run.status in _TERMINAL:
                    break
        return self._task(run, cancellation_requested=run.status not in _TERMINAL)

    async def on_subscribe_to_task(self, params: SubscribeToTaskRequest, context: ServerCallContext) -> AsyncIterator[Any]:
        self._check_tenant(params.tenant)
        try:
            run_id = UUID(params.id)
        except ValueError:
            raise self._not_found() from None
        _actor, run = await self._current(context, run_id)
        if run.status in _TERMINAL:
            raise UnsupportedOperationError("Task has already ended")
        async for event in self._follow(context, run_id):
            yield event

    def _push_error(self, exc: Exception) -> A2AError:
        if isinstance(exc, ServiceError) and exc.code == "invalid_push_config":
            return InvalidParamsError("Invalid push notification config")
        return self._not_found()

    @staticmethod
    def _push_config(view: dict[str, Any]) -> TaskPushNotificationConfig:
        return _protobuf(TaskPushNotificationConfig, {"id": view["id"], "taskId": view["task_id"], "url": view["url"]})

    async def _push_call(self, params, context, call):
        self._check_tenant(params.tenant)
        actor = await self._actor(context)
        try:
            return await call(actor, UUID(params.task_id))
        except (ValueError, ServiceError) as exc:
            raise self._push_error(exc) from None

    async def on_list_tasks(self, params: ListTasksRequest, context: ServerCallContext) -> ListTasksResponse:
        self._check_tenant(params.tenant)
        actor = await self._actor(context)
        statuses = None
        if params.status:
            name = TaskState.Name(params.status)
            statuses = {s for s in _RUN_STATUSES if task_state(s)[0] == name}
        try:
            rows, token, total = await asyncio.to_thread(
                self.services.webhooks.list_runs, actor, statuses=statuses,
                page_size=params.page_size, page_token=params.page_token)
        except ServiceError as exc:
            raise self._push_error(exc) from None
        return ListTasksResponse(tasks=[self._task(run_view(row)) for row in rows], next_page_token=token,
                                 page_size=len(rows), total_size=total)

    async def on_create_task_push_notification_config(self, params: TaskPushNotificationConfig, context: ServerCallContext) -> TaskPushNotificationConfig:
        view = await self._push_call(params, context, lambda actor, run_id: self.services.webhooks.set_push_config(
            actor, run_id, params.id, params.url, params.token))
        return self._push_config(view)

    async def on_get_task_push_notification_config(self, params: GetTaskPushNotificationConfigRequest, context: ServerCallContext) -> TaskPushNotificationConfig:
        view = await self._push_call(params, context, lambda actor, run_id: asyncio.to_thread(
            self.services.webhooks.get_push_config, actor, run_id, params.id))
        return self._push_config(view)

    async def on_delete_task_push_notification_config(self, params: DeleteTaskPushNotificationConfigRequest, context: ServerCallContext) -> None:
        await self._push_call(params, context, lambda actor, run_id: asyncio.to_thread(
            self.services.webhooks.delete_push_config, actor, run_id, params.id))

    async def on_list_task_push_notification_configs(self, params: ListTaskPushNotificationConfigsRequest, context: ServerCallContext) -> ListTaskPushNotificationConfigsResponse:
        views = await self._push_call(params, context, lambda actor, run_id: asyncio.to_thread(
            self.services.webhooks.list_push_configs, actor, run_id))
        return ListTaskPushNotificationConfigsResponse(configs=[self._push_config(v) for v in views])

    async def on_get_extended_agent_card(self, params: GetExtendedAgentCardRequest, context: ServerCallContext) -> AgentCard:
        actor = await self._actor(context)
        # grants.authenticate re-reads the grant row, so capabilities are current (FR-P05).
        return _agent_card(self.base_url, [skill for skill in SKILLS if skill.capability in actor.capabilities])


def _agent_card(base_url: str, skills: Sequence[Skill]) -> AgentCard:
    security = [{"schemes": {"bearerAuth": {"list": []}}}]
    return _protobuf(
        AgentCard,
        {
            "name": "Job Search Platform",
            "description": "Evaluate a job posting or draft application documents for the Project authorized by the supplied bearer grant.",
            "supportedInterfaces": [
                {"url": base_url, "protocolBinding": "JSONRPC", "protocolVersion": "1.0"},
                {"url": base_url, "protocolBinding": "HTTP+JSON", "protocolVersion": "1.0"},
            ],
            "version": "0.1.0",
            "capabilities": {"streaming": True, "pushNotifications": True, "extendedAgentCard": True},
            "securitySchemes": {
                "bearerAuth": {
                    "httpAuthSecurityScheme": {
                        "scheme": "bearer",
                        "bearerFormat": "Project capability token",
                    }
                }
            },
            "securityRequirements": security,
            "defaultInputModes": ["application/json"],
            "defaultOutputModes": ["application/json", "text/markdown"],
            "skills": [
                {
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description,
                    "tags": list(skill.tags),
                    "examples": list(skill.examples),
                    "inputModes": ["application/json"],
                    "outputModes": ["application/json"],
                    "securityRequirements": security,
                }
                for skill in skills
            ],
        },
    )


def _allowed_hostnames(allowed_hosts: list[str]) -> list[str]:
    if not allowed_hosts or any(not host or "*" in host for host in allowed_hosts):
        raise ValueError("a2a_allowed_hosts_must_be_exact")
    result: list[str] = []
    for host in allowed_hosts:
        value = urlsplit(f"//{host}").hostname
        if not value:
            raise ValueError("a2a_allowed_hosts_must_be_exact")
        result.append(value)
    return result


def create_a2a_app(services: Services, *, base_url: str, allowed_hosts: list[str]) -> FastAPI:
    """Build official A2A SDK routes over the platform's durable run services."""
    parsed = urlsplit(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("a2a_base_url_must_be_an_http_origin")
    if parsed.path not in {"", "/"}:
        raise ValueError("a2a_base_url_must_name_the_a2a_root")
    if parsed.hostname not in set(_allowed_hostnames(allowed_hosts)):
        raise ValueError("a2a_base_url_host_not_allowed")
    normalized_base_url = base_url.rstrip("/")
    for logger_name in (
        "a2a.server.routes.jsonrpc_dispatcher",
        "a2a.server.routes.rest_dispatcher",
    ):
        logging.getLogger(logger_name).addFilter(_A2APayloadLogFilter())
    card = _agent_card(normalized_base_url, SKILLS)
    handler = _PlatformRequestHandler(services, base_url=normalized_base_url)
    context_builder = _ContextBuilder()
    app = FastAPI(title="Job Search Platform A2A", docs_url=None, redoc_url=None, openapi_url=None)
    rest_routes = [
        route
        for route in create_rest_routes(handler, context_builder=context_builder)
        if getattr(route, "path", None) != "/{tenant}"
    ]
    add_a2a_routes_to_fastapi(
        app,
        agent_card_routes=create_agent_card_routes(card, cache_control="no-store"),
        jsonrpc_routes=create_jsonrpc_routes(handler, rpc_url="/", context_builder=context_builder),
        rest_routes=rest_routes,
    )

    @app.get("/artifacts/evaluations/{run_id}", include_in_schema=False)
    async def read_evaluation(run_id: UUID, request: Request) -> Response:
        context = ServerCallContext(state={"authorization": request.scope.get("state", {}).get("a2a_authorization", "")})
        try:
            actor = await handler._actor(context, "results:read")
        except A2AError:
            return JSONResponse({"error": "request_rejected"}, status_code=403, headers={"Cache-Control": "no-store"})
        try:
            run = await services.runs.get(actor, actor.project_id, run_id)
        except ServiceError:
            return Response(status_code=404)
        result = run.evaluation_result
        if result is None or run.status != "completed":
            return Response(status_code=404)
        body = result.report_markdown.encode("utf-8")
        if len(body) > _MAX_ARTIFACT_BYTES:
            return Response(status_code=404)
        return Response(body, media_type="text/markdown", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    @app.get("/artifacts/documents/{document_id}", include_in_schema=False)
    async def read_document(document_id: UUID, request: Request) -> Response:
        context = ServerCallContext(state={"authorization": request.scope.get("state", {}).get("a2a_authorization", "")})
        try:
            actor = await handler._actor(context, "results:read")
        except A2AError:
            return JSONResponse({"error": "request_rejected"}, status_code=403, headers={"Cache-Control": "no-store"})
        try:
            document = await services.documents.get(actor, actor.project_id, document_id)
        except ServiceError:
            return Response(status_code=404)
        content = document.content_markdown
        if not content or len(content.encode("utf-8")) > _MAX_ARTIFACT_BYTES:
            return Response(status_code=404)
        return Response(content, media_type="text/markdown", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hostnames(allowed_hosts))
    app.add_middleware(_BearerMiddleware, grants=services.grants)
    _safe_errors(app)
    return app
