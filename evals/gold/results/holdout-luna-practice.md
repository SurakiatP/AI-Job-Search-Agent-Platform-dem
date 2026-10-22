# Gold benchmark luna-ho (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## practice

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 92.2 | 24.7s | 28.2s | $0.00132 | 580 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| openai/gpt-6-luna | 92.2 | 24.7s | $0.00132 |
