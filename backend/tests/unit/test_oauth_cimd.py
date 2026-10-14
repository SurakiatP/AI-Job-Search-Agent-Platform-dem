import httpx
import pytest

from job_search_platform.services import oauth, webhooks

URL = "https://client.example.test/oauth/client.json"


def _doc(**over):
    doc = {"client_id": URL, "client_name": "Synthetic client", "redirect_uris": ["http://127.0.0.1:33418/callback"],
           "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"],
           "response_types": ["code"]}
    doc.update(over)
    return doc


def test_is_cimd_client_id():
    assert oauth.is_cimd_client_id(URL)
    for value in ("http://client.example.test/c.json", "https://client.example.test", "https://client.example.test/",
                  "0b6f6c1e-7d84-4c55-9f0a-2a8f6f0f6d11", "https://u:p@client.example.test/c.json", URL + "#x",
                  "https://[abc/x"):
        assert not oauth.is_cimd_client_id(value), value


def test_validate_cimd_accepts_public_client():
    info = oauth.validate_cimd(URL, _doc())
    assert info.client_id == URL and info.token_endpoint_auth_method == "none"
    assert info.client_secret is None


@pytest.mark.parametrize("over", [{"client_id": "https://evil.example.test/c.json"}, {"redirect_uris": []},
                                  {"token_endpoint_auth_method": "client_secret_post"}, {"client_secret": "s"},
                                  {"grant_types": ["client_credentials"]},
                                  {"redirect_uris": ["javascript:alert(1)//"]}])
def test_validate_cimd_rejects(over):
    with pytest.raises(ValueError):
        oauth.validate_cimd(URL, _doc(**over))


def test_resource_matches():
    assert oauth.resource_matches("https://a.test/mcp", "https://a.test/mcp")
    assert oauth.resource_matches("https://a.test/mcp/", "https://a.test/mcp")
    assert not oauth.resource_matches(None, "https://a.test/mcp")
    assert not oauth.resource_matches("https://a.test/other", "https://a.test/mcp")


async def _fetch(monkeypatch, handler):
    async def ok(url):
        return "ok"
    monkeypatch.setattr(webhooks, "check_url", ok)
    return await oauth.fetch_cimd(URL, transport=httpx.MockTransport(handler))


async def test_fetch_cimd_ok(monkeypatch):
    info = await _fetch(monkeypatch, lambda req: httpx.Response(200, json=_doc()))
    assert info is not None and info.client_name == "Synthetic client"


async def test_cimd_redirect_is_refused(monkeypatch):
    assert await _fetch(monkeypatch, lambda req: httpx.Response(302, headers={"Location": "https://x.test/"})) is None


async def test_cimd_too_large_or_not_json_is_refused(monkeypatch):
    big = {"client_name": "x" * 6000}
    assert await _fetch(monkeypatch, lambda req: httpx.Response(200, json=_doc(**big))) is None
    assert await _fetch(monkeypatch, lambda req: httpx.Response(200, text="not json")) is None


async def test_cimd_blocked_url_is_not_fetched(monkeypatch):
    calls = []
    async def blocked(url):
        return "blocked"
    monkeypatch.setattr(webhooks, "check_url", blocked)
    assert await oauth.fetch_cimd(URL, transport=httpx.MockTransport(lambda r: calls.append(r) or httpx.Response(200))) is None
    assert calls == []


@pytest.mark.parametrize("uris,ok", [
    (["https://app.example.test/cb"], True), (["http://127.0.0.1:9/cb"], True), (["http://localhost/cb"], True),
    (["http://[::1]:9/cb"], True), (["http://evil.example.test/cb"], False), (["javascript:alert(1)//"], False),
    (["data:text/html,x"], False), (["file:///etc/passwd"], False), (["cursor://callback"], True),
    (["com.example.app:/cb"], True), (["JavaScript:alert(1)"], False), ([], False),
    (["https://app.example.test/cb", "javascript:alert(1)//"], False), (["https://[abc/x"], False)])
def test_redirect_uris_ok(uris, ok):
    assert oauth.redirect_uris_ok(uris) is ok
