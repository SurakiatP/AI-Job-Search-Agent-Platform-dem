"""Benchmark runner rules that need no database: verdict, summary, unsupported task, one at a time."""
from unittest.mock import MagicMock

import pytest

from job_search_platform.services import benchmark
from job_search_platform.services.errors import ServiceError


def test_supported_operations_map_to_gold_tasks():
    assert benchmark.SUPPORTED_OPERATIONS == {"evaluate_job", "draft_documents", "extract_experience", "tailor_cv",
                                              "apply_prepare", "interview_generate", "interview_grade",
                                              "interview_report", "document_ocr"}
    assert set(benchmark.TASK_OF.values()) <= set(benchmark._gold().TASKS)


def test_run_bench_knows_medium_and_high():
    assert benchmark._gold().MODES["medium"] == {"effort": "medium"} and benchmark._gold().MODES["high"] == {"effort": "high"}


@pytest.mark.parametrize("quality, errors, baseline, expected", [
    (80.0, 0, 80.0, "green"), (78.0, 0, 80.0, "green"),  # drop of exactly 2 is allowed
    (77.9, 0, 80.0, "red"), (90.0, 1, 80.0, "red"), (0.0, 1, None, "red"), (10.0, 0, None, "green")])
def test_verdict(quality, errors, baseline, expected):
    summary = {"quality": quality, "errors": errors}
    assert benchmark._verdict(summary, None if baseline is None else {"quality": baseline}) == expected


def test_summary_counts_errors_truncations_and_cost():
    results = [{"quality": 100.0, "total_s": 1.0, "cost_usd": 0.02},
               {"quality": 50.0, "total_s": 3.0, "cost_usd": 0.04, "truncated": True},
               {"quality": 0.0, "error": "URLError: x", "total_s": None}]
    s = benchmark._summary(results, {"in": 1, "out": 1, "cache": 1}, True)
    assert (s["quality"], s["errors"], s["truncations"], s["cost_has_manual"]) == (50.0, 1, 1, True)
    assert s["cost_per_call_usd"] == pytest.approx(0.02) and s["p50_seconds"] == 3.0
    assert benchmark._summary(results, None, True)["cost_per_call_usd"] is None


def test_unsupported_operation_is_refused_before_anything_else():
    for op in ("nope", "apply_submit"):
        with pytest.raises(ServiceError) as err:
            benchmark.start(MagicMock(), None, op, "m/x", "low")
        assert err.value.code == "not_found"


def test_second_benchmark_while_one_runs_is_busy():
    assert benchmark._LOCK.acquire(blocking=False)
    try:
        with pytest.raises(ServiceError) as err:
            benchmark.start(MagicMock(), None, "evaluate_job", "m/x", "low")
        assert err.value.code == "benchmark_busy"
    finally:
        benchmark._LOCK.release()
