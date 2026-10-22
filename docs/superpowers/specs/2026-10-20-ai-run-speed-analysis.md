# AI run speed — measured causes and proposed fixes

Status: ANALYSIS, fixes awaiting owner decision · Date: 2026-10-20

## How it was measured

Local database of the owner's test instance (synthetic data), all completed runs, timestamps of
`run_events` (`run_queued` → `run_started` → progress → `run_completed`). The `llm_round` event
records the gateway model, latency and token counts. Script: one read-only query, no writes.

## Results

| Operation | Runs | Median total | p90 | Median wait before start |
|---|---|---|---|---|
| profile_cv (read CV skills) | 4 | 805 s | 1,623 s | 801 s |
| interview_generate | 6 | 242 s | 309 s | 0 s |
| extract_experience | 7 | 133 s | 1,791 s | 1 s (one run waited 1,764 s) |
| evaluate_job | 21 | 71 s | 130 s | 0 s |
| interview_grade | 4 | 50 s | 59 s | 0 s |
| tailor_cv | 14 | 50 s | 180 s | 0 s |
| interview_report | 3 | 43 s | 104 s | 0 s |
| draft_documents | 15 | 25 s | 89 s | 0 s |

## Cause 1 — runs wait in line behind each other (largest delay)

`workers/queue.py`: at most `MAX_ACTIVE_PROJECTS = 2` projects run at once, and **one run per user**
(multi-user spec Q18). Uploading a CV queues `profile_cv` plus one `extract_experience`; the
measured `profile_cv` runs that waited ~1,600 s were queued behind three `extract_experience` runs
of the same project. The user sees "waiting" for up to 27 minutes with nothing wrong.

Proposed fix (needs owner decision, it changes approved rule Q18):
- **S-1a (recommended):** allow up to 2 running runs per user, still 1 per project for runs that
  write to the same CV (profile/extract), and raise the global cap from 2 to a setting
  `WORKER_MAX_ACTIVE` (default 4). Each run already has its own sandbox
  (`RunSandbox(project_id, run_id)`), but the agent bridge refuses a second run while one is alive
  (`native_bridge.py`: `project_busy`), so S-1a needs one bridge process per active run.
- **S-1b (small, no rule change):** run `profile_cv` before `extract_experience` for the same CV
  (priority order in `claim_next`), so the CV becomes usable first.

## Cause 2 — one AI call spends most of its time reasoning

`interview_generate`: one gateway round of 283–305 s, 21,821 input tokens and 44,000–46,000 output
tokens, while the stored questions total 7,800–10,100 characters (~3,000–4,000 tokens). About 90%
of output tokens are the model's hidden reasoning. `evaluate_job` shows the same pattern at a smaller
scale (66 s, 5,400–11,000 output tokens).

Proposed fixes:
- **S-2a (recommended):** pass `reasoning_config={"enabled": true, "effort": "low"}` to the agent
  for interview operations (generation, grading, report) through the existing `submit` request.
  Expected: generation in well under 2 minutes. Quality must be checked on the same practice set
  before and after (owner review).
- **S-2b:** generate questions per round in parallel (one call per section) instead of one call for
  the whole set. Bigger change; only if S-2a is not enough.

## Cause 3 — small steady costs (no action proposed)

- Queue poll interval 0.5 s and agent start-up 3–4 s per run: under 5% of any run.

## Not measured

Production hardware, several users at once, and a model other than `ai-analyze`
(`openrouter/z-ai/glm-5.3-flash`). The numbers come from one local instance.

## Decisions and results (owner approved all recommendations, 2026-10-20)

- **S-1b done:** `profile_cv` is claimed before older queued runs (test + mutation check).
- **S-1a done in part:** global cap is `WORKER_MAX_ACTIVE` (default 4, was 2) and each user may have
  2 running runs (was 1, replaces multi-user Q18). Two runs inside **one project** still run one at a
  time: the agent runtime keeps one process, state folder and container label per project
  (`hermes_runtime.py` `start_project`, supervisor cleanup by `platform.project` label). Running a
  project's jobs in parallel needs that layer keyed by run: a separate change, not done.
- **S-2a done:** interview operations send OpenRouter `reasoning: {effort: low}` as request extra body
  (`infra/hermes/native_bridge.py` `REASONING`). Hermes drops `reasoning_config` for a gateway, and
  the gateway refuses `reasoning_effort` for this model, so both were tried and rejected.
  Same set definition (11 questions, 4 sections), same session, owner's local instance:

  | | Time | Output tokens | Questions | Example answers |
  |---|---|---|---|---|
  | Default reasoning | 683 s | 26,854 | 11 | 5 |
  | Low reasoning | 72 s | 8,667 | 11 | 5 |

  Earlier default-reasoning runs took 242–308 s with ~45,000 output tokens; provider speed varies.
