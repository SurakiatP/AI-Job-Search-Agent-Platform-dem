# MCP contract

The platform exposes MCP through the official Python MCP SDK `mcp==2.3.0` and its `MCPServer.streamable_http_app` Streamable HTTP transport. The official Python client `ClientSession` and `streamable_http_client` negotiate MCP protocol revision `2025-11-25` in the live TCP integration test. Normative specification: [Model Context Protocol, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25).

`create_mcp_app(services, *, allowed_hosts, allowed_origins)` returns the official SDK ASGI app. Mount it at `/mcp/` on the shared-only listener; the listener also answers the advertised `/mcp` (no trailing slash) instead of letting it fall through to the A2A app. The parent listener lifespan must enter `mcp_lifespan_context(app)`; this adapter does not start application workers or own service startup. Stateless HTTP mode keeps no durable identity in MCP sessions. The app requires an authenticated bearer grant on every HTTP operation, and each tool and resource handler authenticates again before using shared services. A session identifier never grants authority.

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

## OAuth 2.1 (FR-P03)

The shared listener also serves an OAuth 2.1 authorization server so MCP clients can connect without a pasted `jspg_` token.

- Discovery: `/.well-known/oauth-protected-resource/mcp` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414). An unauthenticated `/mcp` request returns `401` with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp"`.
- Endpoints: `/authorize` (per-IP rate limited, 60/hour), `/token`, `/register` (per-IP rate limited, 20/hour), `/revoke`.
- Rate limits key on the direct peer IP. Behind a reverse proxy every client shares one bucket, so rate-limit at the proxy as well.
- Public clients only (`token_endpoint_auth_method: none`), registered by Client ID Metadata Document (an https `client_id` URL, fetched with an SSRF guard) or Dynamic Client Registration.
- PKCE `S256` is required, and the `resource` parameter is required and must equal the `/mcp` URL.
- Access tokens (`jspo_`) last 1 hour and are valid only at `/mcp` (A2A refuses them). Refresh tokens rotate; reuse of a rotated refresh token revokes the grant's tokens.
- Each consent creates a `Grant` that the owner can revoke under Connected agents; revocation takes effect on the next request.
- OAuth is off unless the shared origin (`SHARE_PUBLIC_ORIGIN`) is https or loopback with no path; with OAuth on, `/mcp` also accepts the `SHARE_PUBLIC_ORIGIN` host. Otherwise the OAuth routes are not mounted and `/mcp` advertises no resource metadata.
- `jspg_` grant tokens keep working unchanged.

## Tasks, MRTR and caching (FR-P02)

Protocol `2026-07-28`. Clients that declare nothing see the previous behaviour unchanged.

- `server/discover` advertises `capabilities.extensions["io.modelcontextprotocol/tasks"]`.
- Six tools may return `resultType: "task"` instead of the run payload: `evaluate_job`, `draft_documents`, `tailor_cv`, `apply_prepare`, `apply_submit`, `draft_follow_up`. This happens only when the request declares the tasks extension and the grant has `results:read`; otherwise the normal result is returned. `taskId` is the run id. The create result carries the task fields only; details come from `tasks/get`.
- Methods: `tasks/get`, `tasks/update`, `tasks/cancel` (protocol `2026-07-28` only; there is no `tasks/list`). Each requires the tasks extension on the request, otherwise `-32021` with `data.requiredCapabilities = {"extensions": {"io.modelcontextprotocol/tasks": {}}}`.
- `tasks/get` reads any run of the grant's Project that `get_run` can read. An unknown, malformed or foreign task id returns `-32602` with the message `Failed to retrieve task: Task not found`.
- `tasks/cancel` uses the same service as `cancel_run`: cancelling a run created by a different grant returns `-32001` `forbidden`.
- `pollIntervalMs` is 2000; `ttlMs` is `null` because runs are durable. `statusMessage` is the run status; `createdAt`/`lastUpdatedAt` are ISO 8601 (`lastUpdatedAt` is the finish time, else the newest run event, else the creation time).

| Run status | Task status | Extra fields on `tasks/get` |
|---|---|---|
| `queued`, `running` | `working` | none |
| `waiting_approval` | `input_required` | `inputRequests["owner-approval-<run_id>"]`: URL elicitation to `<owner origin>/app/projects/<project_id>/console?tab=approvals` |
| `needs_input` | `input_required` | `inputRequests["owner-input-<run_id>"]`: URL elicitation to `<owner origin>/app/projects/<project_id>/sessions/<session_id>` (the timeline tab when the run has no session) |
| `completed` | `completed` | `result`: a `CallToolResult` whose `structuredContent` equals the `get_run` payload (including `artifact_resources`), with one JSON text block |
| `failed`, `interrupted` | `failed` | `error: {"code": -32000, "message": "run_failed"}` (`"run_interrupted"` for interrupted) |
| `cancelled` | `cancelled` | none |

- The owner decides in the app, never over MCP. `tasks/update` only validates the task and acknowledges (`resultType: "complete"`); `inputResponses` are ignored. Elicitation keys are stable per run and status, so a client sees each owner step once.
- MRTR on `apply_submit`: for a client that declares URL elicitation and a grant with `results:read`, the first call submits the run and, while it is not terminal, returns `input_required` with the owner-approval URL elicitation and a sealed `requestState` holding the run id. Each retry re-reads that same run and never submits again; a terminal run returns the `get_run` payload. Other clients get the plain submit result.
- The SDK binds a sealed `requestState` to the method, tool name and arguments and expires it after 600 s. A retry with different arguments or after expiry is rejected with `-32602`; the client must start over, which creates a new run.
- The sealing key is stored in the file `mcp-request-state-key` in the private runtime directory (mode 0600), created once so in-flight rounds survive a restart. An empty, symlinked or group/world-accessible file stops startup (`private_runtime_credentials_unavailable`).
- Cache hints: `tools/list`, `prompts/list` and `resources/templates/list` are `public` with `ttlMs` 3600000 (1 hour); every other response is `private` with `ttlMs` 0.
