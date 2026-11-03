# Gold benchmark baseline-luna-345b12a (dataset gold.holdout.v1, max_tokens 16000)

Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p95), cost = list-price USD per call.

## evaluate

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 98.0 | 12.8s | 15.0s | $0.00073 | 173 | 0% | 0 | 0 |

## draft

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 100.0 | 6.8s | 9.5s | $0.00037 | 267 | 0% | 0 | 0 |

## extract

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 99.2 | 6.7s | 10.3s | $0.00068 | 242 | 0% | 0 | 0 |

## tailor

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 96.0 | 4.9s | 6.5s | $0.00033 | 279 | 0% | 0 | 0 |

## apply

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 93.4 | 9.9s | 12.5s | $0.00040 | 295 | 0% | 0 | 0 |

## practice

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 89.7 | 25.3s | 36.6s | $0.00127 | 491 | 0% | 0 | 0 |

## ocr

| model | quality | time p50 | time p95 | cost/call | think tok | cache hit | errors | truncated |
|---|---|---|---|---|---|---|---|---|
| openai/gpt-6-luna | 98.2 | 9.1s | 22.5s | $0.00067 | 544 | 0% | 0 | 0 |

## Overall (mean over tasks)

| model | quality | time p50 | cost/call |
|---|---|---|---|
| openai/gpt-6-luna | 96.4 | 10.8s | $0.00063 |
