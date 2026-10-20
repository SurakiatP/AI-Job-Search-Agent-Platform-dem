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
