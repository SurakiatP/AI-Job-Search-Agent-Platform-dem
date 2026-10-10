from __future__ import annotations

from typing import get_args

import pytest

from job_search_platform.services.agent_jobs import markdown_to_text
from job_search_platform.services.contracts import Operation
from job_search_platform.services.skills import SKILLS


def test_markdown_to_text_strips_markup_and_keeps_words():
    md = (
        "# Role\n\nWe need **Python** and _Docker_ skills.\n\n"
        "- Build [APIs](https://x.test/a)\n* Ship `code`\n\n> quoted\n\n---\n\n"
        "```python\nprint(1)\n```\n\n![logo](https://x.test/l.png)\n\n\n\nEnd"
    )
    text = markdown_to_text(md)
    assert text == "Role\n\nWe need Python and Docker skills.\n\n- Build APIs\n- Ship code\n\nquoted\n\nprint(1)\n\nlogo\n\nEnd"
    assert markdown_to_text(text) == text


def test_markdown_to_text_leaves_snake_case_and_math_alone():
    assert markdown_to_text("use snake_case_name and 2*3") == "use snake_case_name and 2*3"


def test_direct_skills_have_handlers_and_are_not_operations():
    direct = [s for s in SKILLS if s.kind == "direct"]
    assert {s.id for s in direct} == {"jobs_search", "jobs_fit"}
    for skill in direct:
        assert callable(skill.handler) and skill.output_model is not None
        assert skill.id not in get_args(Operation)


def test_task_skills_have_no_handler_and_are_operations():
    tasks = [s for s in SKILLS if s.kind == "task"]
    assert tasks
    for skill in tasks:
        assert skill.handler is None
        assert skill.id in get_args(Operation)


def test_new_capability_is_registered_for_jobs_search():
    skills = {s.id: s for s in SKILLS}
    assert skills["jobs_search"].capability == "jobs:search"
    assert skills["jobs_fit"].capability == "jobs:evaluate"
