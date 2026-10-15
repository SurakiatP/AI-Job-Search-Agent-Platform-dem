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
DEFAULT_PRIVATE_DIR = Path(os.environ.get("CORE02_PRIVATE_DIR") or Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003")
DEFAULT_MINIO_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "minio"
PROMETHEUS_COMMIT = "5241a27fe3c6983549fccc32f6e65917408c63cd"
DEFAULT_PROMETHEUS_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "prometheus"
CADDY_COMMIT = "72dd0fb067f6d7826c7f79907670ba4a713bfe37"  # caddy v2.11.7
DEFAULT_CADDY_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "caddy"
CADDY_BUILDER_IMAGE = GOSU_BUILDER_IMAGE  # same pinned golang:1.27.2-bookworm digest
PROMETHEUS_BUILDER_IMAGE = GOSU_BUILDER_IMAGE  # same pinned golang:1.27.2-bookworm digest
GRAFANA_PROM_DS_COMMIT = "6d21418acde6ce31c9f7a6418a88758842a881bb"  # grafana-prometheus-datasource v13.2.3
DEFAULT_GRAFANA_PROM_DS_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "grafana-prometheus-datasource"
DEFAULT_GOSU_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "gosu"
# Name -> generator. Values embedded in URLs (DB, ClickHouse, Redis, MinIO) stay hex.
SECRETS = {
    "postgres-user": lambda: secrets.token_hex(20),
    "postgres-password": lambda: secrets.token_urlsafe(40),
    "minio-access-key": lambda: secrets.token_hex(20),
    "minio-secret-key": lambda: secrets.token_urlsafe(40),
    "litellm-master-key": lambda: "sk-" + secrets.token_hex(24),
    "litellm-salt-key": lambda: secrets.token_hex(32),
    "litellm-db-password": lambda: secrets.token_urlsafe(40),
    "litellm-ui-password": lambda: secrets.token_urlsafe(24),
    "langfuse-db-password": lambda: secrets.token_hex(24),
    "langfuse-clickhouse-password": lambda: secrets.token_hex(24),
    "langfuse-redis-password": lambda: secrets.token_hex(24),
    "langfuse-minio-access-key": lambda: secrets.token_hex(20),
    "langfuse-minio-secret-key": lambda: secrets.token_hex(32),
    "langfuse-nextauth-secret": lambda: secrets.token_urlsafe(40),
    "langfuse-salt": lambda: secrets.token_urlsafe(40),
    "langfuse-encryption-key": lambda: secrets.token_hex(32),
    "langfuse-ui-password": lambda: secrets.token_urlsafe(24),
    "langfuse-public-key": lambda: "pk-lf-" + secrets.token_hex(16),
    "langfuse-secret-key": lambda: "sk-lf-" + secrets.token_hex(16),
    "meili-master-key": lambda: secrets.token_urlsafe(32),
    "grafana-admin-password": lambda: secrets.token_urlsafe(24),
}
SECRET_NAMES = tuple(SECRETS)
DERIVED_NAMES = ("langfuse-clickhouse-users.xml", "langfuse-valkey.conf")
LANGFUSE_PROFILE = ["--profile", "langfuse"]
LANGFUSE_OWNER_EMAIL = "owner@jobsearch.local"
APP_KEY_FILE = "litellm_app_key"


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

def validate_pinned_source(path: Path, commit: str, label: str, required: tuple[str, ...]) -> Path:
    """A clean, detached upstream checkout at exactly `commit`, outside the repository (spec A1.1)."""
    source = path.expanduser().resolve()
    root = ROOT.resolve()
    if source == root or root in source.parents:
        raise ConfigurationError(f"{label}_source_must_be_external")
    try:
        revision = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"],
                                  capture_output=True, text=True, timeout=10, check=False)
        status = subprocess.run(["git", "-C", str(source), "status", "--porcelain=v1", "--untracked-files=all", "--ignored"],
                                capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ConfigurationError(f"{label}_source_unavailable") from error
    if revision.returncode or revision.stdout.strip() != commit:
        raise ConfigurationError(f"{label}_source_revision_mismatch")
    if status.returncode:
        raise ConfigurationError(f"{label}_source_status_unavailable")
    if status.stdout.strip():
        raise ConfigurationError(f"{label}_source_dirty")
    if any(not (source / name).is_file() for name in required):
        raise ConfigurationError(f"{label}_source_incomplete")
    return source


def validate_go_overlay(directory: Path, commit: str, label: str) -> None:
    """go.mod/go.sum overlay hashes must match provenance.json for the pinned source (spec A1.1)."""
    try:
        provenance = json.loads((directory / "provenance.json").read_text(encoding="utf-8"))
        if provenance.get("source_commit") != commit:
            raise ConfigurationError(f"{label}_overlay_source_mismatch")
        for file_name, key in (("go.mod", "go_mod_sha256"), ("go.sum", "go_sum_sha256")):
            if hashlib.sha256((directory / file_name).read_bytes()).hexdigest() != provenance.get(key):
                raise ConfigurationError(f"{label}_overlay_hash_mismatch")
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"{label}_overlay_invalid") from error


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


def group_read_enabled() -> bool:
    """Servers set CORE02_SECRETS_GROUP_READ=1: containers read bind-mounted secrets through the owner's group."""
    return os.environ.get("CORE02_SECRETS_GROUP_READ", "").strip() == "1"


def secret_file_mode() -> int:
    return 0o640 if group_read_enabled() else 0o600


def secret_file_forbidden_bits() -> int:
    return 0o037 if group_read_enabled() else 0o077


def group_readable_private_files(private_dir: Path) -> None:
    """Flag set: chmod existing secret and derived files 0640 (only ever from 0600, never wider)."""
    if not group_read_enabled():
        return
    for name in (*SECRET_NAMES, *DERIVED_NAMES, APP_KEY_FILE):
        path = private_dir / name
        if path.is_file() and not path.is_symlink() and stat.S_IMODE(path.stat().st_mode) == 0o600:
            path.chmod(0o640)


def _check_secret_file(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise ConfigurationError("credential_file_invalid")
    if stat.S_IMODE(path.stat().st_mode) & secret_file_forbidden_bits():
        raise ConfigurationError("credential_file_permissions")


def _write_owner_only(path: Path, text: str) -> None:
    """Create or replace a 0600 (flag: 0640) file without following a symlink."""
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, secret_file_mode())
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        os.fchmod(output.fileno(), secret_file_mode())
        output.write(text)
        output.flush()
        os.fsync(output.fileno())


def _read_secret(private_dir: Path, name: str) -> str:
    return (private_dir / name).read_text(encoding="utf-8").strip()


def _clickhouse_users(password: str) -> str:
    """users.d override: the pinned distroless image ignores CLICKHOUSE_PASSWORD_FILE and leaves `default` open."""
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return (
        "<clickhouse>\n  <users>\n    <default remove=\"remove\"/>\n    <langfuse>\n"
        f"      <password_sha256_hex>{digest}</password_sha256_hex>\n"
        "      <networks><ip>::/0</ip></networks>\n      <profile>default</profile>\n"
        "      <quota>default</quota>\n      <access_management>1</access_management>\n"
        "    </langfuse>\n  </users>\n</clickhouse>\n"
    )


def ensure_credentials(private_dir: Path) -> None:
    for name in (*SECRET_NAMES, *DERIVED_NAMES):
        path = private_dir / name
        if path.exists() or path.is_symlink():
            _check_secret_file(path)
    for name, generate in SECRETS.items():
        path = private_dir / name
        if path.exists():
            continue
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.fchmod(descriptor, secret_file_mode())
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(generate())
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
    # Derived from the secrets above, so rewriting keeps them in sync and is byte-identical when unchanged.
    _write_owner_only(private_dir / "langfuse-clickhouse-users.xml",
                      _clickhouse_users(_read_secret(private_dir, "langfuse-clickhouse-password")))
    _write_owner_only(private_dir / "langfuse-valkey.conf",
                      f"requirepass {_read_secret(private_dir, 'langfuse-redis-password')}\nmaxmemory-policy noeviction\n")
    # The seed container writes the app key into this bind-mounted file; it must exist first.
    app_key = private_dir / APP_KEY_FILE
    if app_key.exists() or app_key.is_symlink():
        _check_secret_file(app_key)
    else:
        os.close(os.open(app_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
        app_key.chmod(secret_file_mode())


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
    environment["CORE02_SECRETS_GID"] = str(os.stat(private_dir).st_gid)  # prod override group_adds it
    environment["MINIO_SOURCE_DIR"] = str(source_dir)
    environment["MINIO_SOURCE_COMMIT"] = MINIO_COMMIT
    environment["GOSU_SOURCE_DIR"] = str(Path(os.environ.get("GOSU_SOURCE_DIR", str(DEFAULT_GOSU_SOURCE))).expanduser().resolve())
    environment["GOSU_SOURCE_COMMIT"] = GOSU_COMMIT
    environment["PROMETHEUS_SOURCE_DIR"] = str(Path(os.environ.get("PROMETHEUS_SOURCE_DIR", str(DEFAULT_PROMETHEUS_SOURCE))).expanduser().resolve())
    environment["PROMETHEUS_SOURCE_COMMIT"] = PROMETHEUS_COMMIT
    environment["CADDY_SOURCE_DIR"] = str(Path(os.environ.get("CADDY_SOURCE_DIR", str(DEFAULT_CADDY_SOURCE))).expanduser().resolve())
    environment["CADDY_SOURCE_COMMIT"] = CADDY_COMMIT
    environment["GRAFANA_PROM_DS_SOURCE_DIR"] = str(Path(os.environ.get("GRAFANA_PROM_DS_SOURCE_DIR", str(DEFAULT_GRAFANA_PROM_DS_SOURCE))).expanduser().resolve())
    environment["GRAFANA_PROM_DS_SOURCE_COMMIT"] = GRAFANA_PROM_DS_COMMIT
    environment.setdefault("CORE02_POSTGRES_PORT", "55432")
    environment.setdefault("CORE02_MINIO_PORT", "59000")
    environment.setdefault("CORE02_LITELLM_PORT", "54000")
    environment.setdefault("CORE02_LANGFUSE_PORT", "53000")
    environment.setdefault("CORE02_MEILI_PORT", "57700")
    environment.setdefault("CORE02_PROMETHEUS_PORT", "59090")
    environment.setdefault("CORE02_GRAFANA_PORT", "53300")
    environment.setdefault("CORE02_MAILPIT_SMTP_PORT", "51025")
    environment.setdefault("CORE02_MAILPIT_UI_PORT", "58025")
    environment.setdefault("PROMETHEUS_RETENTION", "15d")
    environment.setdefault("GRAFANA_ADMIN_USER", "admin")
    environment["OPENROUTER_API_KEY"] = os.environ.get("OPENROUTER_API_KEY", "")  # reaches only litellm
    environment["OPENROUTER_KEY_PRESENT"] = "1" if environment["OPENROUTER_API_KEY"] else ""  # flag for the seed
    return environment


def validate_caddy_build_inputs() -> None:
    validate_pinned_source(Path(os.environ.get("CADDY_SOURCE_DIR", str(DEFAULT_CADDY_SOURCE))),
                           CADDY_COMMIT, "caddy", ("go.mod", "go.sum", "LICENSE", "cmd/caddy/main.go"))
    validate_go_overlay(ROOT / "infra" / "caddy", CADDY_COMMIT, "caddy")


def validate_observability_build_inputs() -> None:
    validate_pinned_source(Path(os.environ.get("PROMETHEUS_SOURCE_DIR", str(DEFAULT_PROMETHEUS_SOURCE))),
                           PROMETHEUS_COMMIT, "prometheus", ("go.mod", "go.sum", "LICENSE", "NOTICE", "scripts/compress_assets.sh"))
    validate_go_overlay(ROOT / "infra" / "prometheus", PROMETHEUS_COMMIT, "prometheus")
    validate_pinned_source(Path(os.environ.get("GRAFANA_PROM_DS_SOURCE_DIR", str(DEFAULT_GRAFANA_PROM_DS_SOURCE))),
                           GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds", ("go.mod", "go.sum", "LICENSE", "pkg/main.go"))
    validate_go_overlay(ROOT / "infra" / "grafana", GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds")


def _compose(
    action: list[str],
    private_dir: Path,
    source_dir: Path,
    *,
    timeout: int = 120,
) -> subprocess.CompletedProcess[str]:
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
        tail = "\n".join((result.stderr or "").splitlines()[-40:])
        print(f"compose stderr (last 40 lines):\n{tail}", file=sys.stderr)
        raise ConfigurationError(f"compose_{action[2] if action[0] == '--profile' else action[0]}_failed")
    return result


def langfuse_enabled() -> bool:
    return bool(os.environ.get("LANGFUSE_HOST", "").strip())


def write_credentials_summary(private_dir: Path, langfuse: bool, target: Path = ROOT / "CREDENTIALS.md") -> Path:
    """Owner-only, gitignored login sheet built from the private dir. Values are never printed."""
    if target.is_symlink():
        raise ConfigurationError("credentials_summary_symlink")
    s = lambda name: _read_secret(private_dir, name)  # noqa: E731
    port = lambda name, default: os.environ.get(name) or default  # noqa: E731
    litellm = f"http://127.0.0.1:{port('CORE02_LITELLM_PORT', '54000')}"
    text = f"""# Local credentials — DO NOT COMMIT (gitignored, mode 0600)

Regenerated by `scripts/local_infra.py start` from `{private_dir}`; the files there are the source of truth.

## Owner app
- URL: http://127.0.0.1:8000 (share listener :8001 when enabled)
- Login: one-use bootstrap URL printed by the launcher (no stored password)

## PostgreSQL (app data)
- Address: 127.0.0.1:{port('CORE02_POSTGRES_PORT', '55432')}, database `jobsearch_platform_core02`
- User: `{s('postgres-user')}`
- Password: `{s('postgres-password')}`

## MinIO (object store)
- API: http://127.0.0.1:{port('CORE02_MINIO_PORT', '59000')}
- Access key: `{s('minio-access-key')}`
- Secret key: `{s('minio-secret-key')}`

## LiteLLM gateway
- API: {litellm}
- UI: {litellm}/ui — user `owner`, password `{s('litellm-ui-password')}`
- Master key: `{s('litellm-master-key')}`
- App virtual key (job-search-app): `{s(APP_KEY_FILE)}`
- Salt key (never change after first start): `{s('litellm-salt-key')}`

## LiteLLM Postgres (internal network only, no host port)
- Host `litellm-db:5432`, database `litellm`, user `litellm`
- Password: `{s('litellm-db-password')}`

## OpenRouter
- Key lives in `.env` as `OPENROUTER_API_KEY` (reaches LiteLLM only)
"""
    if langfuse:
        ui = f"http://127.0.0.1:{port('CORE02_LANGFUSE_PORT', '53000')}"
        text += f"""
## Langfuse (run tracing)
- UI: {ui} — email `{LANGFUSE_OWNER_EMAIL}`, password `{s('langfuse-ui-password')}`
- Project `job-search-platform` public key: `{s('langfuse-public-key')}`
- Project secret key: `{s('langfuse-secret-key')}`
- Internal services (langfuse-db, langfuse-clickhouse, langfuse-valkey, langfuse-minio) have no host port; their passwords are the `langfuse-*` files in the private dir.
"""
    _write_owner_only(target, text)
    target.chmod(0o600)  # repo-root summary, never group-readable
    return target


def start(private_dir: Path, source_dir: Path) -> dict[str, str]:
    private_dir = prepare_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    ensure_credentials(private_dir)
    group_readable_private_files(private_dir)
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("warning: OPENROUTER_API_KEY not set; LiteLLM has no provider key and model calls will fail", file=sys.stderr)
    langfuse = langfuse_enabled()
    profile = LANGFUSE_PROFILE if langfuse else []
    validate_observability_build_inputs()
    if os.environ.get("CORE02_COMPOSE_OVERRIDE", "").strip():  # the prod override adds the source-built Caddy
        validate_caddy_build_inputs()
    _compose([*profile, "up", "--detach", "--build", "--wait", "--wait-timeout", "300"], private_dir, source_dir, timeout=3600)
    try:  # one-shot seed is profiled out of `up --wait`, which treats its exit as failure
        _compose(["--profile", "seed", "run", "--rm", "litellm-seed"], private_dir, source_dir, timeout=300)
    except ConfigurationError as exc:
        raise ConfigurationError("litellm_seed_failed") from exc
    write_credentials_summary(private_dir, langfuse)
    return {"status": "started", "private_directory": str(private_dir), "minio_source_commit": MINIO_COMMIT}


def status(private_dir: Path, source_dir: Path) -> list[dict[str, object]]:
    private_dir = prepare_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    result = _compose([*LANGFUSE_PROFILE, "ps", "--all", "--format", "json"], private_dir, source_dir)
    services: list[dict[str, object]] = []
    for line in result.stdout.splitlines():
        if line.strip():
            item = json.loads(line)
            services.append({"service": item.get("Service"), "state": item.get("State"), "health": item.get("Health")})
    return services


def stop(private_dir: Path, source_dir: Path) -> dict[str, str]:
    private_dir = validate_private_directory(private_dir)
    source_dir = validate_minio_source(source_dir)
    _compose([*LANGFUSE_PROFILE, "stop"], private_dir, source_dir)
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
