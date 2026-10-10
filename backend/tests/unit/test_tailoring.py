from __future__ import annotations

import json
from uuid import uuid4

from job_search_platform.services.tailoring import apply_edits, parse_edits, round_prompt, should_stop

ID = str(uuid4())


def _raw(*edits):
    return json.dumps({"edits": list(edits)})


def test_parse_fenced_and_unfenced():
    raw = _raw({"find": "a", "text": "b", "evidence_ids": [ID]})
    expected = [{"find": "a", "text": "b", "evidence_ids": [ID]}]
    assert parse_edits(raw) == expected
    assert parse_edits("```json\n" + raw + "\n```") == expected


def test_parse_defaults_find_and_malformed():
    assert parse_edits(_raw({"text": "b", "evidence_ids": [ID]}))[0]["find"] == ""
    assert parse_edits("not json") == []
    assert parse_edits("[1]") == []
    assert parse_edits('{"edits": 3}') == []


def test_parse_drops_invalid():
    good = {"text": "ok", "evidence_ids": [ID]}
    bad = [
        "x", {"text": "t", "evidence_ids": ["nope"]}, {"text": "", "evidence_ids": [ID]},
        {"text": "x" * 2001, "evidence_ids": [ID]}, {"text": "t", "evidence_ids": []},
        {"text": "t", "evidence_ids": [ID] * 21}, {"text": "t", "evidence_ids": ID},
    ]
    assert [e["text"] for e in parse_edits(_raw(*bad, good))] == ["ok"]


def test_parse_caps_at_eight():
    assert len(parse_edits(_raw(*[{"text": str(i), "evidence_ids": [ID]} for i in range(12)]))) == 8


def test_apply_replace_append_skip():
    edits = [
        {"find": "Python", "text": "Python, Go", "evidence_ids": [ID]},
        {"find": "", "text": "Skills: Rust", "evidence_ids": [ID]},
        {"find": "missing", "text": "zzz", "evidence_ids": [ID]},
    ]
    text, applied = apply_edits("Python and Python", edits)
    assert text == "Python, Go and Python\nSkills: Rust"
    assert applied == edits[:2]


def test_stop_reasons():
    assert should_stop([0.5], [1], 30, 0, 100) == "max_rounds"
    assert should_stop([0.5], [1], 3, 100, 100) == "time_budget"
    assert should_stop([0.5, 1.0], [1], 1, 0, 100) == "full_coverage"
    assert should_stop([0.5, 0.5, 0.5], [0, 0], 2, 0, 100) == "no_gain"
    assert should_stop([None, None, None], [0, 0], 2, 0, 100) == "no_gain"


def test_stop_none():
    assert should_stop([0.5, 0.6], [1], 1, 0, 100) is None
    assert should_stop([0.5, 0.5, 0.6], [1, 1], 2, 0, 100) is None
    assert should_stop([None, None], [0, 1], 2, 0, 100) is None
    assert should_stop([None], [0], 1, 0, 100) is None


def test_round_prompt():
    prompt, instructions = round_prompt("# CV", "Dev", "job text", ["docker", "k8s"], [{"id": ID, "text": "Built X", "context": "Eng, Acme"}], "en")
    assert ID in prompt and "docker" in prompt and "k8s" in prompt and "Built X" in prompt
    assert "JSON" in instructions and "untrusted" in instructions
