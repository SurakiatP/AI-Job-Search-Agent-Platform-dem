"""CR-IVP-01 FR-IVP-07: model answers follow the CV-tailoring evidence rule (require_evidence), not the stricter form rule."""
import json
from uuid import uuid4

from job_search_platform.services import practice
from job_search_platform.services.evidence import claims

FACT = uuid4()
FACTS = {FACT: claims("Built a test set of 500 questions for RAG answers")}
CV = "Thai RAG chatbot at Example Telecom. Cut answer time by 60%."


def _answer(text, ids=(str(FACT),)):
    raw = json.dumps({"questions": [{"section": "behavioral", "prompt": "Q", "why": "w", "key_points": [],
                                     "model_answer": text, "evidence_ids": list(ids)}]})
    questions, _ = practice.parse_reply(raw, [{"id": "behavioral", "count": 1}], FACTS, set(), known=claims(CV))
    return questions[0]["model_answer"]


def test_names_from_the_owner_cv_are_allowed():
    assert _answer("At Example Telecom I built a test set of 500 questions for RAG answers.")


def test_new_numbers_and_unknown_names_still_drop_the_answer():
    assert _answer("I built a test set of 900 questions.") is None          # number not in the cited fact
    assert _answer("At Globex I built a test set of 500 questions.") is None  # name in neither CV nor fact
    assert _answer("I cut answer time by 60%.") is None                     # numbers must come from cited facts
    assert _answer("I built a test set of 500 questions.", ids=()) is None  # uncited
    assert _answer("I built a test set of 500 questions.", ids=("not-a-uuid",)) is None


def test_short_fact_labels_map_back_to_real_ids_and_bad_labels_drop():
    facts = [{"id": str(FACT), "text": "Built a test set of 500 questions for RAG answers", "context": ""}]
    body, _ = practice.prompt(level="mid", sections=[{"id": "behavioral", "count": 1}], job={"title": "T", "description": "D"},
                              cv_text=CV, facts=facts, report=None, output_language="en")
    assert "[F1] Built a test set" in body and str(FACT) not in body  # models copy short labels reliably
    aliases = practice.aliases(facts)
    raw = json.dumps({"questions": [{"section": "behavioral", "prompt": "Q", "why": "w", "key_points": [],
                                     "model_answer": "I built a test set of 500 questions.", "evidence_ids": ["F1"]},
                                    {"section": "behavioral", "prompt": "Q2", "why": "w", "key_points": [],
                                     "model_answer": "I built a test set of 500 questions.", "evidence_ids": ["F9"]}]})
    questions, _ = practice.parse_reply(raw, [{"id": "behavioral", "count": 2}], FACTS, set(), known=claims(CV), aliases=aliases)
    assert questions[0]["model_answer"] and questions[0]["evidence_ids"] == [str(FACT)]
    assert questions[1]["model_answer"] is None
    assert practice.cited_ids(raw, aliases) == {str(FACT)}


def test_fact_labels_never_reach_the_owner():
    raw = json.dumps({"questions": [{"section": "technical", "prompt": "RAG (F3) steps?", "why": "In the CV (F28) and JD",
                                     "key_points": ["Chunking [F2]", "Embeddings"], "model_answer": None, "evidence_ids": []}],
                      "reverse_questions": ["Which stack (F4)?"]})
    (q,), reverse = practice.parse_reply(raw, [{"id": "technical", "count": 1}], {}, set())
    assert (q["prompt"], q["why"], q["key_points"], reverse) == ("RAG steps?", "In the CV and JD", ["Chunking", "Embeddings"], ["Which stack?"])
    facts = [{"id": str(FACT), "text": "Built a test set"}]
    grade = practice.parse_grade(json.dumps({"scores": {k: 3 for k in practice.DIMENSIONS}, "summary": "Use F1 more",
                                             "add": ["Cite (F1)"], "star": [], "unused_fact_ids": []}), "x", facts, card=False)
    assert grade["summary"] == "Use more" and grade["add"] == ["Cite"]
    card = practice.parse_grade(json.dumps({"verdict": "partial", "missing": ["re-ranking (F9)"], "note": "See F9."}), "x", facts, card=True)
    assert card["missing"] == ["re-ranking"] and card["note"] == "See."
    report = practice.parse_report(json.dumps({"strengths": ["Clear (F2) intro"], "skills_to_build": [], "plan": ["Review F5"],
                                               "readiness": [{"section": "intro", "level": "almost", "note": "Add F1 numbers"}]}), {"intro"})
    assert report["strengths"] == ["Clear intro"] and report["plan"] == ["Review"] and report["readiness"][0]["note"] == "Add numbers"


def test_report_prompt_names_scores_in_plain_words():
    from types import SimpleNamespace
    q = {"section": "intro", "prompt": "About you", "ready": False, "card_rating": None,
         "attempts": [{"feedback": {"status": "done", "kind": "answer", "scores": {k: 4 for k in practice.DIMENSIONS}}}]}
    body, instructions = practice.report_prompt(set_row=SimpleNamespace(sections=[{"id": "intro", "count": 1}], level="mid"),
                                                questions=[q], job={"title": "AI Engineer"}, report=None, output_language="th")
    assert "company_fit" not in body and "เข้ากับบริษัท 4/5" in body and "โครงเรื่อง 4/5" in body
    assert "field names" in instructions
