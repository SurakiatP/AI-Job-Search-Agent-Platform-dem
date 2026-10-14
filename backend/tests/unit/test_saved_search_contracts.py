"""FR-J05 contracts: shared filter rules, saved-search DTOs. Synthetic data only."""
from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_search_platform.services.contracts import (
    MatchRunRequest, SavedSearchCreate, SavedSearchFilters, SavedSearchUpdate,
)


def test_match_run_request_keeps_its_fields_and_rules():
    assert set(MatchRunRequest.model_fields) == {
        "cv_revision_id", "q", "cities", "work_mode", "posted_within_days", "category", "seniority",
        "employment_type", "company_type", "skills", "posting_language", "salary_min", "pool", "offset"}
    request = MatchRunRequest(cv_revision_id=uuid4(), skills=["sql", "python", "sql"], seniority=["senior", "junior"])
    assert request.skills == ["python", "sql"] and request.seniority == ["junior", "senior"]
    with pytest.raises(ValidationError):
        MatchRunRequest(cv_revision_id=uuid4(), skills=["a", "b", "c", "d", "e", "f"])


def test_saved_search_filters_reject_run_only_fields():
    assert SavedSearchFilters(q="data", cities=["Bangkok"]).q == "data"
    for extra in ({"cv_revision_id": str(uuid4())}, {"posted_within_days": 7}, {"pool": 10}):
        with pytest.raises(ValidationError):
            SavedSearchFilters(**extra)
    with pytest.raises(ValidationError):
        SavedSearchFilters(work_mode="sometimes")


def test_create_and_update_rules():
    created = SavedSearchCreate(name="  งานข้อมูล กรุงเทพ  ", filters={"q": "data"})
    assert created.name == "งานข้อมูล กรุงเทพ" and created.frequency == "daily"
    for bad in ("", "   ", "x" * 81):
        with pytest.raises(ValidationError):
            SavedSearchCreate(name=bad)
    with pytest.raises(ValidationError):
        SavedSearchCreate(name="ok", frequency="hourly")
    with pytest.raises(ValidationError):
        SavedSearchUpdate()
    assert SavedSearchUpdate(digest_enabled=False).digest_enabled is False
