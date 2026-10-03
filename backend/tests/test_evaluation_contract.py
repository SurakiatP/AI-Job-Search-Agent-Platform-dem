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
