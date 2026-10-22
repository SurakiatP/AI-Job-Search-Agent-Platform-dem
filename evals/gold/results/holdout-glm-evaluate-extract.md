# Gold benchmark glm-rest (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.

## evaluate

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 96.0 | 31.9s | 46.5s | $0.00044 | 188 | 2% | 0 | 0 |

## extract

| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| z-ai/glm-5.3-flash | 98.6 | 12.8s | 32.6s | $0.00034 | 513 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| z-ai/glm-5.3-flash | 97.3 | 22.4s | $0.00039 |
