"""Validate locked dependencies, runtimes, and immutable source inputs."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_SCANS = {
    "backend",
    "frontend",
    "tests",
    "hermes",
    "hermes_node",
    "postgres_image",
    "minio_image",
    "hermes_image",
    "go_build_dependencies",
    "postgres_go_build_dependencies",
    "parser_source",
}


@dataclass(frozen=True)
class CoverageResult:
    missing: set[str]
    failed: set[str]

    @property
    def passed(self) -> bool:
        return not self.missing and not self.failed


def evaluate_scan_coverage(
    statuses: dict[str, str], required: set[str] = REQUIRED_SCANS
) -> CoverageResult:
    return CoverageResult(
        missing={scope for scope in required if statuses.get(scope) in (None, "missing", "skipped")},
        failed={scope for scope in required if statuses.get(scope) not in (None, "missing", "skipped", "complete")},
    )


def version_at_least(actual: str, minimum: str) -> bool:
    def parts(value: str) -> tuple[int, ...]:
        match = re.match(r"^v?(\d+(?:\.\d+){0,3})", value.strip())
        if not match:
            raise ValueError(f"not a numeric version: {value}")
        return tuple(int(part) for part in match.group(1).split("."))

    left, right = parts(actual), parts(minimum)
    width = max(len(left), len(right))
    return left + (0,) * (width - len(left)) >= right + (0,) * (width - len(right))


def validate_npm_lock(manifest: dict[str, Any], lock: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if lock.get("lockfileVersion") != 3:
        problems.append("npm lockfileVersion must be 3")
    locked_root = lock.get("packages", {}).get("")
    if not isinstance(locked_root, dict):
        return problems + ["package-lock.json has no root package entry"]
    for section in ("dependencies", "devDependencies", "optionalDependencies"):
        expected = manifest.get(section, {})
        actual = locked_root.get(section, {})
        for name in sorted(set(expected) | set(actual)):
            if expected.get(name) != actual.get(name):
                problems.append(
                    f"root dependency {name} differs: package.json={expected.get(name)} "
                    f"package-lock.json={actual.get(name)}"
                )
        for name, spec in expected.items():
            package = lock.get("packages", {}).get(f"node_modules/{name}")
            if not isinstance(package, dict):
                problems.append(f"locked package {name} is missing from package-lock.json")
            elif re.fullmatch(r"\d+\.\d+\.\d+", str(spec)) and package.get("version") != spec:
                problems.append(f"locked package {name} version differs: expected {spec}, found {package.get('version')}")
    for name, package in lock.get("packages", {}).items():
        resolved = package.get("resolved") if isinstance(package, dict) else None
        if resolved and (resolved.startswith("git+") or resolved.startswith("github:")):
            problems.append(f"npm package {name} uses an unpinned Git source")
    return problems


def validate_uv_lock(lock_text: str, pyproject_text: str) -> list[str]:
    problems: list[str] = []
    for line_number, line in enumerate(lock_text.splitlines(), start=1):
        if "git =" not in line:
            continue
        if re.search(r"\b(branch|tag)\s*=", line):
            problems.append(f"uv.lock line {line_number} uses a moving Git branch or tag")
        revision = re.search(r'\brev\s*=\s*"([^"]+)"', line)
        pinned = bool(revision and re.fullmatch(r"[0-9a-f]{40}", revision.group(1)))
        git_url = re.search(r'\bgit\s*=\s*"([^"]+)"', line)
        if git_url:
            parsed = urlsplit(git_url.group(1))
            query = parse_qs(parsed.query)
            if "branch" in query or "tag" in query:
                problems.append(f"uv.lock line {line_number} uses a moving Git branch or tag")
            rev = query.get("rev", [""])[0]
            pinned = pinned or bool(re.fullmatch(r"[0-9a-f]{40}", rev) and parsed.fragment == rev)
        if not pinned:
            problems.append(f"uv.lock line {line_number} Git source lacks a full commit pin")
    if re.search(r"(?m)^\s*(branch|tag)\s*=", pyproject_text):
        problems.append("pyproject.toml contains an unpinned branch or tag source")
    return problems


def _run(args: list[str], *, cwd: Path = ROOT) -> str:
    result = subprocess.run(args, cwd=cwd, check=False, capture_output=True, text=True)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"{' '.join(args)} failed ({result.returncode}): {detail}")
    return result.stdout.strip()


def _runtime_checks(problems: list[str]) -> None:
    try:
        python_version = _run(["uv", "run", "--locked", "--project", "backend", "python", "--version"])
        python_version = python_version.removeprefix("Python ")
        if not version_at_least(python_version, "3.12.0") or version_at_least(python_version, "3.13.0"):
            problems.append(f"backend Python must be >=3.12,<3.13; found {python_version}")
    except (OSError, RuntimeError, ValueError) as exc:
        problems.append(f"backend Python runtime check failed: {exc}")

    for command, expected in (("node", "24.18.0"), ("npm", "11.16.0")):
        try:
            actual = _run([command, "--version"])
            if actual.removeprefix("v") != expected:
                problems.append(f"{command} must be exactly {expected}; found {actual}")
        except (OSError, RuntimeError) as exc:
            problems.append(f"{command} runtime check failed: {exc}")


def _check_upstream_sources(config: dict[str, str], problems: list[str]) -> None:
    source_env = {'hermes': 'HERMES_SOURCE_DIR', 'career-ops': 'CAREER_OPS_SOURCE_DIR', 'minio': 'MINIO_SOURCE_DIR', 'gosu': 'GOSU_SOURCE_DIR'}
    for name, env_name in source_env.items():
        path = os.environ.get(env_name)
        if not path:
            continue
        try:
            revision = _run(["git", "-C", path, "rev-parse", "HEAD"])
        except (OSError, RuntimeError) as exc:
            problems.append(f"{name} source checkout check failed: {exc}")
            continue
        if revision != config[name]:
            problems.append(f"{name} checkout must be {config[name]}; found {revision}")


def _check_container_build_inputs(problems: list[str]) -> None:
    infra = ROOT / "infra"
    if not infra.exists():
        return
    env_names = {'hermes': 'HERMES_SOURCE_DIR', 'career-ops': 'CAREER_OPS_SOURCE_DIR', 'minio': 'MINIO_SOURCE_DIR', 'gosu': 'GOSU_SOURCE_DIR'}
    for dockerfile in infra.rglob("Dockerfile*"):
        try:
            content = dockerfile.read_text(encoding="utf-8")
        except OSError as exc:
            problems.append(f"cannot read container build input {dockerfile.relative_to(ROOT)}: {exc}")
            continue
        if re.search(r"\bgit\s+(?:clone|checkout)\b", content, re.I):
            problems.append(f"{dockerfile.relative_to(ROOT)} must use an immutable upstream source cache, not a live Git checkout")
        aliases: set[str] = set()
        for line_number, line in enumerate(content.splitlines(), start=1):
            match = re.match(r"\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?", line, re.I)
            if not match:
                continue
            image, alias = match.groups()
            if image.lower() not in aliases and image.lower() != "scratch" and "@sha256:" not in image:
                problems.append(f"{dockerfile.relative_to(ROOT)}:{line_number} base image must use an immutable digest")
            if alias:
                aliases.add(alias.lower())
        lower = content.lower()
        for upstream, env_name in env_names.items():
            if upstream in lower and not os.environ.get(env_name):
                problems.append(f"{dockerfile.relative_to(ROOT)} references {upstream}; set {env_name} to its pinned source checkout")


def _upstream_pins(pyproject: str) -> dict[str, str]:
    section = re.search(
        r"(?ms)^\[tool\.job-search-platform\.upstream\]\s*\n(.*?)(?=^\[|\Z)",
        pyproject,
    )
    if not section:
        raise ValueError("missing [tool.job-search-platform.upstream]")
    pins = dict(re.findall(r'^([\w-]+)\s*=\s*"([0-9a-f]{40})"\s*$', section.group(1), re.M))
    if set(pins) != {"hermes", "career-ops", "minio", "gosu"}:
        raise ValueError("Hermes, Career Ops, MinIO, and gosu require exact 40-character commits")
    return pins


def check() -> list[str]:
    problems: list[str] = []
    backend = ROOT / "backend"
    try:
        uv_lock = (backend / "uv.lock").read_text(encoding="utf-8")
    except OSError:
        uv_lock = ""
        problems.append("backend/uv.lock is missing")
    try:
        pyproject_text = (backend / "pyproject.toml").read_text(encoding="utf-8")
        problems.extend(validate_uv_lock(uv_lock, pyproject_text))
    except OSError as exc:
        problems.append(f"backend/pyproject.toml could not be read: {exc}")

    for directory in ("frontend", "tests"):
        manifest_path = ROOT / directory / "package.json"
        lock_path = ROOT / directory / "package-lock.json"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            lock = json.loads(lock_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            problems.append(f"{directory} manifest/lock could not be read: {exc}")
            continue
        problems.extend(f"{directory}: {issue}" for issue in validate_npm_lock(manifest, lock))

    try:
        upstream = _upstream_pins((backend / "pyproject.toml").read_text(encoding="utf-8"))
        _check_upstream_sources(upstream, problems)
        _check_container_build_inputs(problems)
    except (OSError, ValueError) as exc:
        problems.append(f"upstream pin metadata is invalid: {exc}")

    _runtime_checks(problems)
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print machine-readable status")
    args = parser.parse_args()
    problems = check()
    result = {"status": "failed" if problems else "complete", "problems": problems}
    if args.json:
        print(json.dumps(result, sort_keys=True))
    elif problems:
        print("Dependency checks failed:")
        for problem in problems:
            print(f"- {problem}")
    else:
        print("Dependency locks, required runtimes, and configured upstream pins are consistent.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
