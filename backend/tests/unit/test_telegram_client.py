"""Telegram Bot API client: fake transport only, no network. Synthetic data only."""
import json
import logging

import httpx
import pytest

from job_search_platform.integrations import telegram as tg
from job_search_platform.services.saved_searches import telegram_text

TOKEN = "123456:SYNTHETIC-token"


def _client(handler):
    return tg.TelegramClient(TOKEN, transport=httpx.MockTransport(handler))


def test_send_message_posts_plain_text_without_previews_to_fixed_host():
    seen = []

    def handler(request):
        seen.append((str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"ok": True, "result": {}})

    _client(handler).send_message(42, "hello")
    assert seen == [(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                     {"chat_id": 42, "text": "hello", "link_preview_options": {"is_disabled": True}})]


def test_bot_username_is_cached():
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json={"ok": True, "result": {"username": "jsp_bot"}})

    client = _client(handler)
    assert client.bot_username() == client.bot_username() == "jsp_bot" and len(calls) == 1


@pytest.mark.parametrize("response,kind", [
    (httpx.Response(403, json={"ok": False, "description": "Forbidden: bot was blocked by the user"}), "blocked"),
    (httpx.Response(400, json={"ok": False, "description": "Bad Request: chat not found"}), "blocked"),
    (httpx.Response(400, json={"ok": False, "description": "Bad Request: message is too long"}), "transient"),
    (httpx.Response(429, json={"ok": False}), "transient"),
    (httpx.Response(500, text="boom"), "transient"),
    (httpx.Response(200, content=b"x" * (tg.MAX_BODY + 1)), "transient"),
])
def test_error_classification(response, kind):
    with pytest.raises(tg.TelegramError) as err:
        _client(lambda request: response).send_message(1, "x")
    assert err.value.kind == kind


def test_network_failure_is_transient_and_never_carries_the_token(caplog):
    def handler(request):
        raise httpx.ConnectError(f"cannot reach {request.url}")

    with caplog.at_level(logging.DEBUG), pytest.raises(tg.TelegramError) as err:
        _client(handler).get_updates(None)
    assert err.value.kind == "transient" and TOKEN not in str(err.value) and TOKEN not in caplog.text
    assert TOKEN not in repr(tg.TelegramClient(TOKEN))


def test_get_updates_sends_offset_and_no_wait():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True, "result": [{"update_id": 5}, "junk"]})

    assert _client(handler).get_updates(7) == [{"update_id": 5}]
    assert bodies[0]["offset"] == 7 and bodies[0]["timeout"] == 0


def test_load_token_needs_private_file(tmp_path):
    assert tg.load_token(tmp_path) is None
    path = tmp_path / "telegram-bot-token"
    path.write_text(TOKEN + "\n")
    path.chmod(0o600)
    assert tg.load_token(tmp_path) == TOKEN
    path.chmod(0o644)
    assert tg.load_token(tmp_path) is None


def test_telegram_text_has_no_unsubscribe_and_truncates_to_limit():
    items = [{"slug": str(i), "title": "T" * 300, "company": "Example Co", "source_url": f"https://jobs.example.test/{i}"}
             for i in range(20)]
    short = telegram_text("en", "Data", items[:2], "https://app.example.test/x")
    assert "unsubscribe" not in short.lower() and "Stop this digest" not in short and "…" not in short
    long = telegram_text("en", "Data", items, "https://app.example.test/x")
    assert len(long) <= 4096 and "\n…\n" in long and long.endswith("https://app.example.test/x")


def test_supervisor_poll_loop_repeats_survives_errors_and_is_off_without_token():
    import asyncio

    from job_search_platform.workers.supervisor import WorkerSupervisor

    calls = []

    async def poll():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return 0

    async def go(poll_fn):
        supervisor = WorkerSupervisor(None, None, object(), object(), telegram_poll=poll_fn, telegram_interval=0.01)
        supervisor._telegram_task = asyncio.create_task(supervisor._telegram_loop()) if poll_fn else None
        await asyncio.sleep(0.2)
        await supervisor.close()
        assert supervisor._telegram_task is None

    asyncio.run(go(poll))
    assert len(calls) >= 3  # kept polling after the first failure, and close() stopped it
    assert WorkerSupervisor(None, None, object(), object())._telegram_task is None
    asyncio.run(go(None))
