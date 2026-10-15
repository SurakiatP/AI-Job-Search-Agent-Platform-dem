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
PROM_IMAGE = "job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6"  # built locally from pinned source (A1)
GRAFANA_IMAGE = "job-search-platform/grafana:13.2.4-promds13.2.3-go1.27.2-6d21418acde6"  # built locally (A1)
SCRAPE_TIME = {"jsp_db_up", "jsp_runs_in_state", "jsp_job_postings", "jsp_ingest_last_run_timestamp_seconds",
               "jsp_ingest_source_last_success_timestamp_seconds", "jsp_ingest_source_state",
               "jsp_ingest_source_rows", "jsp_search_up", "jsp_search_documents",
               "jsp_process_peak_rss_bytes"}  # the last one exists only where /proc is absent (macOS)


def _compose():
    return yaml.safe_load((ROOT / "infra/compose.yaml").read_text())


def test_services_pinned_and_loopback_only():
    services = _compose()["services"]
    prom, grafana = services["prometheus"], services["grafana"]
    assert prom["image"] == PROM_IMAGE and grafana["image"] == GRAFANA_IMAGE
    build = prom["build"]
    assert build["context"] == "./prometheus"
    assert build["additional_contexts"]["prometheus_source"].startswith("${PROMETHEUS_SOURCE_DIR:?")
    assert build["args"]["PROMETHEUS_SOURCE_COMMIT"].startswith("${PROMETHEUS_SOURCE_COMMIT:?")
    gbuild = grafana["build"]
    assert gbuild["context"] == "./grafana"
    assert gbuild["additional_contexts"]["grafana_prom_ds_source"].startswith("${GRAFANA_PROM_DS_SOURCE_DIR:?")
    assert gbuild["args"]["GRAFANA_PROM_DS_SOURCE_COMMIT"].startswith("${GRAFANA_PROM_DS_SOURCE_COMMIT:?")
    assert prom["ports"] == ["127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}:9090"]
    assert grafana["ports"] == ["127.0.0.1:${CORE02_GRAFANA_PORT:-53300}:3000"]
    assert grafana["environment"]["GF_SECURITY_ADMIN_USER"] == "${GRAFANA_ADMIN_USER:-admin}"
    assert "--storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-15d}" in prom["command"]
    assert "host.docker.internal:host-gateway" in prom["extra_hosts"]
    env = grafana["environment"]
    for key in ("GF_AUTH_ANONYMOUS_ENABLED", "GF_USERS_ALLOW_SIGN_UP", "GF_ANALYTICS_REPORTING_ENABLED",
                "GF_ANALYTICS_CHECK_FOR_UPDATES"):
        assert str(env[key]).lower() == "false"
    assert env["GF_SECURITY_ADMIN_PASSWORD__FILE"] == "/run/secrets/grafana-admin-password"
    assert "grafana-admin-password" in grafana["secrets"]
    assert "grafana-admin-password" in _compose()["secrets"]


def test_mailpit_ports_use_env():
    assert _compose()["services"]["mailpit"]["ports"] == [
        "127.0.0.1:${CORE02_MAILPIT_SMTP_PORT:-51025}:1025", "127.0.0.1:${CORE02_MAILPIT_UI_PORT:-58025}:8025"]


def test_every_published_port_uses_env():
    ports = [(name, p) for name, svc in _compose()["services"].items() for p in svc.get("ports", [])]
    assert ports
    assert all("${" in str(p) for _, p in ports), [x for x in ports if "${" not in str(x[1])]


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


def _prom_image_built() -> bool:
    return _docker() and subprocess.run(["docker", "image", "inspect", PROM_IMAGE], capture_output=True).returncode == 0


@pytest.mark.skipif(not _prom_image_built(), reason="locally built Prometheus image unavailable")
def test_promtool_accepts_config_and_rules():
    result = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{ROOT / 'infra/prometheus'}:/etc/prometheus:ro",
         PROM_IMAGE, "check", "config", "/etc/prometheus/prometheus.yml"],
        capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
    unit = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "promtool", "-v", f"{ROOT / 'infra/prometheus'}:/etc/prometheus:ro",
         PROM_IMAGE, "test", "rules", "/etc/prometheus/rules_test.yml"],
        capture_output=True, text=True, timeout=180)
    assert unit.returncode == 0, unit.stdout + unit.stderr


def test_memory_panel_falls_back_to_peak_rss_on_macos():
    dashboard = json.loads((ROOT / "infra/grafana/dashboards/platform-overview.json").read_text())
    panel = next(p for p in dashboard["panels"] if p.get("title") == "Memory (RSS; peak on macOS)")
    assert panel["targets"][0]["expr"] == (
        'process_resident_memory_bytes{job="app"} or jsp_process_peak_rss_bytes{job="app"}')
