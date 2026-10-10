"""Evidence gate: AI-written CV edits must cite live candidate facts of the same project."""
from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from job_search_platform.db.models import ExperienceItem
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.experience import numbers
from job_search_platform.services.tailoring import apply_edits


class EvidencedEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    text: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


def fact_numbers(db: Session, project_id: UUID, ids) -> dict[UUID, set[str]]:
    """Numbers stated by each live fact of the project, keyed by fact id."""
    wanted = set(ids)
    return {row.id: numbers(f"{row.text} {row.period or ''}") for row in db.execute(
        select(ExperienceItem.id, ExperienceItem.text, ExperienceItem.period).where(
            ExperienceItem.project_id == project_id, ExperienceItem.id.in_(wanted),
            ExperienceItem.removed_at.is_(None)))} if wanted else {}


def apply_gated(text: str, edits: Sequence[dict], facts: dict) -> tuple[str, list[dict], list[dict]]:
    """Apply edits one at a time; an edit that adds a number to the CV not stated by its cited facts (e.g. by
    splicing digits against the surrounding text) is rejected and leaves the text unchanged."""
    applied, rejected = [], []
    for edit in edits:
        new, done = apply_edits(text, [edit])
        if not done:
            continue
        allowed = set().union(*(facts.get(UUID(str(i)), set()) for i in edit["evidence_ids"]))
        if numbers(new) - numbers(text) <= allowed:
            text = new
            applied.append(edit)
        else:
            rejected.append(edit)
    return text, applied, rejected


def require_evidence(db: Session, project_id: UUID, edits: Sequence[EvidencedEdit]) -> None:
    """Reject the whole batch unless every edit cites live facts here and every number appears in them."""
    facts = fact_numbers(db, project_id, {item_id for edit in edits for item_id in edit.evidence_ids})
    for index, edit in enumerate(edits):
        reason = None
        if not edit.evidence_ids:
            reason = "missing"
        elif any(item_id not in facts for item_id in edit.evidence_ids):
            reason = "unknown"
        elif not numbers(edit.text) <= set().union(*(facts[item_id] for item_id in edit.evidence_ids)):
            reason = "unsupported_number"
        if reason:
            raise ServiceError("evidence_required", fields={f"edits.{index}": reason})
