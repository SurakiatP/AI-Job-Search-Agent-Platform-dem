"""FR-J05 Telegram channel: linking, polling, delivery, unlink, routes. Fake transport, synthetic data only."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from helpers import login_cookie, owner, project
from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import SavedSearch, SavedSearchSeen, TelegramLink, User
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.integrations.telegram import TelegramClient
from job_search_platform.main import create_app
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.accounts import Accounts
from job_search_platform.services.contracts import SavedSearchCreate, SavedSearchUpdate
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import OwnerSessions
from job_search_platform.services.telegram import Telegram
from test_saved_search_digests import NOW, ORIGIN, _Source, _due, _item, _seen

pytestmark = pytest.mark.integration
TOKEN = "123456:SYNTHETIC-token"


class FakeBot:
    """Stands in for api.telegram.org: queued updates, recorded sends, scripted send status."""

    def __init__(self):
        self.updates, self.sent, self.send_status, self.methods = [], [], 200, []

    def __call__(self, request):
        method = request.url.path.rsplit("/", 1)[1]
        self.methods.append(method)
        body = __import__("json").loads(request.content)
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"username": "jsp_bot"}})
        if method == "getUpdates":
            fresh = [u for u in self.updates if u["update_id"] >= body.get("offset", 0)]
            return httpx.Response(200, json={"ok": True, "result": fresh})
        if self.send_status == 200:
            self.sent.append((body["chat_id"], body["text"]))
            return httpx.Response(200, json={"ok": True, "result": {}})
        desc = "Forbidden: bot was blocked by the user" if self.send_status == 403 else "oops"
        return httpx.Response(self.send_status, json={"ok": False, "description": desc})

    def say(self, update_id, chat_id, text, chat_type="private"):
        self.updates.append({"update_id": update_id, "message": {"chat": {"id": chat_id, "type": chat_type}, "text": text}})


def _code(url: str) -> str:
    return parse_qs(urlsplit(url).query)["start"][0]


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        pid = project(db, owner=actor).id
    bot = FakeBot()
    telegram = Telegram(sessions, TelegramClient(TOKEN, transport=httpx.MockTransport(bot)))
    mailer, source = MemoryMailer(), _Source([_item("a"), _item("b")])
    service = ss.SavedSearches(sessions, mailer, public_origin=ORIGIN, search=source, telegram=telegram)
    sid = service.create(actor, pid, SavedSearchCreate(name="Data"), now=NOW - timedelta(days=1)).id
    return SimpleNamespace(sessions=sessions, bot=bot, telegram=telegram, service=service, mailer=mailer, source=source,
                           actor=actor, pid=pid, sid=sid, uid=actor.user_id)


def _link(ctx, chat_id=900, update_id=1):
    code = _code(ctx.telegram.link(ctx.uid)["url"])
    ctx.bot.say(update_id, chat_id, f"/start {code}")
    assert asyncio.run(ctx.telegram.poll()) == 1
    return code


def _enable(ctx):
    ctx.service.update(ctx.actor, ctx.pid, ctx.sid, SavedSearchUpdate(telegram_enabled=True), now=NOW - timedelta(hours=1))
    _due(ctx.sessions, ctx.sid)


def _switch(ctx):
    with ctx.sessions() as db:
        return db.get(SavedSearch, ctx.sid).telegram_enabled


def _code_stored_hashed(ctx, code):
    with ctx.sessions() as db:
        row = db.get(TelegramLink, ctx.uid)
        return row.code_hash is not None and code.encode() not in row.code_hash


def test_link_redeem_confirms_and_code_is_single_use(ctx):
    view = ctx.telegram.link(ctx.uid)
    code = _code(view["url"])
    assert view["url"].startswith("https://t.me/jsp_bot?start=") and _code_stored_hashed(ctx, code)
    ctx.bot.say(1, 900, f"/start {code}")
    assert asyncio.run(ctx.telegram.poll()) == 1
    assert ctx.telegram.status(ctx.uid)["linked"] is True and ctx.bot.sent[0][0] == 900
    ctx.bot.say(2, 901, f"/start {code}")  # replay from another chat
    assert asyncio.run(ctx.telegram.poll()) == 0 and len(ctx.bot.sent) == 1
    with ctx.sessions() as db:
        assert db.get(TelegramLink, ctx.uid).chat_id == 900


def test_expired_code_is_refused(ctx):
    code = _code(ctx.telegram.link(ctx.uid, now=datetime.now(timezone.utc) - timedelta(minutes=11))["url"])
    assert ctx.telegram.redeem(code, 900) is None and ctx.telegram.status(ctx.uid)["linked"] is False


def test_new_link_replaces_pending_code(ctx):
    old = _code(ctx.telegram.link(ctx.uid)["url"])
    new = _code(ctx.telegram.link(ctx.uid)["url"])
    assert ctx.telegram.redeem(old, 900) is None and ctx.telegram.redeem(new, 900) is not None


def test_foreign_group_other_command_and_malformed_updates_are_ignored(ctx):
    code = _code(ctx.telegram.link(ctx.uid)["url"])
    ctx.bot.say(1, 900, "hello")
    ctx.bot.say(2, 900, "/stop")
    ctx.bot.say(3, 900, f"/start {code}", chat_type="group")
    ctx.bot.say(4, 900, "/start bad code!")
    ctx.bot.say(5, 900, "/start nonexistentcode")
    ctx.bot.say(6, 900, f"/start {code} extra")
    ctx.bot.updates.append({"update_id": 7, "edited_message": {}})
    ctx.bot.updates.append({"update_id": 8, "message": {"chat": {"id": "x"}, "text": 5}})
    assert asyncio.run(ctx.telegram.poll()) == 0 and ctx.bot.sent == []
    assert ctx.telegram.status(ctx.uid)["linked"] is False
    assert ctx.telegram.redeem(code, 900) is not None  # the code survived all of that


def test_relinking_the_same_chat_moves_it_between_accounts(ctx):
    _link(ctx)
    with ctx.sessions.begin() as db:
        other = owner(db).user_id
    code = _code(ctx.telegram.link(other)["url"])
    assert ctx.telegram.redeem(code, 900) is not None
    assert ctx.telegram.status(ctx.uid)["linked"] is False and ctx.telegram.status(other)["linked"] is True


def test_disabled_without_token(ctx):
    off = Telegram(ctx.sessions, None)
    assert off.status(ctx.uid) == {"enabled": False, "linked": False, "bot_username": None, "linked_at": None}
    for call in (lambda: off.link(ctx.uid), lambda: off.unlink(ctx.uid)):
        with pytest.raises(ServiceError) as err:
            call()
        assert err.value.code == "telegram_disabled"
    assert asyncio.run(off.poll()) == 0


def test_enabling_needs_a_link(ctx):
    with pytest.raises(ServiceError) as err:
        ctx.service.update(ctx.actor, ctx.pid, ctx.sid, SavedSearchUpdate(telegram_enabled=True))
    assert err.value.code == "telegram_not_linked"
    ctx.telegram.link(ctx.uid)  # a pending code is not a link
    with pytest.raises(ServiceError):
        ctx.service.update(ctx.actor, ctx.pid, ctx.sid, SavedSearchUpdate(telegram_enabled=True))
    _link(ctx, update_id=1)
    assert ctx.service.update(ctx.actor, ctx.pid, ctx.sid, SavedSearchUpdate(telegram_enabled=True)).telegram_enabled


def test_delivery_to_chat_marks_seen_and_skips_unsubscribe_link(ctx):
    _link(ctx)
    ctx.bot.sent.clear()
    with ctx.sessions.begin() as db:
        db.execute(update(SavedSearch).where(SavedSearch.id == ctx.sid).values(digest_enabled=False))
    _enable(ctx)
    assert asyncio.run(ctx.service.run_due(NOW)) == 1
    (chat, text), = ctx.bot.sent
    assert chat == 900 and "https://jobs.example.test/a" in text and "unsubscribe" not in text
    assert ctx.mailer.sent == [] and _seen(ctx.sessions, ctx.sid) == {"a", "b"}


def test_transient_failure_retries_and_keeps_items_unseen(ctx):
    _link(ctx)
    with ctx.sessions.begin() as db:
        db.execute(update(SavedSearch).where(SavedSearch.id == ctx.sid).values(digest_enabled=False))
    _enable(ctx)
    ctx.bot.send_status = 500
    assert asyncio.run(ctx.service.run_due(NOW)) == 0
    assert _seen(ctx.sessions, ctx.sid) == set() and _switch(ctx)
    with ctx.sessions() as db:
        assert db.get(SavedSearch, ctx.sid).next_run_at == NOW + ss.RETRY_BACKOFF
    ctx.bot.send_status = 200
    _due(ctx.sessions, ctx.sid, NOW + ss.RETRY_BACKOFF)
    assert asyncio.run(ctx.service.run_due(NOW + ss.RETRY_BACKOFF)) == 1
    assert _seen(ctx.sessions, ctx.sid) == {"a", "b"}


def test_email_still_marks_seen_when_chat_fails_transiently(ctx):
    _link(ctx)
    _enable(ctx)
    ctx.bot.send_status = 500
    assert asyncio.run(ctx.service.run_due(NOW)) == 1
    assert len(ctx.mailer.sent) == 1 and _seen(ctx.sessions, ctx.sid) == {"a", "b"}


def test_forbidden_unlinks_and_clears_every_switch(ctx):
    _link(ctx)
    second = ctx.service.create(ctx.actor, ctx.pid, SavedSearchCreate(name="Other")).id
    ctx.service.update(ctx.actor, ctx.pid, second, SavedSearchUpdate(telegram_enabled=True))
    _enable(ctx)
    ctx.bot.send_status = 403
    assert asyncio.run(ctx.service.run_due(NOW)) == 1  # email still went out
    assert ctx.telegram.status(ctx.uid)["linked"] is False and not _switch(ctx)
    with ctx.sessions() as db:
        assert not db.get(SavedSearch, second).telegram_enabled


def test_unlink_clears_switches_and_deleting_the_user_removes_the_link(ctx):
    _link(ctx)
    _enable(ctx)
    ctx.telegram.unlink(ctx.uid)
    assert not _switch(ctx) and ctx.telegram.status(ctx.uid)["linked"] is False
    _link(ctx, chat_id=901, update_id=9)
    with ctx.sessions.begin() as db:
        db.delete(db.get(User, ctx.uid))
    with ctx.sessions() as db:
        assert db.get(TelegramLink, ctx.uid) is None


def test_token_never_logged(ctx, caplog):
    with caplog.at_level(logging.DEBUG):
        _link(ctx)
        ctx.bot.send_status = 500
        _enable(ctx)
        asyncio.run(ctx.service.run_due(NOW))
    assert TOKEN not in caplog.text and "900" not in caplog.text


# --- routes ---

def _api(ctx, migrated_engine, enabled=True):
    sessions = ctx.sessions
    owner_sessions = OwnerSessions(sessions, public_origin=ORIGIN)

    class Stub:
        async def start(self): return None
        async def close(self): return None
        async def reconcile_pending(self): return None

    telegram = ctx.telegram if enabled else Telegram(sessions, None)
    services = Services(sessions=sessions, owner_sessions=owner_sessions, files=Stub(), documents=None, runs=None,
                        grants=None, settings=None, approvals=None, supervisor=Stub(), runtime=Stub(), queue=None,
                        accounts=Accounts(sessions, owner_sessions, MemoryMailer(), public_origin=ORIGIN),
                        saved_searches=ctx.service, telegram=telegram)
    from fastapi.testclient import TestClient
    client = TestClient(create_app(services), base_url=ORIGIN)
    cookie, csrf = login_cookie(services, ctx.uid)
    client.cookies.set("jsp_owner_session", cookie)
    return client, {"X-CSRF-Token": csrf, "Origin": ORIGIN}


def test_routes_link_status_unlink(ctx, migrated_engine):
    client, headers = _api(ctx, migrated_engine)
    with client:
        assert client.get("/api/v1/account/telegram").json() == {
            "enabled": True, "linked": False, "bot_username": "jsp_bot", "linked_at": None}
        link = client.post("/api/v1/account/telegram/link", headers=headers)
        assert link.status_code == 200 and link.json()["url"].startswith("https://t.me/jsp_bot?start=")
        ctx.bot.say(1, 900, f"/start {_code(link.json()['url'])}")
        asyncio.run(ctx.telegram.poll())
        assert client.get("/api/v1/account/telegram").json()["linked"] is True
        patched = client.patch(f"/api/v1/projects/{ctx.pid}/saved-searches/{ctx.sid}", headers=headers,
                               json={"telegram_enabled": True})
        assert patched.status_code == 200 and patched.json()["telegram_enabled"] is True
        assert client.delete("/api/v1/account/telegram", headers=headers).status_code == 204
        assert client.get("/api/v1/account/telegram").json()["linked"] is False
        assert client.get(f"/api/v1/projects/{ctx.pid}/saved-searches").json()["items"][0]["telegram_enabled"] is False
        again = client.patch(f"/api/v1/projects/{ctx.pid}/saved-searches/{ctx.sid}", headers=headers,
                             json={"telegram_enabled": True})
        assert again.status_code == 409 and again.json()["code"] == "telegram_not_linked"


def test_routes_disabled_without_token(ctx, migrated_engine):
    client, headers = _api(ctx, migrated_engine, enabled=False)
    with client:
        assert client.get("/api/v1/account/telegram").json() == {
            "enabled": False, "linked": False, "bot_username": None, "linked_at": None}
        for call in (lambda: client.post("/api/v1/account/telegram/link", headers=headers),
                     lambda: client.delete("/api/v1/account/telegram", headers=headers)):
            response = call()
            assert response.status_code == 404 and response.json()["code"] == "telegram_disabled"


def test_link_is_rate_limited(ctx, migrated_engine):
    client, headers = _api(ctx, migrated_engine)
    with client:
        codes = [client.post("/api/v1/account/telegram/link", headers=headers).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]
