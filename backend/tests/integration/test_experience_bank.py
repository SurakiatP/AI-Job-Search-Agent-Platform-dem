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


def test_verbatim_match_respects_word_edges(db_session):
    p, revision = _revision(db_session)
    store = lambda cv, text: experience.store_extracted(db_session, p.id, revision.id, cv, [_item(text)])["added"]
    assert store("Built JavaScript apps", "Java") == 0
    assert store("Built JavaScript apps", "JavaScript") == 1
    assert store("Ran MySQL", "SQL") == 0
    assert store("Python, Go", "Go") == 1
    assert store("Java and JavaScript", "java") == 1  # a later whole-word occurrence counts
    assert store("ใช้ Pythonเป็นหลัก", "Python") == 1  # only Latin letters/digits count as word neighbours
    assert store("ทักษะ: ใช้งานฐานข้อมูล", "ใช้งาน") == 1  # Thai-edged items stay plain substring


def test_context_fields_kept_only_when_in_the_cv(db_session):
    p, revision = _revision(db_session)
    items = [_item("Ran BigQuery", role="Data Engineer", organization="Google", period="2018–2024"),
             _item("Built Airflow pipelines that cut load time by 40%", organization="SCB", period="2022-2024")]
    experience.store_extracted(db_session, p.id, revision.id, CV, items)
    stored = {i.text: (i.role, i.organization, i.period) for i in experience.list_items(db_session, p.id)}
    assert stored["Ran BigQuery"] == ("Data Engineer", None, None)
    assert stored["Built Airflow pipelines that cut load time by 40%"] == (None, "SCB", "2022-2024")


def test_owner_can_readd_a_removed_fact(db_session):
    p, _ = _revision(db_session)
    first = experience.add_item(db_session, p.id, kind="other", text="Led a team of 5")
    experience.remove_item(db_session, p.id, first.id)
    again = experience.add_item(db_session, p.id, kind="skill", text="led a team of 5", role="Lead")
    assert again.id == first.id and again.removed_at is None and again.kind == "skill" and again.role == "Lead"
    assert [i.id for i in experience.list_items(db_session, p.id)] == [first.id]


def test_edit_can_be_reverted_to_the_removed_text(db_session):
    p, _ = _revision(db_session)
    a = experience.add_item(db_session, p.id, kind="skill", text="A")
    b = experience.replace_item(db_session, p.id, a.id, kind="skill", text="B")
    back = experience.replace_item(db_session, p.id, b.id, kind="skill", text="A")
    assert back.id == a.id and back.removed_at is None
    assert db_session.get(ExperienceItem, b.id).removed_at is not None
    assert [i.id for i in experience.list_items(db_session, p.id)] == [a.id]


def _removed_cv_fact(db):
    p, revision = _revision(db)
    experience.store_extracted(db, p.id, revision.id, CV, [_item("Ran BigQuery")])
    item = experience.list_items(db, p.id)[0]
    assert item.source == "cv" and item.source_cv_revision_id == revision.id
    item.builder_cv_id = primary_cv(db, p.id).id
    experience.remove_item(db, p.id, item.id)
    db.flush()
    return p, item


def test_owner_can_revive_a_removed_cv_fact(db_session):
    p, item = _removed_cv_fact(db_session)
    again = experience.add_item(db_session, p.id, kind="skill", text="Ran BigQuery")
    db_session.flush()  # the owner/revision check constraint must hold
    assert again.id == item.id and again.source == "owner"
    assert again.source_cv_revision_id is None and again.builder_cv_id is None and again.removed_at is None


def test_edit_revert_revives_a_removed_cv_fact(db_session):
    p, item = _removed_cv_fact(db_session)
    other = experience.add_item(db_session, p.id, kind="skill", text="Other")
    back = experience.replace_item(db_session, p.id, other.id, kind="skill", text="Ran BigQuery")
    db_session.flush()
    assert back.id == item.id and back.source == "owner" and back.source_cv_revision_id is None


def test_readding_a_live_fact_is_still_a_duplicate(db_session):
    p, _ = _revision(db_session)
    experience.add_item(db_session, p.id, kind="skill", text="Python")
    with pytest.raises(ServiceError) as dup:
        experience.add_item(db_session, p.id, kind="skill", text="Python")
    assert dup.value.code == "duplicate"


def test_republishing_one_builder_cv_keeps_a_fact_another_builder_cv_uses(db_session):
    from uuid import uuid4
    from sqlalchemy import insert
    from job_search_platform.api.resume import sync_bank
    from job_search_platform.db.models import CV
    p, _ = _revision(db_session)
    a, b = uuid4(), uuid4()
    for cv_id in (a, b):
        db_session.execute(insert(CV).values(id=cv_id, project_id=p.id, name=f"cv-{cv_id}", is_primary=False))
    fact = {"kind": "skill", "text": "Python", "role": None, "organization": None, "period": None}
    sync_bank(db_session, p.id, a, [fact])
    sync_bank(db_session, p.id, b, [fact])
    sync_bank(db_session, p.id, a, [])  # A drops Python, B still lists it
    assert [i.text for i in experience.list_items(db_session, p.id)] == ["Python"]
