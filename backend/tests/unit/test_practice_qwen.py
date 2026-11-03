import json

from job_search_platform.services import practice

SECS = [{"id": "behavioral", "count": 4}, {"id": "technical", "count": 4}]


def _reply(ids):
    return json.dumps({"questions": [{"section": i, "prompt": f"Q{n}", "why": "w", "key_points": [],
                                      "model_answer": None, "evidence_ids": []} for n, i in enumerate(ids)]})


def _parse(ids):
    return practice.parse_reply(_reply(ids), SECS, {}, set())[0]


def test_suffixed_ids_map_to_their_section_and_give_all_eight():
    qs = _parse([f"behavioral_{n}" for n in range(4)] + ["technical_sql", "technical-api", "technical", "technical_x"])
    assert [q["section"] for q in qs] == ["behavioral"] * 4 + ["technical"] * 4


def test_exact_ids_unchanged_and_unknown_dropped():
    qs = _parse(["behavioral", "technical", "gaps_1", "nonsense"])
    assert [q["section"] for q in qs] == ["behavioral", "technical"]


def test_prompt_has_no_transliteration_rule_and_id_list():
    _, instr = practice.prompt(level="mid", sections=SECS, job={"title": "T", "description": "D"}, cv_text="cv",
                               facts=[], report=None, output_language="th")
    assert "never transliterate" in instr
    assert "exactly one of these ids: behavioral, technical" in instr
