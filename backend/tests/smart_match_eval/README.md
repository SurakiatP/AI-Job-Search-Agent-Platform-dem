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

The 60-pair set is saturated (all headline metrics 1.0), so `--pool` scores every CV against all 60 jobs (600 pairs):

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/run_eval.py --pool

Labels: the 60 original pairs keep theirs; a job against a CV from another role family (families: cv-01/02, 03/04, 05/06,
07/08, 09/10; a job's family is that of the CV it was written for) is `no` (kind `cross-family`); a job against the sibling
CV of its own family (60 pairs, kind `same-family`) is read from `data/pool_labels.json`
(`{"<slug>+<cv_id>": {"label": "good|maybe|no", "reason": "..."}}`), supplied by a blind labeller from
`python backend/tests/smart_match_eval/pool.py sheet`. Without that file `--pool` refuses to run. The 60 original pairs are
already cached, so the first run costs about 540 Jev calls. Output adds `precision_at_5` (macro over CVs) and
`cross_family_leak` (share of cross-family pairs landing in band 4 or 5; 0 is best).
