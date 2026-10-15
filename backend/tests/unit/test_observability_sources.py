"""WP1 A1: pinned upstream sources and Go dependency overlays for the locally built observability images."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import local_infra  # noqa: E402


def _overlay(directory: Path):
    provenance = json.loads((directory / "provenance.json").read_text())
    digests = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in ("go.mod", "go.sum")}
    return provenance, digests


def test_prometheus_overlay_matches_provenance():
    provenance, digests = _overlay(ROOT / "infra/prometheus")
    assert provenance["source_commit"] == local_infra.PROMETHEUS_COMMIT
    assert provenance["builder_image"] == local_infra.PROMETHEUS_BUILDER_IMAGE
    assert provenance["go_mod_sha256"] == digests["go.mod"] and provenance["go_sum_sha256"] == digests["go.sum"]
    assert "golang.org/x/net v0.60.0" in (ROOT / "infra/prometheus/go.mod").read_text()
    local_infra.validate_go_overlay(ROOT / "infra/prometheus", local_infra.PROMETHEUS_COMMIT, "prometheus")


def test_edited_overlay_is_refused(tmp_path):
    for name in ("go.mod", "go.sum", "provenance.json"):
        (tmp_path / name).write_bytes((ROOT / "infra/prometheus" / name).read_bytes())
    commit = local_infra.PROMETHEUS_COMMIT
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_overlay_source_mismatch"):
        local_infra.validate_go_overlay(tmp_path, "0" * 40, "prometheus")
    (tmp_path / "go.sum").write_text("drifted\n")
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_overlay_hash_mismatch"):
        local_infra.validate_go_overlay(tmp_path, commit, "prometheus")
    (tmp_path / "provenance.json").unlink()
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_overlay_invalid"):
        local_infra.validate_go_overlay(tmp_path, commit, "prometheus")


def _repo(tmp_path, name="src"):
    path = tmp_path / name
    path.mkdir()
    for file_name in ("go.mod", "go.sum", "LICENSE"):
        (path / file_name).write_text("x\n")
    git = lambda *args: subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True)
    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    return path, git("rev-parse", "HEAD").stdout.strip()


def test_pinned_source_validation(tmp_path):
    path, head = _repo(tmp_path)
    required = ("go.mod", "go.sum", "LICENSE")
    assert local_infra.validate_pinned_source(path, head, "x", required) == path.resolve()
    with pytest.raises(local_infra.ConfigurationError, match="x_source_revision_mismatch"):
        local_infra.validate_pinned_source(path, "0" * 40, "x", required)
    with pytest.raises(local_infra.ConfigurationError, match="x_source_incomplete"):
        local_infra.validate_pinned_source(path, head, "x", required + ("NOTICE",))
    with pytest.raises(local_infra.ConfigurationError, match="x_source_revision_mismatch"):
        local_infra.validate_pinned_source(tmp_path / "missing", head, "x", required)
    with pytest.raises(local_infra.ConfigurationError, match="x_source_must_be_external"):
        local_infra.validate_pinned_source(ROOT / "infra", head, "x", required)
    (path / "stray.txt").write_text("x\n")
    with pytest.raises(local_infra.ConfigurationError, match="x_source_dirty"):
        local_infra.validate_pinned_source(path, head, "x", required)


def test_prometheus_dockerfile_pins_inputs():
    text = (ROOT / "infra/prometheus/Dockerfile").read_text()
    provenance = json.loads((ROOT / "infra/prometheus/provenance.json").read_text())
    for value in (local_infra.PROMETHEUS_BUILDER_IMAGE, provenance["base_image"], provenance["web_ui_sha256"],
                  local_infra.PROMETHEUS_COMMIT, "go1.27.2", "builtinassets", "--from=prometheus_source"):
        assert value in text
    for value in ("go mod verify", "-mod=readonly", "GOTOOLCHAIN=local",
                  "--checksum=sha256:" + provenance["web_ui_sha256"]):
        assert value in text
    assert "go mod download" in text and text.index("go mod download") < text.index("go mod verify")
    assert "|| exit 1" in text  # a failed go build must fail the image build
    assert "git clone" not in text


def test_grafana_overlay_and_dockerfile():
    provenance, digests = _overlay(ROOT / "infra/grafana")
    assert local_infra.GRAFANA_PROM_DS_COMMIT == "6d21418acde6ce31c9f7a6418a88758842a881bb"
    assert provenance["source_commit"] == local_infra.GRAFANA_PROM_DS_COMMIT
    assert provenance["builder_image"] == local_infra.PROMETHEUS_BUILDER_IMAGE
    assert provenance["unsigned_plugin_allowlist"] == ["prometheus"]
    assert provenance["go_mod_sha256"] == digests["go.mod"] and provenance["go_sum_sha256"] == digests["go.sum"]
    assert "golang.org/x/net v0.60.0" in (ROOT / "infra/grafana/go.mod").read_text()
    local_infra.validate_go_overlay(ROOT / "infra/grafana", local_infra.GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds")
    text = (ROOT / "infra/grafana/Dockerfile").read_text()
    for value in (local_infra.PROMETHEUS_BUILDER_IMAGE, provenance["base_image"], local_infra.GRAFANA_PROM_DS_COMMIT,
                  "go1.27.2", "go mod verify", "-mod=readonly", "-trimpath", "GOTOOLCHAIN=local",
                  "--from=grafana_prom_ds_source", "MANIFEST.txt", "plugins-bundled", "--chmod=0755",
                  "GF_PLUGINS_PREINSTALL_DISABLED=true", "GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=prometheus"):
        assert value in text
    for value in ("grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f",
                  "rm -f /usr/share/grafana/data/plugins-bundled/prometheus/MANIFEST.txt",
                  "USER 472", "--chown=472:0", "-tags arrow_json_stdlib", "go mod download"):
        assert value in text
    assert text.index("go mod download") < text.index("go mod verify")
    assert "git clone" not in text and "grafana-cli" not in text


def test_unsigned_plugin_allowlist_is_exactly_prometheus():
    import re
    text = (ROOT / "infra/grafana/Dockerfile").read_text()
    assert re.findall(r"GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=(\S+)", text) == ["prometheus"]
    compose = (ROOT / "infra/compose.yaml").read_text()
    assert "ALLOW_LOADING_UNSIGNED_PLUGINS" not in compose  # the allow-list lives only in the image


def _stub_pre_a1(monkeypatch, tmp_path):
    for name in ("validate_gosu_source", "validate_postgres_overlay", "validate_dependency_overlay"):
        monkeypatch.setattr(local_infra, name, lambda *a, **k: None)
    for name in ("prepare_private_directory", "validate_private_directory", "validate_minio_source"):
        monkeypatch.setattr(local_infra, name, lambda p: p)
    monkeypatch.setattr(local_infra, "ensure_credentials", lambda p: None)
    monkeypatch.setattr(local_infra, "compose_environment", lambda *a: {})
    monkeypatch.setenv("PROMETHEUS_SOURCE_DIR", str(tmp_path / "missing"))
    calls = []

    def fake_run(command, **kwargs):
        if command[0] == "docker":
            calls.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(local_infra.subprocess, "run", fake_run)
    return calls


def test_status_and_stop_do_not_need_observability_sources(monkeypatch, tmp_path):
    calls = _stub_pre_a1(monkeypatch, tmp_path)
    local_infra.status(tmp_path, tmp_path)
    local_infra.stop(tmp_path, tmp_path)
    assert len(calls) == 2


def test_start_validates_observability_sources_before_compose(monkeypatch, tmp_path):
    calls = _stub_pre_a1(monkeypatch, tmp_path)
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_source"):
        local_infra.start(tmp_path, tmp_path)
    assert calls == []


def test_start_timeout_covers_first_prometheus_build():
    assert "timeout=3600)" in (ROOT / "scripts/local_infra.py").read_text().split("def start(")[1].split("def status(")[0]


def test_compose_override_appended_only_when_set(monkeypatch, tmp_path):
    calls = _stub_pre_a1(monkeypatch, tmp_path)
    monkeypatch.delenv("CORE02_COMPOSE_OVERRIDE", raising=False)
    local_infra._compose(["ps"], tmp_path, tmp_path)
    assert calls[-1].count("--file") == 1
    override = tmp_path / "compose.prod.yaml"
    override.write_text("services: {}\n")
    monkeypatch.setenv("CORE02_COMPOSE_OVERRIDE", str(override))
    local_infra._compose(["ps"], tmp_path, tmp_path)
    files = [calls[-1][i + 1] for i, part in enumerate(calls[-1]) if part == "--file"]
    assert files == [str(local_infra.COMPOSE_FILE), str(override)]
    assert calls[-1][-1] == "ps"


def test_compose_override_must_exist(monkeypatch, tmp_path):
    _stub_pre_a1(monkeypatch, tmp_path)
    monkeypatch.setenv("CORE02_COMPOSE_OVERRIDE", str(tmp_path / "missing.yaml"))
    with pytest.raises(local_infra.ConfigurationError, match="compose_override_missing"):
        local_infra._compose(["ps"], tmp_path, tmp_path)


def test_grafana_datasource_url_comes_from_env():
    ds = (ROOT / "infra/grafana/provisioning/datasources/prometheus.yml").read_text()
    assert "url: ${GRAFANA_PROMETHEUS_URL}" in ds
    import yaml
    env = yaml.safe_load((ROOT / "infra/compose.yaml").read_text())["services"]["grafana"]["environment"]
    assert env["GRAFANA_PROMETHEUS_URL"] == "${GRAFANA_PROMETHEUS_URL:-http://prometheus:9090}"


def test_caddy_overlay_matches_provenance():
    provenance, digests = _overlay(ROOT / "infra/caddy")
    assert provenance["source_commit"] == local_infra.CADDY_COMMIT
    assert provenance["builder_image"] == local_infra.CADDY_BUILDER_IMAGE
    assert provenance["go_mod_sha256"] == digests["go.mod"] and provenance["go_sum_sha256"] == digests["go.sum"]
    assert "golang.org/x/net v0.60.0" in (ROOT / "infra/caddy/go.mod").read_text()
    local_infra.validate_go_overlay(ROOT / "infra/caddy", local_infra.CADDY_COMMIT, "caddy")


def test_caddy_dockerfile_pins_inputs():
    text = (ROOT / "infra/caddy/Dockerfile").read_text()
    provenance = json.loads((ROOT / "infra/caddy/provenance.json").read_text())
    for value in (local_infra.CADDY_BUILDER_IMAGE, provenance["base_image"], local_infra.CADDY_COMMIT, "go1.27.2",
                  "--from=caddy_source", "-mod=readonly", "-trimpath", "GOTOOLCHAIN=local", "go mod verify",
                  "/etc/ssl/certs/ca-certificates.crt", "XDG_CONFIG_HOME=/config", "XDG_DATA_HOME=/data",
                  "/licenses/caddy/LICENSE", "EXPOSE 80 443"):
        assert value in text
    assert "go mod download" in text and text.index("go mod download") < text.index("go mod verify")


def test_caddy_build_inputs_are_checked_only_with_compose_override(monkeypatch, tmp_path):
    calls = _stub_pre_a1(monkeypatch, tmp_path)
    monkeypatch.setattr(local_infra, "validate_observability_build_inputs", lambda: None)
    monkeypatch.setattr(local_infra, "langfuse_enabled", lambda: False)
    monkeypatch.setattr(local_infra, "write_credentials_summary", lambda *a: None)
    monkeypatch.delenv("CORE02_COMPOSE_OVERRIDE", raising=False)
    monkeypatch.setenv("CADDY_SOURCE_DIR", str(tmp_path / "missing"))
    local_infra.start(tmp_path, tmp_path)  # dev start never needs a Caddy checkout
    assert calls
    calls.clear()
    (tmp_path / "compose.prod.yaml").write_text("services: {}\n")
    monkeypatch.setenv("CORE02_COMPOSE_OVERRIDE", str(tmp_path / "compose.prod.yaml"))
    with pytest.raises(local_infra.ConfigurationError, match="caddy_source"):
        local_infra.start(tmp_path, tmp_path)
    assert calls == []
    local_infra.status(tmp_path, tmp_path)
    local_infra.stop(tmp_path, tmp_path)  # status/stop never validate it


def test_caddy_compose_environment_pins_source(monkeypatch, tmp_path):
    monkeypatch.delenv("CADDY_SOURCE_DIR", raising=False)
    env = local_infra.compose_environment(tmp_path, tmp_path)
    assert env["CADDY_SOURCE_COMMIT"] == local_infra.CADDY_COMMIT
    assert env["CADDY_SOURCE_DIR"] == str(local_infra.DEFAULT_CADDY_SOURCE.resolve())
