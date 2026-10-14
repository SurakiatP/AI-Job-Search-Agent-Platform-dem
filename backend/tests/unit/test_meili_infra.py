"""Meilisearch infra pinning and key wiring (spec: Infrastructure). Reads files only."""
from __future__ import annotations

import re
from pathlib import Path

import yaml

from job_search_platform import config

ROOT = Path(__file__).resolve().parents[3]


def _service():
    return yaml.safe_load((ROOT / "infra/compose.yaml").read_text())["services"]["meilisearch"]


def test_image_pinned_by_digest_and_loopback_only():
    service = _service()
    assert re.fullmatch(r"getmeili/meilisearch:v1\.55\.0@sha256:[0-9a-f]{64}", service["image"])
    assert service["ports"] == ["127.0.0.1:${CORE02_MEILI_PORT:-57700}:7700"]
    assert service["environment"]["MEILI_ENV"] == "production"
    assert str(service["environment"]["MEILI_NO_ANALYTICS"]).lower() == "true"
    assert "meili-master-key" in service["secrets"]


def test_master_key_generated_by_local_infra():
    source = (ROOT / "scripts/local_infra.py").read_text()
    assert '"meili-master-key": lambda: secrets.token_urlsafe(32)' in source


def test_config_defaults(monkeypatch):
    monkeypatch.delenv("MEILI_URL", raising=False)
    monkeypatch.delenv("MEILI_INDEX", raising=False)
    assert config.meili_url() == "http://127.0.0.1:57700"
    assert config.meili_index() == "jobs"
