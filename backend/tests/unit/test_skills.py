from __future__ import annotations

from typing import get_args

from job_search_platform.services.authorization import GRANT_CAPABILITIES, GRANT_WORK_RESOURCES
from job_search_platform.services.contracts import Capability, Operation, ProtocolJobInput, ToolDescriptor
from job_search_platform.services.skills import SKILL_BY_ID, SKILLS


def test_registry_matches_operation_literal_in_order():
    assert tuple(skill.id for skill in SKILLS if skill.kind == "task") == get_args(Operation)
    assert len(SKILL_BY_ID) == len(SKILLS)


def test_every_skill_capability_is_a_grant_capability():
    assert {skill.capability for skill in SKILLS} <= set(get_args(Capability))
    assert SKILL_BY_ID["evaluate_job"].capability == "jobs:evaluate"
    assert SKILL_BY_ID["draft_documents"].capability == "documents:draft"
    assert SKILL_BY_ID["tailor_cv"].capability == "cv:tailor"
    assert SKILL_BY_ID["apply_prepare"].capability == SKILL_BY_ID["apply_submit"].capability == "applications:apply"
    assert SKILL_BY_ID["draft_follow_up"].capability == "documents:draft"
    plain = {"evaluate_job", "draft_documents", "tailor_cv", "draft_follow_up"}
    assert all(skill.input_model is ProtocolJobInput for skill in SKILLS if skill.id in plain)


def test_owner_only_operations_are_not_skills():
    for operation in ("export_document", "profile_cv", "match_jobs", "extract_experience"):
        assert operation not in SKILL_BY_ID
        assert operation not in GRANT_WORK_RESOURCES


def test_grant_capabilities_unchanged():
    assert GRANT_CAPABILITIES == frozenset({"results:read", "jobs:evaluate", "documents:draft", "cv:tailor", "jobs:search",
                                     "applications:apply"})
    assert GRANT_WORK_RESOURCES == frozenset({"evaluate_job", "draft_documents", "tailor_cv", "apply_prepare", "apply_submit", "draft_follow_up"})


def test_tool_descriptor_name_is_one_flat_enum():
    name = ToolDescriptor.model_json_schema()["properties"]["name"]
    assert name["enum"] == ["evaluate_job", "draft_documents", "tailor_cv", "apply_prepare", "apply_submit", "draft_follow_up", "jobs_search", "jobs_fit", "get_run", "cancel_run", "list_results"]
