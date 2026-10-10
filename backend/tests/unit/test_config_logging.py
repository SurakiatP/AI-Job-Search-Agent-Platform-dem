"""Env parsing and JSON log format; no infrastructure needed."""
import json
import logging

from job_search_platform import config
from job_search_platform.integrations import logging as jsp_logging

KEYS = ("JSP_POSTGRES_HOST", "JSP_POSTGRES_PORT", "CORE02_POSTGRES_PORT", "JSP_DATABASE", "JSP_MINIO_ENDPOINT",
        "CORE02_MINIO_PORT", "JSP_PRIVATE_BUCKET", "JSP_LOG_LEVEL")


def _clean(monkeypatch):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)


def test_defaults(monkeypatch):
    _clean(monkeypatch)
    assert (config.postgres_host(), config.postgres_port(), config.database_name()) == ("127.0.0.1", 55432, "jobsearch_platform_core02")
    assert config.minio_endpoint() == "http://127.0.0.1:59000"
    assert config.private_bucket() == "job-search-platform-private"


def test_overrides_and_legacy_names(monkeypatch):
    _clean(monkeypatch)
    monkeypatch.setenv("CORE02_POSTGRES_PORT", "1111")
    monkeypatch.setenv("CORE02_MINIO_PORT", "2222")
    assert config.postgres_port() == 1111 and config.minio_endpoint() == "http://127.0.0.1:2222"
    monkeypatch.setenv("JSP_POSTGRES_PORT", "3333")
    monkeypatch.setenv("JSP_POSTGRES_HOST", "db.internal")
    monkeypatch.setenv("JSP_MINIO_ENDPOINT", "http://minio.internal:9000")
    monkeypatch.setenv("JSP_DATABASE", "other")
    assert config.postgres_port() == 3333 and config.postgres_host() == "db.internal"
    assert config.minio_endpoint() == "http://minio.internal:9000" and config.database_name() == "other"
    monkeypatch.setenv("JSP_POSTGRES_PORT", "  ")  # blank means unset
    assert config.postgres_port() == 1111


def test_json_formatter_fields():
    record = logging.LogRecord("x.y", logging.WARNING, __file__, 1, "hello %s", ("w",), None)
    line = json.loads(jsp_logging.JsonFormatter().format(record))
    assert set(line) == {"ts", "level", "logger", "msg", "request_id"}
    assert (line["level"], line["logger"], line["msg"]) == ("WARNING", "x.y", "hello w")


def test_log_level_from_env(monkeypatch):
    root = logging.getLogger()
    before = root.level, list(root.handlers)
    try:
        monkeypatch.setenv("JSP_LOG_LEVEL", "debug")
        jsp_logging.configure_logging()
        assert root.level == logging.DEBUG
        monkeypatch.setenv("JSP_LOG_LEVEL", "nonsense")
        jsp_logging.configure_logging()
        assert root.level == logging.INFO
        assert sum(getattr(h, "_jsp", False) for h in root.handlers) == 1
    finally:
        root.handlers[:] = before[1]
        root.setLevel(before[0])
