import pytest

from job_search_platform.services import experience
from job_search_platform.workers.executor import _native_json, repair_prompt


def test_repair_prompt_names_shape_and_forbids_prose():
    text = repair_prompt('{"items": []}', "[1, 2]")
    assert '{"items": []}' in text and "[1, 2]" in text and "no code fence" in text


def test_bare_array_is_invalid_for_extraction():
    with pytest.raises(ValueError):
        experience.parse_experience_items("[]")
    assert experience.parse_experience_items('{"items": []}') == []


def test_extraction_prompt_requires_object():
    assert "JSON object" in experience.extraction_prompt("cv")[0]
