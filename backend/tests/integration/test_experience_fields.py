"""Richer experience fields, years of experience, and job-relevant fact selection."""
from __future__ import annotations

from helpers import project
from job_search_platform.services import experience


def _add(db, pid, text, **extra):
    return experience.add_item(db, pid, kind=extra.pop("kind", "experience"), text=text, **extra)


def test_new_fields_round_trip_and_replace_keeps_them(db_session):
    p = project(db_session)
    item = _add(db_session, p.id, "Built Airflow pipelines", role="Data Engineer", organization="SCB",
                employment_type="full_time", location="Bangkok", start_date="2022-03", end_date="2024-01",
                industry="Banking", responsibilities="Own ETL", achievements="Cut load time by 40%",
                skills_used="Airflow, SQL")
    view = experience.item_view(db_session, item)
    assert (view["employment_type"], view["location"], view["start_date"], view["end_date"], view["is_current"]) == \
        ("full_time", "Bangkok", "2022-03", "2024-01", False)
    assert (view["industry"], view["responsibilities"], view["achievements"], view["skills_used"]) == \
        ("Banking", "Own ETL", "Cut load time by 40%", "Airflow, SQL")


def test_years_of_experience_merges_overlaps_and_counts_current(db_session):
    p = project(db_session)
    _add(db_session, p.id, "A", start_date="2020-01", end_date="2021-12")
    _add(db_session, p.id, "B", start_date="2021-06", end_date="2022-12")  # overlaps A
    _add(db_session, p.id, "C", start_date="2024-01", is_current=True)
    _add(db_session, p.id, "Skill: SQL", kind="skill", start_date="2000-01", end_date="2001-01")  # not work
    assert experience.years_of_experience(db_session, p.id, today=(2025, 1)) == 4.1  # 36 merged months + 13 current
    

def test_fact_records_keep_only_job_relevant_facts_and_add_years(db_session):
    p = project(db_session)
    _add(db_session, p.id, "Built Airflow pipelines", organization="SCB", start_date="2022-01", end_date="2023-01")
    _add(db_session, p.id, "Played football on weekends", kind="other")
    _add(db_session, p.id, "Python", kind="skill")
    records = experience.fact_records(db_session, p.id, job_text="We need Airflow and Python skills", limit=2)
    assert [r["text"] for r in records] == ["Built Airflow pipelines", "Python"]
    assert experience.profile_summary(db_session, p.id, today=(2025, 1)) == "Years of experience: 1.1"
