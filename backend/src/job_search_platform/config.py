"""Service addresses read from the environment, with the local-stack defaults."""
from __future__ import annotations

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
