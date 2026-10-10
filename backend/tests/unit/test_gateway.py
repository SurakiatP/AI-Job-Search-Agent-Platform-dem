import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.services.errors import ServiceError

KEY = "sk-test-gateway"


class _Stub(BaseHTTPRequestHandler):
    seen: list = []

    def _reply(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.seen.append((self.path, self.headers.get("Authorization")))
        self._reply({"data": [{"id": "ai-analyze"}, {"id": "other"}]})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.seen.append((self.path, self.headers.get("Authorization"), json.loads(self.rfile.read(length))))
        self._reply({"answers": {"q": 1}})

    def log_message(self, *_):
        pass


@pytest.fixture
def stub(monkeypatch):
    _Stub.seen = []
    server = HTTPServer(("127.0.0.1", 0), _Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("LITELLM_BASE_URL", f"http://127.0.0.1:{server.server_port}/")
    yield server
    server.shutdown()


def test_provider_config_is_custom_openai_compatible_v1():
    config = GatewaySettings.from_env().provider_config()
    assert (config.provider, config.model, config.base_url, config.api_key) == (
        "custom", "ai-analyze", "http://127.0.0.1:4000/v1", KEY)


def test_missing_key_raises_gateway_unconfigured(no_gateway_key):
    with pytest.raises(ServiceError) as raised:
        GatewaySettings.from_env().provider_config()
    assert raised.value.code == "gateway_unconfigured"


def test_key_file_fallback_needs_private_mode(no_gateway_key, tmp_path):
    path = tmp_path / "litellm_app_key"
    path.write_text("sk-from-file\n")
    path.chmod(0o644)
    assert GatewaySettings.from_env().api_key is None
    path.chmod(0o600)
    assert GatewaySettings.from_env().api_key == "sk-from-file"


async def test_status_reachable_lists_models_and_hides_key(stub):
    view = await GatewaySettings.from_env().status()
    assert view.configured and view.reachable and view.models == ["ai-analyze", "other"]
    assert view.base_url == f"http://127.0.0.1:{stub.server_port}"
    assert _Stub.seen == [("/v1/models", f"Bearer {KEY}")]
    assert KEY not in view.model_dump_json()


async def test_status_unreachable_and_unconfigured(monkeypatch, no_gateway_key):
    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:9")
    assert (await GatewaySettings.from_env().status()).configured is False
    monkeypatch.setenv("LITELLM_API_KEY", KEY)
    view = await GatewaySettings.from_env().status()
    assert view.configured and not view.reachable and view.models == []


def test_jev_posts_to_gateway_passthrough_with_app_key(stub):
    answers = GatewaySettings.from_env().jev_client().decide({"s": 1}, {"q": "?"})
    assert answers == {"q": 1}
    path, auth, body = _Stub.seen[0]
    assert (path, auth) == ("/jev/decisions", f"Bearer {KEY}")
    assert body["model"] == "typesafe/jev-1.13"
