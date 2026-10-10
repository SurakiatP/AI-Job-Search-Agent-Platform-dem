# Experience bank and evidence gate — design

Status: approved in chat 2026-10-10 (Q1–Q5, approach 1, sections 1–5 "as recommended"); this spec awaits owner review.
Phase 1 of the TOR AI roadmap (Python stack). Covers TOR FR-C01 and FR-C02. Phase 3 (CV tailoring, FR-C03) consumes the gate defined here.

## Goal

Every fact the AI may use about the candidate lives in one per-project bank, in the candidate's own words, with a stable id.
Any CV edit the AI writes must cite those ids; the service layer rejects edits that do not.
Uploading a new CV only adds facts; it never deletes existing ones.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | How do facts enter the bank? | The LLM extracts them on CV upload and they are stored at once as candidate facts. The owner can add, edit or remove items later. |
| Q2 | What does the gate cover? | CV edits only (TOR "every edit"). Cover letters and application messages get a prompt rule instead: use only bank facts, add no new facts. No service gate for them. |
| Q3 | Bank scope | One bank per project. Every CV in the project feeds it; tailoring any CV may cite any item. |
| Q4 | Granularity | One item = one fact (a bullet), with optional context: role, organization, period. |
| Q5 | External callers | No access. The bank is used inside the server only. Grant callers (REST/MCP/A2A) see results and cited `evidence_id`s, never the bank. Matches ADR-002 (no raw CV for callers). |
| A | Extraction engine | A new Hermes run, `extract_experience`, like `evaluate_job`. Works with every configured provider and reuses the sandbox, the 30 tool-call cap, cancellation and accounting. |

## Data model

New table `experience_items` (migration 0015):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | The `evidence_id` the AI cites |
| `project_id` | uuid FK `projects.id` ON DELETE CASCADE | |
| `kind` | varchar, CHECK in `experience, education, skill, certification, project, other` | |
| `text` | text, CHECK length 1–1000 | One fact, candidate's words |
| `role`, `organization` | varchar(200), nullable | Context |
| `period` | varchar(60), nullable | Free text, e.g. "2022–2024" |
| `source` | varchar, CHECK in `cv, owner` | Both are candidate provenance |
| `source_cv_revision_id` | uuid, nullable; composite FK `(project_id, source_cv_revision_id)` → `cv_revisions` | Set when `source = cv` |
| `text_hash` | char(64) | sha256 of the normalized text |
| `created_at` | timestamptz default now() | |
| `removed_at` | timestamptz, nullable | Soft removal |

Constraints:

- `UNIQUE (project_id, text_hash)` across removed rows too. A fact the owner removed is not re-added by a later extraction.
- `CHECK (source = 'owner') = (source_cv_revision_id IS NULL)`.
- Item text is immutable. An owner "edit" inserts a new item and soft-removes the old one in one transaction, so earlier citations still resolve.
- At most 1,000 live items per project (`bank_full` when exceeded).

There is no separate `provenance` column. Only the candidate (via a CV or the owner UI) can add items, so every row is candidate provenance. Add a column only when a non-candidate source exists.

Migration 0015 also widens the run constraints:

- `ck_runs_operation` adds `extract_experience`.
- `ck_runs_context_required` allows `extract_experience` with a provider and no session or job.

### Normalization

`normalize(text)`: Unicode NFKC, Thai digits to Arabic, curly quotes and dashes folded to ASCII (`’‘` to `'`, `“”` to `"`, `–—‒−` to `-`), lowercase, strip leading bullet markers per line (`•`, `*`, `·` and similar; `-` or digits followed by `.` or `)` only when whitespace follows, so `4.0 GPA` and `-5%` keep their numbers), collapse all whitespace runs to one space, strip. Thai text passes through NFKC unchanged apart from whitespace. `text_hash = sha256(normalize(text))`.

## Extraction run

Trigger:

- `POST /projects/{pid}/cvs/{cv_id}/profile` (`api/rest.py`) already queues `profile_cv` after upload. It now also queues `extract_experience` for the same latest published revision when a global provider is configured. Without a provider nothing is queued; the UI explains why.
- `POST /projects/{pid}/cvs/{cv_id}/experience-runs` queues it on demand (for example after the owner sets a provider). If a queued or running `extract_experience` exists for that revision, it is returned instead.
- The automatic trigger is skipped when a completed `extract_experience` already exists for the revision. The on-demand route always creates a new run when none is active.
- Both obey `MAX_QUEUED_PER_PROJECT` and the one-active-run-per-project index.

Run record: `operation = "extract_experience"`, `actor_scope = "owner"`, `cv_revision_id` = the revision, provider configuration snapshotted like `evaluate_job`, `session_id` and `job_revision_id` NULL, `output_language = "en"`.

Executor (`workers/executor.py`), new `_execute_extract` next to `_execute_profile`:

1. `_materialize` the CV in the sandbox and get `parsed.text`.
2. Submit a prompt to Hermes under the existing tool-call cap. The prompt asks for JSON `{"items": [{"kind", "text", "role", "organization", "period"}]}` and says: copy each fact verbatim from the CV, one bullet per item, do not paraphrase, merge or invent.
3. `parse_experience_items(native_result)` validates the shape with pydantic. Malformed output fails the run with `errors.execution_failed`; no native text or traceback is exposed.
4. Verify each item: `normalize(item.text)` must occur in `normalize(parsed.text)` without splitting a Latin word or number (an item edge in `[a-z0-9]` needs a non-`[a-z0-9]` neighbour, so `Java` does not match inside `JavaScript`; Thai edges match as plain substrings). Items that fail are dropped and counted as `rejected`. Role, organization and period are kept only when they occur in the CV the same way; otherwise they are stored as NULL. This is the guard against facts invented during extraction.
5. Insert with `ON CONFLICT (project_id, text_hash) DO NOTHING`, `source = "cv"`. Conflicts count as `duplicates`. Stop inserting at the 1,000-item cap and count the rest as `rejected`.
6. Append run event `experience_extracted` with `{added, duplicates, rejected}` and finish `completed`.

Visibility: `extract_experience` joins `export_document`, `profile_cv` and `match_jobs` as owner-only. It is excluded from grant run views (`services/runs.py`), from the owner timeline filter of internal runs (`api/rest.py`), and from MCP tools and the A2A Agent Card.

CV text already goes to the configured provider for evaluation; extraction adds no new data path.

## Evidence gate

New module `services/evidence.py`:

```python
class EvidencedEdit(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)

def require_evidence(db: Session, project_id: UUID, edits: Sequence[EvidencedEdit]) -> None:
    """Reject any AI-written edit that does not cite live candidate evidence in this project."""
```

Rules, all deterministic:

1. Each edit cites at least one id (`missing`).
2. Every cited id is a live item (`removed_at IS NULL`) in the same project; one query per batch (`unknown`).
3. Every number token in the edit text (integers, decimals, percentages, years; Thai digits normalized to Arabic) appears in the text or period of at least one cited item (`unsupported_number`).

Any failure raises `ServiceError("evidence_required", fields={"edits.<index>": "<reason>"})` and rejects the whole batch.

Limits: the gate proves that citations exist and that numbers match. It cannot prove each sentence is fully supported by its evidence. Phase 3 shows every edit next to its cited evidence for owner review.

Phase 1 has no production caller. Phase 3 (`tailor_cv`) is the first.

Drafts (Q2): the `draft_documents` prompt in the executor includes the live bank items (text and context) with the rule "use only the facts listed; do not add new facts". With an empty bank the prompt is unchanged.

## REST API

Owner-only. A grant actor gets `forbidden`. Existing CSRF, error envelope and correlation rules apply. Responses never include CV text, only bank items.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/projects/{pid}/experience` | Live items ordered by organization, period, created_at |
| POST | `/projects/{pid}/experience` | Owner adds an item (`source = owner`); `duplicate` (409) on hash conflict, `bank_full` at the cap |
| PUT | `/projects/{pid}/experience/{id}` | New item plus soft removal of the old one; returns the new item |
| DELETE | `/projects/{pid}/experience/{id}` | Soft removal (204) |
| POST | `/projects/{pid}/cvs/{cv_id}/experience-runs` | Queue extraction for the latest published revision (202, `RunView`) |

Item view: `id, kind, text, role, organization, period, source, source_cv_id, source_cv_name, created_at`.

All routes and DTOs are added to `docs/contracts/application-api.yaml`; the existing contract test covers them.

## UI

A new section "คลังประสบการณ์ / Experience bank" on the CV & preferences page (`frontend/src/features/profile/ProfilePage.tsx`), below the CV list. No new route: DESIGN.md assigns the source CV to this page.

- Items grouped by role, organization and period. Each shows its text, a source label ("From CV: <name>" / "Added by you") and edit and remove buttons.
- Add form: kind, text, role, organization, period. Native labels, inputs at least 16px.
- Extraction status:
  - queued and running show a stop button.
  - completed shows "Added X, duplicates Y, dropped Z (not found in the CV)".
  - failed and interrupted show retry.
  - All statuses are announced through `aria-live`.
- Empty states: no CV (upload button), no provider (link to Settings), and an empty bank (extraction in progress, or add manually).
- Thai and English copy live in the feature copy file. No animation. No horizontal overflow at 320px.

## Tests

Backend (`backend/tests/`, real PostgreSQL like existing suites):

- `test_experience_items.py`: hash dedup, removed facts not re-added, edit = new item plus removal, 1,000 cap, project cascade.
- `test_experience_extract.py` (fake native result):
  - Verbatim items are added; paraphrased or invented items are counted as rejected.
  - Malformed JSON fails without leaking native text.
  - Thai CV normalization works.
  - A second CV upload keeps every earlier item (FR-C01).
- `test_evidence_gate.py`:
  - `missing`, `unknown`, another project's id, a removed id and `unsupported_number` each reject the whole batch.
  - A valid batch passes (FR-C02).
- `test_experience_api.py`: owner CRUD, grant actor forbidden on every route, CSRF, contract test.
- Existing protocol suites: `extract_experience` absent from MCP tools, the A2A card and grant run lists.
- Migration 0015 upgrade and downgrade.

Frontend: one Playwright spec, `tests/e2e/experience-bank.spec.ts`, with intercepted synthetic data. It covers grouping, add, edit and remove, extraction states, empty states, the Thai/English switch and 320px. It uses current selectors. The 25 stale specs tracked as E2E-001 are out of scope.

## Acceptance

1. Full backend aggregate passes (323 today plus the new tests); frontend build passes.
2. Live smoke with the configured OpenRouter provider: upload the demo AI-engineer CV. The bank fills, and every item is found verbatim (normalized) in the CV.
3. Independent Opus review PASS; security scan shows no new High or Critical findings.
4. Hub updated: TRACKING, REGISTRY entry EXP-001, ADR-011 (experience bank, evidence gate, no grant access).

## Out of scope

- CV tailoring, autopilot, batch undo (phase 3).
- Skill registry and exposing new skills to MCP/A2A (phase 2).
- Semantic support checks by an LLM.
- Gating cover letters and application messages.
- Grant read or write access to the bank.
