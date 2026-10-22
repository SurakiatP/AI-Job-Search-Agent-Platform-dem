# Single-VM IaC (WP1 part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform deployable to one fresh Ubuntu 24.04 VM with HTTPS, timers and tag-based deploy/rollback, proven in a throwaway Colima VM.

**Architecture:** The app keeps running through `scripts/run_local.py`, now as a systemd service. Infrastructure keeps running from `infra/compose.yaml` plus a small production override that adds Caddy and moves Prometheus/Grafana to host networking. Shell scripts in `infra/deploy/` (cloud-init, bootstrap, deploy) reuse the existing `local_infra.py`, `backup.py`, `restore.py` and `infra/hermes/setup.py`.

**Tech Stack:** Ubuntu 24.04, systemd, Docker Compose v2, Caddy 2.11, bash, Python 3.12 + pytest, uv 0.12.2, Node 24.18.0.

**Spec:** `docs/superpowers/specs/2026-10-15-iac-single-vm-design.md` (approved 2026-10-15). ADR: `docs/adr/ADR-017-systemd-single-vm.md`.

## Global Constraints

- Only ports 22, 80 and 443 are public. Every Compose `ports:` entry binds `127.0.0.1`. Only `caddy`, `prometheus` and `grafana` use `network_mode: host`.
- Every container image is pinned by `@sha256:` digest or is a locally built `job-search-platform/...` image (enforced by `scripts/check_dependencies.py`).
- No known High/Critical CVE in any image (DELIVERY gate). An unresolved finding blocks the task; escalate, do not ignore.
- Secrets live only in `/etc/job-search-platform/private/` (dir 0700, files 0600). No secret in Git, logs or the plan.
- Do not run `scripts/local_infra.py start` on the owner machine without the owner's `.env` (LEARNINGS 2026-10-15: it strips the LiteLLM provider key). Only the rehearsal VM (Task 7) runs `start`.
- One Docker image build at a time; check `df -h /` ≥ 20 GB free before any image build.
- Shell commands on the dev machine are prefixed with `rtk`. Scripts that ship to the server do not use `rtk`.
- Never deploy a branch; `deploy.sh` takes a tag.
- Host paths, verbatim: `/opt/job-search-platform/releases/<tag>`, `/opt/job-search-platform/current`, `/var/lib/job-search-platform` (home of `jsp`), `/etc/job-search-platform/private/` (+ `app.env`), `/var/backups/job-search-platform/`.
- Versions, verbatim: uv `0.12.2`, Node `24.18.0`, uvicorn `0.41.0`.

## Spec deviation (decided at planning, 2026-10-15)

The spec's `run_local.py --behind-proxy` flag is not needed: uvicorn 0.41.0 already defaults to `proxy_headers=True` and `forwarded_allow_ips="127.0.0.1"` (verified with `uv run python -c "from uvicorn.config import Config; ..."`). Behind Caddy on 127.0.0.1 the real client IP already reaches `accounts._ip`. The only risk is the `FORWARDED_ALLOW_IPS` environment variable widening trust. Task 1 therefore pins `proxy_headers=True, forwarded_allow_ips="127.0.0.1"` explicitly on both listeners and tests the behaviour. Same outcome as spec D5, no new flag.

## Review Focus

1. **`app.env` still holding placeholders or wrong permissions** → bootstrap must stop with a clear message before starting anything; a world-readable `app.env` must be refused. (Task 4 test)
2. **Rollback to a tag with a different Alembic head** → `deploy.sh` must refuse and print the `restore.py` command, never start old code on a newer schema. (Task 4 test)
3. **Failed health check after deploy** → `current` must point back at the previous release and the app restart; exit non-zero. (Task 4 test)
4. **Client-sent `X-Forwarded-For` from a non-proxy peer** → must be ignored; and `FORWARDED_ALLOW_IPS=*` in the environment must not widen trust. (Task 1 test)
5. **A Compose port or service accidentally public in the merged prod config** → test fails if any published port is not `127.0.0.1` or any service other than caddy/prometheus/grafana is host-networked. (Task 5 test)

---

### Task 1: App runs on Linux and pins proxy trust

**Files:**
- Modify: `backend/src/job_search_platform/main.py` (line 130, `secrets = MacOSKeychain()`)
- Modify: `scripts/run_local.py` (both `uvicorn.Config(...)` calls)
- Test: `backend/tests/unit/test_linux_deploy_startup.py` (create)

**Interfaces:**
- Produces: `main._secret_store() -> MacOSKeychain | None`; `run_local._server_config(app, host: str, port: int) -> uvicorn.Config`.

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_linux_deploy_startup.py -q`
Expected: FAIL — `AttributeError: module 'job_search_platform.main' has no attribute '_secret_store'` and `run_local` has no `_server_config`.

- [ ] **Step 3: Implement**

In `main.py`, `sys` is not imported yet — add `import sys` with the other stdlib imports. Add above `build_services`:

```python
def _secret_store():
    return MacOSKeychain() if sys.platform == "darwin" else None  # no caller reads it; Keychain exists only on macOS
```

and replace `secrets = MacOSKeychain()` with `secrets = _secret_store()`.

In `run_local.py`, add after `_parser()`:

```python
def _server_config(app, host: str, port: int):
    import uvicorn
    # Caddy proxies from loopback; pin trust so FORWARDED_ALLOW_IPS cannot widen it.
    return uvicorn.Config(app, host=host, port=port, access_log=False, log_config=None,
                          proxy_headers=True, forwarded_allow_ips="127.0.0.1")
```

Replace `uvicorn.Config(app, host=args.host, port=args.port, access_log=False, log_config=None)` with `_server_config(app, args.host, args.port)`, and the shared listener's `uvicorn.Config(create_shared_app(...), host=args.share_host, port=args.share_port, access_log=False, log_config=None)` with `_server_config(create_shared_app(services, host=args.share_host, port=args.share_port), args.share_host, args.share_port)`.

- [ ] **Step 4: Run tests**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_linux_deploy_startup.py backend/tests/integration/test_application_startup.py -q`
Expected: PASS (the startup integration test proves `_launch` still serves).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/main.py scripts/run_local.py backend/tests/unit/test_linux_deploy_startup.py
rtk git commit -m "feat(deploy): start without Keychain off macOS; pin proxy trust to loopback (WP1 IaC)"
```

---

### Task 2: Compose override hook and Grafana datasource URL

**Files:**
- Modify: `scripts/local_infra.py` (`_compose`, `compose_environment`)
- Modify: `infra/grafana/provisioning/datasources/prometheus.yml`
- Modify: `infra/compose.yaml` (grafana `environment`)
- Test: `backend/tests/unit/test_observability_sources.py` (append)

**Interfaces:**
- Produces: env var `CORE02_COMPOSE_OVERRIDE` (absolute or repo-relative path to an extra compose file); Grafana env `GRAFANA_PROMETHEUS_URL`.

- [ ] **Step 1: Write the failing tests** (append; `_stub_pre_a1` already exists in this file)

```python
def test_compose_override_appended_only_when_set(monkeypatch, tmp_path):
    calls = _stub_pre_a1(monkeypatch, tmp_path)
    monkeypatch.delenv("CORE02_COMPOSE_OVERRIDE", raising=False)
    local_infra._compose(["ps"], tmp_path, tmp_path)
    assert calls[-1].count("--file") == 1
    override = tmp_path / "compose.prod.yaml"
    override.write_text("services: {}\n")
    monkeypatch.setenv("CORE02_COMPOSE_OVERRIDE", str(override))
    local_infra._compose(["ps"], tmp_path, tmp_path)
    files = [calls[-1][i + 1] for i, part in enumerate(calls[-1]) if part == "--file"]
    assert files == [str(local_infra.COMPOSE_FILE), str(override)]
    assert calls[-1][-1] == "ps"


def test_compose_override_must_exist(monkeypatch, tmp_path):
    _stub_pre_a1(monkeypatch, tmp_path)
    monkeypatch.setenv("CORE02_COMPOSE_OVERRIDE", str(tmp_path / "missing.yaml"))
    with pytest.raises(local_infra.ConfigurationError, match="compose_override_missing"):
        local_infra._compose(["ps"], tmp_path, tmp_path)


def test_grafana_datasource_url_comes_from_env():
    ds = (ROOT / "infra/grafana/provisioning/datasources/prometheus.yml").read_text()
    assert "url: ${GRAFANA_PROMETHEUS_URL}" in ds
    import yaml
    env = yaml.safe_load((ROOT / "infra/compose.yaml").read_text())["services"]["grafana"]["environment"]
    assert env["GRAFANA_PROMETHEUS_URL"] == "${GRAFANA_PROMETHEUS_URL:-http://prometheus:9090}"
```

- [ ] **Step 2: Run to verify they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_observability_sources.py -q -k "override or datasource_url"`
Expected: 3 FAIL.

- [ ] **Step 3: Implement**

In `_compose`, replace the `command = [...]` list with:

```python
    override = os.environ.get("CORE02_COMPOSE_OVERRIDE", "").strip()
    extra: list[str] = []
    if override:
        path = Path(override) if Path(override).is_absolute() else ROOT / override
        if not path.is_file():
            raise ConfigurationError("compose_override_missing")
        extra = ["--file", str(path)]
    command = [  # callers put global flags (--profile) first in `action`
        "docker",
        "compose",
        "--project-name",
        "jobsearch-core02",
        "--file",
        str(COMPOSE_FILE),
        *extra,
        *action,
    ]
```

Grafana provisioning file: `url: http://prometheus:9090` → `url: ${GRAFANA_PROMETHEUS_URL}` (Grafana expands `$VAR` in provisioning files).

`infra/compose.yaml` grafana `environment:` add `GRAFANA_PROMETHEUS_URL: ${GRAFANA_PROMETHEUS_URL:-http://prometheus:9090}`.

- [ ] **Step 4: Run tests**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_observability_sources.py backend/tests/unit/test_observability_infra.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/local_infra.py infra/grafana/provisioning/datasources/prometheus.yml infra/compose.yaml backend/tests/unit/test_observability_sources.py
rtk git commit -m "feat(deploy): CORE02_COMPOSE_OVERRIDE and Grafana datasource URL from env (WP1 IaC)"
```

---

### Task 3: Caddy image pin and CVE gate

**Files:**
- Modify: `scripts/security_scan.py:18` (`IMAGE_SCOPES`)
- Modify: `scripts/check_dependencies.py` (`REQUIRED_SCANS`)
- Modify: `backend/tests/test_dependency_checks.py` (append)
- Modify: `docs/engineering/dependencies.md` (Caddy row + scan evidence)
- Create: `infra/deploy/caddy-image.txt` — one line, the pinned reference (single source used by Task 4 and Task 5)

**Interfaces:**
- Produces: scan scope `caddy_image`; file `infra/deploy/caddy-image.txt` containing `caddy:2.11.7@sha256:<index digest>`.

- [ ] **Step 1: Resolve the digest** (no pull needed)

Run: `rtk docker buildx imagetools inspect caddy:2.11.7 | head -4`
Expected: `Digest: sha256:...` for an OCI index (multi-arch). Use the index digest. If `2.11.7` is no longer the newest 2.x patch (`rtk docker buildx imagetools inspect caddy:2 --format '{{json .Image}}'` shows `CADDY_VERSION`), use the newest and update every place this plan says `2.11.7`.

- [ ] **Step 2: Write the failing tests** (append to `backend/tests/test_dependency_checks.py`)

```python
def test_caddy_image_is_required_scan_and_digest_pinned():
    assert "caddy_image" in check_dependencies.REQUIRED_SCANS
    assert "caddy_image" in security_scan.IMAGE_SCOPES
    ref = (check_dependencies.ROOT / "infra/deploy/caddy-image.txt").read_text().strip()
    assert ref.startswith("caddy:2.") and "@sha256:" in ref and len(ref.split("@sha256:")[1]) == 64
```

- [ ] **Step 3: Run to verify it fails**

Run: `rtk uv run --locked --project backend pytest backend/tests/test_dependency_checks.py -q -k caddy`
Expected: FAIL.

- [ ] **Step 4: Implement** — add `"caddy_image"` to both tuples/sets; write `infra/deploy/caddy-image.txt` with the reference from Step 1.

- [ ] **Step 5: Scan the image** (check `df -h /` first; pulling Caddy is ~50 MB)

Run:
```bash
rtk docker pull "$(cat infra/deploy/caddy-image.txt)"
rtk proxy trivy image --severity HIGH,CRITICAL --format json --output /tmp/caddy-trivy.json "$(cat infra/deploy/caddy-image.txt)"
python3 -c "import json;r=json.load(open('/tmp/caddy-trivy.json'));print(sum(len(x.get('Vulnerabilities') or []) for x in r.get('Results',[])))"
```
Expected: `0`. **If not 0: STOP this task and report to the controller** with the CVE ids, packages and fixed versions. The controller decides between a newer Caddy tag and a source build (spec "Caddy image and CVEs"); do not ignore findings. Also run for amd64: `--platform linux/amd64`.

- [ ] **Step 6: Record evidence** in `docs/engineering/dependencies.md`: a Caddy row (version, index digest, Apache-2.0, scan date, Trivy version and DB date, result 0 High/Critical for arm64 and amd64), in the same table format as the Prometheus/Grafana rows.

- [ ] **Step 7: Run tests and commit**

Run: `rtk uv run --locked --project backend pytest backend/tests/test_dependency_checks.py -q`
Expected: PASS.

```bash
rtk git add scripts/security_scan.py scripts/check_dependencies.py backend/tests/test_dependency_checks.py infra/deploy/caddy-image.txt docs/engineering/dependencies.md
rtk git commit -m "feat(deploy): pin Caddy by digest and add caddy_image scan scope (WP1 IaC)"
```

---

### Task 4: Production override, Caddyfile, deploy scripts and systemd units

**Files (all create):**
- `infra/compose.prod.yaml`
- `infra/prometheus/prometheus.prod.yml`
- `infra/deploy/Caddyfile`
- `infra/deploy/app.env.example`
- `infra/deploy/cloud-init.yaml`
- `infra/deploy/bootstrap.sh`
- `infra/deploy/deploy.sh`
- `infra/deploy/lib.sh` (shared shell helpers: env check, schema guard, health poll)
- `scripts/migration_state.py` (Alembic state for deploy: code head, DB head, known revision)
- `infra/deploy/job-search-platform.service`, `job-search-ingest.service`, `job-search-ingest.timer`, `job-search-backup.service`, `job-search-backup.timer`
- Test: `backend/tests/unit/test_deploy_scripts.py`, `backend/tests/unit/test_migration_state.py`

**Interfaces:**
- Consumes: `CORE02_COMPOSE_OVERRIDE` (Task 2), `GRAFANA_PROMETHEUS_URL` (Task 2), `infra/deploy/caddy-image.txt` (Task 3), `run_local.py --enable-sharing` (Task 1).
- Produces: `lib.sh` functions `check_app_env <file>`, `guard_schema <db_head> <code_head>`, `wait_ready <url> <seconds>`; `scripts/migration_state.py code-head` (prints the checkout's Alembic head, no DB), `db-head` (prints the DB's revision, reads the same private files and `config` as `ingest_jobs.py`), `knows <rev>` (exit 0 if the checkout's migration history contains `<rev>`, else 1). Env names in `app.env`: `DOMAIN`, `ACME_EMAIL`, `CADDY_TLS`, `APP_PUBLIC_ORIGIN`, `SHARE_PUBLIC_ORIGIN`, `CORE02_PRIVATE_DIR`, `METRICS_PORT`, `MINIO_SOURCE_DIR`, `GOSU_SOURCE_DIR`, `PROMETHEUS_SOURCE_DIR`, `GRAFANA_PROM_DS_SOURCE_DIR`, `OPENROUTER_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`, `CORE02_COMPOSE_OVERRIDE`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/unit/test_deploy_scripts.py`). They run the shell helpers with stubbed commands on PATH; no Docker, no root.

```python
"""WP1 part 2: deploy helpers refuse unsafe states (placeholders, open perms, schema mismatch, failed health)."""
from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
DEPLOY = ROOT / "infra/deploy"


def _sh(script: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["bash", "-c", f"set -euo pipefail; source '{DEPLOY / 'lib.sh'}'; {script}"],
                          capture_output=True, text=True, env={**os.environ, **(env or {})}, timeout=30)


def _env_file(tmp_path: Path, text: str, mode: int = 0o600) -> Path:
    path = tmp_path / "app.env"
    path.write_text(text)
    path.chmod(mode)
    return path


def test_example_has_every_name_and_only_placeholders():
    text = (DEPLOY / "app.env.example").read_text()
    for name in ("DOMAIN", "ACME_EMAIL", "APP_PUBLIC_ORIGIN", "SHARE_PUBLIC_ORIGIN", "CORE02_PRIVATE_DIR",
                 "METRICS_PORT", "OPENROUTER_API_KEY", "SMTP_HOST", "SMTP_PASSWORD", "CORE02_COMPOSE_OVERRIDE"):
        assert f"\n{name}=" in "\n" + text, name
    assert "sk-or-" not in text and "CHANGE_ME" in text


def test_check_app_env_rejects_placeholder(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=CHANGE_ME\n")
    result = _sh(f"check_app_env '{path}'")
    assert result.returncode != 0 and "CHANGE_ME" in result.stderr


def test_check_app_env_rejects_group_or_world_readable(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=example.test\n", mode=0o644)
    result = _sh(f"check_app_env '{path}'")
    assert result.returncode != 0 and "0600" in result.stderr


def test_check_app_env_accepts_complete_private_file(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=example.test\nACME_EMAIL=ops@example.test\n")
    assert _sh(f"check_app_env '{path}'").returncode == 0


def _stub(tmp_path: Path, name: str, body: str) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    path = bin_dir / name
    path.write_text("#!/usr/bin/env bash\n" + body + "\n")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def test_wait_ready_fails_after_deadline(tmp_path):
    _stub(tmp_path, "curl", "exit 22")
    result = _sh("wait_ready https://example.test/api/v1/health/ready 2",
                 {"PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}"})
    assert result.returncode != 0


def test_wait_ready_succeeds(tmp_path):
    _stub(tmp_path, "curl", "exit 0")
    result = _sh("wait_ready https://example.test/api/v1/health/ready 5",
                 {"PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}"})
    assert result.returncode == 0


@pytest.mark.parametrize("db_head,code_head,ok", [("0029_job_crawl", "0029_job_crawl", True),
                                                  ("0030_next", "0029_job_crawl", False)])
def test_rollback_guard(tmp_path, db_head, code_head, ok):
    result = _sh(f"guard_schema '{db_head}' '{code_head}'")
    assert (result.returncode == 0) is ok
    if not ok:
        assert "restore.py" in result.stderr


def test_deploy_restores_previous_release_on_failed_health():
    text = (DEPLOY / "deploy.sh").read_text()
    assert "wait_ready" in text
    fail_branch = text.split("if ! wait_ready", 1)[1].split("\nfi", 1)[0]
    assert 'ln -sfn "$previous"' in fail_branch and "systemctl restart job-search-platform" in fail_branch
    assert "exit 1" in fail_branch


def test_deploy_takes_backup_before_switching():
    text = (DEPLOY / "deploy.sh").read_text()
    assert text.index("scripts/backup.py") < text.index('ln -sfn "$release"')


def test_deploy_refuses_branches_and_checks_schema_before_switch():
    text = (DEPLOY / "deploy.sh").read_text()
    assert "refs/tags/" in text
    assert text.index("migration_state.py knows") < text.index("scripts/backup.py") < text.index('ln -sfn "$release"')


def test_units_use_jsp_and_private_env():
    for name in ("job-search-platform.service", "job-search-ingest.service", "job-search-backup.service"):
        text = (DEPLOY / name).read_text()
        assert "User=jsp" in text and "EnvironmentFile=/etc/job-search-platform/private/app.env" in text
        assert "WorkingDirectory=/opt/job-search-platform/current" in text
    app = (DEPLOY / "job-search-platform.service").read_text()
    assert "--enable-sharing" in app and "Restart=on-failure" in app
    assert "OnCalendar=hourly" in (DEPLOY / "job-search-ingest.timer").read_text()
    backup_timer = (DEPLOY / "job-search-backup.timer").read_text()
    assert "OnCalendar=*-*-* 03:00:00" in backup_timer and "Persistent=true" in backup_timer
    assert "-mtime +7" in (DEPLOY / "job-search-backup.service").read_text()


def test_caddyfile_proxies_both_origins_to_loopback():
    text = (DEPLOY / "Caddyfile").read_text()
    assert "{$DOMAIN}" in text and "agents.{$DOMAIN}" in text
    assert "reverse_proxy 127.0.0.1:8000" in text and "reverse_proxy 127.0.0.1:8001" in text
    assert "{$CADDY_TLS" in text


def test_shell_scripts_parse():
    for name in ("lib.sh", "bootstrap.sh", "deploy.sh"):
        assert subprocess.run(["bash", "-n", str(DEPLOY / name)]).returncode == 0, name
```

Also create `backend/tests/unit/test_migration_state.py`:

```python
"""WP1 part 2: deploy reads Alembic state from the checkout without alembic.ini."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/migration_state.py"


def _run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=60)


def test_code_head_matches_newest_migration():
    result = _run("code-head")
    assert result.returncode == 0, result.stderr
    newest = sorted(p.stem for p in (ROOT / "backend/migrations/versions").glob("[0-9][0-9][0-9][0-9]_*.py"))[-1]
    assert result.stdout.strip() == newest


def test_knows_existing_and_unknown_revision():
    head = _run("code-head").stdout.strip()
    assert _run("knows", head).returncode == 0
    assert _run("knows", "9999_not_a_revision").returncode == 1
```

If migration file names do not equal their revision ids, change the `newest` line to read `revision = "..."` from the newest file instead; do not loosen the assertion.

- [ ] **Step 2: Run to verify they fail**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_deploy_scripts.py backend/tests/unit/test_migration_state.py -q`
Expected: FAIL (files missing).

- [ ] **Step 3: Write `infra/deploy/lib.sh`**

```bash
#!/usr/bin/env bash
# Shared helpers for bootstrap.sh and deploy.sh (WP1 part 2, spec 2026-10-15-iac-single-vm-design.md).

check_app_env() {
  local file="$1"
  [[ -f "$file" ]] || { echo "missing $file; copy infra/deploy/app.env.example and fill it in" >&2; return 1; }
  local mode
  mode=$(stat -c %a "$file" 2>/dev/null || stat -f %Lp "$file")
  [[ "$mode" == "600" ]] || { echo "$file must be mode 0600 (is $mode)" >&2; return 1; }
  if grep -n 'CHANGE_ME' "$file" >&2; then
    echo "replace every CHANGE_ME in $file" >&2; return 1
  fi
}

wait_ready() {
  local url="$1" seconds="$2" deadline=$((SECONDS + $2))
  while (( SECONDS < deadline )); do
    curl --silent --fail --max-time 5 ${CURL_EXTRA:-} "$url" >/dev/null && return 0
    sleep 2
  done
  echo "not ready after ${seconds}s: $url" >&2
  return 1
}

guard_schema() {
  local db_head="$1" code_head="$2"
  [[ "$db_head" == "$code_head" ]] && return 0
  echo "database is at $db_head but this release expects $code_head; code-only rollback is unsafe." >&2
  echo "restore the pre-deploy backup instead:" >&2
  echo "  uv run --locked --project backend python scripts/restore.py --archive /var/backups/job-search-platform/<pre-deploy archive> --target-database <db> --target-bucket <bucket>" >&2
  return 1
}
```

Then write `scripts/migration_state.py` (Alembic runs programmatically in this repo, see `main._migrate`; there is no `alembic.ini`):

```python
"""Alembic state for deploy.sh: code-head | db-head | knows <revision>."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from alembic.config import Config  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from alembic.util.exc import CommandError  # noqa: E402


def _scripts() -> ScriptDirectory:
    cfg = Config()
    cfg.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    return ScriptDirectory.from_config(cfg)


def _db_head() -> str:
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy.engine import URL
    from job_search_platform import config
    from job_search_platform.db.session import make_engine
    from job_search_platform.main import _private_text
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    with make_engine(url, connect_args={"connect_timeout": 5}).connect() as connection:
        return MigrationContext.configure(connection).get_current_revision() or ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("code-head")
    sub.add_parser("db-head")
    sub.add_parser("knows").add_argument("revision")
    args = parser.parse_args(argv)
    if args.command == "code-head":
        print(_scripts().get_current_head())
    elif args.command == "db-head":
        print(_db_head())
    else:
        try:
            return 0 if _scripts().get_revision(args.revision) is not None else 1
        except CommandError:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

The tests run it with `sys.executable`; run them through `uv run --locked --project backend` so Alembic and the package are importable.

- [ ] **Step 4: Write `infra/deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# Usage: deploy.sh <tag>. Update or roll back to a tagged release (spec "Deploy and rollback"). Run as root.
set -euo pipefail
tag="${1:?usage: deploy.sh <tag>}"
base=/opt/job-search-platform
env_file=/etc/job-search-platform/private/app.env
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/lib.sh"
check_app_env "$env_file"
set -a; source "$env_file"; set +a
as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }  # releases are owned by jsp; git refuses root on them

previous="$(readlink -f "$base/current")"
release="$base/releases/$tag"
repo_url="$(as_jsp "git -C '$previous' remote get-url origin")"
git ls-remote --exit-code "$repo_url" "refs/tags/$tag" >/dev/null || { echo "no such tag: $tag" >&2; exit 1; }
[[ -d "$release" ]] || as_jsp "git clone --quiet --depth 1 --branch '$tag' '$repo_url' '$release'"
as_jsp "cd '$release' && uv sync --locked --project backend"

# Rolling back across a migration is never automatic: the target must know the database's revision.
db_head="$(as_jsp "cd '$previous' && uv run --locked --project backend python scripts/migration_state.py db-head")"
if ! as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py knows '$db_head'"; then
  guard_schema "$db_head" "$(as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py code-head")"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/var/backups/job-search-platform/pre-deploy-$tag-$stamp"
as_jsp "cd '$previous' && uv run --locked --project backend python scripts/backup.py --archive '$archive'"

as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"
if ! diff -rq "$previous/infra" "$release/infra" >/dev/null; then
  as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
fi

ln -sfn "$release" "$base/current"
systemctl restart job-search-platform
if ! wait_ready "https://$DOMAIN/api/v1/health/ready" 60; then
  echo "health check failed; restoring $previous" >&2
  ln -sfn "$previous" "$base/current"
  systemctl restart job-search-platform
  echo "if $tag migrated the schema, restore $archive with scripts/restore.py (see infra/deploy/README.md)" >&2
  exit 1
fi
echo "deployed $tag"
```

`knows` succeeding means an upgrade or the same revision; migrations then run at app start. `guard_schema` always fails when the heads differ, so a rollback across a migration stops before the backup and before any switch.

- [ ] **Step 5: Write `infra/deploy/bootstrap.sh`**

```bash
#!/usr/bin/env bash
# First install on a host prepared by cloud-init.yaml. Idempotent (spec "bootstrap.sh"). Run as root.
set -euo pipefail
base=/opt/job-search-platform
private=/etc/job-search-platform/private
env_file="$private/app.env"
release="$(readlink -f "$base/current")"
here="$release/infra/deploy"
source "$here/lib.sh"

install -d -o jsp -g jsp -m 0700 /etc/job-search-platform "$private" /var/backups/job-search-platform
install -d -o jsp -g jsp -m 0700 "$private/core02"
[[ -f "$env_file" ]] || install -o jsp -g jsp -m 0600 "$here/app.env.example" "$env_file"
check_app_env "$env_file"
set -a; source "$env_file"; set +a

as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }

upstream=/var/lib/job-search-platform/.cache/job-search-platform/upstream
as_jsp "mkdir -p '$upstream'"
fetch_pinned() {  # name url commit
  local dir="$upstream/$1"
  if [[ "$(as_jsp "git -C '$dir' rev-parse HEAD 2>/dev/null" || true)" != "$3" ]]; then
    as_jsp "rm -rf '$dir' && git init -q '$dir' && git -C '$dir' fetch -q --depth 1 '$2' '$3' && git -C '$dir' checkout -q --detach '$3'"
  fi
}
pin() { as_jsp "cd '$release' && uv run --locked --project backend python -c 'import sys; sys.path.insert(0, \"scripts\"); import local_infra; print(local_infra.$1)'"; }
as_jsp "cd '$release' && uv sync --locked --project backend"
fetch_pinned minio https://github.com/minio/minio.git "$(pin MINIO_COMMIT)"
fetch_pinned gosu https://github.com/tianon/gosu.git "$(pin GOSU_COMMIT)"
fetch_pinned prometheus https://github.com/prometheus/prometheus.git "$(pin PROMETHEUS_COMMIT)"
fetch_pinned grafana-prometheus-datasource https://github.com/grafana/grafana-prometheus-datasource.git "$(pin GRAFANA_PROM_DS_COMMIT)"

as_jsp "cd '$release' && uv run --locked --project backend python infra/hermes/setup.py --acquire --build"
as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"

install -m 0644 "$here"/job-search-*.service "$here"/job-search-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now job-search-platform job-search-ingest.timer job-search-backup.timer
wait_ready "https://$DOMAIN/api/v1/health/ready" 300
echo "ready: https://$DOMAIN/login"
```

`app.env` sets `CORE02_COMPOSE_OVERRIDE=infra/compose.prod.yaml` (relative to the release dir, resolved by Task 2's code) and `CORE02_PRIVATE_DIR=/etc/job-search-platform/private/core02`. `local_infra.prepare_private_directory` accepts this path (checked at planning: it only rejects symlinks, paths inside the repo and modes with group/other bits).

- [ ] **Step 6: Write `app.env.example`**

```bash
# Production settings for one VM. Copy to /etc/job-search-platform/private/app.env (mode 0600, owner jsp).
# bootstrap.sh and deploy.sh refuse to run while any CHANGE_ME remains.
DOMAIN=CHANGE_ME
ACME_EMAIL=CHANGE_ME
# Empty in production. The rehearsal sets: CADDY_TLS=tls internal
CADDY_TLS=
APP_PUBLIC_ORIGIN=https://CHANGE_ME
SHARE_PUBLIC_ORIGIN=https://agents.CHANGE_ME
CORE02_PRIVATE_DIR=/etc/job-search-platform/private/core02
CORE02_COMPOSE_OVERRIDE=infra/compose.prod.yaml
METRICS_PORT=59464
MINIO_SOURCE_DIR=/var/lib/job-search-platform/.cache/job-search-platform/upstream/minio
GOSU_SOURCE_DIR=/var/lib/job-search-platform/.cache/job-search-platform/upstream/gosu
PROMETHEUS_SOURCE_DIR=/var/lib/job-search-platform/.cache/job-search-platform/upstream/prometheus
GRAFANA_PROM_DS_SOURCE_DIR=/var/lib/job-search-platform/.cache/job-search-platform/upstream/grafana-prometheus-datasource
OPENROUTER_API_KEY=CHANGE_ME
SMTP_HOST=CHANGE_ME
SMTP_PORT=587
SMTP_USERNAME=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
SMTP_FROM=CHANGE_ME
SMTP_STARTTLS=true
```

- [ ] **Step 7: Write the systemd units**

`job-search-platform.service`:
```ini
[Unit]
Description=AI Job Search Agent Platform
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
User=jsp
Group=jsp
WorkingDirectory=/opt/job-search-platform/current
EnvironmentFile=/etc/job-search-platform/private/app.env
Environment=HOME=/var/lib/job-search-platform
ExecStart=/usr/local/bin/uv run --locked --project backend python scripts/run_local.py --enable-sharing --share-host 127.0.0.1
Restart=on-failure
RestartSec=5
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

`job-search-ingest.service`:
```ini
[Unit]
Description=Hourly job ingest
After=job-search-platform.service

[Service]
Type=oneshot
User=jsp
Group=jsp
WorkingDirectory=/opt/job-search-platform/current
EnvironmentFile=/etc/job-search-platform/private/app.env
Environment=HOME=/var/lib/job-search-platform
ExecStart=/usr/local/bin/uv run --locked --project backend python scripts/ingest_jobs.py run
```

`job-search-ingest.timer`:
```ini
[Unit]
Description=Run job ingest hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

`job-search-backup.service`:
```ini
[Unit]
Description=Daily backup with 7-day local retention

[Service]
Type=oneshot
User=jsp
Group=jsp
WorkingDirectory=/opt/job-search-platform/current
EnvironmentFile=/etc/job-search-platform/private/app.env
Environment=HOME=/var/lib/job-search-platform
ExecStart=/bin/bash -c 'uv run --locked --project backend python scripts/backup.py --archive /var/backups/job-search-platform/daily-$(date -u +%%Y%%m%%dT%%H%%M%%SZ)'
ExecStartPost=/usr/bin/find /var/backups/job-search-platform -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} +
```

`job-search-backup.timer`:
```ini
[Unit]
Description=Run backup daily at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Check `uv` lands in `/usr/local/bin/uv` from cloud-init (Step 9); keep paths consistent.

- [ ] **Step 8: Write `Caddyfile`, `compose.prod.yaml`, `prometheus.prod.yml`**

`infra/deploy/Caddyfile`:
```text
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	{$CADDY_TLS}
	reverse_proxy 127.0.0.1:8000
}

agents.{$DOMAIN} {
	{$CADDY_TLS}
	reverse_proxy 127.0.0.1:8001
}
```

`infra/compose.prod.yaml` (image line: paste the exact reference from `infra/deploy/caddy-image.txt`):
```yaml
# Production override for one VM (spec 2026-10-15-iac-single-vm-design.md). Layered on compose.yaml via
# CORE02_COMPOSE_OVERRIDE=infra/compose.prod.yaml. Only Caddy listens on public ports.
services:
  mailpit:
    profiles: ["dev"]
  prometheus:
    network_mode: host
    ports: !reset []
    extra_hosts: !reset []
    command:
      - --config.file=/etc/prometheus/prometheus.prod.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-15d}
      - --web.listen-address=127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}
  grafana:
    network_mode: host
    ports: !reset []
    environment:
      GF_SERVER_HTTP_ADDR: 127.0.0.1
      GF_SERVER_HTTP_PORT: ${CORE02_GRAFANA_PORT:-53300}
      GRAFANA_PROMETHEUS_URL: http://127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}
  caddy:
    image: caddy:2.11.7@sha256:<digest from infra/deploy/caddy-image.txt>
    restart: unless-stopped
    network_mode: host
    environment:
      DOMAIN: ${DOMAIN:?Set DOMAIN in app.env}
      ACME_EMAIL: ${ACME_EMAIL:?Set ACME_EMAIL in app.env}
      CADDY_TLS: ${CADDY_TLS:-}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
volumes:
  caddy-data:
  caddy-config:
```

With host networking Prometheus and Grafana listen on 59090/53300, so the base healthchecks (ports 9090/3000) must be overridden. Add under `prometheus:`

```yaml
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}/-/ready"]
```

and under `grafana:`

```yaml
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:${CORE02_GRAFANA_PORT:-53300}/api/health"]
```

Other healthcheck keys (interval, retries) merge from `compose.yaml`.

`infra/prometheus/prometheus.prod.yml`:
```yaml
# Production scrape config (host networking). Keep in step with prometheus.yml; only targets differ.
global:
  scrape_interval: 30s
  evaluation_interval: 30s
rule_files:
  - /etc/prometheus/rules.yml
scrape_configs:
  - job_name: app
    static_configs:
      - targets: ["127.0.0.1:59464"]
  - job_name: prometheus
    static_configs:
      - targets: ["127.0.0.1:59090"]
```

- [ ] **Step 9: Write `infra/deploy/cloud-init.yaml`**

```yaml
#cloud-config
# First boot of one Ubuntu 24.04 VM (spec "Provisioning"). Edit REPO_URL and RELEASE_TAG, then pass as user-data.
users:
  - default
  - name: jsp
    system: true
    homedir: /var/lib/job-search-platform
    shell: /bin/bash
    groups: [docker]
groups:
  - docker
package_update: true
packages: [ca-certificates, curl, git, ufw, sudo]
write_files:
  - path: /etc/ssh/sshd_config.d/10-key-only.conf
    content: |
      PasswordAuthentication no
      KbdInteractiveAuthentication no
runcmd:
  - [install, -d, -o, jsp, -g, jsp, -m, "0700", /var/lib/job-search-platform]  # system users get no home from cloud-init
  - [bash, -c, "install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable\" > /etc/apt/sources.list.d/docker.list && apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"]
  - [bash, -c, "curl -fsSL https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-$(dpkg --print-architecture | sed 's/amd64/x64/').tar.xz | tar -xJ -C /usr/local --strip-components=1"]
  - [bash, -c, "curl -LsSf https://astral.sh/uv/0.12.2/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh"]
  - [bash, -c, "ufw default deny incoming && ufw default allow outgoing && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable"]
  - [systemctl, restart, ssh]
  - [bash, -c, "install -d -o jsp -g jsp /opt/job-search-platform/releases && sudo -u jsp git clone --quiet --depth 1 --branch RELEASE_TAG REPO_URL /opt/job-search-platform/releases/RELEASE_TAG && ln -sfn /opt/job-search-platform/releases/RELEASE_TAG /opt/job-search-platform/current"]
```

Node tarballs are verified in Task 7 by `node --version` = `v24.18.0`. bootstrap is **not** run from cloud-init: `app.env` must be filled in first (README step), then the operator runs `sudo /opt/job-search-platform/current/infra/deploy/bootstrap.sh`. This keeps secrets out of user-data, which many clouds store in plain text.

- [ ] **Step 10: Run tests**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_deploy_scripts.py backend/tests/unit/test_migration_state.py -q`
Expected: PASS.

Run: `rtk proxy shellcheck infra/deploy/*.sh` if `shellcheck` is installed; fix warnings of severity warning and above. If not installed, say so in the report.

- [ ] **Step 11: Commit**

```bash
rtk git add infra/compose.prod.yaml infra/prometheus/prometheus.prod.yml infra/deploy scripts/migration_state.py backend/tests/unit/test_deploy_scripts.py backend/tests/unit/test_migration_state.py
rtk git commit -m "feat(deploy): prod compose override, Caddy, cloud-init, bootstrap, deploy/rollback, systemd units (WP1 IaC)"
```

**Spec deviation in this task:** cloud-init does not run `bootstrap.sh` (spec "Provisioning" step 5). Reason: `bootstrap.sh` cannot pass `check_app_env` until the operator writes secrets, and putting secrets into user-data would expose them in the cloud console. Record this in the spec in Task 6.

---

### Task 5: Static check of the merged production Compose config

**Files:**
- Test: `backend/tests/unit/test_deploy_config.py` (create)

**Interfaces:**
- Consumes: `infra/compose.prod.yaml` (Task 4), `infra/deploy/caddy-image.txt` (Task 3).

- [ ] **Step 1: Write the test**

```python
"""WP1 part 2: the merged production Compose config exposes nothing but Caddy publicly."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
HOST_NETWORK = {"caddy", "prometheus", "grafana"}


def _merged(tmp_path: Path) -> dict:
    # Real HOME: the compose CLI plugin lives under ~/.docker on macOS. Empty --env-file: never read the owner's .env.
    empty = tmp_path / "empty.env"
    empty.write_text("")
    env = {**os.environ, "CORE02_PRIVATE_DIR": str(tmp_path), "DOMAIN": "example.test", "ACME_EMAIL": "ops@example.test"}
    for name in ("MINIO", "GOSU", "PROMETHEUS", "GRAFANA_PROM_DS"):
        env[f"{name}_SOURCE_DIR"] = str(tmp_path)
        env[f"{name}_SOURCE_COMMIT"] = "0" * 40
    result = subprocess.run(
        ["docker", "compose", "--env-file", str(empty), "--project-name", "jobsearch-core02", "-f", "infra/compose.yaml",
         "-f", "infra/compose.prod.yaml", "--profile", "langfuse", "config", "--format", "json", "--no-path-resolution"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.skipif(not shutil.which("docker"), reason="docker compose CLI unavailable")
def test_only_loopback_ports_and_expected_host_network(tmp_path):
    services = _merged(tmp_path)["services"]
    assert "mailpit" not in services  # dev profile only
    assert "caddy" in services
    for name, svc in services.items():
        for port in svc.get("ports", []):
            assert port.get("host_ip") == "127.0.0.1", (name, port)
        if svc.get("network_mode") == "host":
            assert name in HOST_NETWORK, name
    for name in HOST_NETWORK:
        assert services[name]["network_mode"] == "host"
        assert not services[name].get("ports")
    caddy_ref = (ROOT / "infra/deploy/caddy-image.txt").read_text().strip()
    assert services["caddy"]["image"] == caddy_ref


@pytest.mark.skipif(not shutil.which("docker"), reason="docker compose CLI unavailable")
def test_prod_prometheus_and_grafana_listen_on_loopback(tmp_path):
    services = _merged(tmp_path)["services"]
    assert "--web.listen-address=127.0.0.1:59090" in services["prometheus"]["command"]
    assert "--config.file=/etc/prometheus/prometheus.prod.yml" in services["prometheus"]["command"]
    env = services["grafana"]["environment"]
    assert env["GF_SERVER_HTTP_ADDR"] == "127.0.0.1" and env["GRAFANA_PROMETHEUS_URL"] == "http://127.0.0.1:59090"


def test_cloud_init_schema(tmp_path):
    if not shutil.which("cloud-init"):
        pytest.skip("cloud-init not installed; schema is checked in the Task 7 rehearsal VM")
    result = subprocess.run(["cloud-init", "schema", "--config-file", str(ROOT / "infra/deploy/cloud-init.yaml")],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
```

Note: `mailpit` is in profile `dev`, so it is absent unless `--profile dev` is passed; `langfuse` is included to check its ports too. If `docker compose config` resolves `!reset` differently than expected (Compose ≥ 2.24 supports it; the dev machine has 5.5.0; GitHub `ubuntu-latest` ships a recent v2), fix the override, not the test.

- [ ] **Step 2: Run**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_deploy_config.py -q`
Expected: PASS (cloud-init test SKIPPED on macOS, with reason).

- [ ] **Step 3: Run the whole unit suite** (CI parity per LEARNINGS 2026-10-13: empty HOME and temp private dir)

Run: `HOME=$(mktemp -d) CORE02_PRIVATE_DIR=$(mktemp -d) rtk uv run --locked --project backend pytest backend/tests -m "not integration" -q`
Expected: PASS, apart from the existing recorded baseline failure (compare with `develop`).

- [ ] **Step 4: Commit**

```bash
rtk git add backend/tests/unit/test_deploy_config.py
rtk git commit -m "test(deploy): merged prod compose exposes only loopback ports; cloud-init schema (WP1 IaC)"
```

---

### Task 6: Runbook and docs

**Files:**
- Create: `infra/deploy/README.md`
- Modify: `docs/engineering/local-operation.md` (link to runbook; note `CORE02_COMPOSE_OVERRIDE`; note the pinned proxy trust)
- Modify: `infra/AGENTS.md` (production override, Caddy pin in `infra/deploy/caddy-image.txt`, keep `compose.prod.yaml` image line equal to it)
- Modify: `README.md` (ADR-017 link after the ADR-015 line)
- Modify: `docs/superpowers/specs/2026-10-15-iac-single-vm-design.md` (add a short "Planning amendments" section: no `--behind-proxy` flag, pinned proxy trust instead; cloud-init stops before bootstrap; any `CORE02_PRIVATE_DIR` location change from Task 4 Step 5)

- [ ] **Step 1: Write `infra/deploy/README.md`** with these sections, each with exact commands:
  1. **Create the VM** — Ubuntu 24.04, 4 vCPU / 8 GB / 80 GB, SSH key; edit `REPO_URL` and `RELEASE_TAG` in `cloud-init.yaml`, pass as user-data.
  2. **DNS** — A/AAAA records for `<domain>` and `agents.<domain>` to the VM before first start (Let's Encrypt needs them).
  3. **Secrets** — `sudo install -o jsp -g jsp -m 0600 /opt/job-search-platform/current/infra/deploy/app.env.example /etc/job-search-platform/private/app.env`, then edit; every `CHANGE_ME` replaced.
  4. **First install** — `sudo /opt/job-search-platform/current/infra/deploy/bootstrap.sh` (first run builds images: expect 30–60 min).
  5. **Deploy** — `git tag` + push on the dev machine, then `sudo /opt/job-search-platform/current/infra/deploy/deploy.sh <tag>`.
  6. **Rollback** — `deploy.sh <older tag>`; what the schema refusal means; the `restore.py` command with the pre-deploy archive.
  7. **Restore from a daily backup** — `restore.py` usage with `/var/backups/job-search-platform/daily-*`.
  8. **Grafana** — `ssh -L 53300:127.0.0.1:53300 <host>`; admin password file location under `CORE02_PRIVATE_DIR`.
  9. **Logs and timers** — `journalctl -u job-search-platform`, `systemctl list-timers 'job-search-*'`.
  10. **Langfuse (optional)** — the existing profile switch.
  11. **Off-site backup** — owner TODO; copy `/var/backups/job-search-platform/` elsewhere.

- [ ] **Step 2: Update the other docs** listed under Files. Keep each edit to the lines needed.

- [ ] **Step 3: Check links**

Run: `rtk grep -rn "ADR-017\|infra/deploy/README.md" README.md docs/engineering/local-operation.md infra/AGENTS.md`
Expected: each file references the new material.

- [ ] **Step 4: Commit**

```bash
rtk git add infra/deploy/README.md docs/engineering/local-operation.md infra/AGENTS.md README.md docs/superpowers/specs/2026-10-15-iac-single-vm-design.md
rtk git commit -m "docs(deploy): single-VM runbook, ADR-017 link, planning amendments (WP1 IaC)"
```

---

### Task 7: Rehearsal in a throwaway Colima VM (controller only)

Not delegated: it needs the owner machine, disk discipline and judgement. Record every command and PASS/FAIL/SKIP in the Hub WORKING_LOG.

**Pre-flight:**
- [ ] `df -h /` ≥ 20 GB free. If not, stop and ask the owner what to free (candidates in WORKING_LOG 2026-10-15).
- [ ] Push the branch and a rehearsal tag only after owner say-so (the VM clones from GitHub). Alternative without pushing: serve the local repo with `git daemon` on the Colima host address and use that as `REPO_URL`. Prefer this; it needs no push.

**Steps:**
- [ ] 1. `colima start --profile jsp-iac --cpu 4 --memory 8 --disk 60 --vm-type vz` (Ubuntu-based VM; Docker runtime inside). Apply `cloud-init.yaml` by running its `runcmd` steps over `colima ssh --profile jsp-iac` if Colima does not accept user-data; check `cloud-init schema` there.
- [ ] 2. Write `app.env` with `DOMAIN=jsp.test`, `CADDY_TLS=tls internal`, test SMTP pointing nowhere (mail disabled is acceptable), the owner's OpenRouter key **not** used (model calls are not part of this smoke). Map `jsp.test` and `agents.jsp.test` to the VM IP in the host's `/etc/hosts` for the run only (owner approval needed: it is a system file).
- [ ] 3. Run `bootstrap.sh`. Expect the first Prometheus build ~15–20 min.
- [ ] 4. Smoke over HTTPS (`curl -k` / browser with the internal CA): `/api/v1/health/ready` 200; sign up and log in; job search returns results after one `systemctl start job-search-ingest`; `https://agents.jsp.test/.well-known/agent-card.json` 200.
- [ ] 5. From the host: `nc -zv <vm-ip>` on 80, 443, 22 succeed; on 8000, 55432, 59090, 53300 fail.
- [ ] 6. Prometheus target `app` up (via `colima ssh` + `curl 127.0.0.1:59090/api/v1/targets`); Grafana through an SSH tunnel shows the dashboard.
- [ ] 7. `systemctl start job-search-backup`; archive appears; run `find ... -mtime +7` dry check.
- [ ] 8. Deploy a second tag (`deploy.sh`), then roll back; force a failing health check (e.g. stop Postgres before deploy) and confirm automatic code rollback; confirm the schema refusal with a tag whose migration head differs (create a throwaway local tag with an extra empty migration; never push it).
- [ ] 9. Confirm the two observability images and Caddy run on the VM's architecture; if the host is arm64, record that amd64 remains unverified for Prometheus/Grafana builds unless a `--platform linux/amd64` build is run (one at a time, disk checked).
- [ ] 10. Tear down: `colima delete --profile jsp-iac`, remove the `/etc/hosts` lines, `docker builder prune` and `colima ssh -- sudo fstrim -v /var/lib/docker` on the default profile. Check `df -h /`.
- [ ] 11. Fix any defect found as a commit on the branch with a test where possible; rerun the affected step.
- [ ] 12. Final whole-branch review (Sonnet), full suite, then ask the owner for push/PR/merge.
