"""WP1 part 2: the app starts on Linux and trusts X-Forwarded-For only from Caddy on loopback."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

import run_local  # noqa: E402
from job_search_platform import main  # noqa: E402


def test_secret_store_is_none_off_macos(monkeypatch):
    def boom():
        raise AssertionError("Keychain must not be built on Linux")
    monkeypatch.setattr(main.sys, "platform", "linux")
    monkeypatch.setattr(main, "MacOSKeychain", boom)
    assert main._secret_store() is None


def test_secret_store_is_keychain_on_macos(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(main.sys, "platform", "darwin")
    monkeypatch.setattr(main, "MacOSKeychain", lambda: sentinel)
    assert main._secret_store() is sentinel


def _client_seen(config, peer: str, forwarded: str | None) -> str:
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"][0]

    config.app = app
    config.load()
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    scope = {"type": "http", "client": (peer, 5000), "headers": headers, "scheme": "http",
             "path": "/", "query_string": b"", "method": "GET", "http_version": "1.1",
             "server": ("127.0.0.1", 8000), "root_path": "", "asgi": {"version": "3.0"}}
    asyncio.run(config.loaded_app(scope, None, None))
    return seen["client"]


def test_forwarded_for_trusted_only_from_loopback(monkeypatch):
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")  # must not widen trust
    config = run_local._server_config(None, "127.0.0.1", 8000)
    assert config.proxy_headers is True and config.forwarded_allow_ips == "127.0.0.1"
    assert _client_seen(config, "127.0.0.1", "203.0.113.9") == "203.0.113.9"
    config = run_local._server_config(None, "127.0.0.1", 8000)
    assert _client_seen(config, "198.51.100.7", "203.0.113.9") == "198.51.100.7"
    config = run_local._server_config(None, "127.0.0.1", 8000)
    assert _client_seen(config, "127.0.0.1", None) == "127.0.0.1"


def test_container_deploy_may_listen_on_all_interfaces_but_proxy_trust_stays_loopback(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["run_local.py", "--host", "0.0.0.0"])
    assert run_local._parser().parse_args().host == "0.0.0.0"
    config = run_local._server_config(None, "0.0.0.0", 8000)
    assert config.host == "0.0.0.0" and config.forwarded_allow_ips == "127.0.0.1"
