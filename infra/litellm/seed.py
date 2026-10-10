"""First-start LiteLLM seed: ai-analyze model and the job-search-app virtual key. Stdlib only, idempotent."""

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("LITELLM_URL", "http://litellm:4000")
MASTER_KEY = open("/run/secrets/litellm-master-key", encoding="utf-8").read().strip()
KEY_OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LITELLM_APP_KEY_FILE", "/out/litellm_app_key")
MODEL = {
    "model_name": "ai-analyze",
    "litellm_params": {"model": "openrouter/z-ai/glm-5.3-flash", "api_key": "os.environ/OPENROUTER_API_KEY"},
}
KEY_ALIAS = "job-search-app"


def call(method, path, body=None, token=MASTER_KEY):
    request = urllib.request.Request(
        BASE + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, {}
    except (urllib.error.URLError, OSError, ValueError):
        return 0, {}


def wait_healthy(seconds=180):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if call("GET", "/health/liveliness")[0] == 200:
            return True
        time.sleep(2)
    return False


def read_key():
    try:
        return open(KEY_OUT, encoding="utf-8").read().strip()
    except OSError:
        return ""


def write_key(value):
    descriptor = os.open(KEY_OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value + "\n")


def seed_model():
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("openrouter_key_missing: model seed skipped", flush=True)
        return
    status, info = call("GET", "/model/info")
    if status == 200 and any(m.get("model_name") == MODEL["model_name"] for m in info.get("data", [])):
        print("model_present", flush=True)
        return
    print("model_created" if call("POST", "/model/new", MODEL)[0] == 200 else "model_create_failed", flush=True)


def seed_key():
    existing = read_key()
    if existing and call("GET", "/v1/models", token=existing)[0] == 200:
        print("app_key_present", flush=True)
        return
    call("POST", "/key/delete", {"key_aliases": [KEY_ALIAS]})  # a stale key cannot be recovered
    status, created = call(
        "POST", "/key/generate", {"key_alias": KEY_ALIAS, "models": ["ai-analyze"], "metadata": {"allowed_passthrough_routes": ["/jev/decisions"]}}
    )
    if status == 200 and created.get("key"):
        write_key(created["key"])
        print("app_key_created", flush=True)
    else:
        print("app_key_create_failed", flush=True)


if __name__ == "__main__":
    if not wait_healthy():
        print("litellm_unhealthy", flush=True)
        sys.exit(1)
    seed_model()
    seed_key()
