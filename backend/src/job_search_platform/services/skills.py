"""Single declaration of every externally callable skill (TOR FR-A04).

MCP tools, A2A Agent Card skills, grant authorization and REST /tools read
from SKILLS. Owner-only runs (export_document, profile_cv, match_jobs,
extract_experience) are deliberately absent. Adding a skill means one entry
here plus its id in contracts.Operation; tests/unit/test_skills.py pins both.
"""
from __future__ import annotations

from dataclasses import dataclass

from job_search_platform.services.contracts import DTO, Capability, Operation, ProtocolJobInput


@dataclass(frozen=True)
class Skill:
    id: Operation
    name: str
    description: str
    capability: Capability
    tags: tuple[str, ...]
    examples: tuple[str, ...]
    input_model: type[DTO]


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
)
SKILL_BY_ID: dict[str, Skill] = {skill.id: skill for skill in SKILLS}
