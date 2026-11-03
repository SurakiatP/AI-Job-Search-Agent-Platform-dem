# Gold benchmark qwen-pre-harness-345b12a (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p95), cost = list-price USD per call.

## evaluate

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 98.0 | 41.6s | 53.6s | $0.00061 | 3613 | 0% | 0 | 0 |

## draft

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 91.0 | 38.4s | 57.2s | $0.00055 | 3656 | 0% | 0 | 0 |

## extract

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 93.3 | 52.7s | 68.8s | $0.00095 | 5701 | 0% | 0 | 0 |

## tailor

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 98.0 | 41.0s | 66.5s | $0.00069 | 4777 | 0% | 0 | 0 |

## apply

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 95.8 | 54.9s | 68.0s | $0.00094 | 6289 | 0% | 0 | 0 |

## practice

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 78.1 | 102.8s | 148.2s | $0.00145 | 6008 | 0% | 0 | 0 |

## ocr

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| qwen/qwen3.7-flash | 73.1 | 32.7s | 71.2s | $0.00036 | 2139 | 0% | 0 | 5 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| qwen/qwen3.7-flash | 89.6 | 52.0s | $0.00079 |
