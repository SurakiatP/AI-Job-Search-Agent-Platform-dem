"""Manage only the CORE-02 PostgreSQL and MinIO Compose project."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import stat
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "infra" / "compose.yaml"
MINIO_COMMIT = "7aac2a2c5b7c882e68c1ce017d8256be2feea27f"
POSTGRES_IMAGE = "job-search-platform/postgres:17.11-alpine-gosu-1.19-6456aaa0f3c8"
POSTGRES_BASE_IMAGE = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
GOSU_BUILDER_IMAGE = "golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61"
GOSU_COMMIT = "6456aaa0f3c854d199d0f037f068eb97515b7513"
DEFAULT_PRIVATE_DIR = Path.home() / ".local" / "share" / "job-search-platform" / "core02"
DEFAULT_MINIO_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "minio"
DEFAULT_GOSU_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "gosu"
SECRET_NAMES = ("postgres-user", "postgres-password", "minio-access-key", "minio-secret-key")


class ConfigurationError(ValueError):
    """A safe-to-report local infrastructure configuration error."""

def validate_gosu_source(path: Path) -> Path:
    source = path.expanduser().resolve()
    root = ROOT.resolve()
    if source == root or root in source.parents:
        raise ConfigurationError("gosu_source_must_be_external")
    try:
        revision = subprocess.run(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        status = subprocess.run(
            ["git", "-C", str(source), "status", "--porcelain=v1", "--untracked-files=all", "--ignored"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ConfigurationError("gosu_source_unavailable") from error
    if revision.returncode or revision.stdout.strip() != GOSU_COMMIT:
        raise ConfigurationError("gosu_source_revision_mismatch")
    if status.returncode:
        raise ConfigurationError("gosu_source_status_unavailable")
    if status.stdout.strip():
        raise ConfigurationError("gosu_source_dirty")
    if any(not (source / name).is_file() for name in ("go.mod", "go.sum", "LICENSE", "version.go")):
        raise ConfigurationError("gosu_source_incomplete")
    return source

def validate_postgres_overlay() -> None:
    overlay = ROOT / "infra" / "postgres"
    try:
        provenance = json.loads((overlay / "provenance.json").read_text(encoding="utf-8"))
        expected = {
            "source_commit": GOSU_COMMIT,
            "gosu_version": "1.19",
            "license": "Apache-2.0",
            "base_image": POSTGRES_BASE_IMAGE,
            "builder_image": GOSU_BUILDER_IMAGE,
        }
        if any(provenance.get(key) != value for key, value in expected.items()):
            raise ConfigurationError("postgres_image_provenance_mismatch")
        for file_name, provenance_key in (("go.mod", "go_mod_sha256"), ("go.sum", "go_sum_sha256")):
            digest = hashlib.sha256((overlay / file_name).read_bytes()).hexdigest()
            if digest != provenance.get(provenance_key):
                raise ConfigurationError("postgres_dependency_overlay_hash_mismatch")
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError("postgres_image_provenance_invalid") from error

def validate_dependency_overlay() -> None:
    overlay = ROOT / "infra" / "minio"
    try:
        provenance = json.loads((overlay / "provenance.json").read_text(encoding="utf-8"))
        if provenance.get("source_commit") != MINIO_COMMIT:
            raise ConfigurationError("minio_dependency_overlay_source_mismatch")
        if provenance.get("go_version") != "1.26.0":
            raise ConfigurationError("minio_dependency_overlay_go_version_mismatch")
        for file_name, provenance_key in (("go.mod", "go_mod_sha256"), ("go.sum", "go_sum_sha256")):
            digest = hashlib.sha256((overlay / file_name).read_bytes()).hexdigest()
            if digest != provenance.get(provenance_key):
                raise ConfigurationError("minio_dependency_overlay_hash_mismatch")
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError("minio_dependency_overlay_invalid") from error


def validate_private_directory(path: Path, repo_root: Path = ROOT) -> Path:
    if path.expanduser().is_symlink():
        raise ConfigurationError("private_directory_symlink")
    resolved = path.expanduser().resolve()
    repository = repo_root.expanduser().resolve()
    if resolved == repository or repository in resolved.parents:
        raise ConfigurationError("secret_directory_in_repository")
    if not resolved.is_dir():
        raise ConfigurationError("private_directory_missing")
    if stat.S_IMODE(resolved.stat().st_mode) & 0o077:
        raise ConfigurationError("private_directory_permissions")
    return resolved


def prepare_private_directory(path: Path = DEFAULT_PRIVATE_DIR, repo_root: Path = ROOT) -> Path:
    expanded = path.expanduser().absolute()
    resolved = expanded.resolve()
    repository = repo_root.expanduser().resolve()
    if resolved == repository or repository in resolved.parents:
        raise ConfigurationError("secret_directory_in_repository")
    if expanded.is_symlink():
        raise ConfigurationError("private_directory_symlink")
    if expanded.exists():
        return validate_private_directory(expanded, repository)
    expanded.mkdir(mode=0o700, parents=True, exist_ok=False)
    return validate_private_directory(expanded, repository)


def _check_secret_file(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise ConfigurationError("credential_file_invalid")
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ConfigurationError("credential_file_permissions")


def ensure_credentials(private_dir: Path) -> None:
    present = [private_dir / name for name in SECRET_NAMES]
    for path in present:
        if path.exists() or path.is_symlink():
            _check_secret_file(path)
    for name, value in zip(
        SECRET_NAMES,
        (
            secrets.token_hex(20),
            secrets.token_urlsafe(40),
            secrets.token_hex(20),
            secrets.token_urlsafe(40),
        ),
    ):
        path = private_dir / name
        if path.exists():
            continue
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(value)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())


def validate_minio_source(path: Path) -> Path:
    source = path.expanduser().resolve()
    repository = ROOT.resolve()
    if source == repository or repository in source.parents:
        raise ConfigurationError("minio_source_must_be_external")
    try:
        result = subprocess.run(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ConfigurationError("minio_source_unavailable") from exc
    if result.returncode or result.stdout.strip() != MINIO_COMMIT:
        raise ConfigurationError("minio_source_revision_mismatch")
    try:
        status = subprocess.run(
            ["git", "-C", str(source), "status", "--porcelain=v1", "--untracked-files=all", "--ignored"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ConfigurationError("minio_source_status_unavailable") from exc
    if status.returncode or status.stdout.strip():
        raise ConfigurationError("minio_source_dirty")
    if not (source / "go.mod").is_file() or not (source / "LICENSE").is_file():
        raise ConfigurationError("minio_source_incomplete")
    return source


def compose_environment(private_dir: Path, source_dir: Path) -> dict[str, str]:
    environment = os.environ.copy()
    environment["CORE02_PRIVATE_DIR"] = str(private_dir)
    environment["MINIO_SOURCE_DIR"] = str(source_dir)
    environment["MINIO_SOURCE_COMMIT"] = MINIO_COMMIT
    environment["GOSU_SOURCE_DIR"] = str(Path(os.environ.get("GOSU_SOURCE_DIR", str(DEFAULT_GOSU_SOURCE))).expanduser().resolve())
    environment["GOSU_SOURCE_COMMIT"] = GOSU_COMMIT
    environment.setdefault("CORE02_POSTGRES_PORT", "55432")
    environment.setdefault("CORE02_MINIO_PORT", "59000")
    return environment


def _compose(
    action: list[str],
    private_dir: Path,
    source_dir: Path,
    *,
    timeout: int = 120,
) -> subprocess.CompletedProcess[str]:
    command = [
        "docker",
        "compose",
        "--project-name",
        "jobsearch-core02",
        "--file",
        str(COMPOSE_FILE),
        *action,
    ]
    validate_gosu_source(Path(os.environ.get("GOSU_SOURCE_DIR", str(DEFAULT_GOSU_SOURCE))))
    validate_postgres_overlay()
    validate_dependency_overlay()
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=compose_environment(private_dir, source_dir),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ConfigurationError("compose_command_unavailable_or_timed_out") from exc
    if result.returncode:
        raise ConfigurationError(f"compose_{action[0]}_failed")
    return result


def start(private_dir: Path, source_dir: Path) -> dict[str, str]:
    private_dir = prepare_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    ensure_credentials(private_dir)
    _compose(["up", "--detach", "--build", "--wait", "--wait-timeout", "300"], private_dir, source_dir, timeout=1800)
    return {"status": "started", "private_directory": str(private_dir), "minio_source_commit": MINIO_COMMIT}


def status(private_dir: Path, source_dir: Path) -> list[dict[str, object]]:
    private_dir = prepare_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    result = _compose(["ps", "--all", "--format", "json"], private_dir, source_dir)
    services: list[dict[str, object]] = []
    for line in result.stdout.splitlines():
        if line.strip():
            item = json.loads(line)
            services.append({"service": item.get("Service"), "state": item.get("State"), "health": item.get("Health")})
    return services


def stop(private_dir: Path, source_dir: Path) -> dict[str, str]:
    private_dir = validate_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    _compose(["stop"], private_dir, source_dir)
    return {"status": "stopped", "volumes": "preserved"}


def restart_minio(private_dir: Path) -> None:
    private_dir = validate_private_directory(private_dir)
    source_dir = validate_minio_source(Path(os.environ.get("MINIO_SOURCE_DIR", str(DEFAULT_MINIO_SOURCE))))
    _compose(["restart", "minio"], private_dir, source_dir)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)
    for action in ("start", "status", "stop"):
        child = subparsers.add_parser(action)
        child.add_argument("--private-dir", type=Path, default=DEFAULT_PRIVATE_DIR)
        child.add_argument("--source-dir", type=Path, default=Path(os.environ.get("MINIO_SOURCE_DIR", DEFAULT_MINIO_SOURCE)))
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        result = {
            "start": start,
            "status": status,
            "stop": stop,
        }[arguments.action](arguments.private_dir, arguments.source_dir)
    except (ConfigurationError, OSError, ValueError) as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
