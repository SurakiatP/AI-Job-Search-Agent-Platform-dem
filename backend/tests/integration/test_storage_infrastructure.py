"""Real PostgreSQL and MinIO checks for the local infrastructure slice."""

from __future__ import annotations

import importlib.util
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
