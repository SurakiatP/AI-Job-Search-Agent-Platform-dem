from __future__ import annotations

import pytest

from job_search_platform.services.experience import extraction_prompt, normalize, numbers, parse_experience_items, text_hash


def test_normalize_thai_digits_and_bullets():
    assert normalize("  • ลดเวลาโหลดข้อมูล ๔๐%  ") == "ลดเวลาโหลดข้อมูล 40%"
    assert normalize("1) Built   APIs\n") == "built apis"
    assert text_hash("• Built APIs") == text_hash("built apis")


def test_leading_decimals_and_signs_are_not_bullets():
    assert normalize("4.0 GPA") == "4.0 gpa"
    assert numbers("3.5 years of Python") == {"3.5"}
    assert text_hash("3.5 years of Python") != text_hash("5 years of Python")
    assert normalize("-5% churn") == "-5% churn"
    assert normalize("• x") == normalize("1) x") == normalize("- x") == normalize("1. x") == "x"


def test_curly_quotes_and_dashes_fold():
    assert normalize("Led “Data” team – 2022") == normalize('Led "Data" team - 2022')
    assert normalize("O’Brien — − ‒ ‘x’") == "o'brien - - - 'x'"


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


def test_found_in_does_not_split_numbers_at_separators():
    from job_search_platform.services.experience import _found_in
    cv = normalize("3.5 years of Python; 1,000 users; 2022, 2023; v2.1 shipped")
    assert not _found_in(normalize("5 years of Python"), cv)
    assert not _found_in(normalize("000 users"), cv)
    assert not _found_in(normalize("3 years"), normalize("3.5 years"))
    assert not _found_in(normalize("1 shipped"), cv)
    assert _found_in(normalize("3.5 years of Python"), cv)
    assert _found_in(normalize("1,000 users"), cv)
    assert _found_in(normalize("2022"), cv) and _found_in(normalize("2023"), cv)
