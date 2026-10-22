# Gold benchmark ho-new (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## draft

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 97.8 | 14.2s | 26.4s | $0.00024 | 226 | 3% | 0 | 0 |

## tailor

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 87.9 | 3.3s | 19.2s | $0.00015 | 442 | 3% | 0 | 0 |

## apply

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 96.9 | 3.3s | 14.3s | $0.00013 | 312 | 6% | 0 | 0 |

## practice

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 87.0 | 72.0s | 115.8s | $0.00101 | 362 | 5% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| z-ai/glm-5.3-flash | 92.4 | 23.2s | $0.00038 |
