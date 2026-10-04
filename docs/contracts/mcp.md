# MCP contract

The platform exposes MCP through the official Python MCP SDK `mcp==2.3.0` and its `MCPServer.streamable_http_app` Streamable HTTP transport. The official Python client `ClientSession` and `streamable_http_client` negotiate MCP protocol revision `2025-11-25` in the live TCP integration test. Normative specification: [Model Context Protocol, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25).

`create_mcp_app(services, *, allowed_hosts, allowed_origins)` returns the official SDK ASGI app. Mount it at `/mcp/` on the shared-only listener. The parent listener lifespan must enter `mcp_lifespan_context(app)`; this adapter does not start application workers or own service startup. Stateless HTTP mode keeps no durable identity in MCP sessions. The app requires an authenticated bearer grant on every HTTP operation, and each tool and resource handler authenticates again before using shared services. A session identifier never grants authority.

The default transport security allowlist is `127.0.0.1` and `localhost`, with no allowed cross-origin browser origins. The root listener may pass exact host and origin values when it explicitly enables the shared LAN listener. Wildcard origins are not accepted by the platform configuration. LAN remains disabled by default; owner UI, management, approvals, and settings stay on the owner loopback surface.

| Tool | Required grant capability | Input and result |
|---|---|---|
| `evaluate_job` | `jobs:evaluate` | One bounded `ProtocolJobInput` in `request`; returns the durable `run_id`, status, and permitted result reference. |
| `draft_documents` | `documents:draft` | One bounded `ProtocolJobInput` in `request`; returns the durable `run_id` and status. |
| `get_run` | `results:read` | A run UUID; returns authorized current status and published result references. |
| `cancel_run` | `jobs:evaluate` plus original-creator check | A run UUID; queued work may be cancelled immediately. Running work reports its current state with `cancellation_pending=true` until the executor confirms stop. |
| `list_results` | `results:read` | No arguments; returns published generated-document resources and completed evaluation-report resources. |

`ProtocolJobInput` permits exactly one of an inline `JobCreate` or `job_revision_id`, requires `output_language` (`th` or `en`) and an unchanged bounded `idempotency_key`, and forbids additional fields. Project and external-agent session are derived by `ProtocolRuns` from the current grant. The caller cannot choose a project, session, CV, provider, model, credential, storage key, or owner-only operation. Run admission, grant refresh, quotas, and idempotency remain in the shared services.

The only resource templates are `job-search://runs/{run_id}/evaluation` and `job-search://documents/{document_id}`. They use server-created UUID identifiers, expose only generated reports or published generated-document content, require `results:read` at read time, and cap UTF-8 payloads at 200,000 bytes. A resource URI is a reference, not a bearer credential; foreign, unpublished, raw-input, CV, and unknown resource identifiers are denied. Result access is rechecked against current PostgreSQL grant state on each request.

MCP errors use stable authorization or request codes and omit request bodies, credentials, native output, tracebacks, and provider configuration. The official SDK request middleware validates bounded tool arguments before its generated Pydantic argument model runs; invalid fields and rejected extra values return only `invalid_parameters`, without echoing the supplied value in tool content or logs. The implementation does not expose shell access, raw file paths, object-store keys, private chat, or generic project CRUD.

The scoped TCP test uses a parent FastAPI lifespan to enter the SDK app lifespan, two projects, real PostgreSQL and MinIO test fixtures, and the official SDK client. It verifies initialize/version negotiation, exact tool list, inline-job submission and replay, conflicting idempotency input, strict extra-field rejection, status polling, queued cancellation, pending running cancellation, cross-project transfer denial, result-only capability behavior, published artifact/resource reads through `Artifacts.publish`, missing/expired/revoked bearer denial, and an unknown raw-file resource guess. Its controlled synthetic queue completion verifies adapter and publication integration only; it is not native provider execution proof. Shared listener activation remains owned by the application integrator.
