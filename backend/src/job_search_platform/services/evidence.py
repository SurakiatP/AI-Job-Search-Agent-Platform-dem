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


class EvidencedEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    text: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


def require_evidence(db: Session, project_id: UUID, edits: Sequence[EvidencedEdit]) -> None:
    """Reject the whole batch unless every edit cites live facts here and every number appears in them."""
    wanted = {item_id for edit in edits for item_id in edit.evidence_ids}
    facts = {row.id: numbers(f"{row.text} {row.period or ''}") for row in db.execute(
        select(ExperienceItem.id, ExperienceItem.text, ExperienceItem.period).where(
            ExperienceItem.project_id == project_id, ExperienceItem.id.in_(wanted),
            ExperienceItem.removed_at.is_(None)))} if wanted else {}
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
