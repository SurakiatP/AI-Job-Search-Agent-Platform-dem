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
    assert "|| exit 1" in text  # a failed go build must fail the image build
    assert "git clone" not in text


def test_grafana_overlay_and_dockerfile():
    provenance, digests = _overlay(ROOT / "infra/grafana")
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
    assert "git clone" not in text and "grafana-cli" not in text


def test_unsigned_plugin_allowlist_is_exactly_prometheus():
    import re
    text = (ROOT / "infra/grafana/Dockerfile").read_text()
    assert re.findall(r"GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=(\S+)", text) == ["prometheus"]
    compose = (ROOT / "infra/compose.yaml").read_text()
    assert "ALLOW_LOADING_UNSIGNED_PLUGINS" not in compose  # the allow-list lives only in the image
