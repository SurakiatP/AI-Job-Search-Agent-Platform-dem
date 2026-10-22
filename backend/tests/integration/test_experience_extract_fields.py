"""Extraction of dates/location/skills/skill_group, idempotent re-fill, skill_group column, relevance top-up."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from helpers import primary_cv, project
from job_search_platform.db.models import CVRevision, ExperienceItem
from job_search_platform.services import experience
from job_search_platform.services.experience import ExtractedItem, extraction_prompt

CV = ("Data Engineer, SCB, Bangkok (2022-03 to Present)\n• Built Airflow pipelines\n"
      "Skills: Airflow, SQL\n• Ran BigQuery since 2021")


def _revision(db):
    p = project(db)
    revision = CVRevision(project_id=p.id, cv_id=primary_cv(db, p.id).id, revision=1)
    db.add(revision)
    db.flush()
    return p, revision


def _store(db, p, revision, *items, cv=CV):
    return experience.store_extracted(db, p.id, revision.id, cv, list(items))


def _only(db, p, text):
    return next(i for i in experience.list_items(db, p.id) if i.text == text)


def test_prompt_asks_for_new_fields_but_not_industry_or_type():
    prompt, _ = extraction_prompt("CV BODY")
    for name in ("start_date", "end_date", "is_current", "location", "skills_used", "skill_group"):
        assert name in prompt
    assert "industry" not in prompt and "employment_type" not in prompt


def test_extracted_context_kept_when_in_cv(db_session):
    p, rev = _revision(db_session)
    _store(db_session, p, rev, ExtractedItem(
        kind="experience", text="Built Airflow pipelines", start_date="2022-03", is_current=True, location="Bangkok",
        skills_used="Airflow"))
    item = _only(db_session, p, "Built Airflow pipelines")
    assert (item.start_date, item.end_date, item.is_current, item.location, item.skills_used) == \
        ("2022-03", None, True, "Bangkok", "Airflow")
    assert item.industry is None and item.employment_type is None


def test_unsupported_values_become_null_never_reject_fact(db_session):
    p, rev = _revision(db_session)
    summary = _store(db_session, p, rev, ExtractedItem(
        kind="experience", text="Built Airflow pipelines", start_date="1999-01", end_date="2022-13", location="Paris",
        skills_used="Airflow, Kubernetes", skill_group="technical"))
    assert summary == {"added": 1, "duplicates": 0, "rejected": 0}
    item = _only(db_session, p, "Built Airflow pipelines")
    assert (item.start_date, item.end_date, item.location, item.skills_used, item.skill_group) == (None,) * 5


def test_date_needs_valid_format_and_year_in_cv(db_session):
    p, rev = _revision(db_session)
    _store(db_session, p, rev,
           ExtractedItem(kind="experience", text="Built Airflow pipelines", start_date="2021-06", end_date="2022/03"),
           ExtractedItem(kind="experience", text="Ran BigQuery since 2021", start_date="2021-06"))
    assert _only(db_session, p, "Built Airflow pipelines").start_date == "2021-06"  # 2021 appears in the CV
    assert _only(db_session, p, "Built Airflow pipelines").end_date is None  # bad format
    assert _only(db_session, p, "Ran BigQuery since 2021").start_date == "2021-06"


def test_skill_group_kept_only_for_valid_skills(db_session):
    p, rev = _revision(db_session)
    _store(db_session, p, rev,
           ExtractedItem(kind="skill", text="Airflow", skill_group="tools"),
           ExtractedItem(kind="skill", text="SQL", skill_group="wizardry"),
           ExtractedItem(kind="experience", text="Built Airflow pipelines", skill_group="tools"))
    assert _only(db_session, p, "Airflow").skill_group == "tools"
    assert _only(db_session, p, "SQL").skill_group is None
    assert _only(db_session, p, "Built Airflow pipelines").skill_group is None


def test_reextraction_fills_only_empty_fields_of_live_cv_items(db_session):
    p, rev = _revision(db_session)
    _store(db_session, p, rev, ExtractedItem(kind="experience", text="Built Airflow pipelines", location="Bangkok"))
    again = _store(db_session, p, rev, ExtractedItem(
        kind="experience", text="Built Airflow pipelines", location="SCB", start_date="2022-03", is_current=True,
        skills_used="Airflow"))
    assert again == {"added": 0, "duplicates": 1, "rejected": 0}
    item = _only(db_session, p, "Built Airflow pipelines")
    assert (item.location, item.start_date, item.is_current, item.skills_used) == ("Bangkok", "2022-03", True, "Airflow")


def test_reextraction_never_touches_owner_or_removed_items(db_session):
    p, rev = _revision(db_session)
    mine = experience.add_item(db_session, p.id, kind="experience", text="Built Airflow pipelines")
    gone = experience.add_item(db_session, p.id, kind="experience", text="Ran BigQuery since 2021")
    experience.remove_item(db_session, p.id, gone.id)
    summary = _store(db_session, p, rev,
                     ExtractedItem(kind="experience", text="Built Airflow pipelines", location="Bangkok"),
                     ExtractedItem(kind="experience", text="Ran BigQuery since 2021", location="Bangkok"))
    assert summary["duplicates"] == 2
    assert db_session.get(ExperienceItem, mine.id).location is None
    assert db_session.get(ExperienceItem, gone.id).location is None


def test_skill_group_service_nulls_other_kinds_and_check_constraint(db_session):
    p, _ = _revision(db_session)
    skill = experience.add_item(db_session, p.id, kind="skill", text="Python", skill_group="language")
    other = experience.add_item(db_session, p.id, kind="experience", text="Ran X", skill_group="language")
    assert experience.item_view(db_session, skill)["skill_group"] == "language"
    assert experience.item_view(db_session, other)["skill_group"] is None
    moved = experience.replace_item(db_session, p.id, skill.id, kind="experience", text="Python", skill_group="tools")
    assert moved.skill_group is None
    db_session.add(ExperienceItem(project_id=p.id, kind="skill", text="Bad", source="owner", text_hash="c" * 64,
                                  skill_group="wizardry"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_relevance_tops_up_to_five_with_most_recent_facts(db_session):
    p, _ = _revision(db_session)
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    for n in range(7):
        item = experience.add_item(db_session, p.id, kind="other", text=f"Hobby number {n}")
        item.created_at = base + timedelta(days=n)
    airflow = experience.add_item(db_session, p.id, kind="experience", text="Built Airflow pipelines")
    airflow.created_at = base - timedelta(days=30)
    db_session.flush()
    texts = [r["text"] for r in experience.fact_records(db_session, p.id, job_text="Airflow engineer")]
    assert texts == ["Built Airflow pipelines", "Hobby number 6", "Hobby number 5", "Hobby number 4", "Hobby number 3"]
    none = [r["text"] for r in experience.fact_records(db_session, p.id, job_text="zzzz qqqq")]
    assert none == [f"Hobby number {n}" for n in (6, 5, 4, 3, 2)]
    assert len(experience.fact_lines(db_session, p.id, job_text="zzzz qqqq", limit=2)) == 2


def test_relevance_small_bank_returns_everything_when_nothing_matches(db_session):
    p, _ = _revision(db_session)
    experience.add_item(db_session, p.id, kind="other", text="Played football")
    assert [r["text"] for r in experience.fact_records(db_session, p.id, job_text="zzzz qqqq")] == ["Played football"]
