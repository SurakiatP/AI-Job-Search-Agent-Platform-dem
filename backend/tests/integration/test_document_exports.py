from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_pinned_exporters_round_trip_thai_and_english_with_checksums() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "prove_hermes.py"), "--offline"],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    proof = json.loads(result.stdout)

    exports = proof["export_artifacts"]
    assert {(item["language"], item["format"]) for item in exports} == {
        ("en", "pdf"), ("en", "docx"), ("th", "pdf"), ("th", "docx")
    }
    assert all(item["size_bytes"] > 100 and item["text_round_trip"] for item in exports)
    assert all(re.fullmatch(r"[0-9a-f]{64}", item["sha256"]) for item in exports)
    thai_pdf = next(item for item in exports if item["language"] == "th" and item["format"] == "pdf")
    assert thai_pdf["thai_font_embedded"] is True
