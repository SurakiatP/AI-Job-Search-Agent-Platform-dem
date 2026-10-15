"""WP1 part 2: the merged production Compose config exposes nothing but Caddy publicly."""
from __future__ import annotations

import json
import os
import pwd
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
HOST_NETWORK = {"caddy", "prometheus", "grafana"}


def _merged(tmp_path: Path) -> dict:
    # Real account HOME (even under CI-parity empty HOME): the compose CLI plugin lives under ~/.docker on macOS. Empty --env-file: never read the owner's .env.
    empty = tmp_path / "empty.env"
    empty.write_text("")
    env = {**os.environ, "HOME": pwd.getpwuid(os.getuid()).pw_dir, "CORE02_PRIVATE_DIR": str(tmp_path), "DOMAIN": "example.test", "ACME_EMAIL": "ops@example.test"}
    for name in ("MINIO", "GOSU", "PROMETHEUS", "GRAFANA_PROM_DS", "CADDY"):
        env[f"{name}_SOURCE_DIR"] = str(tmp_path)
        env[f"{name}_SOURCE_COMMIT"] = "0" * 40
    result = subprocess.run(
        ["docker", "compose", "--env-file", str(empty), "--project-name", "jobsearch-core02", "-f", "infra/compose.yaml",
         "-f", "infra/compose.prod.yaml", "--profile", "langfuse", "config", "--format", "json", "--no-path-resolution"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.skipif(not shutil.which("docker"), reason="docker compose CLI unavailable")
def test_only_loopback_ports_and_expected_host_network(tmp_path):
    services = _merged(tmp_path)["services"]
    assert "mailpit" not in services  # dev profile only
    assert "caddy" in services
    for name, svc in services.items():
        for port in svc.get("ports", []):
            assert port.get("host_ip") == "127.0.0.1", (name, port)
        if svc.get("network_mode") == "host":
            assert name in HOST_NETWORK, name
    for name in HOST_NETWORK:
        assert services[name]["network_mode"] == "host"
        assert not services[name].get("ports")
    caddy_ref = (ROOT / "infra/deploy/caddy-image.txt").read_text().strip()
    assert services["caddy"]["image"] == caddy_ref


@pytest.mark.skipif(not shutil.which("docker"), reason="docker compose CLI unavailable")
def test_prod_prometheus_and_grafana_listen_on_loopback(tmp_path):
    services = _merged(tmp_path)["services"]
    assert "--web.listen-address=127.0.0.1:59090" in services["prometheus"]["command"]
    assert "--config.file=/etc/prometheus/prometheus.prod.yml" in services["prometheus"]["command"]
    env = services["grafana"]["environment"]
    assert env["GF_SERVER_HTTP_ADDR"] == "127.0.0.1" and env["GRAFANA_PROMETHEUS_URL"] == "http://127.0.0.1:59090"


def test_cloud_init_schema(tmp_path):
    if not shutil.which("cloud-init"):
        pytest.skip("cloud-init not installed; schema is checked in the Task 7 rehearsal VM")
    result = subprocess.run(["cloud-init", "schema", "--config-file", str(ROOT / "infra/deploy/cloud-init.yaml")],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
