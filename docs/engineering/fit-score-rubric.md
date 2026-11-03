# Fit score rubric

The AI judges each requirement of the job against the CV. The platform computes the number, so the same rows always give the same percent. Code: `backend/src/job_search_platform/services/fit_score.py`.

| Importance | Weight | Meaning |
|---|---|---|
| critical | 5 | The posting says must / required / essential, or the role cannot be done without it |
| high | 3 | Central to the daily work |
| meaningful | 2 | Clearly wanted |
| preferred | 1 | Nice to have |
| low_signal | 0.5 | Boilerplate, perks |

| Match | Credit |
|---|---|
| strong | 1.0 |
| partial | 0.5 |
| missing | 0 |
| not_applicable | row leaves the calculation |

`percent = round(100 * sum(weight * credit) / sum(weight))`, rounded half up.

- Gate: if any critical row is missing, the percent is capped at 59.
- Fewer than 3 scorable rows (strong, partial or missing): no percent.
- Bands: 80-100 strong, 60-79 good, 40-59 partial, 20-39 weak, 0-19 poor.

Example: critical strong (5), high partial (1.5 of 3), preferred missing (0 of 1) gives 6.5 / 9 = 72, band good.

The importance override: Career Ops treats importance as not affecting its 1-5 score. This app does weight by importance on purpose.

Results stored before this rubric keep their 1-5 `score`; they are never converted to a percent.
