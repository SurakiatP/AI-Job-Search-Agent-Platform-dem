"""FR-J05 delivery: run_due, gates, failures, concurrency, preview, prune, supervisor. Synthetic data only."""
from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.db.models import ProjectPreference, SavedSearch, SavedSearchSeen, User
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.contracts import SavedSearchCreate
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.supervisor import WorkerSupervisor

UTC = timezone.utc
ORIGIN = "http://127.0.0.1:8765"
NOW = datetime(2026, 10, 15, 1, 0, tzinfo=UTC)  # 08:00 Bangkok


def _item(slug, title="Synthetic Data Engineer", **extra):
    return {"slug": slug, "title": title, "company": "Example Co", "cities": ["Bangkok"], "age_days": 2,
            "stale": False, "source_url": f"https://jobs.example.test/{slug}", **extra}


class _Source:
    def __init__(self, items=(), fail=False, delay=0.0):
        self.items, self.fail, self.delay, self.calls = list(items), fail, delay, []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        time.sleep(self.delay)
        if self.fail:
            raise ServiceError("job_source_unavailable", retryable=True)
        return {"items": list(self.items), "total": len(self.items), "limit": 20, "offset": 0}


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        pid = project(db, owner=actor).id
    mailer, source = MemoryMailer(), _Source([_item("a"), _item("b")])
    service = ss.SavedSearches(sessions, mailer, public_origin=ORIGIN, search=source)
    created = service.create(actor, pid, SavedSearchCreate(name="Data", filters={"q": "data", "skills": ["sql"]}),
                             now=NOW - timedelta(days=1))
    return sessions, service, mailer, source, actor, pid, created.id


def _due(sessions, sid, when=NOW - timedelta(minutes=1)):
    with sessions.begin() as db:
        db.execute(update(SavedSearch).where(SavedSearch.id == sid).values(next_run_at=when))


def _seen(sessions, sid):
    with sessions() as db:
        return set(db.scalars(select(SavedSearchSeen.slug).where(SavedSearchSeen.saved_search_id == sid)))


@pytest.mark.integration
def test_sends_unseen_once_then_advances(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 1
    (mail,) = mailer.sent
    assert mail.subject == "งานใหม่ 2 ตำแหน่ง: Data"
    assert "https://jobs.example.test/a" in mail.text and f"{ORIGIN}/digest/unsubscribe?token=" in mail.text
    assert f"{ORIGIN}/app/projects/{pid}/search?" in mail.text and "skills=sql" in mail.text
    assert source.calls[0]["posted_within_days"] == 7 and source.calls[0]["limit"] == 20
    assert _seen(sessions, sid) == {"a", "b"}
    with sessions() as db:
        row = db.get(SavedSearch, sid)
        assert row.last_sent_at == NOW and row.next_run_at == ss.next_slot(NOW, "daily")
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert len(mailer.sent) == 1
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == ss.next_slot(NOW, "daily")


@pytest.mark.integration
def test_duplicate_slugs_in_one_page_are_sent_once(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.items = [_item("a"), _item("a"), _item("c")]
    _due(sessions, sid)
    asyncio.run(service.run_due(NOW))
    assert mailer.sent[0].subject.startswith("งานใหม่ 2 ")
    assert _seen(sessions, sid) == {"a", "c"}


@pytest.mark.integration
@pytest.mark.parametrize("gate", ["unverified", "disabled", "notifications_off"])
def test_gates_block_send_and_advance(ctx, gate):
    sessions, service, mailer, source, actor, pid, sid = ctx
    with sessions.begin() as db:
        if gate == "unverified":
            db.execute(update(User).where(User.id == actor.user_id).values(email_verified_at=None))
        elif gate == "disabled":
            db.execute(update(User).where(User.id == actor.user_id).values(disabled_at=NOW))
        else:
            db.add(ProjectPreference(project_id=pid, values={"notifications_enabled": False}))
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert mailer.sent == [] and source.calls == [] and _seen(sessions, sid) == set()
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == ss.next_slot(NOW, "daily")


@pytest.mark.integration
def test_disabled_digest_is_not_selected(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    _due(sessions, sid)
    with sessions.begin() as db:
        db.get(SavedSearch, sid).digest_enabled = False
    assert asyncio.run(service.run_due(NOW)) == 0 and source.calls == []


@pytest.mark.integration
def test_source_failure_records_nothing_and_does_not_spin(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.fail = True
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert len(source.calls) == 1 and mailer.sent == [] and _seen(sessions, sid) == set()
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == NOW - timedelta(minutes=1)


@pytest.mark.integration
def test_mail_failure_records_nothing(ctx):
    sessions, service, mailer, source, *_, sid = ctx

    def broken(mail):
        raise OSError("smtp down")
    mailer.send = broken
    with sessions() as db:
        old_hash = db.get(SavedSearch, sid).unsubscribe_token_hash
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    with sessions() as db:
        row = db.get(SavedSearch, sid)
        assert row.last_sent_at is None and row.next_run_at == NOW - timedelta(minutes=1)
        assert row.unsubscribe_token_hash == old_hash
    assert _seen(sessions, sid) == set()


@pytest.mark.integration
def test_no_mailer_records_nothing(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    service.mailer = None
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0 and _seen(sessions, sid) == set()


@pytest.mark.integration
def test_concurrent_run_due_sends_once(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.delay = 0.5
    _due(sessions, sid)
    results = []
    threads = [threading.Thread(target=lambda: results.append(asyncio.run(service.run_due(NOW)))) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == [0, 1] and len(mailer.sent) == 1


@pytest.mark.integration
def test_new_token_unsubscribes_and_old_one_expires(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    _due(sessions, sid)
    asyncio.run(service.run_due(NOW))
    first = mailer.sent[0].text.split("token=")[1].split()[0]
    service.preview(ctx[4], ctx[5], sid)
    second = mailer.sent[1].text.split("token=")[1].split()[0]
    with pytest.raises(ServiceError) as caught:
        service.unsubscribe(first, "198.51.100.1")
    assert caught.value.code == "invalid_token"
    service.unsubscribe(second, "198.51.100.1")
    with sessions() as db:
        assert db.get(SavedSearch, sid).digest_enabled is False


@pytest.mark.integration
def test_preview_sends_without_recording_and_is_rate_limited(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    service.preview(actor, pid, sid)
    assert len(mailer.sent) == 1 and _seen(sessions, sid) == set()
    source.items = []
    service.preview(actor, pid, sid)
    assert mailer.sent[1].subject == "ยังไม่มีงานใหม่: Data"
    for _ in range(3):
        service.preview(actor, pid, sid)
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "rate_limited"


@pytest.mark.integration
def test_preview_gates(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    service.mailer = None
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "mail_unavailable"
    service.mailer = mailer
    with sessions.begin() as db:
        db.execute(update(User).where(User.id == actor.user_id).values(email_verified_at=None))
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "email_unverified"


@pytest.mark.integration
def test_prune_seen(ctx):
    sessions, service, *_, sid = ctx
    with sessions.begin() as db:
        db.add_all([SavedSearchSeen(saved_search_id=sid, slug="old", seen_at=NOW - timedelta(days=91)),
                    SavedSearchSeen(saved_search_id=sid, slug="new", seen_at=NOW - timedelta(days=1))])
    assert service.prune_seen(NOW) == 1
    assert _seen(sessions, sid) == {"new"}


def test_render_digest_thai():
    subject, text = ss.render_digest("th", "งานข้อมูล กรุงเทพ", [
        _item("a", title="วิศวกรข้อมูลอาวุโส", stale=True, age_days=0), _item("b", company=None, cities=[])],
        "http://app/search?q=x", "http://app/digest/unsubscribe?token=t")
    assert subject == "งานใหม่ 2 ตำแหน่ง: งานข้อมูล กรุงเทพ"
    assert "1. วิศวกรข้อมูลอาวุโส" in text and "อาจเป็นประกาศเก่า" in text and "วันนี้" in text
    assert text.rstrip().endswith("http://app/digest/unsubscribe?token=t")


@pytest.mark.integration
def test_supervisor_runs_digests_even_when_purge_fails(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    calls = []

    async def bad_purge():
        raise RuntimeError("boom")

    async def digests():
        calls.append(1)
        return 0
    supervisor = WorkerSupervisor(sessions, None, None, None, purge=bad_purge, digests=digests)
    asyncio.run(supervisor._purge_step())
    assert calls == [1]
