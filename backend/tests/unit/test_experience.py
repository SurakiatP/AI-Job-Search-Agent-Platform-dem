from __future__ import annotations

import pytest

from job_search_platform.services.experience import extraction_prompt, normalize, numbers, parse_experience_items, text_hash


def test_normalize_thai_digits_and_bullets():
    assert normalize("  • ลดเวลาโหลดข้อมูล ๔๐%  ") == "ลดเวลาโหลดข้อมูล 40%"
    assert normalize("1) Built   APIs\n") == "built apis"
    assert text_hash("• Built APIs") == text_hash("built apis")


def test_verbatim_across_wrapped_lines():
    cv = "Experience\n• Built Airflow pipelines that cut\n  load time by 40%\n• Ran BigQuery"
    assert normalize("Built Airflow pipelines that cut load time by 40%") in normalize(cv)


def test_numbers_strip_thousands_separators():
    assert numbers("Saved 1,000 hours in 2022–2024, 40%") == {"1000", "2022", "2024", "40"}


def test_parse_items_accepts_fence_and_rejects_bad_shapes():
    good = '```json\n{"items":[{"kind":"skill","text":"Python","role":null,"organization":null,"period":null}]}\n```'
    assert [i.text for i in parse_experience_items(good)] == ["Python"]
    for bad in ('{"items":[{"kind":"hobby","text":"x"}]}', '{"facts":[]}', "not json", '{"items":[{"kind":"skill","text":""}]}'):
        with pytest.raises(ValueError):
            parse_experience_items(bad)


def test_prompt_contains_cv_and_verbatim_rule():
    prompt, instructions = extraction_prompt("CV BODY")
    assert "CV BODY" in prompt and "verbatim" in prompt and "untrusted" in instructions
