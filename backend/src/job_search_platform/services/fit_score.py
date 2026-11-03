"""Fit score rubric: the model judges each requirement, this code turns the judgments into 0-100.

Weights by importance: critical 5, high 3, meaningful 2, preferred 1, low_signal 0.5.
Credit by match: strong 1.0, partial 0.5, missing 0; not_applicable rows drop out.
percent = round(100 * sum(weight * credit) / sum(weight)).
Gate: any critical requirement that is missing caps the percent at 59.
Fewer than 3 scorable rows -> no percent (not enough evidence).
Bands: 80-100 strong, 60-79 good, 40-59 partial, 20-39 weak, 0-19 poor.
Full text with worked examples: docs/engineering/fit-score-rubric.md
"""
from __future__ import annotations

from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

WEIGHTS = {"critical": 5, "high": 3, "meaningful": 2, "preferred": 1, "low_signal": 0.5}
CREDIT = {"strong": 1.0, "partial": 0.5, "missing": 0.0}
GATE_CAP = 59
MIN_ROWS = 3
BANDS = ((80, "strong"), (60, "good"), (40, "partial"), (20, "weak"), (0, "poor"))


def band_of(percent: int) -> str:
    return next(name for floor, name in BANDS if percent >= floor)


def compute_fit_percent(requirements: Iterable[Any]) -> dict | None:
    """Rows need `.importance` and `.match`. Returns {percent, band, basis} or None when under-evidenced."""
    counts = {"strong": 0, "partial": 0, "missing": 0, "not_applicable": 0}
    total = earned = 0.0
    critical_missing = False
    for row in requirements:
        counts[row.match] += 1
        if row.match == "not_applicable":
            continue
        weight = WEIGHTS[row.importance]
        total += weight
        earned += weight * CREDIT[row.match]
        critical_missing = critical_missing or (row.importance == "critical" and row.match == "missing")
    if counts["strong"] + counts["partial"] + counts["missing"] < MIN_ROWS or total == 0:
        return None
    raw = int((Decimal(100 * earned) / Decimal(total)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    capped = critical_missing and raw > GATE_CAP
    percent = GATE_CAP if capped else raw
    return {"percent": percent, "band": band_of(percent),
            "basis": {**counts, "critical_missing": critical_missing, "capped": capped}}
