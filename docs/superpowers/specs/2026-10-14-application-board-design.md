# Application board (TOR FR-T01) — design

Status: owner-approved design, 2026-10-14. Branch `feat/application-board` from `origin/develop` (d58e60a).

## Goal

TOR FR-T01: "Application board: stage, event ledger, and recruiter email linking (existing)". The platform
does not fork freehire (ADR-015), so we build the feature here. When it is done, a job seeker sees every job in
a project as a card on a stage board, moves cards between stages, reads each application's history, and keeps
a recruiter contact with a log of correspondence. A customer can try it on the local app with no server.

## Constraints

- TOR §1: no duplicate application submissions, and no channel that sends email out of the platform.
- TOR FR-T03: the user sends real email themselves; agents only draft.
- TOR FR-P07: REST, MCP and A2A share one core. Agent tools are direct skills in `services/skills.py`.
- Isolation: every route authorizes through `authorize()`. The OpenAPI-wide cross-user test covers new routes.
- Lock order stays project before user. Writes lock the status row (`FOR UPDATE`) before appending events.

## Decisions (grill round 1, all as recommended)

1. **Recruiter email = (a).** Store one contact per application. A `mailto:` button opens the user's own mail
   client. The user logs sent and received mail by hand. Inbound capture (IMAP, forwarding address) is out of
   scope until after deploy.
2. **Stages:** `saved → applied → responded → interview → offer → hired`, plus `rejected` and `withdrawn`,
   reachable from any stage. The names follow Career Ops `funnel-stages.mjs`. Existing `saved`/`applied` rows
   stay valid.
3. **Transitions are free,** including backwards, with two guards: an owner may set `applied` directly
   ("applied outside the platform"), and the `apply_submit` approval also sets it. The ledger records every
   change.
4. **Cards are every non-removed job revision in the project.** A job with no status row is `saved`.
5. **One board per project.**
6. **Append-only ledger** of five event kinds (below), with the actor recorded on every event. The current
   stage stays in `job_application_statuses`.
7. **Agents (grants) can read the board and ledger, write notes, and move stages,** except to `saved` or
   `applied`. Writing needs the new capability `applications:write`.
8. **Board UI:** stage columns, a keyboard-accessible "Move to…" menu per card, and vertical columns on mobile.
   No drag-and-drop library.
9. **The board replaces "Saved jobs"** in the project sidebar. The job detail page gains an application section.

Approach A: extend `job_application_statuses` and add one append-only table. Approach B (a separate
`applications` table) and C (pure event sourcing) were rejected as larger with no present need.

## Data model — migration `0023_application_board`

### `job_application_statuses` (existing)

- Widen `ck_job_application_status_value` to the eight stages.
- Add nullable `contact_name` (String 200), `contact_email` (String 320), `contact_role` (String 200).
- No other change. The composite FK to `job_revisions` with `ON DELETE CASCADE` stays.

### `application_events` (new)

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID not null | composite FK `(project_id, job_revision_id)` → `job_revisions` `ON DELETE CASCADE` |
| `job_revision_id` | UUID not null | |
| `kind` | String(32) not null | CHECK in the five kinds |
| `actor_scope` | String(80) not null | `user:<id>`, `grant:<id>`, or `migration` |
| `payload` | JSONB not null | shape per kind, below |
| `created_at` | timestamptz not null, default `now()` | |

Index on `(project_id, job_revision_id, created_at)`.

Event kinds and payloads:

- `stage_changed` — `{"from": stage, "to": stage}`
- `note` — `{"text": str}` (1–2000 chars)
- `contact_updated` — `{"name": str|null, "email": str|null, "role": str|null}` (the new values)
- `email_logged` — `{"direction": "sent"|"received", "subject": str (1–300), "occurred_on": date, "note": str|null (≤ 2000)}`
- `applied_via_approval` — `{"from": stage, "approval_id": uuid, "pack_run_id": uuid}`

**Immutability.** A trigger `application_events_append_only` runs `BEFORE UPDATE OR DELETE`:
- It always rejects UPDATE.
- It rejects DELETE unless the parent `job_revisions` row or `projects` row no longer exists. That is the case
  during FK cascades from project deletion and the account purge (FR-U04). A test covers both paths.

**Backfill.** For each existing status row with `status = 'applied'`, insert one `stage_changed`
`{"from": "saved", "to": "applied"}` event with `actor_scope = 'migration'`. This keeps the duplicate guard
consistent for old data.

## Core service — `services/applications.py`

One module owns all reads and writes; REST and the direct skills call it.

- `STAGES` (ordered tuple), `CLOSED = {"rejected", "withdrawn"}`, `AGENT_TARGETS = {"responded", "interview", "offer", "hired", "rejected", "withdrawn"}`.
- `application_recorded(db, project_id, job_id) -> bool`: true if any `applied_via_approval` event exists, or
  any `stage_changed` event with `to = "applied"`, or the current stage is in `{responded, interview, offer, hired}`.
- `board(actor, project_id) -> list[ApplicationCard]`: each card carries the job id, title, company,
  `created_at`, stage, `has_contact`, and `last_activity_at` (the newest event, else the job's `created_at`).
- `detail(actor, project_id, job_id) -> ApplicationDetail`: stage, contact, and the newest 200 events, newest first.
- `set_stage(actor, project_id, job_id, stage)`: lock or upsert the row, no-op if unchanged, otherwise append
  `stage_changed`. Grants are limited to `AGENT_TARGETS` and need `application_recorded`, else
  `application_not_applied`. Owners may set any stage.
- `set_contact(actor, project_id, job_id, name, email, role)`: owner only. Email is validated. Appends
  `contact_updated`.
- `add_event(actor, project_id, job_id, kind, payload)`: owners may add `note` and `email_logged`; grants may
  add `note` only.
- `record_applied_via_approval(db, run, approval, job_id)`: called inside `_finish_submission` in
  `services/approvals.py`. It replaces the inline status write there.

Authorization:
- New resource kind `application`.
- Owners pass through the user branch.
- Grants: read needs `results:read`, write needs `applications:write`.
- `job_revision_id` must belong to the project (`require_scoped_id`) and have `removed_at IS NULL`, else `not_found`.

### Fixes in existing code

- `services/runs.py::_application_checks` and the `submit_application` check in `services/approvals.py`
  compare `status == "applied"`. Both switch to `application_recorded`.
  - Follow-up drafting is allowed once the application is recorded.
  - `apply_submit` raises `already_applied` whenever it is recorded. Moving a card back to `saved` does not
    re-enable submission. This is the TOR "no duplicate per (user, job)" rule.
- `Capability` in `services/contracts.py` gains `"applications:write"`, and so do the frontend capability lists
  (`ProjectSharing.tsx`, console `copy.ts`, `AgentsTab.tsx`).

## REST (owner)

All routes sit under `/api/v1`. They use the existing owner and write dependencies and are added to
`docs/contracts/application-api.yaml`.

- `GET /projects/{project_id}/applications` returns `list[ApplicationCardView]`.
- `GET /projects/{project_id}/jobs/{job_id}/application` returns `ApplicationDetailView`.
- `PATCH /projects/{project_id}/jobs/{job_id}/application-status` already exists. Its body and view widen to
  the eight stages, and it delegates to `set_stage`.
- `PUT /projects/{project_id}/jobs/{job_id}/application/contact` takes `{name, email, role}` and returns the detail.
- `POST /projects/{project_id}/jobs/{job_id}/application/events` takes `{kind: "note"|"email_logged", ...}` and
  returns 201 with the event.
- The `application_status` field on job views widens to the eight stages.

## Agent skills (MCP, A2A, REST agent tools)

Both are direct skills with no Run:
- `applications_list`
  - Capability `results:read`.
  - Input `{job_id?: uuid}`. Without `job_id` it returns the board; with it, the detail.
- `applications_update`
  - Capability `applications:write`.
  - Input `{job_id: uuid, stage?: one of AGENT_TARGETS, note?: str}`, with at least one of `stage` or `note`.
  - Returns the detail.

Both appear in the skill registry, the agent card, and the extended agent card through the existing mechanisms.

## UI

- **Sidebar:** "Saved jobs" becomes "ใบสมัคร / Applications" and links to `/app/projects/:id/applications`.
  The old `/app/projects/:id/jobs` redirects there. Job detail stays at its current route, and its back link
  points to the board.
- **Board page:**
  - Six columns for the active stages, plus a collapsible "Closed" group for `rejected` and `withdrawn`.
  - Each card shows the title, company, posting age, and a contact indicator.
  - Each card has a "Move to…" menu, a native or Radix menu reachable by keyboard.
  - Columns scroll horizontally on desktop and stack vertically below `md`. Nothing overflows at 320 px.
  - The empty state links to job search.
- **Job detail page:** a new application section with:
  - A stage select.
  - A contact form (name, email, role).
  - A "Write email" `mailto:` link (subject `Re: <job title>`) shown when an email exists.
  - "Log correspondence" (direction, subject, date, note) and "Add note".
  - A timeline with an actor label: "คุณ / You", "เอเจนต์ / Agent", "ระบบ / System".
- The overview counts switch to board stages: saved, applied-onward (`application_recorded`), and documents.
- All copy comes in Thai and English. The design follows the last tracked `DESIGN.md` (`eb9bace^`): indigo
  accent, shadcn primitives, 40 px minimum targets.

Stage labels (th / en):
- saved: บันทึกไว้ / Saved
- applied: สมัครแล้ว / Applied
- responded: ได้รับการตอบกลับ / Responded
- interview: สัมภาษณ์ / Interview
- offer: ได้รับข้อเสนอ / Offer
- hired: ได้งาน / Hired
- rejected: ไม่ผ่าน / Rejected
- withdrawn: ถอนตัว / Withdrawn

## Errors

- `not_found`: wrong project, removed job, or another user's job.
- `forbidden`: a grant without the capability, or a grant attempting an owner-only action.
- `application_not_applied`: an agent stage move before the application is recorded, or a follow-up before applied.
- `already_applied`: `apply_submit` after the application is recorded, for this card or for a card with the same source URL (`utm_*` ignored) in any project of the same user (TOR FR-T02, one submission per user and job).
- `validation_error` (existing 422 handler, via DTO validation): bad stage, oversize text, bad email, or neither `stage` nor `note`.

## Testing

Backend (Postgres):
- Each stage move appends exactly one event. A same-stage move appends none.
- The trigger rejects UPDATE and direct DELETE. Project deletion and the account purge cascade-delete events.
- Backfill: a pre-existing `applied` row gets one `migration` event.
- A grant cannot set `saved` or `applied`, cannot move a never-applied job, and cannot set a contact or log
  email. It can add a note with `applications:write`. Without the capability it gets `forbidden`.
- Duplicates: `applied`, then move back to `saved`, then `apply_submit` gives `already_applied`. The approval
  path writes `applied_via_approval`.
- A follow-up is allowed at `interview` and refused at `saved`.
- The cross-user OpenAPI sweep picks up the new routes. MCP and A2A tool calls for both skills are covered.

Playwright:
- Move a card by keyboard, then reload and check it persisted.
- Add a contact, check the `mailto:` href, log correspondence, add a note, and check the timeline order.
- The closed group collapses.
- At 320 px nothing overflows. Run the axe accessibility check and both locales.
- Update existing specs that reference "Saved jobs" or the two-value status.

## Out of scope

- Inbound email capture (after deploy, since it needs a server).
- Drag-and-drop.
- A cross-project board.
- Reminders and notifications.
- Multiple contacts per application.
- FR-T02 auto-apply changes beyond the duplicate guard.
