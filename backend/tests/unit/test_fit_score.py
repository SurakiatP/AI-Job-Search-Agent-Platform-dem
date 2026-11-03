import json
from types import SimpleNamespace as R

from job_search_platform.services.fit_score import band_of, compute_fit_percent
from job_search_platform.workers.executor import RunExecutor, parse_evaluation_result


def rows(*spec):
    return [R(importance=i, match=m) for i, m in spec]


def test_weights_and_rounding():
    got = compute_fit_percent(rows(("critical", "strong"), ("high", "partial"), ("preferred", "missing")))
    assert got["percent"] == 72 and got["band"] == "good"
    assert got["basis"] == {"strong": 1, "partial": 1, "missing": 1, "not_applicable": 0, "critical_missing": False, "capped": False}


def test_rounds_half_up():
    # 1 of 8 weight units earned = 12.5 -> 13
    got = compute_fit_percent(rows(("preferred", "strong"), ("high", "missing"), ("high", "missing"), ("preferred", "missing")))
    assert got["percent"] == 13


def test_critical_missing_caps_at_59():
    got = compute_fit_percent(rows(("critical", "missing"), ("high", "strong"), ("high", "strong"), ("meaningful", "strong")))
    assert got["percent"] == 59 and got["basis"]["capped"] and got["basis"]["critical_missing"]


def test_cap_does_not_raise_low_scores():
    got = compute_fit_percent(rows(("critical", "missing"), ("high", "missing"), ("high", "missing")))
    assert got["percent"] == 0 and not got["basis"]["capped"]


def test_not_applicable_drops_out_and_few_rows_give_none():
    assert compute_fit_percent(rows(("critical", "strong"), ("high", "strong"), ("high", "not_applicable"))) is None
    got = compute_fit_percent(rows(("critical", "strong"), ("high", "strong"), ("preferred", "strong"), ("high", "not_applicable")))
    assert got["percent"] == 100 and got["basis"]["not_applicable"] == 1
    assert compute_fit_percent([]) is None


def test_bands():
    assert [band_of(n) for n in (100, 80, 79, 60, 59, 40, 39, 20, 19, 0)] == [
        "strong", "strong", "good", "good", "partial", "partial", "weak", "weak", "poor", "poor"]


def test_parse_ignores_model_score_and_stores_basis():
    report = {"verdict": "v", "summary": "s", "requirements": [
        {"requirement": "a", "importance": "critical", "match": "strong"},
        {"requirement": "b", "importance": "high", "match": "strong"},
        {"requirement": "c", "importance": "high", "match": "strong"}]}
    out = parse_evaluation_result(json.dumps({"score": 1, "report": report}))
    assert out.score is None and out.score_percent == 100 and out.score_band == "strong" and out.score_basis.strong == 3
    short = parse_evaluation_result(json.dumps({"report": {**report, "requirements": report["requirements"][:2]}}))
    assert short.score_percent is None and short.score_basis is None


def test_prompt_gives_rubric_and_asks_no_score():
    run = R(operation="evaluate_job", output_language="en", input_snapshot={"job": {"title": "t", "description": "d"}})
    task = RunExecutor._prompt(run, "cv text")[0]
    assert '"score"' not in task and "importance: critical" in task and "match: strong" in task and "different languages" in task


def test_mcp_run_result_carries_percent_and_legacy_score():
    from datetime import datetime, timezone
    from job_search_platform.api.mcp import _run_result
    from job_search_platform.services.contracts import EvaluationResult
    for ev, want in ((EvaluationResult(report_markdown="r", score_percent=72, score_band="good"), {"score_percent": 72, "score_band": "good"}),
                     (EvaluationResult(report_markdown="r", score=4.5), {"score": 4.5})):
        run = R(id="x", status="completed", operation="evaluate_job", created_at=datetime.now(timezone.utc), evaluation_result=ev)
        got = _run_result(run)
        assert {k: got[k] for k in ("score_percent", "score_band", "score") if k in got} == want
