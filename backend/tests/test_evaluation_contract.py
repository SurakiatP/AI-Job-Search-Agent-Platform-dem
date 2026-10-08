import pytest
from pydantic import ValidationError

from job_search_platform.services.contracts import EvaluationResult


def test_generated_evaluation_has_report_native_score_and_no_private_trace():
    report = EvaluationResult(report_markdown="## Fit\nSynthetic evidence-backed evaluation.", score=4.5)
    assert report.score == 4.5
    assert report.model_dump()["report_markdown"].startswith("## Fit")
    for invalid in ({"report_markdown": " "},
                    {"report_markdown": "report", "score": 6},
                    {"report_markdown": "report", "native_trace": "private tool data"}):
        with pytest.raises(ValidationError):
            EvaluationResult.model_validate(invalid)


def test_old_rows_without_skill_coverage_still_validate():
    assert EvaluationResult.model_validate({"report_markdown": "r", "score": 3.0}).skill_coverage is None
    full = EvaluationResult.model_validate({"report_markdown": "r", "skill_coverage": {
        "required": ["A", "B"], "matched": ["A"], "missing": ["B"], "ratio": 0.5, "method": "keyword_dictionary_v1"}})
    assert full.model_dump(mode="json")["skill_coverage"]["matched"] == ["A"]
