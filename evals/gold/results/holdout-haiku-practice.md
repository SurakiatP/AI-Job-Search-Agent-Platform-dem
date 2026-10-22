# Gold benchmark hk-ho (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## practice

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| anthropic/claude-haiku-5.5 | 89.3 | 25.9s | 31.4s | $0.00299 | 1472 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| anthropic/claude-haiku-5.5 | 89.3 | 25.9s | $0.00299 |
