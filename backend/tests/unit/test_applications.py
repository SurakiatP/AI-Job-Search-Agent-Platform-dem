"""Pure apply_prepare helpers: tolerant parsing, the evidence gate and parked detection."""
import json
from uuid import uuid4

from job_search_platform.services.applications import gate_answers, pack_prompt, parse_answers
from job_search_platform.services.evidence import claims

F1, F2 = uuid4(), uuid4()
FACTS = {F1: claims("Packaged services with Docker, 5 years"), F2: claims("Wrote Python services")}
QUESTIONS = [
    {"id": "why", "label": "Why us?", "required": True, "kind": "text"},
    {"id": "auth", "label": "Authorised?", "required": True, "kind": "boolean"},
    {"id": "level", "label": "Level", "required": False, "kind": "choice", "choices": ["junior", "senior"]},
]


def _answers(**by_id):
    return [{"question_id": k, "answer": a, "evidence_ids": [str(i) for i in ids]} for k, (a, ids) in by_id.items()]


def test_parse_is_tolerant_and_keeps_only_well_formed_items():
    raw = "```json\n" + json.dumps({"answers": [
        {"question_id": "why", "answer": "x", "evidence_ids": [str(F1), "not-a-uuid"]},
        {"question_id": 7, "answer": "bad"}, "junk", {"question_id": "auth", "answer": None}]}) + "\n```"
    assert parse_answers(raw) == [{"question_id": "why", "answer": "x", "evidence_ids": [str(F1)]},
                                  {"question_id": "auth", "answer": None, "evidence_ids": []}]
    assert parse_answers("nope") == [] and parse_answers('{"answers": 3}') == []


def test_gate_keeps_supported_answers_in_question_order():
    entries, missing = gate_answers(
        _answers(level=("senior", [F2]), auth=(True, [F2]), why=("Packaged services with Docker", [F1])), QUESTIONS, FACTS)
    assert [e["question_id"] for e in entries] == ["why", "auth", "level"]
    assert all(e["answer"] is not None and "reason" not in e for e in entries) and missing == []
    assert [e["label"] for e in entries] == ["Why us?", "Authorised?", "Level"]


def test_gate_nulls_unsupported_claims_invalid_options_and_missing_evidence():
    entries, missing = gate_answers(_answers(
        why=("Used Docker for 9 years", [F1]),  # number not in the cited fact
        auth=("yes", [F2]),  # boolean must be a real boolean
        level=("principal", [F2])), QUESTIONS, FACTS)
    assert [e["reason"] for e in entries] == ["unsupported_claim", "invalid_answer", "invalid_answer"]
    assert missing == ["why", "auth"]  # level is optional
    skill, _ = gate_answers(_answers(why=("Wrote Terraform modules", [F2])), QUESTIONS[:1], FACTS)
    assert skill[0]["reason"] == "unsupported_claim"
    unknown, _ = gate_answers(_answers(why=("Wrote Python services", [uuid4()])), QUESTIONS[:1], FACTS)
    assert unknown[0]["reason"] == "evidence_required"
    uncited, _ = gate_answers(_answers(why=("Wrote Python services", [])), QUESTIONS[:1], FACTS)
    assert uncited[0]["reason"] == "evidence_required"


def test_unanswered_required_question_is_parked_and_optional_is_not():
    entries, missing = gate_answers([], QUESTIONS, FACTS)
    assert missing == ["why", "auth"] and entries[2] == {
        "question_id": "level", "label": "Level", "answer": None, "evidence_ids": [], "reason": "not_answerable"}
    null_answer, missing = gate_answers(_answers(why=(None, [])), QUESTIONS[:1], FACTS)
    assert missing == ["why"] and null_answer[0]["reason"] == "not_answerable"


def test_prompt_marks_questions_as_data_and_lists_fact_ids():
    prompt, instructions = pack_prompt("CV text", "Dev", "Dev job", QUESTIONS, [{"id": str(F1), "text": "Docker"}], "en")
    assert str(F1) in prompt and "Questions (JSON data)" in prompt and '"id": "why"' in prompt
    assert "untrusted data" in instructions and "Nothing is submitted" in instructions
