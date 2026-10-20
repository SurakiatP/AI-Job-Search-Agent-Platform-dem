# Smart match accuracy and AI visibility — proposal (analysis only, no code)

Status: PROPOSED, awaiting owner decision. Read from code at `origin/develop` 0ecd4f6; accuracy has not been measured yet.

## How it works today (evidence: `services/smart_match.py`, `workers/executor.py`, spec 2026-10-08)
- One LLM call per job with the full CV text plus up to 6000 chars of the posting, asking role fit, seniority fit, a hard-blocker flag, and two yes/no questions per skill (up to 12 skills).
- Score = 100 x (0.5 role + 0.3 weighted skills + 0.2 seniority) x (1 - 0.5 blocker). The weights are hand-picked, not fitted to data.
- Each run scores at most 100 unscored jobs, newest first, 8 at a time. Scores are cached per CV revision, job, content hash and model (cost about $0.016 per 100 new jobs per the spec).

## Where accuracy is likely lost (hypotheses, to be confirmed by step 1)
1. The 100-job window is chosen by recency, not by likely fit, so good older jobs are never scored.
2. The whole CV is re-read for every job: noisy, costly and inconsistent between jobs.
3. Weights 0.5/0.3/0.2 and the 55/70 bands were never checked against human judgement.
4. The score has no quoted evidence, so users cannot tell a right score from a wrong one.
5. Saves, hides and applications by the user are not used to improve ranking.

## Proposals, cheapest first
| # | Change | Cost effect | Expected gain |
|---|---|---|---|
| 1 | Golden set: 40-60 CV/job pairs labelled by the owner (good / maybe / no), plus a script that reports rank correlation and top-10 precision. Nothing else is tuned until this exists. | one-off labelling time | makes every later change measurable |
| 2 | Free pre-ranker before the LLM: overlap with the existing skill dictionary, title similarity, city and work-mode match. Send only the top 100 of the whole pool to the LLM, not the newest 100. | lower or equal | better candidates reach the LLM |
| 3 | Structured CV profile built once per CV revision (roles, years, skills with evidence, languages, education) and sent instead of the raw CV. | about 30-60% fewer input tokens (to be measured) | more consistent scores |
| 4 | Ask for one quoted evidence line for role fit and each missing must-have; show it as "why this score". | small output increase | trust, easier debugging |
| 5 | Fit weights and bands on the golden set (a small grid search), not by hand. | none at run time | measured accuracy |
| 6 | Use saved, hidden and applied jobs as soft signals (boost similar titles, demote similar hidden ones). | none | personalisation |
| 7 | Optional second pass: a stronger model only on the top 10 borderline jobs. | about +10% | sharper top of list |

## Making the AI parts stand out (UI, low cost)
- Smart match result card: score ring with the one-line reason and the quoted evidence; clear "Missing must-have" chips that link to Tailor CV.
- A consistent "AI" mark and a short "what the agent did" line on every AI output (matching, evaluation, tailoring, interview practice).
- Show progress as the agent's steps while scoring (reading CV, shortlisting N, scoring) using run events that already exist.

## Recommended order
1 -> 2 -> 3 -> 4 -> 5, then UI. Stop after step 1 and 2 if the golden set shows the top 10 is already good.

## Questions for the owner (Q-xx)
- Q-01: Who labels the golden set? Recommended: owner labels 40 pairs from real, anonymised CVs; no personal data in the repo.
- Q-02: Monthly AI budget ceiling per user? Recommended: keep current per-user daily quota and add no new model calls beyond step 7.
- Q-03: Is the second-pass stronger model (step 7) acceptable?
