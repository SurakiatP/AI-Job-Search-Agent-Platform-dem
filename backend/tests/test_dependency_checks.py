import sys
from pathlib import Path


ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import check_dependencies  # noqa: E402
import security_scan  # noqa: E402
import pytest


def test_malformed_pip_vulnerability_cannot_appear_clean():
    with pytest.raises(ValueError):
        security_scan.pip_findings({"dependencies": [{"vulns": [None]}]})


def test_empty_sbom_does_not_establish_dependency_coverage():
    assert not security_scan._valid_sbom({"bomFormat": "CycloneDX", "components": []})


def test_hermes_audit_uses_its_runtime_marker_context(tmp_path, monkeypatch):
    commands = []
    monkeypatch.setattr(security_scan, "_export_requirements", lambda *args, **kwargs: (True, "locked.txt"))

    def successful_scan(name, command, output):
        commands.append(command)
        output.write_text('{"dependencies": []}')
        return 0, "complete"

    monkeypatch.setattr(security_scan, "run_scan", successful_scan)
    security_scan._scan_pip(tmp_path, tmp_path, "hermes", dev=False)
    command = commands[0]
    assert command[command.index("--project") + 1] == str(tmp_path)
    assert command[command.index("--group") + 1] == "audit"
    assert "--local" in command
    assert "--requirement" not in command


def test_native_node_audit_has_independent_required_coverage(tmp_path, monkeypatch):
    commands = []

    def successful_scan(name, command, output):
        commands.append(command)
        output.write_text('{"metadata":{"vulnerabilities":{"low":0,"moderate":0,"high":0,"critical":0}}}')
        return 0, "complete"

    monkeypatch.setattr(security_scan, "run_scan", successful_scan)
    status, _, _ = security_scan._scan_npm("hermes_node", tmp_path, project=tmp_path)
    assert status == "complete"
    assert commands[0][commands[0].index("--prefix") + 1] == str(tmp_path)
    assert "hermes_node" in check_dependencies.REQUIRED_SCANS


def test_native_runtime_lock_drift_blocks_audit_provenance(tmp_path, monkeypatch):
    committed = tmp_path / "infra" / "hermes"
    environment = tmp_path / "environment"
    committed.mkdir(parents=True)
    environment.mkdir()
    for name in ("pyproject.toml", "uv.lock", ".python-version"):
        (committed / name).write_text("locked-input")
        (environment / name).write_text("locked-input")
    monkeypatch.setattr(security_scan, "ROOT", tmp_path)
    assert security_scan.hermes_manifest_mirror_valid(environment)
    (environment / "uv.lock").write_text("drifted-input")
    assert not security_scan.hermes_manifest_mirror_valid(environment)


def test_parser_source_inventory_rejects_cargo_drift(tmp_path, monkeypatch):
    import hashlib
    (tmp_path / "Cargo.lock").write_bytes(b"locked")
    monkeypatch.setattr(security_scan, "PARSER_CARGO_SHA256", hashlib.sha256(b"locked").hexdigest())
    assert security_scan.parser_source_inventory(tmp_path) == tmp_path
    (tmp_path / "Cargo.lock").write_text("drifted")
    with pytest.raises(ValueError, match="parser"):
        security_scan.parser_source_inventory(tmp_path)


def test_source_built_postgres_helper_requires_independent_coverage():
    assert "postgres_go_build_dependencies" in check_dependencies.REQUIRED_SCANS


def test_unknown_trivy_advisories_remain_visible():
    report = {"Results": [{"Target": "go.mod", "Vulnerabilities": [{"VulnerabilityID": "GO-2026-5932", "Severity": "UNKNOWN"}]}]}
    assert security_scan.trivy_findings(report) == []
    assert security_scan.trivy_findings(report, severities={"UNKNOWN"}) == [("go.mod", "GO-2026-5932", "UNKNOWN")]


def test_minio_build_inventory_rejects_overlay_drift(tmp_path, monkeypatch):
    import hashlib
    import json

    overlay = tmp_path / "infra" / "minio"
    overlay.mkdir(parents=True)
    metadata = {"schema_version": 1, "source_commit": "7aac2a2c5b7c882e68c1ce017d8256be2feea27f"}
    for name, key in (("go.mod", "go_mod_sha256"), ("go.sum", "go_sum_sha256")):
        (overlay / name).write_bytes(b"locked")
        metadata[key] = hashlib.sha256(b"locked").hexdigest()
    (overlay / "provenance.json").write_text(json.dumps(metadata))
    monkeypatch.setattr(security_scan, "ROOT", tmp_path)
    assert security_scan.minio_build_inventory(tmp_path / "source") == overlay
    (overlay / "go.sum").write_text("drifted")
    with pytest.raises(ValueError, match="overlay"):
        security_scan.minio_build_inventory(tmp_path / "source")


def test_npm_lock_rejects_dependency_drift():
    manifest = {
        "name": "example",
        "dependencies": {"react": "19.1.0"},
    }
    lock = {
        "name": "example",
        "lockfileVersion": 3,
        "packages": {
            "": {"name": "example", "dependencies": {"react": "19.0.0"}},
            "node_modules/react": {"version": "19.1.0"},
        },
    }

    problems = check_dependencies.validate_npm_lock(manifest, lock)

    assert any("root dependency react differs" in problem for problem in problems)


def test_npm_lock_rejects_missing_resolved_package():
    manifest = {"name": "example", "dependencies": {"react": "19.1.0"}}
    lock = {"name": "example", "lockfileVersion": 3, "packages": {"": {"name": "example", "dependencies": {"react": "19.1.0"}}}}

    problems = check_dependencies.validate_npm_lock(manifest, lock)

    assert problems == ["locked package react is missing from package-lock.json"]


def test_uv_lock_rejects_moving_git_branch_or_tag():
    problems = check_dependencies.validate_uv_lock(
        'source = { git = "https://example.invalid/repo.git", branch = "main" }\n',
        "[project]\nname = 'example'\n",
    )

    assert any("moving Git branch or tag" in problem for problem in problems)
    assert any("lacks a full commit pin" in problem for problem in problems)


def test_uv_lock_accepts_native_uv_pinned_git_url():
    revision = "3" * 40
    lock = f'source = {{ git = "https://example.invalid/repo?rev={revision}#{revision}" }}\n'
    assert check_dependencies.validate_uv_lock(lock, "[project]\n") == []


def test_scan_coverage_rejects_missing_required_scope():
    result = check_dependencies.evaluate_scan_coverage(
        {"backend": "complete", "frontend": "complete", "tests": "complete"},
        required={"backend", "frontend", "tests", "hermes", "postgres_image", "minio_image", "hermes_image", "go_build_dependencies"},
    )

    assert result.missing == {"hermes", "postgres_image", "minio_image", "hermes_image", "go_build_dependencies"}
    assert not result.passed


def test_scan_coverage_does_not_pass_failed_scanner():
    result = check_dependencies.evaluate_scan_coverage(
        {"backend": "complete", "frontend": "failed", "tests": "complete"},
        required={"backend", "frontend", "tests"},
    )

    assert result.failed == {"frontend"}
    assert not result.passed


def test_one_image_scan_does_not_satisfy_other_required_image_scopes():
    result = check_dependencies.evaluate_scan_coverage(
        {"postgres_image": "complete"},
        required={"postgres_image", "minio_image", "hermes_image"},
    )

    assert result.missing == {"minio_image", "hermes_image"}
    assert not result.passed


def test_malformed_npm_success_report_is_not_zero_findings():
    try:
        security_scan.npm_findings({"metadata": {}})
    except ValueError as exc:
        assert "vulnerabilities" in str(exc)
    else:
        raise AssertionError("malformed npm audit report was accepted")


def test_trivy_database_timestamp_is_retained_with_indented_version_output():
    parsed = security_scan.parse_trivy_version(
        "Version: 0.75.0\nVulnerability DB:\n  UpdatedAt: 2026-10-03 07:01:46 +0000 UTC\n"
    )

    assert parsed == {"trivy": "0.75.0", "trivy_db_updated_at_utc": "2026-10-03 07:01:46 +0000 UTC"}


def test_container_build_manifest_rejects_mutable_base_images(tmp_path, monkeypatch):
    infra = tmp_path / "infra"
    infra.mkdir()
    (infra / "Dockerfile.worker").write_text("FROM python:3.12\n", encoding="utf-8")
    monkeypatch.setattr(check_dependencies, "ROOT", tmp_path)
    problems = []

    check_dependencies._check_container_build_inputs(problems)

    assert len(problems) == 1
    assert "base image must use an immutable digest" in problems[0]


def test_container_build_manifest_rejects_live_upstream_checkout(tmp_path, monkeypatch):
    infra = tmp_path / "infra"
    infra.mkdir()
    dockerfile = infra / "Dockerfile.minio"
    dockerfile.write_text(
        "FROM golang:1.25@sha256:" + "a" * 64 + "\nRUN git clone https://example.invalid/minio/minio.git main\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(check_dependencies, "ROOT", tmp_path)
    monkeypatch.delenv("MINIO_SOURCE_DIR", raising=False)
    problems = []

    check_dependencies._check_container_build_inputs(problems)

    assert any("immutable upstream source cache" in problem for problem in problems)
    assert any("set MINIO_SOURCE_DIR" in problem for problem in problems)


def test_runtime_version_comparison_handles_patch_releases():
    assert check_dependencies.version_at_least("24.18.0", "24.0.0")
    assert not check_dependencies.version_at_least("23.11.0", "24.0.0")
