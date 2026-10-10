from __future__ import annotations

import pytest
from sqlalchemy import delete, select

from helpers import primary_cv, project
from job_search_platform.db.models import CVRevision, ExperienceItem, Project
from job_search_platform.services import experience
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.experience import ExtractedItem

CV = "Data Engineer, SCB (2022–2024)\n• Built Airflow pipelines that cut load time by 40%\n• Ran BigQuery"


def _revision(db):
    p = project(db)
    revision = CVRevision(project_id=p.id, cv_id=primary_cv(db, p.id).id, revision=1)
    db.add(revision)
    db.flush()
    return p, revision


def _item(text, **extra):
    return ExtractedItem(kind="experience", text=text, **extra)


def test_store_adds_verbatim_rejects_invented_and_dedups(db_session):
    p, revision = _revision(db_session)
    items = [_item("Built Airflow pipelines that cut load time by 40%", organization="SCB", period="2022–2024"),
             _item("Led a team of 12 engineers"), _item("• ran bigquery")]
    assert experience.store_extracted(db_session, p.id, revision.id, CV, items) == {"added": 2, "duplicates": 0, "rejected": 1}
    assert experience.store_extracted(db_session, p.id, revision.id, CV, items[:1]) == {"added": 0, "duplicates": 1, "rejected": 0}
    assert db_session.get(CVRevision, revision.id).skill_profile["experience"]["duplicates"] == 1
    assert [i.text for i in experience.list_items(db_session, p.id)] == ["Built Airflow pipelines that cut load time by 40%", "• ran bigquery"]


def test_removed_fact_is_not_readded(db_session):
    p, revision = _revision(db_session)
    experience.store_extracted(db_session, p.id, revision.id, CV, [_item("Ran BigQuery")])
    item = experience.list_items(db_session, p.id)[0]
    experience.remove_item(db_session, p.id, item.id)
    assert experience.store_extracted(db_session, p.id, revision.id, CV, [_item("Ran BigQuery")])["duplicates"] == 1
    assert experience.list_items(db_session, p.id) == []


def test_owner_add_duplicate_and_replace(db_session):
    p, _ = _revision(db_session)
    first = experience.add_item(db_session, p.id, kind="skill", text="Python")
    with pytest.raises(ServiceError) as dup:
        experience.add_item(db_session, p.id, kind="skill", text=" python ")
    assert dup.value.code == "duplicate"
    new = experience.replace_item(db_session, p.id, first.id, kind="skill", text="Python 3")
    assert new.id != first.id and db_session.get(ExperienceItem, first.id).removed_at is not None


def test_replace_context_only_updates_in_place(db_session):
    p, _ = _revision(db_session)
    first = experience.add_item(db_session, p.id, kind="experience", text="Ran BigQuery")
    same = experience.replace_item(db_session, p.id, first.id, kind="experience", text="Ran BigQuery", period="2023")
    assert same.id == first.id and same.period == "2023" and same.removed_at is None


def test_other_project_item_is_not_found(db_session):
    p, _ = _revision(db_session)
    other = project(db_session, "Other")
    item = experience.add_item(db_session, p.id, kind="skill", text="Go")
    for call in (lambda: experience.remove_item(db_session, other.id, item.id),
                 lambda: experience.replace_item(db_session, other.id, item.id, kind="skill", text="Rust")):
        with pytest.raises(ServiceError) as missing:
            call()
        assert missing.value.code == "not_found"


def test_cap(db_session, monkeypatch):
    monkeypatch.setattr(experience, "MAX_ITEMS", 2)
    p, revision = _revision(db_session)
    experience.add_item(db_session, p.id, kind="skill", text="A")
    assert experience.store_extracted(db_session, p.id, revision.id, "B C", [_item("B"), _item("C")]) == {"added": 1, "duplicates": 0, "rejected": 1}
    with pytest.raises(ServiceError) as full:
        experience.add_item(db_session, p.id, kind="skill", text="D")
    assert full.value.code == "bank_full"


def test_project_delete_cascades(db_session):
    p, _ = _revision(db_session)
    experience.add_item(db_session, p.id, kind="skill", text="Go")
    db_session.flush()
    db_session.execute(delete(Project).where(Project.id == p.id))
    assert db_session.scalar(select(ExperienceItem).where(ExperienceItem.project_id == p.id)) is None


def test_fact_lines_include_context(db_session):
    p, _ = _revision(db_session)
    experience.add_item(db_session, p.id, kind="experience", text="Ran BigQuery", organization="SCB", period="2023")
    assert experience.fact_lines(db_session, p.id) == ["Ran BigQuery (SCB, 2023)"]


def test_replace_same_hash_stores_new_casing(db_session):
    p, _ = _revision(db_session)
    first = experience.add_item(db_session, p.id, kind="experience", text="Ran BigQuery")
    same = experience.replace_item(db_session, p.id, first.id, kind="experience", text="ran bigquery")
    assert same.id == first.id and same.text == "ran bigquery"


def test_replace_duplicate_leaves_old_item_live(db_session):
    p, _ = _revision(db_session)
    a = experience.add_item(db_session, p.id, kind="skill", text="A")
    experience.add_item(db_session, p.id, kind="skill", text="B")
    with pytest.raises(ServiceError) as dup:
        experience.replace_item(db_session, p.id, a.id, kind="skill", text="B")
    assert dup.value.code == "duplicate" and db_session.get(ExperienceItem, a.id).removed_at is None
