"""Native checks use actual pinned sources and Docker, never a fake agent."""
from pathlib import Path
import subprocess
import sys

from job_search_platform.integrations.hermes_runtime import validate_source, RuntimeErrorCode, HermesRuntime
import pytest

ROOT = Path(__file__).resolve().parents[3]

def test_missing_revision_is_rejected(tmp_path):
    subprocess.run(["git", "init", str(tmp_path)], check=True, capture_output=True)
    with pytest.raises(RuntimeErrorCode, match="source_revision_invalid"):
        validate_source(tmp_path, "c8301ea6c9b797184df16a9c5dd462400b264ff4")

def test_image_requires_a_real_digest():
    with pytest.raises(RuntimeErrorCode, match="image_not_pinned"):
        HermesRuntime("sha256:invalid")

def test_private_existing_state_directory(tmp_path):
    state = tmp_path / "state"
    state.mkdir(mode=0o755)
    HermesRuntime._private_directory(state, tmp_path)
    assert state.stat().st_mode & 0o777 == 0o700

def test_private_state_rejects_external_symlink(tmp_path):
    trusted = tmp_path / "trusted"
    trusted.mkdir()
    external = tmp_path / "external"
    external.mkdir(mode=0o755)
    (trusted / "state").symlink_to(external, target_is_directory=True)
    with pytest.raises(RuntimeErrorCode, match="state_path_invalid"):
        HermesRuntime._private_directory(trusted / "state", trusted)
    assert external.stat().st_mode & 0o777 == 0o755

def test_native_offline_proof():
    result = subprocess.run([sys.executable, str(ROOT / "scripts/prove_hermes.py"), "--offline"],
                            capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '"native_tool_isolation": "complete"' in result.stdout


def test_submit_accepts_extract_experience(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from uuid import uuid4
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    runtime = HermesRuntime.__new__(HermesRuntime)
    project_id = uuid4()
    runtime.projects = {project_id: SimpleNamespace(tool_gate=None, terminal_received=True)}
    sent = {}

    async def request(_project, method, **payload):
        sent.update(method=method, **payload)
        return {"accepted": True}
    monkeypatch.setattr(runtime, "_request", request)
    asyncio.run(runtime.submit(project_id, uuid4(), "p", "i", None, operation="extract_experience"))
    assert sent["operation"] == "extract_experience"
