# Webhooks and A2A push notifications (TOR FR-P06, FR-P04, FR-J05 push) — design

Status: owner-approved design, 2026-10-14. Branch `feat/webhooks` from `origin/develop` (5b2e643).

## Goal

This work covers three TOR requirements:
- **FR-P06:** webhook push notifications with an HMAC signature, retry with exponential backoff, and a dead-letter state.
- **FR-P04:** A2A support for `tasks/pushNotificationConfig/*` and `tasks/list`.
- **FR-J05:** the push channel for saved-search digests. The owner deferred Telegram, so it is not part of this work.

Success looks like this:
- An external agent registers a push URL through A2A and receives a signed POST whenever its task changes state.
- An owner adds project webhooks in Settings and receives signed run and digest events.
- Failed deliveries retry with backoff and end in a dead-letter state that the owner can inspect and redeliver.
- All of it is testable locally without a server.

## Constraints

- **Signed requests:** every outbound request is signed. No request goes out without a signature.
- **SSRF protection:**
  - Only `https` URLs are accepted.
  - The resolved host must not be private, loopback, link-local, reserved, multicast or unspecified. The check is `a2a.utils.push_url_validator.validate_push_notification_url`.
  - The check runs both when a URL is registered and right before every delivery, because DNS can change.
  - `WEBHOOK_ALLOW_PRIVATE=1` lifts the check and allows `http` and loopback. It is for development and tests only.
  - Redirects are never followed.
- **Isolation:** owner webhook routes go through `authorize()` with the owner-only resource `webhook`. A grant can manage A2A push configs only for runs it created (`run.actor_scope == "grant:<id>"`).
- **No new dependencies:** use `httpx`, which is already a direct dependency.
- **Lock order:** the outbox insert happens inside `append_event`, which already runs under the run row lock. No new lock is added.

## Decisions (grill round 1, all as recommended)

1. Two subscription sources share one delivery engine:
   - **(a)** per-task A2A push configs, which satisfy FR-P04;
   - **(b)** owner project webhooks, which satisfy FR-P06 and carry the FR-J05 push.
2. Implement A2A `tasks/list` as well, which completes FR-P04.
3. **Signature:**
   - The header is `X-JSP-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(key, f"{t}." + body)>`. `X-JSP-Event` and `X-JSP-Delivery` (the delivery id) are also sent.
   - **(b)** The key is a server-generated 32-byte secret, shown once at creation.
   - **(a)** The key is the client-supplied A2A `token`, at least 16 characters, which is also sent as `X-A2A-Notification-Token` per the A2A spec.
4. **Retry and dead-letter:**
   - Retry on network errors, timeouts, 5xx, 408 and 429.
   - Delays are 1, 2, 4, 8, 16, 32, 64, 128 minutes with up to 10% jitter, for at most 8 attempts.
   - Any other 4xx, a 3xx, or an exhausted retry budget ends in `dead`.
   - The request timeout is 10 s, and the request body is capped at 256 KB.
5. SSRF protection as described above.
6. **Events:**
   - (a) A2A receives every task state change as `StreamResponse.statusUpdate`.
   - (b) Webhooks subscribe to any subset of `run.waiting_approval`, `run.needs_input`, `run.completed`, `run.failed`, `run.cancelled` and `digest.ready`.
   - `ping` is sent only by the test button.
7. **Permissions and limits:**
   - Owner webhooks are owner-only, with at most 5 per project.
   - A2A configs are limited to the creating grant, with at most 5 per task. They stop delivering once the grant is revoked or expired.
   - Everything cascades on project or account deletion.
8. **Outbox:**
   - A row in `webhook_deliveries` is written in the same transaction as the triggering event.
   - A dedicated supervisor delivery loop runs every 2 s, claims rows with `FOR UPDATE SKIP LOCKED`, and sends at most 10 concurrently.
   - Delivery history older than 30 days is pruned in housekeeping.
9. **UI:**
   - A Settings "Webhooks" section lets the owner add a URL with event checkboxes. The secret is shown once.
   - It also offers "Send test", enable/disable, delete, the last 50 deliveries (status, HTTP code, attempts), and "Redeliver" on dead rows.
   - Saved searches get a push toggle next to the email toggle.

Approach A, a database outbox owned by the app, was chosen. The alternatives were rejected:
- **B, the a2a-sdk `BasePushNotificationSender`:** it has no retry, backoff or dead-letter state, and it covers only A2A.
- **C, fire-and-forget:** it loses events on restart.

## Data model — migration `0025_webhooks`

### `webhook_endpoints` (owner project webhooks)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid not null | FK → `projects.id` `ON DELETE CASCADE` |
| `url` | varchar(2048) not null | validated at registration |
| `events` | jsonb not null | non-empty list from the webhook event set |
| `secret` | varchar(64) not null | random `secrets.token_urlsafe(32)`; never returned after creation, never logged |
| `enabled` | boolean not null default true | |
| `created_at` | timestamptz not null default now() | |

The service enforces at most 5 per project under a project row lock.

Ruling: the HMAC secret and the A2A token are stored as-is, not encrypted. The delivery loop has to recompute signatures from the raw key, and the app has no encryption key to provision. The only other store, the macOS Keychain, is not available on Linux CI and is too slow to call per delivery. Both values are scoped to signing outbound webhooks. They are never returned after creation or shown in views, logs or errors. They are deleted with the project or account. The same database already holds the more sensitive CV text.

### `a2a_push_configs` (per-task A2A configs)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid not null | composite FK `(project_id, run_id)` → `runs` `ON DELETE CASCADE` |
| `run_id` | uuid not null | |
| `grant_id` | uuid not null | FK → `grants.id` `ON DELETE CASCADE` |
| `config_id` | varchar(128) not null | client-chosen A2A config id; `UNIQUE (run_id, config_id)` |
| `url` | varchar(2048) not null | |
| `token` | varchar(256) not null | client token, at least 16 characters, used as the HMAC key |
| `created_at` | timestamptz not null default now() | |

### `webhook_deliveries` (outbox and history)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid not null | FK → `projects.id` `ON DELETE CASCADE` |
| `endpoint_id` | uuid null | FK → `webhook_endpoints.id` `ON DELETE CASCADE` |
| `push_config_id` | uuid null | FK → `a2a_push_configs.id` `ON DELETE CASCADE` |
| `event_type` | varchar(40) not null | |
| `payload` | jsonb not null | the exact JSON body that will be sent |
| `status` | varchar(12) not null default `pending` | CHECK in (`pending`, `delivered`, `dead`) |
| `attempts` | integer not null default 0 | |
| `next_attempt_at` | timestamptz not null default now() | |
| `last_status_code` | integer null | |
| `last_error` | varchar(200) null | an error class or status text only, never a body |
| `created_at` | timestamptz not null default now() | |
| `delivered_at` | timestamptz null | |

- CHECK: exactly one of `endpoint_id` or `push_config_id` is set.
- Partial index on `(next_attempt_at)` where `status = 'pending'`.
- Index on `(project_id, created_at)`.

## Core service — `services/webhooks.py`

- `WEBHOOK_EVENTS = ("run.waiting_approval", "run.needs_input", "run.completed", "run.failed", "run.cancelled", "digest.ready")`.
- `RUN_EVENT_MAP = {"run_waiting_approval": "run.waiting_approval", "run_needs_input": "run.needs_input", "run_completed": "run.completed", "run_failed": "run.failed", "run_cancelled": "run.cancelled"}`.
- `sign(key: str, timestamp: int, body: bytes) -> str` returns the full header value `t=...,v1=...`.
- `async validate_url(url) -> None` raises `invalid_webhook_url`. It applies the https and SSRF rules unless `WEBHOOK_ALLOW_PRIVATE=1`.
- **`enqueue_for_run_event(db, run, event_row) -> int`**
  - It is called at the end of `services/runs.append_event`, in the same transaction.
  - For each `a2a_push_configs` row of the run whose grant is not revoked or expired, it inserts a delivery. The payload is the A2A `StreamResponse` JSON with `statusUpdate: {taskId, contextId, status}`, built from the same state mapping that A2A `tasks/get` uses. The mapping is extracted from `api/a2a.py` into a shared helper so the push and `tasks/get` never disagree.
  - For mapped run events, it inserts a delivery for each enabled project webhook subscribed to that event. The payload is `{"id": delivery_id, "type": "run.completed", "created_at": ..., "data": {"project_id", "run_id", "operation", "status", "job_revision_id"}}`. The data never includes document contents.
  - It inserts nothing for events that are neither a state change nor mapped.
- **`enqueue_digest(db, saved_search, items) -> int`**
  - FR-J05 calls it inside the digest transaction when the saved search has `push_enabled`.
  - The payload is `{"id", "type": "digest.ready", "created_at", "data": {"project_id", "saved_search_id", "name", "items": [{slug, title, company, cities, age_days, stale, source_url}]}}`.
- **`async deliver_due(now=None) -> int`**
  - It claims up to 10 pending rows due by `now`, using `FOR UPDATE SKIP LOCKED` in a short transaction. It moves `next_attempt_at` to `now + 5 min` as a lease, so a crash mid-send cannot double-send rapidly. Then it commits.
  - It sends concurrently with `httpx.AsyncClient(follow_redirects=False, timeout=10)`, after re-validating each URL.
  - Each result is written back in its own transaction:
    - 2xx → `delivered`
    - retryable failure → `attempts += 1`, then `next_attempt_at = now + backoff(attempts)`, or `dead` once the budget is spent
    - non-retryable failure → `dead`
  - A row whose endpoint has been disabled since it was queued goes straight to `dead` with `last_error="endpoint_disabled"`.
  - A row whose grant is no longer valid goes to `dead` with `last_error="grant_revoked"`.
- **Owner CRUD:**
  - `list`
  - `create`: returns the secret once.
  - `update`: changes `events` and `enabled`. The URL cannot be changed; to change it, delete and re-create the webhook.
  - `delete`
  - `send_test(endpoint)`: enqueues `ping` for that endpoint only.
  - `deliveries(project, limit=50)`
  - `redeliver(delivery)`: dead → pending, `attempts = 0`, `next_attempt_at = now`.
- **A2A configs:** `set_push_config`, `get_push_config`, `list_push_configs` and `delete_push_config`, each taking an actor, a run id and data. They check that the actor is the grant that created the run, the 5-per-task cap, the URL, and the token length.
- **`prune(now)`** deletes rows that are delivered or dead and older than 30 days.

### Supervisor

`WorkerSupervisor` gains a `deliveries` hook, `Callable[[], Awaitable[int]]`, run from its own loop every 2 s. It has its own error guard and log key `webhook_delivery_failed`, and it is cancelled on `close()`. `prune` joins housekeeping. `main.py` wires both.

## A2A (`api/a2a.py`)

- The four push-config handlers call the service. The SDK request and response protobufs carry `task_id`, `id`, `url`, `token` and `authentication`. `authentication` is accepted, but only `token` is used.
- **Errors:**
  - A foreign or unknown task returns `TaskNotFoundError`.
  - An invalid URL or a short token returns `InvalidParamsError`.
  - Exceeding the per-task cap returns `InvalidParamsError`.
- `on_list_tasks` lists runs created by this grant in its project.
  - Newest first.
  - Optional `status` filter, mapped through the same A2A state mapping.
  - `page_size` is at most 50 and defaults to 20.
  - `page_token` is an opaque base64 of `(created_at, id)`.
  - `history_length` and artifacts are ignored. Tasks come back as `tasks/get` returns them.
- The agent card sets `capabilities.pushNotifications: true`.

## REST (owner, `/api/v1`)

- `GET /projects/{project_id}/webhooks` returns `WebhookView[]` with `{id, url, events, enabled, created_at}`.
- `POST /projects/{project_id}/webhooks` with `{url, events}` returns 201 `WebhookCreatedView`, which is `WebhookView` plus `secret`.
  - 409 `webhook_limit` when the project already has 5.
  - 422 `invalid_webhook_url`.
- `PATCH /projects/{project_id}/webhooks/{webhook_id}` with `{events?, enabled?}` returns `WebhookView`.
- `DELETE /projects/{project_id}/webhooks/{webhook_id}` returns 204.
- `POST /projects/{project_id}/webhooks/{webhook_id}/test` returns 202 `{status: "queued"}`.
- `GET /projects/{project_id}/webhooks/deliveries` returns `WebhookDeliveryView[]` with `{id, endpoint_id, event_type, status, attempts, last_status_code, last_error, created_at, delivered_at}`. The payload is not included.
- `POST /projects/{project_id}/webhooks/deliveries/{delivery_id}/redeliver` returns 202. It returns 409 `delivery_not_dead` unless the delivery is dead.
- Saved searches: `SavedSearchUpdate` and `SavedSearchView` gain `push_enabled: bool`, default false. Migration 0025 adds the column to `saved_searches`.
- All of these routes are owner-only. Grants get 401 or 403.

## UI

- Project settings get a "Webhooks" section:
  - **List:** shows URL, event chips, an enabled switch, "Send test" and delete (with confirm).
  - **Add form:** an https URL and checkboxes for the six events.
  - **On create:** a one-time secret panel with a copy button and the warning "This secret is shown only once".
  - **Deliveries:** a table of the last 50 deliveries showing event, status badge, HTTP code, attempts and time, with "Redeliver" on dead rows.
  - **Help text:** how to verify `X-JSP-Signature`.
- In the Saved searches panel, each row gets a push toggle (`aria-pressed`) next to the email toggle. It is disabled, with a hint, when no enabled webhook subscribes to `digest.ready`.
- Copy is in Thai and English. The layout follows the last tracked DESIGN.md (`eb9bace^`), and nothing overflows at 320 px.

## Errors

- `not_found`
- `forbidden`
- `validation_error` (422)
- `invalid_webhook_url` (422)
- `webhook_limit` (409)
- `delivery_not_dead` (409)
- A2A: `TaskNotFoundError`, `InvalidParamsError`

## Testing

Backend (Postgres, plus a real local HTTP receiver: a small Starlette app on uvicorn in the test, with `WEBHOOK_ALLOW_PRIVATE=1` set):
- **Signature:** the receiver recomputes HMAC from the raw body, the timestamp and the key, and checks it matches. Headers `X-JSP-Event`, `X-JSP-Delivery` and `X-A2A-Notification-Token` (A2A only) are present.
- **Outbox atomicity:** a run event appended inside a rolled-back transaction leaves no delivery. A committed one leaves exactly one delivery per matching subscription.
- **Retries:**
  - 500 then 200 → `delivered` after 2 attempts, with `next_attempt_at` following the backoff.
  - Repeated 500s → `dead` after 8 attempts, using a fake clock and advancing time.
  - 404 → `dead` immediately.
  - 302 → `dead`, and the redirect target receives nothing.
  - Timeout is retryable.
- **SSRF:**
  - Without the env flag, `http://127.0.0.1`, `https://10.0.0.1` and `https://localhost` are rejected at registration.
  - A URL that passed registration but later resolves to a private address is rejected at send time, using a monkeypatched validator.
- **Revocation and disabling:** after a grant is revoked, its A2A configs get no new deliveries, and pending rows die with `grant_revoked`. A disabled endpoint's pending rows die with `endpoint_disabled`.
- **Limits:** 5 webhooks per project, 5 configs per task, token length.
- **Concurrency:** two concurrent `deliver_due` calls send each row once.
- **Redeliver and prune** both behave as specified.
- **Digest push:** a saved search with `push_enabled` and a `digest.ready` webhook produces a delivery with the digest items.
- **A2A through the real a2a client:** set, get, list and delete a push config. A task state change reaches the receiver as `statusUpdate`. Foreign tasks return not found. `tasks/list` returns only this grant's tasks, with status filter and paging. The agent card reports `pushNotifications: true`.
- **Cross-cutting:** the OpenAPI-wide cross-user sweep covers the new routes, and grants are denied on owner routes.

Playwright (synthetic API):
- Add a webhook, see the one-time secret, send a test, toggle, delete.
- The deliveries table, with redeliver on a dead row.
- The saved-search push toggle, enabled and disabled.
- 320 px in Thai.

## Out of scope

- Application-board events.
- User-configurable retry schedules.
- CloudEvents envelopes.
- Editing a webhook URL.
- A2A `authentication` schemes beyond `token`.
- Telegram.
