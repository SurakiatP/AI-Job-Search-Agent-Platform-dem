# Gold benchmark ho-old (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## draft

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 97.8 | 15.4s | 26.9s | $0.00023 | 240 | 3% | 0 | 0 |

## tailor

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 82.0 | 5.8s | 10.4s | $0.00009 | 142 | 2% | 0 | 0 |

## apply

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 96.1 | 4.3s | 8.6s | $0.00010 | 124 | 1% | 0 | 0 |

## practice

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 78.7 | 57.5s | 84.0s | $0.00082 | 425 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| z-ai/glm-5.3-flash | 88.6 | 20.7s | $0.00031 |
