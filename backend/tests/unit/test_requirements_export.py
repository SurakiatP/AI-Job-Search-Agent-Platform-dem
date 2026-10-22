"""Root requirements.txt is the pip install list for other machines; it must match backend/uv.lock."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
COMMAND = ["uv", "export", "--locked", "--project", "backend", "--no-dev", "--no-emit-project",
           "--format", "requirements-txt"]


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv not installed")
def test_requirements_txt_matches_lock():
    exported = subprocess.run(COMMAND, cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert (ROOT / "requirements.txt").read_text(encoding="utf-8") == exported, (
        "requirements.txt is stale; regenerate it with: " + " ".join(COMMAND) + " > requirements.txt")
