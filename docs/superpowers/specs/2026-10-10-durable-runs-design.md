# Durable runs, needs_input, tracing and requester — design

Status: the owner approved the decisions on 2026-10-10 (grill round 1, Q10–Q13, "as recommended"). The owner then authorized autonomous execution and will review this spec afterwards.
This is phase 5 of the TOR AI roadmap. It covers FR-A03, FR-A02, FR-A01 and the LLM tracing row of the TOR technology table. ADR-013 supersedes the manual-retry rule in ADR-003. ADR-012 was used in phase 3.

## Goal

- A run that was working when the server stopped resumes by itself after restart, once, and visibly.
- A run that needs the owner's input waits in a distinct `needs_input` state. That state does not block the project queue.
- Every LLM round records its model, latency and token usage. Spans can optionally be exported over OTLP.
- The timeline shows who requested each run.

## FR-A03: automatic resume (ADR-013)

- `runs.resume_count INTEGER NOT NULL DEFAULT 0`, plus a check that it is ≥ 0.
- Today, interruption happens in two places: `RunSupervisor.close()` on graceful shutdown (`_finish_interrupted`) and `reconcile_startup()` after a crash (`_mark_interrupted`). Both change to call a single `queue.interrupt_or_resume(run_id, reason)`:
  - If the run is `queued` or `running`, cancellation has not been requested, `resume_count == 0` and the operation is resumable, it moves back to `queued`. `resume_count` becomes 1, and the lease, heartbeat and `active_started_at` are cleared. `active_seconds` and `tool_calls` are kept, so the FR-A06 limits still bound the total. The run gets the event `run_resumed` `{"status": "queued", "message_key": "events.run_resumed"}`.
  - Otherwise the run becomes `interrupted`, exactly as today. That covers a second interruption, cancellation requested, and non-resumable operations.
  - A run in `waiting_approval` keeps waiting. It holds no sandbox, and its approval is still valid.
  - A run in `needs_input` is untouched.
- Every operation is resumable, because each round restarts from the beginning and output is published only at the end. `export_document`, `profile_cv` and `extract_experience` are idempotent by construction: publication is atomic, extraction is additive with a hash-unique bank, and the profile skips when present.
- When the dispatcher claims a resumed run, the new sandbox starts clean. Pending artifacts from the interrupted attempt are already handled by `_reconcile_pending_artifacts`.
- Manual retry (`retry_of_id`) is unchanged for `failed`, `cancelled` and `interrupted` runs.
- DELIVERY.md says interrupted work "cannot silently resume". The `run_resumed` event makes every resume visible in the timeline, and a cancellation is never resumed.

## FR-A02: `needs_input`

- `RunStatus` gains `needs_input`, and the `ck_runs_status` check is rebuilt to include it. `needs_input` does **not** count as active: it is excluded from `uq_runs_one_active_per_project` and from `claim_next`'s busy set.
- Producers:
  - An `apply_prepare` run whose pack is `parked` finishes in `needs_input` instead of `completed`.
  - An interactive `tailor_cv` run finishes in `needs_input` instead of `completed`.
- Consumers move the run to `completed`:
  - `POST /projects/{pid}/runs/{run_id}/input`, body `{"answers": {"<question_id>": "<text>|true|false|<choice>"}}`. It is owner-only and works on a parked `apply_prepare`. The owner's answers are the candidate's own, so they are not evidence-gated. They are validated against the question kind and choices. They fill only `null` answers. Each gets `"source": "owner"` and the run's `state` is recomputed. If every required answer is now filled, the run becomes `completed` with `state: ready`. Otherwise it stays `needs_input` and the response lists what is still missing.
  - `POST /tailor/apply` moves the interactive tailor run to `completed`, as well as queuing the export. Applying again gives `tailor_already_applied`, which closes the phase 3 deferred minor about double apply.
  - Cancel works on `needs_input` and moves it to `cancelled`.
- Mapping and UI: A2A maps `needs_input` to `TASK_STATE_INPUT_REQUIRED`. MCP `get_run` and REST show the status. Terminal-state sets everywhere (A2A cancel loop, SSE end, UI polling) must treat `needs_input` as a resting, non-terminal state that stops polling.
- `apply_submit` uses only `completed` + `ready` packs. That works unchanged once the input endpoint completes a pack.
- The UI gets status copy in Thai and English. A parked pack shows input fields for the missing answers and a Save button.

## Tracing (Q12)

- The bridge reports usage per result. `infra/hermes/native_bridge.py` already gets the Hermes `run_conversation` result. Add `usage` `{"model", "input_tokens", "output_tokens"}` to the bridge's result message when Hermes exposes it (look in the AIAgent result/session for token counts), and otherwise `null` fields. Never include the prompt or the output.
- The backend measures each LLM round's wall latency around `runtime.submit` + `_await_result`. It appends `run_progress` `{"step": "llm_round", "model": str|null, "latency_ms": int, "input_tokens": int|null, "output_tokens": int|null}`. `RunEventData` gains these 4 optional fields with bounds.
- OpenTelemetry uses the pinned `opentelemetry-api`, `opentelemetry-sdk` and `opentelemetry-exporter-otlp-proto-http`.
  - New `integrations/tracing.py`: `configure()` is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. When it is set, it installs a BatchSpanProcessor with the OTLP HTTP exporter and service name `job-search-platform`.
  - `span(name, **attrs)` is a context manager that is cheap when tracing is disabled.
  - Spans are `run.execute` (operation, run id, project id) and `llm.round` (model, latency, tokens). They carry no content.
  - Call `configure()` once in `main.create_app`.
  - Run pip-audit after the lock update, and add the new deps to `docs/engineering/dependencies.md`.
- UI: the run timeline shows per-round model, latency and tokens, and a run total.

## FR-A01: requester in the timeline

- `grants.label VARCHAR(80) NULL`. `GrantIssueRequest.label` is optional, `GrantView.label` is added, and the grant issue form gets an optional name field.
- `RunView` gains `requester: {"kind": "owner"} | {"kind": "agent", "grant_id": UUID, "label": str|null}`, derived from `actor_scope`: `owner` or `grant:<id>`, with the grant's label looked up.
- The Console timeline shows "You" or "Agent · <label or first 8 of the grant id>", in Thai and English.

## Data

Migration `0018_durable_runs` adds:
- `runs.resume_count`
- the `ck_runs_status` rebuild with `needs_input`
- the active index predicate rebuilt to exclude `needs_input` (it keeps the apply_submit exemption)
- `grants.label`

The downgrade is blocked while any run is in `needs_input`.

## Testing

**Unit tests**
- The `interrupt_or_resume` decision table: first versus second interruption, cancellation requested, `waiting_approval` and `needs_input`.
- Tracing is a no-op when disabled. With an in-memory exporter, the span attributes contain no content.

**Integration tests**
- Graceful close with an active run gives `queued`, `resume_count` 1 and a `run_resumed` event. The re-claim then completes with a fake runtime.
- A second interruption gives `interrupted`.
- Startup reconcile with a recorded container and a running run gives a resume.
- Cancellation requested before the restart gives `interrupted`/`cancelled` and never queued.
- `waiting_approval` survives a restart.
- A parked `apply_prepare` gives `needs_input`, and the project can still claim another run. The input endpoint fills the missing answers, the run reaches `completed`/`ready`, and `apply_submit` is then accepted.
- An interactive tailor gives `needs_input`. Apply moves it to `completed`, and applying twice gives `tailor_already_applied`.
- A2A get_task on a `needs_input` run returns INPUT_REQUIRED.
- `llm_round` events carry model, latency and tokens. Tokens are null when the fake runtime gives no usage.
- `RunView.requester` for an owner run and a labelled grant run.

**Other checks**
- The contract YAML and OpenAPI test pass.
- E2E: one spec covering the timeline requester, the per-round stats, the needs_input pack answer form, and the grant label field.
- Live smoke, at most 10 calls:
  - Restart the app during an autopilot tailor. The run should resume once and complete.
  - One apply_prepare run should reach needs_input, then be completed via the input endpoint.
  - The llm_round events should show real token counts if Hermes exposes them.
