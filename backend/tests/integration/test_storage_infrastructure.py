"""Real PostgreSQL and MinIO checks for the local infrastructure slice."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[3]


def _load_local_infra():
    module_path = ROOT / "scripts" / "local_infra.py"
    if not module_path.is_file():
        pytest.fail("local infrastructure safety module is missing")
    spec = importlib.util.spec_from_file_location("local_infra", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_infrastructure_refuses_secret_directory_inside_repository(tmp_path: Path) -> None:
    local_infra = _load_local_infra()
    repo_root = tmp_path / "repo"
    secret_dir = repo_root / "infra" / "secrets"
    secret_dir.mkdir(parents=True)

    with pytest.raises(local_infra.ConfigurationError, match="secret_directory_in_repository"):
        local_infra.validate_private_directory(secret_dir, repo_root)


def test_infrastructure_requires_private_directory_permissions(tmp_path: Path) -> None:
    local_infra = _load_local_infra()
    private_dir = tmp_path / "private"
    private_dir.mkdir(mode=0o755)
    private_dir.chmod(0o755)

    with pytest.raises(local_infra.ConfigurationError, match="private_directory_permissions"):
        local_infra.validate_private_directory(private_dir, tmp_path / "repo")


def test_prepare_refuses_repository_path_without_creating_it(tmp_path: Path) -> None:
    local_infra = _load_local_infra()
    repo_root = tmp_path / "repo"
    unsafe_dir = repo_root / "infra" / "secrets"

    with pytest.raises(local_infra.ConfigurationError, match="secret_directory_in_repository"):
        local_infra.prepare_private_directory(unsafe_dir, repo_root)
    assert not unsafe_dir.exists()


def test_prepare_refuses_existing_repository_path_without_chmod(tmp_path: Path) -> None:
    local_infra = _load_local_infra()
    repo_root = tmp_path / "repo"
    unsafe_dir = repo_root / "infra" / "secrets"
    unsafe_dir.mkdir(parents=True, mode=0o755)
    unsafe_dir.chmod(0o755)

    with pytest.raises(local_infra.ConfigurationError, match="secret_directory_in_repository"):
        local_infra.prepare_private_directory(unsafe_dir, repo_root)
    assert unsafe_dir.stat().st_mode & 0o777 == 0o755


def test_pinned_source_refuses_dirty_checkout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    local_infra = _load_local_infra()
    source = tmp_path / "minio"
    source.mkdir()
    import subprocess

    subprocess.run(["git", "init", "--quiet", str(source)], check=True)
    subprocess.run(["git", "-C", str(source), "config", "user.email", "storage-proof@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(source), "config", "user.name", "Storage Proof"], check=True)
    (source / "go.mod").write_text("module example.invalid/minio\n", encoding="utf-8")
    (source / "LICENSE").write_text("AGPL-3.0-only\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(source), "add", "go.mod", "LICENSE"], check=True)
    subprocess.run(["git", "-C", str(source), "commit", "--quiet", "-m", "fixture"], check=True)
    commit = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()
    monkeypatch.setattr(local_infra, "MINIO_COMMIT", commit)
    local_infra.validate_minio_source(source)

    (source / "tampered.go").write_text("package main\n", encoding="utf-8")
    with pytest.raises(local_infra.ConfigurationError, match="minio_source_dirty"):
        local_infra.validate_minio_source(source)


def test_dependency_overlay_is_verified_before_compose(monkeypatch, tmp_path) -> None:
    import hashlib
    import json

    local_infra = _load_local_infra()
    monkeypatch.setattr(local_infra, "ROOT", tmp_path)
    overlay = tmp_path / "infra" / "minio"
    overlay.mkdir(parents=True)
    go_mod = b"module github.com/minio/minio\ngo 1.26.0\n"
    go_sum = b"example.invalid/module v1.2.3 h1:checksum\n"
    (overlay / "go.mod").write_bytes(go_mod)
    (overlay / "go.sum").write_bytes(go_sum)
    provenance = {
        "source_commit": local_infra.MINIO_COMMIT,
        "go_version": "1.26.0",
        "go_mod_sha256": hashlib.sha256(go_mod).hexdigest(),
        "go_sum_sha256": hashlib.sha256(go_sum).hexdigest(),
    }
    (overlay / "provenance.json").write_text(json.dumps(provenance), encoding="utf-8")

    local_infra.validate_dependency_overlay()
    (overlay / "go.mod").write_bytes(go_mod + b"// tampered\n")
    with pytest.raises(local_infra.ConfigurationError, match="minio_dependency_overlay_hash_mismatch"):
        local_infra.validate_dependency_overlay()


@pytest.mark.integration
def test_real_postgres_minio_checksum_and_restart_proof() -> None:
    private_dir = os.environ.get("CORE02_PRIVATE_DIR")
    assert private_dir, "set CORE02_PRIVATE_DIR to the private directory reported by local_infra.py start"

    proof = ROOT / "scripts" / "prove_storage.py"
    assert proof.is_file(), "storage proof script is missing"
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, str(proof), "--private-dir", private_dir],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=240,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert '"database": "verified"' in result.stdout
    assert '"object_checksum": "verified"' in result.stdout
    assert '"restart_persistence": "verified"' in result.stdout
    assert '"anonymous_access": "denied"' in result.stdout


def test_ensure_credentials_generates_litellm_secrets_and_app_key_file(tmp_path: Path) -> None:
    local_infra = _load_local_infra()
    private_dir = tmp_path / "private"
    private_dir.mkdir(mode=0o700)

    local_infra.ensure_credentials(private_dir)
    master = (private_dir / "litellm-master-key").read_text().strip()
    for name in (*local_infra.SECRET_NAMES, local_infra.APP_KEY_FILE):
        assert (private_dir / name).stat().st_mode & 0o777 == 0o600
    assert master.startswith("sk-")
    assert (private_dir / local_infra.APP_KEY_FILE).read_text() == ""

    local_infra.ensure_credentials(private_dir)  # idempotent: nothing is regenerated
    assert (private_dir / "litellm-master-key").read_text().strip() == master


def test_compose_environment_passes_openrouter_key_only_when_set(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    local_infra = _load_local_infra()
    monkeypatch.setenv("OPENROUTER_API_KEY", "fake-key")
    assert local_infra.compose_environment(tmp_path, tmp_path)["OPENROUTER_API_KEY"] == "fake-key"
    monkeypatch.delenv("OPENROUTER_API_KEY")
    assert local_infra.compose_environment(tmp_path, tmp_path)["OPENROUTER_API_KEY"] == ""
    assert local_infra.compose_environment(tmp_path, tmp_path)["OPENROUTER_KEY_PRESENT"] == ""
    monkeypatch.setenv("OPENROUTER_API_KEY", "fake-key")
    assert local_infra.compose_environment(tmp_path, tmp_path)["OPENROUTER_KEY_PRESENT"] == "1"


def _load_seed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, handler):
    import http.server
    import threading

    class Stub(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _serve(self):
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            status, payload = handler(self.command, self.path, self.headers.get("Authorization", ""), body)
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = _serve

    server = http.server.HTTPServer(("127.0.0.1", 0), Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    master = tmp_path / "master"
    master.write_text("sk-master\n")
    key_file = tmp_path / "app_key"
    monkeypatch.setenv("LITELLM_URL", f"http://127.0.0.1:{server.server_port}")
    monkeypatch.setenv("LITELLM_MASTER_KEY_FILE", str(master))
    monkeypatch.setenv("LITELLM_APP_KEY_FILE", str(key_file))
    monkeypatch.setenv("OPENROUTER_KEY_PRESENT", "1")
    spec = importlib.util.spec_from_file_location("litellm_seed", ROOT / "infra" / "litellm" / "seed.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, key_file, server


def test_seed_does_not_create_model_when_check_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    calls: list[tuple[str, str]] = []

    def handler(method, path, auth, body):
        calls.append((method, path))
        if path == "/model/info":
            return 500, {}
        return 200, {"key": "sk-new"}

    seed, key_file, server = _load_seed(tmp_path, monkeypatch, handler)
    try:
        assert seed.seed_model() is False
    finally:
        server.shutdown()
    assert "model_check_failed" in capsys.readouterr().out
    assert ("POST", "/model/new") not in calls


def test_seed_reports_create_failure_and_missing_key_is_ok(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(method, path, auth, body):
        if path == "/model/info":
            return 200, {"data": []}
        return 500, {}

    seed, key_file, server = _load_seed(tmp_path, monkeypatch, handler)
    try:
        assert seed.seed_model() is False
        assert seed.seed_key() is False
        monkeypatch.delenv("OPENROUTER_KEY_PRESENT")
        assert seed.seed_model() is True  # the only allowed skip
    finally:
        server.shutdown()


def test_seed_keeps_working_key_on_transient_check_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def handler(method, path, auth, body):
        calls.append(path)
        return (503, {}) if path == "/v1/models" else (200, {"key": "sk-new"})

    seed, key_file, server = _load_seed(tmp_path, monkeypatch, handler)
    key_file.write_text("sk-existing\n")
    try:
        assert seed.seed_key() is False
        assert key_file.read_text() == "sk-existing\n"
        assert "/key/delete" not in calls
    finally:
        server.shutdown()


def test_seed_regenerates_key_only_when_rejected_or_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(method, path, auth, body):
        return (401, {}) if path == "/v1/models" else (200, {"key": "sk-new"})

    seed, key_file, server = _load_seed(tmp_path, monkeypatch, handler)
    key_file.write_text("sk-stale\n")
    try:
        assert seed.seed_key() is True
        assert key_file.read_text() == "sk-new\n"
    finally:
        server.shutdown()


@pytest.mark.parametrize("key,warns", [("", True), ("fake-key", False)])
def test_start_warns_on_stderr_when_openrouter_key_missing(tmp_path, monkeypatch, capsys, key, warns) -> None:
    local_infra = _load_local_infra()
    monkeypatch.setattr(local_infra, "prepare_private_directory", lambda p: p)
    monkeypatch.setattr(local_infra, "validate_minio_source", lambda p: p)
    monkeypatch.setattr(local_infra, "ensure_credentials", lambda p: None)
    monkeypatch.setattr(local_infra, "_compose", lambda *a, **k: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", key)
    assert local_infra.start(tmp_path, tmp_path)["status"] == "started"
    err = capsys.readouterr().err
    assert ("warning: OPENROUTER_API_KEY not set" in err) is warns
    assert "fake-key" not in err


@pytest.mark.parametrize("seed_rc,expected", [(0, "started"), (1, "litellm_seed_failed")])
def test_start_runs_seed_after_up_and_maps_failure(tmp_path, monkeypatch, seed_rc, expected) -> None:
    import subprocess

    local_infra = _load_local_infra()
    monkeypatch.setattr(local_infra, "prepare_private_directory", lambda p: p)
    monkeypatch.setattr(local_infra, "validate_minio_source", lambda p: p)
    monkeypatch.setattr(local_infra, "ensure_credentials", lambda p: None)
    monkeypatch.setattr(local_infra, "validate_gosu_source", lambda p: None)
    monkeypatch.setattr(local_infra, "validate_postgres_overlay", lambda: None)
    monkeypatch.setattr(local_infra, "validate_dependency_overlay", lambda: None)
    monkeypatch.setattr(local_infra, "compose_environment", lambda *a: {})
    commands: list[list[str]] = []

    def fake_run(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(command, seed_rc if "run" in command else 0, "", "")

    monkeypatch.setattr(local_infra.subprocess, "run", fake_run)
    if expected == "started":
        assert local_infra.start(tmp_path, tmp_path)["status"] == "started"
    else:
        with pytest.raises(local_infra.ConfigurationError, match="litellm_seed_failed"):
            local_infra.start(tmp_path, tmp_path)
    up, seed = commands
    assert "up" in up and "--wait" in up and "litellm-seed" not in up and "--profile" not in up
    assert seed[seed.index("--file") + 2 :][:2] == ["--profile", "seed"]
    assert seed[-3:] == ["run", "--rm", "litellm-seed"]
