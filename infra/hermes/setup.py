"""Acquire verified upstream trees and build an immutable tool image."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path.home() / ".cache/job-search-platform"
INPUTS = {
    "hermes": ("https://github.com/NousResearch/hermes-agent.git", "c8301ea6c9b797184df16a9c5dd462400b264ff4"),
    "career-ops": ("https://github.com/career-ops-hq/career-ops.git", "c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7"),
    "career-ops-docx": ("https://github.com/rubicon/career-ops-plugin-docx.git", "9252dc84c09dbb597c995190b82322109cf84805"),
}

def run(args, **kwargs):
    result = subprocess.run(args, check=False, capture_output=True, text=True, timeout=600, **kwargs)
    if result.returncode:
        raise RuntimeError(f"command_failed:{args[0]}:{result.returncode}")
    return result.stdout.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acquire", action="store_true")
    parser.add_argument("--build", action="store_true")
    options = parser.parse_args()
    CACHE.mkdir(parents=True, mode=0o700, exist_ok=True)
    manifest = {}
    for name, (url, revision) in INPUTS.items():
        source = CACHE / "upstream" / f"{name}-{revision}"
        if not source.exists():
            if not options.acquire:
                raise RuntimeError("source_missing")
            run(["git", "init", str(source)])
            run(["git", "-C", str(source), "fetch", "--depth", "1", url, revision])
            run(["git", "-C", str(source), "checkout", "--detach", revision])
        if run(["git", "-C", str(source), "rev-parse", "HEAD"]) != revision:
            raise RuntimeError("source_revision_invalid")
        if run(["git", "-C", str(source), "status", "--porcelain", "--untracked-files=all", "--ignored"]):
            raise RuntimeError("source_dirty")
        if run(["git", "-C", str(source), "submodule", "status"]):
            raise RuntimeError("unverified_submodule")
        names = run(["git", "-C", str(source), "ls-files"]).splitlines()
        digest = hashlib.sha256()
        for name_in_tree in names:
            file = source / name_in_tree
            digest.update(name_in_tree.encode())
            digest.update(file.read_bytes())
            file.chmod(file.stat().st_mode & ~0o222)
        manifest[name] = {"source": str(source), "revision": revision,
                          "files": len(names), "tree_sha256": digest.hexdigest()}
    environment = CACHE / "hermes-environment"
    environment.mkdir(mode=0o700, exist_ok=True)
    for name in ("pyproject.toml", "uv.lock", ".python-version"):
        shutil.copyfile(ROOT / "infra/hermes" / name, environment / name)
    run(["uv", "sync", "--locked", "--project", str(environment), "--python", "3.14.7", "--group", "audit"])
    manifest["environment"] = str(environment)
    manifest["python"] = run([str(environment / ".venv/bin/python"), "--version"])
    manifest["uv_lock_sha256"] = hashlib.sha256((environment / "uv.lock").read_bytes()).hexdigest()
    if options.build:
        build = CACHE / "hermes-image-build"
        build.mkdir(mode=0o700, exist_ok=True)
        archive = build / "career-ops.tar"
        subprocess.run(["git", "-C", manifest["career-ops"]["source"], "archive", "--format=tar", "-o", str(archive), INPUTS["career-ops"][1]], check=True, timeout=60)
        with tarfile.open(archive) as source_archive:
            source_archive.extractall(build / "career-ops", filter="data")
        docx_archive = build / "career-ops-docx.tar"
        subprocess.run(["git", "-C", manifest["career-ops-docx"]["source"], "archive", "--format=tar", "-o", str(docx_archive), INPUTS["career-ops-docx"][1]], check=True, timeout=60)
        with tarfile.open(docx_archive) as source_archive:
            source_archive.extractall(build / "career-ops-docx", filter="data")
        for name in ("Dockerfile", "package.json", "package-lock.json", "parser-requirements.txt", "parse_document.py", "export_pdf.mjs", "typst_render.py"):
            shutil.copyfile(ROOT / "infra/hermes" / name, build / name)
        run(["docker", "build", "--iidfile", str(build / "image-id"), "-t", "job-search-platform-hermes:core-03", str(build)])
        manifest["image"] = (build / "image-id").read_text().strip()
    existing = CACHE / "hermes-runtime.json"
    if existing.exists() and "image" not in manifest:
        manifest["image"] = json.loads(existing.read_text())["image"]
    existing.write_text(json.dumps(manifest, indent=2) + "\n")
    existing.chmod(0o600)
    print(json.dumps(manifest, sort_keys=True))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "blocked", "code": str(exc)}))
        sys.exit(1)
