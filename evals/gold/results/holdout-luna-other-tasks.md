# Gold benchmark luna-rest (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## evaluate

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 97.3 | 12.6s | 14.0s | $0.00077 | 204 | 0% | 0 | 0 |

## draft

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 100.0 | 6.6s | 8.5s | $0.00036 | 250 | 0% | 0 | 0 |

## extract

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 99.2 | 10.2s | 12.2s | $0.00066 | 208 | 0% | 0 | 0 |

## tailor

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 95.8 | 5.1s | 6.6s | $0.00035 | 281 | 0% | 0 | 0 |

## apply

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 94.6 | 5.7s | 6.2s | $0.00041 | 318 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| openai/gpt-6-luna | 97.4 | 8.0s | $0.00051 |
