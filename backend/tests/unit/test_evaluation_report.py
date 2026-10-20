"""CR-EVR-01: structured evaluation report (spec 2026-10-20-structured-evaluation-report-design.md)."""
import json

import pytest

from job_search_platform.workers.executor import parse_evaluation_result

REPORT = {
    "verdict": "ควรสมัคร: ทักษะหลักตรงเกือบทั้งหมด",
    "summary": "คุณมีประสบการณ์ RAG ใช้งานจริงตรงกับงานนี้",
    "requirements": [
        {"requirement": "LLM pipelines / RAG", "importance": "critical", "match": "strong", "evidence": "แชตบอต RAG ภาษาไทย"},
        {"requirement": "Function calling", "importance": "high", "match": "partial", "evidence": "ใช้ LangChain"},
        {"requirement": "GKE", "importance": "preferred", "match": "missing", "evidence": ""},
    ],
    "strengths": ["RAG ใช้งานจริง"],
    "risks": ["ไม่มี GKE"],
    "interview_prep": ["เล่าเรื่องลดค่า LLM 35%"],
    "cv_changes": ["เพิ่มคำว่า function calling"],
}


def test_tc_evr_01_structured_report_keeps_fields_and_builds_markdown():
    result = parse_evaluation_result(json.dumps({"score": 4.2, "report": REPORT}, ensure_ascii=False))
    assert result.score == 4.2
    assert result.report is not None and result.report.requirements[1].match == "partial"
    md = result.report_markdown
    assert REPORT["verdict"] in md and REPORT["summary"] in md
    for row in REPORT["requirements"]:
        assert row["requirement"] in md
    for item in ("RAG ใช้งานจริง", "ไม่มี GKE", "เล่าเรื่องลดค่า LLM 35%", "เพิ่มคำว่า function calling"):
        assert item in md
    assert "4.2" not in md  # score is shown by the page, not repeated in the report


def test_tc_evr_02_old_shape_still_accepted():
    result = parse_evaluation_result(json.dumps({"report_markdown": "## Fit\nok", "score": 3}))
    assert result.report is None and result.report_markdown == "## Fit\nok"


@pytest.mark.parametrize("bad", [
    {"report": {**REPORT, "requirements": [{**REPORT["requirements"][0], "match": "maybe"}]}},
    {"report": {**REPORT, "requirements": [REPORT["requirements"][0]] * 31}},
    {"report": {**REPORT, "extra": "x"}},
    {"report": REPORT, "report_markdown": "both"},
    {"score": 4},
])
def test_tc_evr_03_invalid_structured_output_is_rejected(bad):
    with pytest.raises(ValueError, match="native_response_invalid"):
        parse_evaluation_result(json.dumps(bad, ensure_ascii=False))


def test_tc_evr_03_markdown_table_cells_cannot_break_out():
    row = {**REPORT["requirements"][0], "requirement": "A | B\nC"}
    md = parse_evaluation_result(json.dumps({"report": {**REPORT, "requirements": [row]}})).report_markdown
    assert "A \\| B C" in md
