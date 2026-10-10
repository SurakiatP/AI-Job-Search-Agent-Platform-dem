"""Evidence gate: AI-written CV edits must cite live candidate facts of the same project."""
from __future__ import annotations

import re
from collections.abc import Collection, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from job_search_platform.db.models import ExperienceItem
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.experience import _found_in, normalize, numbers
from job_search_platform.services.skill_coverage import extract_skills
from job_search_platform.services.tailoring import apply_edits


class EvidencedEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    text: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(min_length=1, max_length=20)


_NAME = re.compile(r"(?<![A-Za-z])[A-Z][A-Za-z]+")
_BULLET_LEAD = re.compile(r"^[\s\-*\u2022\u2013\u2014>#\d.)]*")
_SENTENCE_END = re.compile(r"[.!?:]\s*$")
_HEADING_DELIMITERS = ("\u2014", "\u2013", "|", ",", ":", "(", "**", "__")
_ACRONYMS = frozenset(  # technical acronyms that are not names; other 2-4 letter all-caps tokens are
    "AI ML API APIS UI UX QA CI CD IT HR BI ETL SQL AWS GCP CEO CTO CFO COO VP PM MBA BSC MSC PHD GPA CV KPI OKR SLA "
    "REST SAAS B2B B2C IOT NLP LLM RAG OCR TH EN USA UK EU US".split())
_STOPWORDS = frozenset(
    "january february march april may june july august september october november december "
    "jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday "
    "present current".split())


def _heading(after: str) -> bool:
    """A sentence-initial word is a name, not a verb, when a delimiter follows it or nothing lowercase does."""
    return after.lstrip().startswith(_HEADING_DELIMITERS) or not re.search(r"[a-z]", after)


def _latin_names(text: str, strict: bool = False) -> set[str]:
    """Capitalized Latin words (incl. 2-4 letter acronyms) not at a line/bullet/sentence start, not allowlisted
    acronyms, stopwords or skills."""
    found = set()
    for line in text.replace("\x00", "").splitlines():
        lead = len(_BULLET_LEAD.match(line).group())
        for match in _NAME.finditer(line, lead):
            word = match.group()
            before = line[lead:match.start()]
            if (not strict and (not before.strip() or _SENTENCE_END.search(before)) and not _heading(line[match.end():])
                    or (word.upper() in _ACRONYMS and (word.isupper() or word in ("SaaS", "APIs")))
                    or word.lower() in _STOPWORDS or extract_skills(word)):
                continue
            found.add(f"name:{word.lower()}")
    return found


def bank_vocabulary(db: Session, project_id: UUID) -> set[str]:
    """Normalized organization and role values of the project's live facts."""
    rows = db.execute(select(ExperienceItem.organization, ExperienceItem.role).where(
        ExperienceItem.project_id == project_id, ExperienceItem.removed_at.is_(None)))
    return {normalize(value) for row in rows for value in row if value and normalize(value)}


def claims(text: str, vocabulary: Collection[str] | None = None, strict: bool = False) -> set[str]:
    """Checkable claims in text: numbers, dictionary skills and names (capitalized Latin words, bank vocabulary).
    strict (form answers) also checks the first word of every line and sentence."""
    haystack = normalize(text)
    names = {f"name:{term}" for term in vocabulary or () if _found_in(term, haystack)}
    return numbers(text) | {f"skill:{name}" for name in extract_skills(text)} | _latin_names(text, strict) | names


def fact_claims(db: Session, project_id: UUID, ids, vocabulary: Collection[str] | None = None) -> dict[UUID, set[str]]:
    """Claims stated by each live fact of the project (text, role, organization, period), keyed by fact id."""
    wanted = set(ids)
    if not wanted:
        return {}
    vocabulary = bank_vocabulary(db, project_id) if vocabulary is None else vocabulary
    rows = db.execute(select(ExperienceItem.id, ExperienceItem.text, ExperienceItem.role, ExperienceItem.organization,
                             ExperienceItem.period).where(
        ExperienceItem.project_id == project_id, ExperienceItem.id.in_(wanted), ExperienceItem.removed_at.is_(None)))
    return {row.id: claims(" . ".join(v for v in (row.text, row.role, row.organization, row.period) if v), vocabulary, True)
            for row in rows}


def apply_gated(text: str, edits: Sequence[dict], facts: dict,
                vocabulary: Collection[str] | None = None) -> tuple[str, list[dict], list[dict]]:
    """Apply edits one at a time; an edit that adds a number, skill or name to the CV not stated by its cited facts
    (e.g. by splicing digits against the surrounding text) is rejected and leaves the text unchanged."""
    applied, rejected = [], []
    for edit in edits:
        new, done = apply_edits(text, [edit])
        if not done:
            continue
        allowed = set().union(*(facts.get(UUID(str(i)), set()) for i in edit["evidence_ids"]))
        if claims(new, vocabulary) - claims(text, vocabulary) <= allowed:
            text = new
            applied.append(edit)
        else:
            rejected.append(edit)
    return text, applied, rejected


def require_evidence(db: Session, project_id: UUID, edits: Sequence[EvidencedEdit], base: str = "") -> None:
    """Reject the whole batch unless every edit cites live facts here and every number and name (not already in
    the base CV text) appears in them."""
    vocabulary = bank_vocabulary(db, project_id)
    facts = fact_claims(db, project_id, {item_id for edit in edits for item_id in edit.evidence_ids}, vocabulary)
    known = claims(base, vocabulary)
    for index, edit in enumerate(edits):
        reason = None
        if not edit.evidence_ids:
            reason = "missing"
        elif any(item_id not in facts for item_id in edit.evidence_ids):
            reason = "unknown"
        elif not numbers(edit.text) <= set().union(*(facts[item_id] for item_id in edit.evidence_ids)):
            reason = "unsupported_number"
        elif not claims(edit.text, vocabulary) - known <= set().union(*(facts[item_id] for item_id in edit.evidence_ids)):
            reason = "unsupported_claim"
        if reason:
            raise ServiceError("evidence_required", fields={f"edits.{index}": reason})
