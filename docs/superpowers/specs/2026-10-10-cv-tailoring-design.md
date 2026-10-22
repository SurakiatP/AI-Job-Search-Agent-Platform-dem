# CV tailoring — design

Status: decisions approved by the owner on 2026-10-10 (grill round 1, Q4–Q7 "as recommended"). The owner then authorized autonomous execution without reviewing this spec, and reviews it afterwards.
Phase 3 of the TOR AI roadmap. Covers FR-C03 and FR-C04, and is the first production caller of `services/evidence.require_evidence` (FR-C02).

## Goal

The owner, or an external agent holding `cv:tailor`, tailors the project CV to one job.
- Autopilot runs bounded rounds of evidence-backed edits, scored by deterministic skill coverage.
- Interactive mode proposes edits that the owner accepts or rejects one by one.
- Every edit must cite experience-bank facts.
- The result is a per-job tailored CV document, with an immutable revision per batch, rendered to PDF in the sandbox and stored in MinIO.
- The original CV is never edited. Using a tailored CV as a CV goes through the existing `promote_cv` approval.

## Decisions

| # | Decision |
|---|---|
| Q4 | New external skill `tailor_cv` with new capability `cv:tailor`. External calls run autopilot only. Interactive mode is owner UI only, because it needs the owner's choices. |
| Q5 | Autopilot rounds stop at whichever comes first: 30 rounds, no coverage gain for 2 rounds in a row, full coverage of the job's required skills, or a time budget (the server's `MAX_ACTIVE_SECONDS` minus 90 s, so the run never trips FR-A06). |
| Q6 | One batch is one `tailor_cv` run, and it publishes exactly one new revision of the tailored CV document. Undo means restoring the revision before the batch. That is a new revision whose content equals the earlier one, produced by the existing non-LLM `export_document` path. History stays immutable. |
| Q7 | **Ruling (fallback taken):** Typst is not present in the Hermes image, Career Ops or PATH. Adding it would mean a new third-party binary, a rebuild of the sandbox image and a fresh Trivy/SBOM cycle with the owner away. The existing sandbox renderer already meets the FR-C04 intent: Career Ops `renderHtmlToPdf` with the pinned Chromium, in the network-disabled Hermes sandbox, published to MinIO. ADR-012 records the deviation, and Typst stays a tracked follow-up. |

## Data

- Migration `0016_run_result_payload` adds `runs.result_payload JSONB NULL`. It holds machine results that are neither an evaluation nor an artifact: tailoring proposals and round summaries now, and the apply.prepare answer pack in phase 4.
- A tailored CV is a `Document` whose revisions have `document_type = "cv"` and `source_job_revision_id` set. There is one live tailored CV document per (project, job revision). Later batches append revisions to it.
- No new tables.

## Contracts

- `Operation` gains `"tailor_cv"`, and `Capability` gains `"cv:tailor"`. `GRANT_CAPABILITIES` derives `cv:tailor` automatically. The grant UI must offer it.
- A registry entry `Skill(id="tailor_cv", capability="cv:tailor", input_model=ProtocolJobInput, ...)` makes MCP, A2A and REST `/tools` pick it up with no transport edits. The MCP golden fixture gains a `tailor_cv` entry, and the existing two stay byte-identical.
- `RunRequest` gains `tailor_mode: Literal["autopilot", "interactive"] | None`. It is valid only with `operation == "tailor_cv"`, and its default for `tailor_cv` is `"autopilot"`. Grants cannot send `"interactive"`; that gets `forbidden`.
- Tailoring proposals are stored in `result_payload`:
  ```json
  {"kind": "tailor", "mode": "...", "base_revision_id": "...|null", "stop_reason": "...",
   "rounds": [{"round": 1, "accepted": 2, "rejected": 1, "coverage": 0.5}],
   "proposals": [{"id": 0, "find": "...", "text": "...", "evidence_ids": ["..."], "status": "proposed|applied|rejected_by_gate"}],
   "coverage_before": 0.4, "coverage_after": 0.6}
  ```
- New owner-only REST endpoints, added to `docs/contracts/application-api.yaml` together with a contract test:
  - `POST /projects/{pid}/runs/{run_id}/tailor/apply` with body `{"proposal_ids": [int]}`. It applies the selected interactive proposals to the base text and re-runs `require_evidence` on each one. Any failure rejects the whole call with `evidence_required`. On success it queues an `export_document` run whose content is the edited Markdown; the response is a `RunView`.
  - `POST /projects/{pid}/documents/{document_id}/revisions/{revision_id}/restore` queues an `export_document` run with that revision's Markdown, and the response is a `RunView`. This is the batch undo.

## Execution: `_execute_tailor` in `workers/executor.py`

1. Load the base text. Use the latest revision `content_markdown` of the job's live tailored CV document if one exists; otherwise use the stored CV text (`CVRevisionText`), parsing in the sandbox if it is missing. Load the job text, and load bank facts **with their ids**. A new helper `experience.fact_records(db, project_id)` returns `[{"id", "text", "context"}]`.
2. Score the starting text with `compute_skill_coverage(text, job_text)`. If that returns `None` because the job names fewer than 2 skills, rounds still run, but the "no gain" rule uses the count of accepted edits instead.
3. Each round:
   - Call `runtime.submit` with a fresh Hermes session `uuid5(run.id, f"round-{n}")` and a prompt built by `services/tailoring.round_prompt`. The prompt contains the current CV Markdown, the job, the missing skills, and bank facts with ids. The model is told to use no tools and return JSON edits.
   - `tailoring.parse_edits` validates the reply. Each edit is checked on its own with `require_evidence(db, project_id, [EvidencedEdit(text, evidence_ids)])`, and failures are kept with status `rejected_by_gate`.
   - `tailoring.apply_edits` applies the accepted edits. `find` is an exact substring of the current text, or an empty string meaning "append to the end". An edit whose `find` is absent is dropped.
   - Re-score, and emit `run_progress` `{"step": "tailor_round", "round": n, "coverage": x}`. The event carries no CV text.
4. Interactive mode runs exactly one round, applies nothing, stores the proposals and finishes `completed`. The owner then calls `/tailor/apply`.
5. Autopilot writes the final Markdown to staging as a `cv` draft. It publishes through the existing `_export_drafts`/`artifacts.publish` path in PDF format, appending to the tailored CV document, and stores `result_payload`.
6. Errors follow the existing executor pattern. Provider or native text never leaves the backend.

`services/tailoring.py` contains only pure functions, unit-tested without the database or LLM: `round_prompt`, `parse_edits`, `apply_edits`, `should_stop(history, round, elapsed, budget)`.

## Security

- `tailor_cv` is in the registry, so grants with `cv:tailor` can submit it over MCP, A2A or REST `/runs`. They can read results only with `results:read`. They cannot call `/tailor/apply`, `/restore` or approvals beyond the existing rules.
- The prompt marks bank facts and the job text as untrusted data. Edits are checked by the service-layer gate, not by the prompt.
- No CV text appears in events, errors or logs.

## UI (follow DESIGN.md; Thai and English)

- **Job detail and Documents:** a "Tailor CV" action with a choice between autopilot and interactive.
- **Interactive review:** each proposal shows its new text, the cited facts and the gate status, with a checkbox per proposal and an Apply button.
- **Tailored CV document history:** each revision shows its batch (run) and coverage before→after, plus a "Restore this version" action (undo) and the existing promote-to-CV approval.

## Testing

- Unit tests (`tests/unit/test_tailoring.py`):
  - Parsing, including malformed JSON and an unknown evidence id format.
  - `apply_edits`: exact substring, append, and a missing `find`.
  - Every stop rule: 30 rounds, 2 rounds without gain, full coverage, and time budget.
- Integration tests:
  - An autopilot run with a fake runtime returning scripted edits. Check that the gate rejects an edit citing an unknown fact or a number not in the cited facts, that the stop reason is recorded, that one revision is published, and that the original CV is unchanged.
  - Interactive then apply: the selected proposals produce one revision, and a tampered proposal gets `evidence_required`.
  - Restore creates a revision equal to the earlier content.
  - A grant without `cv:tailor` gets `forbidden`, and a grant with it is allowed. A grant sending `interactive` is refused.
  - MCP lists `tailor_cv`, and the golden fixture holds for the old two.
- Contract: the OpenAPI test passes with the updated YAML.
- E2E: one Playwright spec for the tailor → review → apply → restore flow against mocked API routes.
- Live smoke: at most 10 OpenRouter calls, one autopilot run on the smoke project.
