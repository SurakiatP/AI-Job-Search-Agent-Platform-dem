# Paired sessions, multiple CVs and project sandbox

Status: approved by owner 2026-10-08 (grilling Q1–Q17, all recommendations accepted, build now).

## Decisions

| # | Decision |
|---|---|
| Q1 | No free chat. A session is a case workspace for one CV + job pair: evaluation result, skill coverage, draft buttons, and a one-shot "revise" instruction under each drafted document. |
| Q2 | A project holds several named CVs; each CV has its own revisions. |
| Q3 | A session's pair is locked at creation and pins the CV revision. A newer revision of that CV shows a banner offering a new session. |
| Q4 | The job comes from the project's saved jobs or is pasted in the new-session dialog (saved automatically). "Evaluate" on search/jobs pages opens the dialog with the job preselected. |
| Q5/Q14 | Duplicate = same CV revision + same job revision. The server answers 409 with the existing session id; the UI offers to open it. Pasted jobs are deduplicated by identical description within the project. |
| Q6 | Sandbox: a run receives only its pair; no cross-project memory. Provider settings stay owner-level. Cross-project access tests cover every new route. |
| Q7 | Creating a session starts the evaluation immediately. Drafting is explicit and the owner picks the type (cover letter / application message). |
| Q8/Q16 | Existing unpaired sessions stay, labelled "not paired", read-only. The old message endpoints remain; the UI no longer uses them. |
| Q10 | One primary CV per project. It is the default for REST/MCP/A2A and preselected in the dialog. Existing CVs migrate into one primary CV per project. |
| Q11 | CV page lists CV cards: upload new version, set primary, rename, delete (blocked while a session uses it). "+ Add CV" names the CV from the filename. |
| Q12 | Revise creates a new revision of the same document (instruction ≤ 500 chars). Document page shows latest and can switch revisions. |
| Q13 | Session title defaults to "job title · company"; still renamable. |
| Q15 | External channels do not create sessions. REST/MCP/A2A gain an optional `cv_id`; omitted means the primary CV. Additive only; Agent Card unchanged. |

## Data model (migration 0009)

- New `cvs`: `id`, `project_id` (FK cascade), `name` (≤120), `is_primary`, `created_at`, `removed_at`. Unique `(project_id, id)`; partial unique index: one primary per project among non-removed rows.
- `cv_revisions.cv_id` (composite FK to `cvs`); revision numbers unique per `(cv_id, revision)` instead of per project. Migration creates one primary CV named "CV หลัก" for each project that has revisions and assigns them.
- `sessions.cv_revision_id`, `sessions.job_revision_id`: nullable composite FKs; both null (legacy) or both set.

## API (additive)

- `GET/POST /projects/{p}/cvs`, `PATCH/DELETE /projects/{p}/cvs/{cv}`, `POST /projects/{p}/cvs/{cv}/revisions`. Delete is soft and returns 409 `cv_in_use` when a session references it. Deleting the primary promotes the newest remaining CV.
- Legacy `GET/POST /projects/{p}/cv` keep working (POST adds a revision to the primary CV, creating it if missing).
- `POST /projects/{p}/sessions` requires `cv_revision_id` plus either `job_revision_id` or an inline `job` (`title`, `company?`, `description`, `source_url?`). It returns the session with `evaluation_run_id`; 409 `session_pair_exists` carries `session_id`.
- `SessionView` adds `cv_revision_id`, `job_revision_id`, CV name and revision, job title and company, and `cv_outdated`.
- Runs on a paired session take the pair from the session; a conflicting id gives 422 `session_pair_mismatch`. Runs accept optional `cv_id`.
- Draft runs accept `document_id` + `owner_instructions` (UI caps at 500) and append a `DocumentRevision` to that document.
- `docs/contracts/application-api.yaml` stays in sync (contract test).

## Frontend

- CV page: CV cards per Q11.
- New-session dialog: CV select (primary preselected, shows version), saved-job select or "paste new job" form, duplicate → link to the existing session. Opened from the sidebar "new session", the evaluate entry, search results and saved jobs.
- Session page replaces the chat composer: pair header, outdated banner, evaluation (FitScore, SkillCoverage, run timeline), draft type buttons, drafted documents with Markdown preview and a revise box, revision switcher on the document page. Legacy sessions are read-only.
- Thai and English copy; no raw UUIDs; follow `DESIGN.md`.
