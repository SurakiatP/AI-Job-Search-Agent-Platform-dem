import sys
from pathlib import Path


ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import check_dependencies  # noqa: E402
import security_scan  # noqa: E402


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
