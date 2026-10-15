"""A1.6-A1.8: committed .env.example lists every configurable value and holds no secret."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import local_infra  # noqa: E402

TEXT = (ROOT / ".env.example").read_text(encoding="utf-8")
NAMES = {"CORE02_POSTGRES_PORT", "CORE02_MINIO_PORT", "CORE02_LITELLM_PORT", "CORE02_LANGFUSE_PORT",
         "CORE02_MEILI_PORT", "CORE02_PROMETHEUS_PORT", "CORE02_GRAFANA_PORT", "CORE02_MAILPIT_SMTP_PORT",
         "CORE02_MAILPIT_UI_PORT", "PROMETHEUS_RETENTION", "GRAFANA_ADMIN_USER", "METRICS_PORT", "METRICS_HOST",
         "PROMETHEUS_SOURCE_DIR", "GRAFANA_PROM_DS_SOURCE_DIR", "MEILI_URL", "MEILI_INDEX"}


def test_every_configurable_value_is_listed():
    missing = {name for name in NAMES if not re.search(rf"^#?\s*{name}=", TEXT, re.M)}
    assert not missing, missing


def test_no_secret_values():
    for key in ("OPENROUTER_API_KEY", "LITELLM_API_KEY"):
        assert re.search(rf"^{key}=\s*$", TEXT, re.M), key
    assert not re.search(r"(sk-[A-Za-z0-9]{8,}|pk-lf-|sk-lf-|BEGIN [A-Z ]*PRIVATE KEY)", TEXT)


def test_compose_environment_defaults_match_template(monkeypatch, tmp_path):
    for name in NAMES:
        monkeypatch.delenv(name, raising=False)
    env = local_infra.compose_environment(tmp_path, tmp_path)
    for name, default in (("CORE02_PROMETHEUS_PORT", "59090"), ("CORE02_GRAFANA_PORT", "53300"),
                          ("CORE02_MAILPIT_SMTP_PORT", "51025"), ("CORE02_MAILPIT_UI_PORT", "58025"),
                          ("CORE02_MEILI_PORT", "57700"), ("PROMETHEUS_RETENTION", "15d"),
                          ("GRAFANA_ADMIN_USER", "admin")):
        assert env[name] == default
        assert re.search(rf"^#?\s*{name}={re.escape(default)}\s*$", TEXT, re.M), name
