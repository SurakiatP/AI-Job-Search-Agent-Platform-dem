# Smart match evaluation

Scores 60 hand-labelled CV/job pairs with the real Jev worker path and reports ranking quality.

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/run_eval.py

Both env vars must be exported by the caller (no `.env` is read). Cost: about 60 Jev calls on the first run; answers are
cached in `.cache/` (keyed by model + CV/job state + questions), so reruns are free unless data or prompts change.

Output: `ndcg_at_10` and `precision_at_10` (macro-average over CVs; 1.0 is best), `spearman` between fit percent and label
(good=2, maybe=1, no=0), then a band (1-5) by label count table: good pairs should sit in high bands, no pairs in low ones.

## Judge

`judge.py` has an LLM judge (OpenRouter, `deepseek/deepseek-v4.1-flash-1017`, temperature 0) label every pair, then prints
kappa of judge vs construction labels, kappa vs owner labels (optional `data/owner_labels.json`, a dict of
`"<slug>+<cv_id>": "good|maybe|no"`) and up to 25 pairs where judge, construction label and Jev band disagree.

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/judge.py
    python backend/tests/smart_match_eval/judge.py sheet > sheet.md   # offline, blind: no labels, reasons or judge output

The sheet has 15 pairs (5 per label, at least 3 ambiguous, seeded). Fill in `Your label:` and save your answers as
`owner_labels.json`. Acceptance rule (decision D-03): the judge is trusted only if kappa vs owner >= 0.6.
