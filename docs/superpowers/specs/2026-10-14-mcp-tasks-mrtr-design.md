# MCP tasks extension, MRTR and cache hints (TOR FR-P02)

**Status:** approved by owner 2026-10-14 (all recommended options). Branch `feat/mcp-tasks-mrtr` from `origin/develop` 2e4dc88.

## Requirement

TOR FR-P02: the MCP endpoint `/mcp` is stateless Streamable HTTP and supports `server/discover`, `tools/list` (deterministic order, `ttlMs`, `cacheScope`), `tools/call`, MRTR `input_required`, and the tasks extension.

## What already holds (verified against the running app, protocol 2026-07-28)

- `/mcp` runs `streamable_http_app(stateless_http=True, json_response=True)` on `mcp==2.3.0`.
- `server/discover` answers with `supportedVersions: ["2026-07-28"]`, capabilities and instructions.
- `tools/list` returns 13 tools in registration order (`SKILLS` order, then `get_run`, `cancel_run`, `list_results`) with `ttlMs: 0`, `cacheScope: "private"`.
- `tools/call` works for all tools; `jspg_` and OAuth `jspo_` bearer tokens both authenticate.

## Gaps this work closes

1. The tasks extension (`io.modelcontextprotocol/tasks`): not advertised, `tasks/*` methods return method-not-found.
2. MRTR `input_required`: no tool ever returns it.
3. `tools/list` caching: everything is `private`/0, and no test pins the order.

## External specification

- Tasks extension: <https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks> (2026-07-28 revision). Key rules this design follows:
  - Negotiation is per request. The client declares `_meta["io.modelcontextprotocol/clientCapabilities"].extensions["io.modelcontextprotocol/tasks"]`; the server advertises the same key in `server/discover` capabilities.
  - The server decides per request whether `tools/call` returns a task. It may only return one when the client declared the capability on that request.
  - `CreateTaskResult` = `{resultType: "task", taskId, status, statusMessage?, createdAt, lastUpdatedAt, ttlMs, pollIntervalMs?}`, returned only once `tasks/get` would already resolve.
  - Methods: `tasks/get` (`{taskId}` → task plus `inputRequests` | `result` | `error` by status, `resultType: "complete"`), `tasks/update` (`{taskId, inputResponses}` → empty ack), `tasks/cancel` (`{taskId}` → empty ack). There is no `tasks/list` in this revision.
  - Status values `working`, `input_required`, `completed`, `failed`, `cancelled`. `failed` is for JSON-RPC errors only; a tool result with `isError: true` is `completed`.
  - Unknown task id → `-32602`. A `tasks/*` call from a client that did not declare the capability → `-32021` with `data.requiredCapabilities`.
  - Task ids must be unguessable, and every task request must be authorized.
- MRTR: `InputRequiredResult` (`resultType: "input_required"`, `inputRequests`, `requestState`) from `mcp_types`; the SDK seals `requestState` with AES-GCM through `RequestStateSecurity`, binds it to the request and an expiry, and exposes the echo on `ctx.request_state`.
- A throwaway spike (not kept) confirmed on `mcp==2.3.0`: an `Extension` subclass with `identifier = "io.modelcontextprotocol/tasks"` is advertised in `server/discover`; `intercept_tool_call` can return a `resultType: "task"` result; a `MethodBinding("tasks/get", ...)` is served; a tool returning `InputRequiredResult` produces a sealed `requestState`.

## Decisions (owner-approved)

| # | Decision |
|---|---|
| Q1 | Only run-creating tools become tasks: `evaluate_job`, `draft_documents`, `tailor_cv`, `apply_prepare`, `apply_submit`, `draft_follow_up` (every `Skill` with `kind == "task"`). A task is created only when the client declared the tasks capability on that `tools/call`; otherwise the existing `{run_id, status, ...}` result is returned unchanged. `taskId` is the run UUID (UUID4, unguessable). Every `tasks/*` call re-authenticates the bearer token and loads the run through `services.runs.get(actor, actor.project_id, run_id)`; a run outside the grant's Project, or a malformed id, is `-32602` "Task not found". Direct skills (`jobs_search`, `jobs_fit`, `applications_list`, `applications_update`) and `get_run`/`cancel_run`/`list_results` never become tasks. |
| Q2 | Owner decisions stay in the owner app (ADR-001, FR-A05). A task in `input_required` carries one URL elicitation pointing to the owner app. `tasks/update` validates the task and acknowledges, but never answers questions or approves on the owner's behalf. |
| Q3 | Synchronous MRTR on `apply_submit` for clients that did not declare tasks but did declare URL elicitation (`clientCapabilities.elicitation.url`). Round 1 submits the run and returns `InputRequiredResult` with the approval URL elicitation and a `requestState` carrying the run id. A retry with that `requestState` returns the final result once the run is terminal, or another `InputRequiredResult` while it is not. The `requestState` key persists in the private runtime directory so a restart does not break in-flight rounds. |
| Q4 | Cache hints: `tools/list`, `prompts/list`, `resources/templates/list` → `public`, `ttlMs` 3 600 000 (identical for every caller; tools/call re-checks authorization). `resources/list` and everything else stay `private`/0. A test pins the `tools/list` order and the hint values. |
| Q5 | Status mapping and timing below. `pollIntervalMs` 2000; `ttlMs` `null` (runs are durable). `tasks/cancel` uses `services.runs.cancel` exactly like `cancel_run`. |
| Q6 | Out of scope: `notifications/tasks` via `subscriptions/listen` (`/mcp` is stateless; clients poll), 2025-11-25 experimental tasks (`tasks/list`, `tasks/result`), per-caller `tools/list` filtering. |

## Status mapping

| Run status | Task status | Extra fields on `tasks/get` |
|---|---|---|
| `queued`, `running` | `working` | — |
| `waiting_approval` | `input_required` | `inputRequests: {"owner-approval-<run_id>": URL elicitation → approvals page}` |
| `needs_input` | `input_required` | `inputRequests: {"owner-input-<run_id>": URL elicitation → session page}` |
| `completed` | `completed` | `result`: a `CallToolResult` whose `structuredContent` is the same dict `get_run` returns for that run (including `artifact_resources`), with one JSON text content block |
| `failed`, `interrupted` | `failed` | `error: {"code": -32000, "message": "run_failed"}` (`"run_interrupted"` for interrupted) |
| `cancelled` | `cancelled` | — |

- Elicitation keys are stable per run and status, so a client that dedupes keys across polls sees each owner step once. A run that goes `needs_input` → `waiting_approval` produces a second, different key, as the spec requires (keys never reused).
- URL elicitation: `{"method": "elicitation/create", "params": {"mode": "url", "message": <English sentence telling the user the owner must act in the Job Search Platform app>, "url": <url>}}`.
  - Approvals: `{owner_public_origin}/app/projects/{project_id}/console?tab=approvals`.
  - Needs input: `{owner_public_origin}/app/projects/{project_id}/sessions/{session_id}`.
  - `owner_public_origin` is `services.owner_sessions.public_origin` (same source as the OAuth consent URL).
- `createdAt` = run `created_at`; `lastUpdatedAt` = `finished_at` when set, otherwise the newest run event's `created_at`, otherwise `created_at`. ISO 8601 with offset.
- `statusMessage` = the run status string (`"waiting_approval"`, `"needs_input"`, …) so a client can show something without parsing.

## Components

### `backend/src/job_search_platform/api/mcp_tasks.py` (new)

- `TASKS_EXTENSION = "io.modelcontextprotocol/tasks"`.
- `class TasksExtension(Extension)` with `identifier = TASKS_EXTENSION`, constructed with `services`, `resource` and a `create_run(ctx, tool_name, arguments) -> RunView` callback supplied by `mcp.py`, so it reuses `submit`'s auth/intake path rather than duplicating it.
  - `intercept_tool_call`: when the tool is a task skill **and** the request's client capabilities declare the extension, create the run, then return `CreateTaskResult` built from the run. Otherwise `call_next`. Argument validation stays where it is (the sanitizing middleware runs first).
  - `methods()`: `tasks/get`, `tasks/update`, `tasks/cancel`, each with a `RequestParams` subclass (`task_id: str`; `tasks/update` also `input_responses: dict[str, Any] = {}`), restricted to protocol `2026-07-28`.
  - Every method first checks the client declared the extension on this request; if not → `MCPError(-32021, ...)` with `data={"requiredCapabilities": {"extensions": {TASKS_EXTENSION: {}}}}`.
- Pure helpers, unit-tested without a database: `task_status(run_status)`, `task_view(run, last_updated_at, owner_origin) -> dict` (the wire dict for `tasks/get`/`CreateTaskResult`), `client_declares_tasks(meta)`, `client_declares_url_elicitation(meta)`.

### `backend/src/job_search_platform/api/mcp.py` (modify)

- Pass `extensions=[TasksExtension(...)]`, `cache_hints={...}` (Q4) and `request_state_security=RequestStateSecurity(keys=[<key>], audience="job-search-platform-mcp")` to `MCPServer`.
- `apply_submit` gains the Q3 MRTR path. The general skill tool stays as is for every other skill. `apply_submit` behaviour without URL-elicitation capability is unchanged.
- MRTR retry handling: `requestState` plaintext is `{"run_id": "<uuid>"}`. On retry the handler re-authenticates, loads the run through `services.runs.get` (so another Project's run is not found), checks `run.operation == "apply_submit"`, and never creates a second run.

### Request-state key

- `main.py` reads `mcp-request-state-key` from the private runtime directory (`PRIVATE_DIR`, the `CORE02_PRIVATE_DIR` convention). If absent it creates it with 32 random bytes (base64url), `O_CREAT | O_EXCL`, mode `0600`, and re-reads on a creation race. The key is passed to `create_mcp_app` through `Services` (new `mcp_request_state_key: str | None = None`; `None` falls back to the SDK's ephemeral key so existing test setups keep working).
- The key value is never logged.

## Data flow

1. Tasks-capable client → `tools/call evaluate_job` with tasks capability → interceptor creates the run (same intake as today) → `CreateTaskResult{taskId: run_id, status: "working", pollIntervalMs: 2000, ttlMs: null}`.
2. Client polls `tasks/get` → mapped status. `waiting_approval`/`needs_input` → `input_required` with the URL elicitation; the owner acts in the app; the next poll shows `working` or a terminal state.
3. `completed` → `result` is the `get_run` payload as a `CallToolResult`.
4. Non-tasks client with URL elicitation → `tools/call apply_submit` → `InputRequiredResult` (approval URL, sealed `requestState`) → user approves in the owner app → client retries with `requestState` → final `CallToolResult` (or another `InputRequiredResult` if still pending).
5. Plain client (neither capability) → unchanged behaviour (`run_id` + `get_run` polling).

## Error handling

- Unknown, malformed or foreign task id → `-32602` `"Task not found"` (no distinction, so ids cannot be probed).
- Revoked or expired grant → the existing 401 at the bearer middleware.
- Tool lacks capability for the grant → the existing `-32001` from `submit`.
- Invalid or expired `requestState` → the SDK boundary rejects it (`-32602`); the client starts over. A new round 1 creates a new run, which is acceptable because the earlier run is still visible to the owner and to `get_run`.
- Internal failures → `-32000` `request_failed`, never echoing input or tracebacks (existing rule).

## Testing

- Unit (`backend/tests/unit/test_mcp_tasks.py`): status mapping for all 8 run statuses; `task_view` shape for each task status (required fields, camelCase, `resultType`, `ttlMs: null`, `pollIntervalMs: 2000`, elicitation keys and URLs); capability detection helpers.
- Integration (`backend/tests/integration/test_mcp_tasks.py`, real Postgres, in-process ASGI app like `test_mcp.py`):
  - `server/discover` advertises the extension.
  - `tools/list`: exact 13-name order, `cacheScope: "public"`, `ttlMs: 3600000`.
  - Tasks-capable `tools/call evaluate_job` → `resultType: "task"`, and `tasks/get` resolves immediately (the run exists).
  - Same call without the capability → the old result shape.
  - Direct skill with the capability → normal result, no task.
  - `tasks/get` per status by updating the run row: `waiting_approval`/`needs_input` → `input_required` with the right URL; `completed` → `result.structuredContent.run_id`; `failed` → `error`; `cancelled`.
  - `tasks/get` of another Project's run, of a random UUID, and of `"not-a-uuid"` → `-32602`.
  - `tasks/*` without the declared capability → `-32021`.
  - `tasks/cancel` on a queued run → ack, run becomes `cancelled`.
  - `tasks/update` → empty ack, run unchanged.
  - MRTR: `apply_submit` with URL-elicitation capability → `input_required` with approval URL and `requestState`; retry while pending → `input_required` again and no second run; after the owner approves (through the existing approvals service) and the run completes → final result; a `requestState` replayed under a grant for a different Project → not found.
  - The request-state key file is created `0600` and reused on the next build.
- Existing `test_mcp.py`, `test_mcp_oauth.py`, `test_a2a.py` keep passing (no behaviour change for clients that declare nothing).
- Live smoke: run against `run_local.py --enable-sharing` with a raw 2026-07-28 HTTP client: discover, tasks-capable `evaluate_job` → `tasks/get` until terminal.

## Out of scope

- `notifications/tasks` and `subscriptions/listen`.
- The 2025-11-25 experimental tasks API (`tasks/list`, `tasks/result`, `taskSupport` on tools).
- Agents answering owner questions or approving (`tasks/update` / form elicitation) — kept owner-only by ADR-001/FR-A05.
- Filtering `tools/list` per caller.
- A2A changes.
