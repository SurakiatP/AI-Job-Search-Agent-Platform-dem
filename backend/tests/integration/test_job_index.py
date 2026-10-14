"""Job index documents, sync and rebuild against Postgres and an in-memory fake Meilisearch (FR-J01)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import JobIndexDelete, JobPosting
from job_search_platform.integrations.meili import Meili, MeiliError
from job_search_platform.services import job_index, job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)
NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)


class FakeMeili:
    def __init__(self):
        self.indexes: dict[str, dict] = {}
        self.settings: dict[str, dict] = {}
        self.fail_next = False
        self.tasks: dict[int, bool] = {}

    def _task(self):
        uid = len(self.tasks)
        self.tasks[uid] = not self.fail_next
        self.fail_next = False
        return uid

    def wait(self, uid, **_):
        if not self.tasks[uid]:
            raise MeiliError("task_failed")

    def index_exists(self, index):
        return index in self.indexes

    def create_index(self, index):
        self.indexes.setdefault(index, {})
        return self._task()

    def update_settings(self, index, settings):
        self.settings[index] = settings
        return self._task()

    def add_documents(self, index, docs):
        uid = self._task()
        if self.tasks[uid]:
            self.indexes[index].update({d["id"]: d for d in docs})
        return uid

    def delete_documents(self, index, ids):
        uid = self._task()
        if self.tasks[uid]:
            for i in ids:
                self.indexes[index].pop(i, None)
        return uid

    def swap(self, a, b):
        self.indexes[a], self.indexes[b] = self.indexes[b], self.indexes[a]
        self.settings[a], self.settings[b] = self.settings.get(b), self.settings.get(a)
        return self._task()

    def delete_index(self, index):
        self.indexes.pop(index, None)
        self.settings.pop(index, None)
        return self._task()


def _gh(i, url, title="Backend Engineer", company="Acme", posted="2026-10-02T00:00:00Z"):
    return map_posting("greenhouse", "acme", {"id": i, "title": title, "company_name": company, "absolute_url": url,
                                               "location": {"name": "Bangkok, Thailand"}, "first_published": posted})


def _lv(i, title, company="ACME PUBLIC COMPANY LIMITED", posted_ms=1_790_899_200_000):
    return map_posting("lever", "acme", {"id": i, "text": title, "hostedUrl": f"https://jobs.lever.co/acme/{i}",
                                          "categories": {"location": "Bangkok"}, "createdAt": posted_ms,
                                          "company": company})


@pytest.fixture
def sessions(migrated_engine):
    return sessionmaker(migrated_engine, expire_on_commit=False)


def _store(sessions, greenhouse=(), lever=(), at=T0):
    with sessions() as db, db.begin():
        if greenhouse:
            job_store.apply_board(db, "greenhouse", "acme", list(greenhouse), at)
        if lever:
            job_store.apply_board(db, "lever", "acme", list(lever), at)
        job_store.recompute_clusters(db, at)


def _ids(sessions):
    with sessions() as db:
        return {p.slug: p.id for p in db.scalars(select(JobPosting))}


def _dirty(sessions):
    with sessions() as db:
        return {p.slug for p in db.scalars(select(JobPosting).where(JobPosting.index_dirty))}


def _queue(sessions):
    with sessions() as db:
        return set(db.scalars(select(JobIndexDelete.posting_id)))


@pytest.mark.integration
def test_rebuild_when_index_missing_writes_only_canonical(sessions):
    # gh 1 and lever a are one cluster (same title/company/province); gh 2 stands alone
    _store(sessions, greenhouse=[_gh(1, "https://g/1"), _gh(2, "https://g/2", title="Data Scientist")],
           lever=[_lv("a", "Backend Engineer")])
    with sessions() as db, db.begin():
        db.add(JobIndexDelete(posting_id=_ids(sessions)["gh-acme-2"], deleted_at=T0 - timedelta(days=1)))
    meili = FakeMeili()
    out = job_index.sync(sessions, meili, "jobs", now=NOW)
    assert out["state"] == "rebuilt"
    docs = meili.indexes["jobs"]
    assert len(docs) == 2 and "jobs_tmp" not in meili.indexes
    assert meili.settings["jobs"] == job_index.SETTINGS
    assert not _dirty(sessions) and not _queue(sessions)
    cluster = next(d for d in docs.values() if d["title"] == "Backend Engineer")
    assert cluster["sources"] == ["greenhouse", "lever"]


@pytest.mark.integration
def test_sync_upserts_dirty_and_clears_flag(sessions):
    meili = FakeMeili()
    _store(sessions, greenhouse=[_gh(1, "https://g/1")])
    job_index.sync(sessions, meili, "jobs", now=NOW)
    _store(sessions, greenhouse=[_gh(1, "https://g/1"), _gh(2, "https://g/2", title="Data Scientist")])
    assert _dirty(sessions) == {"gh-acme-2"}
    out = job_index.sync(sessions, meili, "jobs", now=NOW)
    assert out == {"upserted": 1, "deleted": 0, "state": "ok"}
    assert len(meili.indexes["jobs"]) == 2 and not _dirty(sessions)


@pytest.mark.integration
def test_queued_deletes_are_sent_then_removed(sessions):
    meili = FakeMeili()
    _store(sessions, greenhouse=[_gh(1, "https://g/1")])
    job_index.sync(sessions, meili, "jobs", now=NOW)
    pid = str(_ids(sessions)["gh-acme-1"])
    assert pid in meili.indexes["jobs"]
    with sessions() as db, db.begin():
        db.add(JobIndexDelete(posting_id=_ids(sessions)["gh-acme-1"], deleted_at=NOW))
    out = job_index.sync(sessions, meili, "jobs", now=NOW)
    assert out["deleted"] == 1 and pid not in meili.indexes["jobs"] and not _queue(sessions)


@pytest.mark.integration
def test_merged_posting_is_removed_from_index(sessions):
    meili = FakeMeili()
    _store(sessions, lever=[_lv("a", "Backend Engineer")], at=T0 + timedelta(days=1))  # A, alone
    job_index.sync(sessions, meili, "jobs", now=NOW)
    a = _ids(sessions)["lv-acme-a"]
    assert str(a) in meili.indexes["jobs"]
    _store(sessions, greenhouse=[_gh(1, "https://g/1")], at=T0)  # B, earlier first_seen_at, becomes canonical
    b = _ids(sessions)["gh-acme-1"]
    with sessions() as db:
        assert db.get(JobPosting, a).canonical_id == b
    job_index.sync(sessions, meili, "jobs", now=NOW)
    assert str(a) not in meili.indexes["jobs"] and str(b) in meili.indexes["jobs"]


@pytest.mark.integration
def test_failed_task_keeps_rows_dirty_and_deletes_queued(sessions):
    meili = FakeMeili()
    _store(sessions, greenhouse=[_gh(1, "https://g/1")])
    job_index.sync(sessions, meili, "jobs", now=NOW)
    _store(sessions, greenhouse=[_gh(1, "https://g/1"), _gh(2, "https://g/2", title="Data Scientist")])
    with sessions() as db, db.begin():
        db.add(JobIndexDelete(posting_id=_ids(sessions)["gh-acme-1"], deleted_at=NOW))
    # settings task is first; let it pass, fail the delete task
    real = meili.update_settings

    def settings_then_fail(index, settings):
        uid = real(index, settings)
        meili.fail_next = True
        return uid

    meili.update_settings = settings_then_fail
    assert job_index.sync(sessions, meili, "jobs", now=NOW)["state"] == "index_failed"
    assert _dirty(sessions) == {"gh-acme-2"} and len(_queue(sessions)) == 1
    meili.update_settings = real
    assert job_index.sync(sessions, meili, "jobs", now=NOW)["state"] == "ok"
    assert not _dirty(sessions) and not _queue(sessions)


@pytest.mark.integration
def test_unreachable_index_returns_index_failed(sessions):
    def boom(*_a, **_k):
        raise OSError("down")

    _store(sessions, greenhouse=[_gh(1, "https://g/1")])
    out = job_index.sync(sessions, Meili("http://127.0.0.1:1", "k", transport=boom), "jobs", now=NOW)
    assert out["state"] == "index_failed" and _dirty(sessions)


def test_document_shape_and_posted_ts_fallback():
    p = SimpleNamespace(id="6f1c2b1e-0000-4000-8000-000000000001", slug="s", title="t", company="c", location="l",
                        cities=["Bangkok"], work_mode=None, skills=["python"], category="eng", posted_at=None,
                        first_seen_at=T0, seniority=None, employment_type=None, company_type=None,
                        posting_language="th", salary_thb_month_min=None, source_url="https://x",
                        description_markdown=None, reality_stale=False)
    d = job_index.to_document(p, ["lever"])
    assert d["posted_ts"] == int(T0.timestamp()) and d["posted_at"] is None
    assert d["description_markdown"] == "" and d["sources"] == ["lever"] and d["id"] == p.id
    assert set(d) == {"id", "slug", "title", "company", "location", "cities", "work_mode", "skills", "category",
                      "posted_at", "posted_ts", "seniority", "employment_type", "company_type", "posting_language",
                      "salary_thb_month_min", "source_url", "description_markdown", "reality_stale", "sources"}
