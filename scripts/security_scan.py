"""Run locked dependency and image scans; keep raw reports in the user's private cache."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from check_dependencies import REQUIRED_SCANS, evaluate_scan_coverage


ROOT = Path(__file__).resolve().parents[1]
TIMEOUT_SECONDS = 900


def evidence_directory() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    path = Path.home() / ".cache" / "job-search-platform" / "security" / stamp
    path.mkdir(mode=0o700, parents=True, exist_ok=False)
    path.chmod(0o700)
    return path


def run_command(command: list[str]) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
            timeout=TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, "", f"{type(exc).__name__}: {exc}"
    return result.returncode, result.stdout, result.stderr


def run_scan(name: str, command: list[str], output_file: Path) -> tuple[int, str]:
    code, stdout, stderr = run_command(command)
    output_file.write_text(stdout, encoding="utf-8")
    output_file.chmod(0o600)
    log_file = output_file.with_suffix(output_file.suffix + ".stderr")
    log_file.write_text(stderr, encoding="utf-8")
    log_file.chmod(0o600)
    return code, f"{name}: exit {code}"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid or missing JSON report: {exc}") from exc
    if not isinstance(report, dict):
        raise ValueError("JSON report root must be an object")
    return report


def npm_findings(report: dict[str, Any]) -> dict[str, int]:
    metadata = report.get("metadata")
    counts = metadata.get("vulnerabilities") if isinstance(metadata, dict) else None
    if not isinstance(counts, dict):
        raise ValueError("npm audit report is missing metadata.vulnerabilities")
    if not all(isinstance(counts.get(level), int) for level in ("low", "moderate", "high", "critical")):
        raise ValueError("npm audit report has invalid severity counts")
    return {level: counts[level] for level in ("low", "moderate", "high", "critical")}


def pip_findings(report: dict[str, Any]) -> tuple[int, list[str]]:
    dependencies = report.get("dependencies")
    if not isinstance(dependencies, list):
        raise ValueError("pip-audit report is missing dependencies list")
    identifiers: list[str] = []
    for dependency in dependencies:
        if not isinstance(dependency, dict) or not isinstance(dependency.get("vulns"), list):
            raise ValueError("pip-audit dependency record has an invalid vulns list")
        for vuln in dependency["vulns"]:
            if not isinstance(vuln, dict) or not isinstance(vuln.get("id"), str) or not vuln["id"]:
                raise ValueError("pip-audit dependency has an invalid vulnerability record")
            identifiers.append(vuln["id"])
    return len(identifiers), identifiers


def trivy_findings(report: dict[str, Any]) -> list[tuple[str, str, str]]:
    results = report.get("Results")
    if not isinstance(results, list):
        raise ValueError("Trivy report is missing Results list")
    findings: list[tuple[str, str, str]] = []
    for target in results:
        if not isinstance(target, dict):
            raise ValueError("Trivy Results contains an invalid target")
        vulnerabilities = target.get("Vulnerabilities") or []
        if not isinstance(vulnerabilities, list):
            raise ValueError("Trivy target has an invalid Vulnerabilities list")
        for vuln in vulnerabilities:
            if not isinstance(vuln, dict):
                raise ValueError("Trivy target has an invalid vulnerability record")
            severity = str(vuln.get("Severity", "UNKNOWN")).upper()
            if severity in {"HIGH", "CRITICAL"}:
                findings.append((str(target.get("Target", "unknown")), str(vuln.get("VulnerabilityID", "unknown")), severity))
    return findings


def _json_report(path: Path) -> dict[str, Any]:
    return _read_json(path)


def _status(code: int, valid: bool) -> str:
    return "complete" if code == 0 and valid else "failed"


def _export_requirements(project: Path, evidence: Path, *, dev: bool) -> tuple[bool, str]:
    output = evidence / f"{project.name}-locked-requirements.txt"
    command = ["uv", "export", "--locked", "--project", str(project), "--format", "requirements.txt", "--no-annotate", "--no-emit-project", "--output-file", str(output)]
    if dev:
        command.append("--all-groups")
    else:
        command.append("--no-dev")
    code, _, stderr = run_command(command)
    if code == 0 and output.is_file() and output.stat().st_size:
        output.chmod(0o600)
        return True, str(output)
    return False, stderr.strip() or "uv export failed or produced an empty requirements file"


def _scan_pip(project: Path, evidence: Path, label: str, *, dev: bool) -> tuple[str, dict[str, Any], str]:
    exported, output_or_error = _export_requirements(project, evidence, dev=dev)
    if not exported:
        return "failed", {}, f"{label} locked export failed"
    raw = evidence / f"{label}-pip-audit.json"
    auditor = ["uv", "run", "--locked", "--project", str(project)]
    if label == "hermes":
        auditor.extend(["--group", "audit"])
    code, note = run_scan(
        f"{label} pip-audit",
        [*auditor, "pip-audit", "--strict", "--requirement", output_or_error, "--no-deps", "--disable-pip", "--format", "json"],
        raw,
    )
    try:
        report = _json_report(raw)
        count, identifiers = pip_findings(report)
    except ValueError:
        return "failed", {}, f"{note}; invalid report"
    # pip-audit does not include severity in JSON; fail closed on any advisory.
    return _status(code, True), {"findings": count, "ids": identifiers}, note


def _scanner_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for label, command in (
        ("uv", ["uv", "--version"]),
        ("node", ["node", "--version"]),
        ("npm", ["npm", "--version"]),
        ("pip-audit", ["uv", "run", "--locked", "--project", "backend", "pip-audit", "--version"]),
        ("trivy", ["trivy", "--version"]),
    ):
        code, stdout, _ = run_command(command)
        output = stdout.strip()
        if code or not output:
            versions[label] = "unavailable"
        elif label == "trivy":
            versions.update(parse_trivy_version(output))
        else:
            versions[label] = output.splitlines()[0]
    return versions


def _scan_npm(scope: str, evidence: Path) -> tuple[str, dict[str, int], str]:
    raw = evidence / f"{scope}-npm-audit.json"
    code, note = run_scan(scope + " npm audit", ["npm", "audit", "--prefix", scope, "--json", "--audit-level=high"], raw)
    try:
        counts = npm_findings(_json_report(raw))
    except ValueError:
        return "failed", {}, f"{note}; invalid report"
    return _status(code, True), counts, note


def _image_id(reference: str) -> str:
    code, stdout, stderr = run_command(["docker", "image", "inspect", "--format", "{{.Id}}", reference])
    digest = stdout.strip()
    if code or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError(stderr.strip() or "Docker did not return an immutable image ID")
    return digest


def _valid_sbom(report: dict[str, Any]) -> bool:
    components = report.get("components")
    return report.get("bomFormat") == "CycloneDX" and isinstance(components, list) and bool(components)


def parse_trivy_version(output: str) -> dict[str, str]:
    version = re.search(r"(?m)^\s*Version:\s*(.+)$", output)
    database = re.search(r"(?m)^\s*UpdatedAt:\s*(.+)$", output)
    parsed = {"trivy": version.group(1).strip() if version else "unknown"}
    if database:
        parsed["trivy_db_updated_at_utc"] = database.group(1).strip()
    return parsed


def _scan_image(scope: str, reference: str, evidence: Path) -> tuple[str, dict[str, Any], list[tuple[str, str, str]], str]:
    try:
        image_id = _image_id(reference)
    except (OSError, ValueError) as exc:
        return "failed", {}, [], f"{scope}: image identity unresolved"
    raw = evidence / f"{scope}-trivy.json"
    code, note = run_scan(scope + " Trivy", ["trivy", "image", "--image-src", "docker", "--scanners", "vuln", "--format", "json", reference], raw)
    try:
        report = _json_report(raw)
        findings = trivy_findings(report)
    except ValueError:
        return "failed", {"image_id": image_id}, [], f"{note}; invalid report"
    try:
        unchanged = _image_id(reference) == image_id
    except (OSError, ValueError):
        unchanged = False
    if code or not unchanged:
        return "failed", {"image_ref": reference, "image_id": image_id}, findings, note

    sbom_file = evidence / f"{scope}-sbom.cdx.json"
    sbom_code, sbom_note = run_scan(scope + " SBOM", ["trivy", "image", "--image-src", "docker", "--format", "cyclonedx", reference], sbom_file)
    try:
        sbom_ok = sbom_code == 0 and _valid_sbom(_json_report(sbom_file)) and _image_id(reference) == image_id
    except (OSError, ValueError):
        sbom_ok = False
    return ("complete" if sbom_ok else "failed"), {"image_ref": reference, "image_id": image_id, "sbom_components": len(_json_report(sbom_file).get("components", [])) if sbom_ok else None}, findings, f"{note}; {sbom_note}"


def _scan_lock_source(scope: str, source: Path, evidence: Path) -> tuple[bool, list[tuple[str, str, str]], dict[str, Any]]:
    raw = evidence / f"{scope}-trivy-fs.json"
    code, _ = run_scan(scope + " Trivy filesystem", ["trivy", "fs", "--include-dev-deps", "--scanners", "vuln", "--format", "json", str(source)], raw)
    sbom_file = evidence / f"{scope}-sbom.cdx.json"
    sbom_code, _ = run_scan(scope + " Trivy filesystem SBOM", ["trivy", "fs", "--include-dev-deps", "--format", "cyclonedx", str(source)], sbom_file)
    try:
        findings = trivy_findings(_json_report(raw))
        sbom = _json_report(sbom_file)
        sbom_ok = _valid_sbom(sbom)
    except ValueError:
        return False, [], {}
    return code == 0 and sbom_code == 0 and sbom_ok, findings, {"sbom_components": len(sbom.get("components", [])) if sbom_ok else None}


def scan(image_refs: dict[str, str]) -> tuple[dict[str, str], list[str], dict[str, Any]]:
    evidence = evidence_directory()
    statuses: dict[str, str] = {scope: "missing" for scope in REQUIRED_SCANS}
    notes: list[str] = []
    summary: dict[str, Any] = {"evidence_directory": str(evidence), "npm": {}, "images": {}, "high_critical": []}

    hermes_project = Path(os.environ.get("HERMES_ENV_DIR", str(ROOT / "infra" / "hermes"))).resolve()
    for scope, project, dev in (("backend", ROOT / "backend", True), ("hermes", hermes_project, False)):
        if scope == "hermes" and not (project / "uv.lock").exists():
            continue
        status, data, note = _scan_pip(project, evidence, scope, dev=dev)
        statuses[scope] = status
        summary[scope] = data
        notes.append(note)

    for scope in ("frontend", "tests"):
        statuses[scope], counts, note = _scan_npm(scope, evidence)
        summary["npm"][scope] = counts
        notes.append(note)

    image_findings: list[tuple[str, str, str]] = []
    summary["source_trivy"] = {}
    lock_sources = [("backend", ROOT / "backend"), ("frontend", ROOT / "frontend"), ("tests", ROOT / "tests")]
    if (hermes_project / "uv.lock").is_file():
        lock_sources.append(("hermes", hermes_project))
    for scope, source in lock_sources:
        valid, findings, sbom = _scan_lock_source(scope, source, evidence)
        summary["source_trivy"][scope] = {**sbom, "high_critical_count": len(findings)}
        if not valid:
            statuses[scope] = "failed"
        image_findings.extend(findings)

    for scope in ("postgres_image", "minio_image", "hermes_image"):
        reference = image_refs.get(scope)
        if not reference:
            continue
        status, data, findings, note = _scan_image(scope, reference, evidence)
        statuses[scope] = status
        summary["images"][scope] = data
        image_findings.extend(findings)
        notes.append(note)

    minio_source = os.environ.get("MINIO_SOURCE_DIR")
    if minio_source and (Path(minio_source) / "go.mod").is_file():
        source = Path(minio_source)
        raw = evidence / "minio-go-trivy.json"
        code, note = run_scan("MinIO Go/build dependency Trivy", ["trivy", "fs", "--include-dev-deps", "--scanners", "vuln", "--format", "json", str(source)], raw)
        try:
            findings = trivy_findings(_json_report(raw))
            sbom_file = evidence / "minio-go-sbom.cdx.json"
            sbom_code, sbom_note = run_scan("MinIO Go SBOM", ["trivy", "fs", "--include-dev-deps", "--format", "cyclonedx", str(source)], sbom_file)
            sbom_ok = sbom_code == 0 and _valid_sbom(_json_report(sbom_file))
        except ValueError:
            findings, sbom_ok, sbom_note = [], False, "invalid report"
        statuses["go_build_dependencies"] = "complete" if code == 0 and sbom_ok else "failed"
        image_findings.extend(findings)
        notes.extend((note, sbom_note))

    summary["high_critical"] = image_findings
    coverage = evaluate_scan_coverage(statuses)
    summary["coverage"] = {"statuses": statuses, "missing": sorted(coverage.missing), "failed": sorted(coverage.failed)}
    summary["scanner_versions"] = _scanner_versions()
    return statuses, notes, summary


def _image_arguments(values: list[str]) -> dict[str, str]:
    image_refs: dict[str, str] = {}
    for value in values:
        scope, separator, reference = value.partition("=")
        if not separator or scope not in {"postgres_image", "minio_image", "hermes_image"} or not reference:
            raise ValueError("each --image must be postgres_image=REF, minio_image=REF, or hermes_image=REF")
        if scope in image_refs:
            raise ValueError(f"duplicate image scope: {scope}")
        image_refs[scope] = reference
    return image_refs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", action="append", default=[], metavar="SCOPE=REF", help="built Docker image; provide each required scope separately")
    args = parser.parse_args()
    try:
        images = _image_arguments(args.image)
    except ValueError as exc:
        parser.error(str(exc))
    statuses, notes, summary = scan(images)
    print(json.dumps(summary, sort_keys=True))
    for note in notes:
        print(note)
    npm_bad = any(counts.get("high", 0) or counts.get("critical", 0) for counts in summary["npm"].values())
    pip_bad = any(data.get("findings", 0) for name, data in summary.items() if name in {"backend", "hermes"})
    failed = bool(summary["coverage"]["missing"] or summary["coverage"]["failed"] or summary["high_critical"] or npm_bad or pip_bad)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
