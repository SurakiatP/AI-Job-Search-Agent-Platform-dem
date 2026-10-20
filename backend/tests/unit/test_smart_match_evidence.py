"""FR-SM-07 / AC-SM-07: evidence lines are verbatim CV text, never paraphrased."""
import json
from pathlib import Path

import pytest

from job_search_platform.services.skill_coverage import extract_skills
from job_search_platform.services.smart_match import evidence_lines

CVS = json.loads((Path(__file__).parents[1] / "smart_match_eval" / "data" / "cvs.json").read_text(encoding="utf-8"))


def _bare(line: str) -> str:
    return line[:-1] if line.endswith("…") else line


@pytest.mark.parametrize("cv", CVS, ids=[c["id"] for c in CVS])
@pytest.mark.parametrize("limit", [160, 40])
def test_every_line_is_a_substring_of_the_cv(cv, limit):
    skills = extract_skills(cv["text"])
    lines = evidence_lines(cv["text"], skills, limit)
    assert set(lines) == set(skills)
    for skill, line in lines.items():
        assert skill in skills and _bare(line) and _bare(line) in cv["text"]
        assert len(_bare(line)) <= limit


def test_absent_skill_is_omitted():
    cv = "Backend engineer\nBuilt APIs in Python on weekends.\n"
    assert set(evidence_lines(cv, ["Python", "Kubernetes"])) == {"Python"}


def test_line_is_whole_stripped_line_with_first_mention():
    cv = "intro\n   Led Python migration, later Python 3.12 upgrade  \nother"
    assert evidence_lines(cv, ["Python"]) == {"Python": "Led Python migration, later Python 3.12 upgrade"}


def test_truncates_on_word_boundary_with_only_an_ellipsis_added():
    cv = "Python " + "word " * 20
    line = evidence_lines(cv, ["Python"], limit=22)["Python"]
    assert line == "Python word word word…"
    assert line[:-1] in cv


def test_unbroken_thai_line_is_hard_cut_still_substring():
    cv = "ใช้ Python " + "ก" * 300
    line = evidence_lines(cv, ["Python"], limit=50)["Python"]
    assert line.endswith("…") and len(line[:-1]) <= 50 and line[:-1] in cv


def test_corpus_yields_evidence():
    assert sum(len(evidence_lines(c["text"], extract_skills(c["text"]))) for c in CVS) > 20
