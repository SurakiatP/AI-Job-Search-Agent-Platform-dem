# Smart match accuracy and visible AI — design (product level)

Status: DRAFT for owner review. Replaces the proposal of the same day. Builds on `2026-10-08-smart-match-jev-design.md`.

## The Why
Who: a job seeker who runs Smart match and trusts the top of the list. Job: find the few jobs worth applying to. Why now: AI is the selling point, so a wrong top 10 or an unexplained score costs trust. Hard limit from the owner: no higher AI cost per user.

## Decisions (owner, 2026-10-21)
- D-01 Measure before tuning. Ground truth = synthetic CV/job pairs with the label known by construction, plus an owner check.
- D-02 Draft judge is DeepSeek V4.1 Flash via OpenRouter (cheap, different family from Jev). No Claude models for judging. Price to be confirmed with the project's own key before the first run (A-01).
- D-03 The owner labels 15 pairs first; the judge is accepted only if Cohen's kappa against the owner is at least 0.6, else the judge or prompt is changed.
- D-04 No real CVs or personal data in the repo, fixtures or prompts.

## Scope in three phases (each its own plan and PR)
### Phase A: measurement (no product behaviour change)
- FR-SM-01 The repo has `backend/tests/smart_match_eval/` with 10 synthetic CVs (Thai and English, 5 role families) and 60 labelled pairs (good / maybe / no), each pair with a one-line reason.
- FR-SM-02 A script scores every pair with the current pipeline (`smart_match.combine`) and prints Spearman rank correlation, NDCG@10, top-10 precision and the confusion of band vs label.
- FR-SM-03 A script asks the draft judge to label the pairs, prints Cohen's kappa against the owner's 15 and against the construction labels, and lists the disagreements for the owner.
- AC-SM-01 One command prints all four metrics in under 10 minutes and costs under USD 0.10 (measured and printed). AC-SM-02 Runs are repeatable: fixed fixtures, temperature 0, results cached by content hash. AC-SM-03 Live calls are opt-in (`SMART_MATCH_EVAL_LIVE=1`); CI never calls a provider.

### Phase B: pipeline (changes product behaviour; accepted only if Phase A metrics improve)
- FR-SM-04 Before any AI call, a free pre-ranker orders the whole pool by skill-dictionary overlap, title similarity, city and work-mode match; the AI scores the top N of the pool (N unchanged at 100), not the newest N.
- FR-SM-05 Per CV revision the CV is reduced once to a structured profile (roles, years, skills with one evidence phrase each, languages, education) stored in `cv_revisions.skill_profile`; per-job calls send the profile instead of the full CV when it is present and fresh.
- FR-SM-06 Score weights and band edges come from a fit on the labelled set, stored as constants with the metrics that justified them.
- AC-SM-04 On the labelled set, NDCG@10 and top-10 precision are not lower than the Phase A baseline, and at least one improves by 10% or more; otherwise the change is not merged. AC-SM-05 Input tokens per scored job drop or stay equal (measured). AC-SM-06 Old scores stay readable: a new `model` or `pipeline` value rescores, nothing is deleted.

### Phase C: visible AI (UI, small API addition)
- FR-SM-07 Each scored job shows one quoted evidence line from the CV for the role fit and for each missing must-have (stored in `details`, no new table).
- FR-SM-08 While a run is active the page shows the agent's steps (reading CV, shortlisting N, scoring i of N) from run events that already exist.
- FR-SM-09 Missing must-have chips link to Tailor CV for that job.
- AC-SM-07 Evidence text is escaped and cannot contain content that is not in the CV (checked by substring test). AC-SM-08 Thai and English, 1440 and 390, light and dark, no overflow.

## Out of scope
Fine-tuning a model; a second stronger-model pass (owner has not approved extra model cost); using saved/hidden/applied signals (possible later change).

## Components and boundaries
- `services/smart_match.py` stays pure; the pre-ranker is a new pure module `services/match_prefilter.py`. The profile builder reuses the existing Jev client and `skill_coverage`. Eval code lives only under `backend/tests/smart_match_eval/` and is not imported by the app.

## Risks and assumptions about the world
- A-01 OpenRouter key can call DeepSeek V4.1 Flash; price is as listed on 2026-10-21 (to verify; owner holds the key).
- A-02 Synthetic pairs resemble real ones closely enough; the owner's 15-pair check is the guard.
- R-01 Construction labels can be too easy; add 10 deliberately ambiguous pairs.
- R-02 Raw agreement overstates quality, so kappa is always reported.

## Questions
- Q-01 (owner) Label 15 pairs; the script will print them as a sheet. Recommended: do it after Phase A is built, in one sitting.
- Q-02 (owner) Is N=100 jobs per run still the right cap? Recommended: keep.
