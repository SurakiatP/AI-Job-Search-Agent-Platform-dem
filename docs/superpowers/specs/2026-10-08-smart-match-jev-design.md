# Smart match with Jev — design

Status: approved in chat 2026-10-08 (Q1–Q6 and, after a competitor review, Q7–Q13 "as recommended");
this spec awaits owner review.
Builds on Smart match option A (commit 1aba84e, migration 0013) and the throwaway spike
`scripts/spikes/jev_rerank.py` on `feat/jev-rerank-spike` (7af838f).

## Goal

The owner picks a CV and gets real Thai job postings ranked by how well they fit, with reasons a person
can read, without having to type a search query. Ranking must beat the keyword score (spike: Spearman
vs an LLM judge 0.88–0.91 for Jev, about 0.6 for keywords), stay fast and cheap, and work with Thai CVs
and postings.

## Decisions

| # | Decision |
|---|----------|
| Q1 | Jev scores **every** job in the pool (up to 100), not only a keyword-filtered shortlist. |
| Q2 | Parsed CV text is persisted once per CV revision so later runs skip the sandbox parse. (Spec choice, see "CV text": a database table instead of a bare object, because bare objects are not removed with the project and are not tied to a files row.) |
| Q3 | Jev is used only when the global provider is OpenRouter. Otherwise AI mode is unavailable and the page shows the keyword (ATS) score with a hint. No separate Jev key. |
| Q4 | No extra consent step. A one-line notice under AI mode says the CV text is sent to OpenRouter/TypeSafe, as evaluation already does. |
| Q5 | Auto query: with no query and no category, the pool comes from the job categories Jev picks for the CV. |
| Q6 | Fixed weights: role 50 %, skills 30 %, seniority 20 %, with a penalty when a must-have requirement is missing. |
| Q7 | Each job skill is classified must-have or nice-to-have (as Huntr does); must-haves weigh double in the skill part and are listed separately. Same single Jev request per job. |
| Q8 | The fit is shown as one of five bands (เหมาะมาก / เหมาะ / พอได้ / น้อย / ไม่เหมาะ) with the percent in small text. |
| Q9 | The job detail pane highlights matched skills (green) and missing skills (red) inside the posting text (as JobGlance's extension does). |
| Q11 | Per-project "hide this job" and "hide this company"; hidden items never reach Smart match or Jev. |
| Q10, Q12, Q13 | Not now: CV evidence lines, daily Top Matches with alerts, embedding retrieval. |

Not in scope: user-adjustable weights, project preferences as ranking input (preferences hold only
locale/output language/notifications today), a separate TypeSafe key, scoring saved project jobs,
CV evidence lines per skill (Q10), thumbs up/down learning, daily Top Matches and alerts (Q12),
embedding retrieval (Q13: the pool is at most 100 jobs from the upstream API, so Jev scores all of them),
hiding in the general search mode.

Competitor notes that shaped Q7–Q13: JobGlance (two modes, one engine; filters narrow, ranking still
ranks; "4/7 skills matched"; matched/missing keyword highlight), Huntr (LLM-weighted must-have vs
nice-to-have, keywords < 20 %, five bands), Simplify (hide job / hide company, "why this job"),
Jobscan (job title weight), LinkedIn/Indeed/CareerBuilder (two-stage embeddings at very large scale).

## Flow

1. The page calls `GET /projects/{p}/job-search/match` (existing) as today. It returns the pool with the
   keyword score and, new, the cached Jev score for each job plus an `ai` block.
2. If `ai.status` is `missing` or `partial`, the page calls `POST /projects/{p}/job-search/match/runs`,
   which creates (or returns the active) `match_jobs` run, then polls the run as for `profile_cv`.
3. The worker ensures the CV text and categories, rebuilds the same pool, scores jobs that have no cached
   score, and stores the scores.
4. When the run finishes, the page re-fetches `GET …/match`, which now sorts by AI fit.

GET and the worker build the pool with one shared function, so both see the same jobs for the same
parameters (the upstream response is already cached briefly by `search_jobs`).

## Components

### `integrations/jev.py` (new)
- `JevClient(api_key)` with `decide(state: dict, questions: dict) -> dict`.
- POST `https://openrouter.ai/api/alpha/decisions` (the endpoint verified in the spike), model pinned
  `typesafe/jev-1.13` (constant `JEV_MODEL`). Timeout 30 s; up to 3 retries with backoff on 429/5xx,
  honouring `retry-after`; other errors raise `ServiceError("jev_failed", retryable=…)`.
- No redirects followed (same opener policy as `services/settings.py`). The key never appears in logs,
  errors, run events or snapshots.

### `services/smart_match.py` (new, pure functions + pool builder)
- `job_questions(skills: list[str]) -> dict`: `role_fit` Score (4 levels), `seniority_fit` Score (4 levels:
  far below / somewhat below / meets / well above), `hard_blocker` Noul, and per job skill two Nouls:
  `skill_i` ("the CV shows evidence of {skill}") and `must_i` ("the posting states {skill} as a required,
  not preferred, qualification"), i = 0…11 (at most 12 skills; they come from `match_skills` on the job text
  plus the job's upstream skill tags, deduplicated, in posting order).
- `combine(answers, skills) -> dict` returns
  `{"fit_percent": int, "band": 1–5, "uncertain": bool, "seniority": "far_below"|"below"|"meets"|"above",
  "hard_blocker": bool, "skills_evidenced": [...], "must_missing": [...], "nice_missing": [...]}`:
  - role = `role_fit.score / 3`; skills = weighted mean of `skill_i` nouls with weight 2 when
    `must_i ≥ 0.5`, else 1 (role when there are no skills);
    seniority = expected value of level weights `[0, 0.5, 1, 0.8]` over `seniority_fit.probabilities`.
  - fit = `(0.5·role + 0.3·skills + 0.2·seniority) · (1 − 0.5·hard_blocker.noul)`, rounded to an int percent.
  - `uncertain` when `role_fit.confidence < 0.5`; `hard_blocker` when its noul ≥ 0.5;
    a skill is evidenced when its noul ≥ 0.5, otherwise it goes to `must_missing` or `nice_missing`;
    `seniority` is the most probable level.
  - `band` from `fit_percent` with constants `BANDS = (70, 55, 40, 25)`: ≥ 70 → 5 เหมาะมาก, ≥ 55 → 4 เหมาะ,
    ≥ 40 → 3 พอได้, ≥ 25 → 2 น้อย, else 1 ไม่เหมาะ. Calibrated on the spike (LLM judge 82 ≈ Jev 70,
    judge 65 ≈ 50, judge 15 ≈ 14); re-check with the spike script when the model version changes.
- `highlight_terms(job_text, skills) -> dict[str, str]`: for each skill, the exact text the dictionary
  pattern matched in the posting (first occurrence), so the UI can highlight aliases such as "ReactJS"
  for React. Names and short surface strings only.
- `category_question(categories) -> dict`: one Choice over the upstream facet categories (`job_facets`,
  top 12) with state = CV text. Selected categories: probability ≥ 0.25, at most 2, best first;
  if none qualify, the top one.
- `build_pool(q, filters, cv_categories, pool) -> list[job]`: when `q` and `category` are empty and
  `cv_categories` exist, fetch up to `pool` jobs split evenly across those categories (deduplicated by slug,
  newest first); otherwise the existing single `search_jobs` call.
- `content_hash(job) = sha256(title + "\n" + description_markdown)`.

### Data (migration `0014_smart_match_jev`)
- `cv_revision_texts`: `cv_revision_id` PK, `project_id` (composite FK to `cv_revisions (project_id, id)`,
  `ON DELETE CASCADE`), `text` (Text, ≤ 200 000 chars), `created_at`. Written once; never returned by any API.
- `job_match_scores`: `id`, `project_id` (FK projects, cascade), `cv_revision_id` (composite FK, cascade),
  `job_slug` (≤ 200), `content_hash` (64), `model` (≤ 80), `fit_percent` (0–100), `uncertain` bool,
  `details` JSON (the `combine` output minus `fit_percent`/`uncertain`), `created_at`.
  Unique `(cv_revision_id, job_slug, content_hash, model)`. Index `(cv_revision_id, job_slug)`.
- `job_search_hidden`: `id`, `project_id` (FK projects, cascade), `kind` (`job`|`company`), `value`
  (job slug, or company name lower-cased and trimmed; ≤ 300), `label` (title or company as shown; ≤ 300),
  `created_at`. Unique `(project_id, kind, value)`.
- `cv_revisions.skill_profile` gains optional `"categories": [...]` and `"categories_model"`
  (names only, still no CV text; the 0013 trigger already allows `skill_profile` updates).
- Runs: `ck_runs_operation` adds `'match_jobs'`; `ck_runs_context_required` becomes
  `operation IN ('profile_cv','match_jobs') OR (…existing…)`. `match_jobs` sets `provider_configuration_id`
  (the global OpenRouter row) but no session or job. Downgrade fails while `match_jobs` runs exist.

### Run `match_jobs` (worker, `workers/executor.py`)
Owner-only like `profile_cv` (hidden from MCP/A2A in the same place, `services/runs.py:660`).
`input_snapshot`: `{cv_revision_id, q, cities, work_mode, posted_within_days, category, pool}`.
1. CV text: if no `cv_revision_texts` row, parse in the sandbox exactly as `_execute_profile` does, store the
   text, and also refresh `skill_profile.skills` when missing.
2. Categories: when `q` and `category` are empty and `skill_profile.categories` is missing or from another
   model, ask the category Choice and store it.
3. Pool: `build_pool(...)`. Score jobs with no row for `(cv_revision_id, slug, content_hash, JEV_MODEL)`,
   8 at a time, one Jev request per job (state = `{cv, job_posting}`; posting text cut to 6 000 chars).
   Each scored job is committed immediately, so a cancelled or failed run keeps its finished scores.
4. Jev calls do **not** go through the tool gate: `MAX_TOOL_CALLS` is 30 per run (`services/runs.py:50`)
   and would fail the run at job 31. Instead the run has its own cap `MAX_JEV_CALLS = 101` (100 jobs + one
   category call) and checks cancellation and the lease (heartbeat, `MAX_ACTIVE_SECONDS`) between batches
   of 8. The sandbox parse in step 1 keeps using the tool gate exactly like `profile_cv`.
   Per-job Jev failures are skipped and counted; the run fails only when every call failed.
   Run events record counts only (scored / cached / failed), never CV text or job content.

### API
- `GET …/job-search/match` (existing): each item gains `ai_match` =
  `{fit_percent, band, uncertain, seniority, hard_blocker, skills_evidenced, must_missing, nice_missing} | null`
  and `highlight = {matched: {skill: surface}, missing: {skill: surface}}` (from `highlight_terms`, using
  `ai_match` skill lists when present, otherwise the keyword lists);
  the response gains `ai = {status: "ready"|"partial"|"missing"|"unavailable", categories: [...]|null,
  scored: int}`. Sort order: items with `ai_match` by `fit_percent` desc, then items without it by the
  existing keyword order. `unavailable` when the global provider is not OpenRouter.
  Hidden jobs and companies are removed from the pool before scoring and sorting; the response gains
  `hidden_count`.
- `POST …/job-search/match/runs` body `{cv_revision_id, q, cities, work_mode, posted_within_days,
  category, pool}` → `202 {run_id}`. Returns the active run for the same CV revision and parameters instead
  of a second one; `409 jev_unavailable` when the provider is not OpenRouter. No `cv_profile_missing`:
  the run parses the CV itself.
- `GET …/job-search/hidden` → `{items: [{id, kind, label, created_at}]}`;
  `POST …/job-search/hidden` body `{kind: "job"|"company", value, label}` → 201 (idempotent on the unique key);
  `DELETE …/job-search/hidden/{id}` → 204. Owner only (`write` on the project), REST only.
- `docs/contracts/application-api.yaml` updated in the same change (contract test must pass).

### UI (`features/search/SearchPage.tsx`, Smart match mode)
- Shows the keyword results immediately. When `ai.status` is `missing`/`partial`, starts the run
  automatically, shows "กำลังวิเคราะห์ด้วย AI… n/N" and re-fetches when it finishes.
- First load with no query and no categories yet: shows "กำลังหางานที่เหมาะกับ CV…" instead of an unrelated
  list, then the category-based pool. The chosen categories appear as removable chips
  ("หมวดที่ AI เลือกจาก CV: …"); typing a query or picking a category replaces them.
- Card: band badge as the primary signal ("เหมาะมาก · 71%", colour per band), "ATS 57%" secondary, "ไม่แน่ใจ" badge when uncertain,
  "⚠ ขาดคุณสมบัติบังคับ" when `hard_blocker`, and seniority text (ต่ำกว่ามาก / ต่ำกว่าเล็กน้อย / ตรง / สูงกว่า).
  Detail pane: three chip groups, "มีหลักฐานใน CV", "ขาด (บังคับ)", "ขาด (มีก็ดี)" (keyword lists as fallback),
  and the posting text with `highlight` surfaces marked green (matched) and red (missing), case-insensitive,
  whole-word where the term is Latin; text is escaped before marking (no HTML injection from postings).
- Card "…" menu: "ซ่อนงานนี้" and "ซ่อนบริษัทนี้" with an Undo bar (same pattern as hidden sessions);
  a "ที่ซ่อนไว้ (n)" link under the results opens a dialog listing hidden items with "เลิกซ่อน".
- `unavailable`: ATS-only list plus "เปิดการจัดอันดับด้วย AI โดยตั้งผู้ให้บริการเป็น OpenRouter" linking to Settings.
- Notice under AI mode: "ระบบส่งเนื้อหา CV ไปยัง OpenRouter/TypeSafe เพื่อจัดอันดับ".
- Thai and English copy; no raw UUIDs; no upstream site name.

## Errors and edge cases

| Case | Behaviour |
|------|-----------|
| Provider not OpenRouter | `ai.status = unavailable`; POST 409 `jev_unavailable`; ATS ranking still works. |
| Jev 429/5xx | Retry with backoff; then skip that job; run completes if any job scored. |
| All Jev calls fail (bad key, no credit) | Run fails `errors.jev_failed`; page keeps ATS order and shows a retry button. |
| Job posting edited upstream | New `content_hash` → rescored; old row ignored. |
| Model version change | New `model` value → rescored; categories recomputed. |
| CV parse yields empty text | Run fails `errors.cv_text_empty`; nothing sent to Jev. |
| Injected instructions in a posting | Only typed answers come back; scores may be skewed, never actions. Documented limitation. |
| CV deleted while running | Run finishes. CV deletion is a soft hide, so the revision, its text and scores stay until the project is deleted, then cascade away. |

## Testing

- Unit: `combine` (weights incl. must-have double weight, penalty, thresholds, band edges 24/25/39/40/
  54/55/69/70, seniority mapping, no-skill fallback), `category_question` selection rule, `build_pool`
  split/dedup, `content_hash`, `highlight_terms` (alias surfaces, Thai text, no match).
- Integration (HTTP to Jev and the job board replaced by fakes): run lifecycle (parse once, cache hit on
  second run, partial failure, total failure, cancellation keeps scored rows), GET sort/`ai` block, POST
  dedup of active runs, `jev_unavailable`, owner-only (no MCP/A2A access), migration up/down guard,
  cascade on project delete, key absent from run events and errors; hidden job/company excluded from GET
  and never sent to Jev, hide idempotent, unhide restores, company match case-insensitive, cross-project
  hidden ids return 404.
- Browser: Smart match with the AI CV and no query → categories chips → AI badges sorted; provider switched
  away from OpenRouter → ATS-only with hint; hide a company → its jobs disappear, Undo brings them back;
highlights visible in the detail pane in light and dark themes.

## Cost and limits

About 3 700 input tokens per job (the must-have questions add about 700) → about $0.016 per 100 new jobs; cached jobs are free. OpenRouter limits
(80 req/s) are far above 8 concurrent calls. Jev is beta on OpenRouter; the endpoint and model are
constants so a change is one edit.
