"""WP1 observability infra: pinning, loopback ports, secrets, and dashboard/rules referencing real metrics."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml
from prometheus_client import REGISTRY

from job_search_platform.integrations import metrics  # noqa: F401  registers the jsp_ metrics

ROOT = Path(__file__).resolve().parents[3]
PROM_IMAGE = "prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e"
GRAFANA_IMAGE = "grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f"
SCRAPE_TIME = {"jsp_db_up", "jsp_runs_in_state", "jsp_job_postings", "jsp_ingest_last_run_timestamp_seconds",
               "jsp_ingest_source_last_success_timestamp_seconds", "jsp_ingest_source_state",
               "jsp_ingest_source_rows", "jsp_search_up", "jsp_search_documents"}


def _compose():
    return yaml.safe_load((ROOT / "infra/compose.yaml").read_text())


def test_services_pinned_and_loopback_only():
    services = _compose()["services"]
    prom, grafana = services["prometheus"], services["grafana"]
    assert prom["image"] == PROM_IMAGE and grafana["image"] == GRAFANA_IMAGE
    assert prom["ports"] == ["127.0.0.1:59090:9090"] and grafana["ports"] == ["127.0.0.1:53300:3000"]
    assert "--storage.tsdb.retention.time=15d" in prom["command"]
    assert "host.docker.internal:host-gateway" in prom["extra_hosts"]
    env = grafana["environment"]
    for key in ("GF_AUTH_ANONYMOUS_ENABLED", "GF_USERS_ALLOW_SIGN_UP", "GF_ANALYTICS_REPORTING_ENABLED",
                "GF_ANALYTICS_CHECK_FOR_UPDATES"):
        assert str(env[key]).lower() == "false"
    assert env["GF_SECURITY_ADMIN_PASSWORD__FILE"] == "/run/secrets/grafana-admin-password"
    assert "grafana-admin-password" in grafana["secrets"]
    assert "grafana-admin-password" in _compose()["secrets"]


def test_admin_password_generated_by_local_infra():
    source = (ROOT / "scripts/local_infra.py").read_text()
    assert '"grafana-admin-password": lambda: secrets.token_urlsafe(24)' in source


def _known_metrics() -> set[str]:
    names = set(SCRAPE_TIME)
    for family in REGISTRY.collect():
        names.add(family.name)
        if family.type == "counter":  # a labelled counter with no observations yet has no _total sample
            names.add(family.name + "_total")
        names.update(sample.name for sample in family.samples)
    return names


def _referenced(text: str) -> set[str]:
    return set(re.findall(r"\bjsp_[a-z_]+", text))


def test_dashboard_and_rules_reference_existing_metrics():
    known = _known_metrics()
    dashboard = (ROOT / "infra/grafana/dashboards/platform-overview.json").read_text()
    json.loads(dashboard)
    rules = (ROOT / "infra/prometheus/rules.yml").read_text()
    missing = {name for name in _referenced(dashboard) | _referenced(rules)
               if name not in known and re.sub(r"_(bucket|count|sum)$", "", name) not in known}
    assert not missing, missing
    alerts = {r["alert"] for g in yaml.safe_load(rules)["groups"] for r in g["rules"]}
    assert alerts == {"AppDown", "DatabaseDown", "SearchDown", "IngestStale", "SourceFailing", "SourceSilent",
                      "HighErrorRate", "RunsStuckQueued"}


def _docker() -> bool:
    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


@pytest.mark.skipif(not _docker(), reason="docker unavailable")
def test_promtool_accepts_config_and_rules():
    result = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{ROOT / 'infra/prometheus'}:/etc/prometheus:ro",
         PROM_IMAGE, "check", "config", "/etc/prometheus/prometheus.yml"],
        capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
