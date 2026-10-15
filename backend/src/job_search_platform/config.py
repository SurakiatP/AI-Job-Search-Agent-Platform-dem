"""Service addresses read from the environment, with the local-stack defaults."""
from __future__ import annotations

import ipaddress
import os


def _env(name: str, default: str) -> str:
    return (os.environ.get(name) or "").strip() or default


def postgres_host() -> str:
    return _env("JSP_POSTGRES_HOST", "127.0.0.1")


def postgres_port() -> int:
    # CORE02_POSTGRES_PORT is the legacy name; the compose file still publishes the port with it.
    return int(_env("JSP_POSTGRES_PORT", _env("CORE02_POSTGRES_PORT", "55432")))


def database_name() -> str:
    return _env("JSP_DATABASE", "jobsearch_platform_core02")


def minio_endpoint() -> str:
    return _env("JSP_MINIO_ENDPOINT", f"http://127.0.0.1:{_env('CORE02_MINIO_PORT', '59000')}")


def private_bucket() -> str:
    return _env("JSP_PRIVATE_BUCKET", "job-search-platform-private")


def meili_url() -> str:
    return _env("MEILI_URL", "http://127.0.0.1:57700")


def meili_index() -> str:
    return _env("MEILI_INDEX", "jobs")


def metrics_port() -> int | None:
    value = _env("METRICS_PORT", "")
    return int(value) if value else None


def metrics_host() -> str:
    """Loopback only: the metrics listener has no auth and must never be reachable from outside (WP1, spec O4)."""
    host = _env("METRICS_HOST", "127.0.0.1")
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise ValueError("metrics_host_not_loopback")
    return host


def secret_file_forbidden_bits() -> int:
    """Mode bits a secret file must not have: group-read is allowed on servers (CORE02_SECRETS_GROUP_READ=1)."""
    return 0o037 if _env("CORE02_SECRETS_GROUP_READ", "") == "1" else 0o077
