from __future__ import annotations

from uuid import uuid4

import pytest

from helpers import project
from job_search_platform.services import experience
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.evidence import EvidencedEdit, require_evidence


def _bank(db):
    p = project(db)
    fact = experience.add_item(db, p.id, kind="experience", text="Cut load time by 40% on 1,000 tables", period="2022–2024")
    return p, fact


def _fails(db, project_id, edits, field, reason):
    with pytest.raises(ServiceError) as error:
        require_evidence(db, project_id, edits)
    assert error.value.code == "evidence_required" and error.value.fields == {field: reason}


def test_valid_batch_passes(db_session):
    p, fact = _bank(db_session)
    require_evidence(db_session, p.id, [EvidencedEdit(text="Reduced load time 40% (2022)", evidence_ids=[fact.id])])


def test_numbers_normalized(db_session):
    p, fact = _bank(db_session)
    require_evidence(db_session, p.id, [EvidencedEdit(text="ลดเวลา ๔๐% บน 1000 ตาราง", evidence_ids=[fact.id])])


def test_missing_unknown_foreign_removed_and_unsupported_number(db_session):
    p, fact = _bank(db_session)
    with pytest.raises(ValueError):
        EvidencedEdit(text="x", evidence_ids=[])
    _fails(db_session, p.id, [EvidencedEdit(text="ok", evidence_ids=[fact.id]),
                              EvidencedEdit(text="x", evidence_ids=[uuid4()])], "edits.1", "unknown")
    other = project(db_session, "Other")
    _fails(db_session, other.id, [EvidencedEdit(text="x", evidence_ids=[fact.id])], "edits.0", "unknown")
    _fails(db_session, p.id, [EvidencedEdit(text="Cut load time by 60%", evidence_ids=[fact.id])], "edits.0", "unsupported_number")
    experience.remove_item(db_session, p.id, fact.id)
    _fails(db_session, p.id, [EvidencedEdit(text="x", evidence_ids=[fact.id])], "edits.0", "unknown")


def test_decimal_fact_does_not_support_its_fraction(db_session):
    p = project(db_session)
    fact = experience.add_item(db_session, p.id, kind="skill", text="3.5 years of Python")
    _fails(db_session, p.id, [EvidencedEdit(text="5 years of Python", evidence_ids=[fact.id])], "edits.0", "unsupported_number")
    require_evidence(db_session, p.id, [EvidencedEdit(text="3.5 years", evidence_ids=[fact.id])])


def test_numbers_may_come_from_the_union_of_cited_facts(db_session):
    p = project(db_session)
    a = experience.add_item(db_session, p.id, kind="experience", text="Raised retention 40%")
    b = experience.add_item(db_session, p.id, kind="experience", text="Launched the app in 2023")
    require_evidence(db_session, p.id, [EvidencedEdit(text="Raised retention 40% in 2023", evidence_ids=[a.id, b.id])])


def test_numbers_may_come_from_the_period_only(db_session):
    p = project(db_session)
    fact = experience.add_item(db_session, p.id, kind="experience", text="Led the data team", period="2022–2024")
    require_evidence(db_session, p.id, [EvidencedEdit(text="Led the data team since 2022", evidence_ids=[fact.id])])
