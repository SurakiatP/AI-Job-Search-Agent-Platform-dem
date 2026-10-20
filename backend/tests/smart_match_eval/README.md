# Smart match evaluation

Scores 60 hand-labelled CV/job pairs with the real Jev worker path and reports ranking quality.

    SMART_MATCH_EVAL_LIVE=1 OPENROUTER_API_KEY=... python backend/tests/smart_match_eval/run_eval.py

Both env vars must be exported by the caller (no `.env` is read). Cost: about 60 Jev calls on the first run; answers are
cached in `.cache/` (keyed by model + CV/job state + questions), so reruns are free unless data or prompts change.

Output: `ndcg_at_10` and `precision_at_10` (macro-average over CVs; 1.0 is best), `spearman` between fit percent and label
(good=2, maybe=1, no=0), then a band (1-5) by label count table: good pairs should sit in high bands, no pairs in low ones.
