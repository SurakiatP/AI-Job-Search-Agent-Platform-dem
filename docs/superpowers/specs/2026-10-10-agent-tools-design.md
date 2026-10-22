# Agent tools — design

Status: the owner approved the decisions on 2026-10-10 (grill round 1, Q3, Q8 and Q9, "as recommended"), then authorized autonomous execution and will review this spec afterwards.
Phase 4 of the TOR AI roadmap. It covers FR-J02, FR-J03 and FR-J04 for agents, FR-T02 and FR-A05 (option B), and FR-T03.

## Goal

External agents get the job-search toolset through the same registry, with the same scopes and the same three transports.
- Reads (search, fit) are direct calls that create no Task.
- Actions with side effects (prepare an application, submit it, draft a follow-up) are Tasks.
- Submitting always needs the owner's approval, and the owner sends the application on the company site. The system never submits a form and never sends email.

## Registry changes (`services/skills.py`)

`Skill` gains three fields:
- `kind: Literal["task", "direct"] = "task"`
- `handler: Callable[[Services, Actor, BaseModel], Awaitable[dict]] | None = None`, which is required when `kind == "direct"`
- `output_model: type[DTO] | None = None`, used for MCP structured output and docs

Task skills keep `id == Operation`. Direct skills are not operations and must never reach `ProtocolRuns.submit`; a unit test pins this. `Operation` gains only the task ids added below. Direct skill ids live in the registry alone.

| Skill | Kind | Capability | Notes |
|---|---|---|---|
| `jobs_search` | direct | `jobs:search` (new) | FR-J02 and FR-J04 |
| `jobs_fit` | direct | `jobs:evaluate` | FR-J03, deterministic only |
| `apply_prepare` | task | `applications:apply` (new) | FR-T02 |
| `apply_submit` | task | `applications:apply` | FR-A05, always gated by approval |
| `draft_follow_up` | task | `documents:draft` | FR-T03 |

## Direct calls

**`jobs_search`**
- Input `AgentJobSearch`: `q`, `cities`, `work_mode`, `posted_within_days`, `category`, `limit` (1–50, default 20) and `description_format: "markdown" | "text"` (default markdown).
- The handler reuses `services/job_sources.search_jobs`, which already returns the full description in Markdown with `age_days` and `stale`.
- For `text`, strip Markdown with a small, deterministic function in the same module.
- Output: `{"jobs": [{"source_id", "title", "company", "city", "work_mode", "posted_at", "posting_age_days", "stale", "source_url", "description", "description_format"}]}`.
- Upstream failures map to `ServiceError("job_source_unavailable")`.

**`jobs_fit`**
- Input: `job` (JobCreate) or `job_revision_id`, plus optional `cv_id`.
- The handler loads the project's current CV text (stored `CVRevisionText`; if none is stored, return `cv_text_unavailable`) and runs `compute_skill_coverage`.
- Output: `{"method": "keyword_dictionary_v1", "ratio", "required", "matched", "missing"}`, or `{"method", "ratio": null, "reason": "too_few_skills"}`.
- It never calls an LLM and creates no run. The LLM fit stays in `evaluate_job`.

**Transports**
- REST: `GET /api/v1/projects/{project_id}/agent/jobs/search` (query parameters) and `POST /api/v1/projects/{project_id}/agent/jobs/fit`. These use the same `run_actor` auth (owner cookie or project grant), and `authorize` checks the capability.
- MCP: a direct skill becomes a tool that awaits its handler and returns the output as structured content. The loop in `api/mcp.py` branches on `kind`.
- A2A: `SendMessage` with a direct `skill_id` returns a `Message` (role agent, one data part) instead of a `Task`. Use the SDK's `Message` type, which the handler already supports as a return. The extended card lists direct skills under the same capability filter.
- Authorization: `authorize` learns direct skill ids as resource kinds whose needed capability comes from the registry. `GRANT_WORK_RESOURCES` stays task-only, and a new `GRANT_READ_RESOURCES = {direct ids}` covers the direct skills.

## Tasks

**`apply_prepare` (FR-T02)**
- Input `ApplyPrepareInput`: `ProtocolJobInput` fields plus `questions: list[{id (1–64 chars), label (1–500), required: bool, kind: "text"|"choice"|"boolean", choices?: list[str]}]`, with 1–40 questions. The agent or the owner supplies the questions from the form; the system never fetches forms.
- Execution:
  - One LLM call drafts the answers from the CV text and the bank facts with their ids.
  - Each answer cites `evidence_ids`, or is `null` when it cannot be answered from those facts. Answers to boolean and choice questions must be valid options.
  - `apply_gated`-style claim checks run on the answer text against the cited facts (numbers and skills). A failing answer becomes `null`.
- Result: `result_payload = {"kind": "apply_pack", "state": "ready"|"parked", "answers": [{"question_id", "answer"|null, "evidence_ids", "reason"?}], "missing_required": [ids]}`. The pack is `parked` whenever a required answer is `null`. The run finishes `completed`; phase 5 changes parked to `needs_input`.
- Duplicate rule: one live prepare per (project, job revision). A new `apply_prepare` for the same job while one is queued or running gets `document_busy`. When a completed ready pack exists, the new run is still allowed and acts as a refresh. Submit always uses the latest ready pack.

**`apply_submit` (FR-A05, option B)**
- Input: `job_revision_id`.
- Requirements: a completed, `ready` `apply_prepare` pack for that job, and the job must not already be `applied`. Otherwise the call fails with `apply_pack_required` or `already_applied`.
- Effect: it creates an approval with the new action `submit_application`, whose target is the prepare run id. The run waits in `waiting_approval`, using the existing approval machinery.
- When the owner approves:
  - Set `JobApplicationStatus` to `applied`.
  - Record a run event `application_recorded`.
  - The run completes, and its `result_payload` points to the pack.
  - The system sends nothing.
- When the owner denies, the run is cancelled.
- No autopilot budget for now. Every submit needs approval.

**`draft_follow_up` (FR-T03)**
- `DraftKind` gains `follow_up`. The new operation `draft_follow_up` executes as `draft_documents` with `draft_kind="follow_up"`.
- It is allowed only when the job's application status is `applied`; otherwise `application_not_applied`.
- The output is a document like the others. No email is ever sent, and the UI only offers copy.

## Data

Migration `0017_agent_tools`:
- `ck_runs_operation` adds `apply_prepare`, `apply_submit` and `draft_follow_up`.
- The approvals action check adds `submit_application`.
- `approvals.target_run_id UUID NULL`.
- The document_type checks add `follow_up` wherever they exist.
- The downgrade is blocked while any row uses the new values.

## Security

- `applications:apply` is a new capability, and grants need it explicitly.
- An agent can prepare and request a submit but can never approve.
- The answer pack holds CV-derived text, so it is hidden from grants without `results:read`, using the same `_authorized_view` rule as phase 3.
- Questions are untrusted input. They are capped, and the prompt marks them as data.
- `jobs_fit` exposes coverage lists (skill names) to `jobs:evaluate` holders, the same data evaluate_job already returns.

## UI (DESIGN.md, Thai and English)

- Console approvals render `submit_application`: job title, the answers with their evidence counts, and a missing list. Approving says it "records applied; you submit on the company site".
- The job detail shows the latest answer pack with copy buttons, and a "Draft follow-up" action for applied jobs.
- The grant picker gains `jobs:search` and `applications:apply`.

## Testing

- Unit tests:
  - Registry invariants: direct skills are not in `Operation`, they have handlers, and the capabilities are valid.
  - Markdown-to-text.
  - Parsing answers from the apply-pack.
- Integration tests:
  - `jobs_search` with a patched upstream returns full descriptions plus age and stale data, and text mode strips Markdown.
  - `jobs_fit` returns a deterministic result with no run row created.
  - Capability denials on every transport.
  - A2A direct returns a Message.
  - MCP direct tools appear in the tool list, and the golden fixture is extended without changing old entries.
  - `apply_prepare` with a fake runtime: a ready pack, a parked pack, an unsupported claim nulled, and the duplicate-run busy check.
  - `apply_submit`: approval created, approve marks applied, deny cancels, and the already-applied and no-pack refusals.
  - `draft_follow_up` is refused unless applied, and works with a fake runtime.
  - The payload is hidden without `results:read`.
- Contract: the YAML is updated and the OpenAPI test passes.
- E2E: one spec covering the approval render, the pack view, the follow-up action and the grant capabilities.
- Live smoke, at most 10 calls: search and fit (no LLM), one `apply_prepare`, and one `draft_follow_up`.
