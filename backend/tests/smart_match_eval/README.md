# Smart match evaluation

Scores 60 hand-labelled CV/job pairs with the real Jev worker path and reports ranking quality.

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/run_eval.py

Both env vars must be exported by the caller (no `.env` is read). Cost: about 60 Jev calls on the first run; answers are
cached in `.cache/` (keyed by model + CV/job state + questions), so reruns are free unless data or prompts change.

Output: `ndcg_at_10` and `precision_at_2` (macro-average over CVs; share of each CV's top 2 jobs labelled good),
`pooled_precision_at_20` (all 60 pairs ranked globally by fit percent, ties by cv_id then slug; share of the top 20 labelled
good; 1.0 is best for all), `spearman` between fit percent and label
(good=2, maybe=1, no=0), then a band (1-5) by label count table: good pairs should sit in high bands, no pairs in low ones.

## Judge

`judge.py` has an LLM judge (OpenRouter, `deepseek/deepseek-v4.1-flash-1017`, temperature 0) label every pair, then prints
kappa of judge vs construction labels, kappa vs owner labels (optional `data/owner_labels.json`, a dict of
`"<slug>+<cv_id>": "good|maybe|no"`) and up to 25 pairs where judge, construction label and Jev band disagree. It is the single report command: it also runs the Jev
scoring (cached) and prints the four metrics and confusion table first, then the D-03 verdict line, total live calls
(Jev + judge), elapsed seconds and the summed judge `usage` tokens ("n/a" if the API returns none). No USD figure is printed
because per-token prices are unverified.

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/judge.py
    python backend/tests/smart_match_eval/judge.py sheet > sheet.md   # offline, blind: no labels, reasons or judge output

The sheet has 15 pairs (5 per label, at least 3 ambiguous, seeded). Fill in `Your label:` and save your answers as
`owner_labels.json`. Acceptance rule (decision D-03): the judge is trusted only if kappa vs owner >= 0.6 with at least 15 owner labels (ACCEPT / REJECT / PENDING).

## Pooled mode

The 60-pair set is saturated (all headline metrics 1.0), so `--pool` scores every CV against every non-borderline job (55 jobs, 550 pairs):

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/run_eval.py --pool

A job's family comes only from `data/job_families.json` (`{"families": {slug: family}, "borderline": {slug: reason}}`,
classified blind from job text); `borderline` jobs are left out of the pool entirely. A CV's family is fixed in `pool.py`
(cv-01/02 software_data, 03/04 marketing, 05/06 finance_accounting, 07/08 healthcare, 09/10 operations_logistics).
Labels: an original pair keeps its label and kind; any other pair whose job family differs from the CV family is `no`
(kind `cross-family`); the rest (kind `same-family`) are read from `data/pool_labels.json`
(`{"<slug>+<cv_id>": {"label": "good|maybe|no", "reason": "..."}}`), supplied by a blind labeller from
`python backend/tests/smart_match_eval/pool.py sheet` (lists only pairs not yet labelled). `--pool` refuses to run without
that file and raises KeyError if a pair is missing. Original pairs are already cached, so the first run costs a few hundred
Jev calls. Output adds `precision_at_5` (macro over CVs) and
`cross_family_leak` (share of cross-family pairs landing in band 4 or 5; 0 is best).
