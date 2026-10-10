"""Single declaration of every externally callable skill (TOR FR-A04).

MCP tools, A2A Agent Card skills, grant authorization and REST /tools read
from SKILLS. Owner-only runs (export_document, profile_cv, match_jobs,
extract_experience) are deliberately absent. Adding a skill means one entry
here plus its id in contracts.Operation; tests/unit/test_skills.py pins both.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from job_search_platform.services import agent_jobs
from job_search_platform.services.contracts import (
    DTO, AgentJobFit, AgentJobFitResult, AgentJobSearch, AgentJobSearchResult, Capability, ProtocolJobInput,
)


@dataclass(frozen=True)
class Skill:
    id: str  # a contracts.Operation for kind "task"; direct ids are never Operations
    name: str
    description: str
    capability: Capability
    tags: tuple[str, ...]
    examples: tuple[str, ...]
    input_model: type[DTO]
    kind: Literal["task", "direct"] = "task"
    # Direct skills only: awaited as handler(services, actor, validated_request) -> dict; creates no Run.
    handler: Callable[[Any, Any, Any], Awaitable[dict]] | None = None
    output_model: type[DTO] | None = None


SKILLS: tuple[Skill, ...] = (
    Skill(
        id="evaluate_job",
        name="Evaluate job",
        description="Evaluate one supplied job posting or same-Project job revision against the current CV.",
        capability="jobs:evaluate",
        tags=("jobs", "evaluation"),
        examples=("Evaluate this job posting",),
        input_model=ProtocolJobInput,
    ),
    Skill(
        id="draft_documents",
        name="Draft application documents",
        description="Draft application documents for one supplied job posting or same-Project job revision.",
        capability="documents:draft",
        tags=("documents", "drafting"),
        examples=("Draft application documents for this job",),
        input_model=ProtocolJobInput,
    ),
    Skill(
        id="tailor_cv",
        name="Tailor CV",
        description="Tailor the current Project CV to one supplied job posting or same-Project job revision using only experience-bank evidence; produces a draft CV revision.",
        capability="cv:tailor",
        tags=("cv", "tailoring"),
        examples=("Tailor my CV for this job",),
        input_model=ProtocolJobInput,
    ),
    Skill(
        id="jobs_search",
        name="Search jobs",
        description=(
            "Search public Thailand job postings. Returns up to 50 postings with the full description "
            "(markdown or plain text), posting age in days and a stale flag. Read-only; creates no Task."
        ),
        capability="jobs:search",
        tags=("jobs", "search"),
        examples=("Find remote Python jobs in Bangkok posted in the last 7 days",),
        input_model=AgentJobSearch,
        kind="direct",
        handler=agent_jobs.jobs_search,
        output_model=AgentJobSearchResult,
    ),
    Skill(
        id="jobs_fit",
        name="Job fit coverage",
        description=(
            "Deterministic keyword skill coverage of the current Project CV against one supplied job or "
            "same-Project job revision: required, matched and missing skills and a ratio. No model is called; "
            "creates no Task."
        ),
        capability="jobs:evaluate",
        tags=("jobs", "fit"),
        examples=("How well does my CV cover this job's skills?",),
        input_model=AgentJobFit,
        kind="direct",
        handler=agent_jobs.jobs_fit,
        output_model=AgentJobFitResult,
    ),
)
SKILL_BY_ID: dict[str, Skill] = {skill.id: skill for skill in SKILLS}
