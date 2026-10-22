"""WP1 part 2: deploy reads Alembic state from the checkout without alembic.ini."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/migration_state.py"


def _run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=60)


def test_code_head_matches_newest_migration():
    result = _run("code-head")
    assert result.returncode == 0, result.stderr
    newest = sorted(p.stem for p in (ROOT / "backend/migrations/versions").glob("[0-9][0-9][0-9][0-9]_*.py"))[-1]
    assert result.stdout.strip() == newest


def test_knows_existing_and_unknown_revision():
    head = _run("code-head").stdout.strip()
    assert _run("knows", head).returncode == 0
    assert _run("knows", "9999_not_a_revision").returncode == 1
