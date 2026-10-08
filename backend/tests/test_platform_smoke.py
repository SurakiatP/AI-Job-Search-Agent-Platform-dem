"""A terminal API state alone must not make smoke cleanup claim native stop."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

spec = importlib.util.spec_from_file_location("platform_smoke", Path(__file__).resolve().parents[2] / "scripts" / "smoke_platform.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class Session:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def get(self, *args):
        return SimpleNamespace(status="cancelled")


@pytest.mark.asyncio
async def test_smoke_refuses_terminal_row_until_both_native_bridge_and_container_are_gone(tmp_path, monkeypatch):
    services = SimpleNamespace(sessions=Session, runtime=SimpleNamespace(workspace_root=tmp_path))
    pid, run_id = uuid4(), uuid4()
    live = {"bridge": True, "container": True}
    from job_search_platform.workers import supervisor
    import subprocess
    monkeypatch.setattr(supervisor, "_find_native_process", lambda _: (123, None) if live["bridge"] else None)
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="synthetic-container" if live["container"] else ""))
    with pytest.raises(smoke.SmokeFailure, match="native_stop_unconfirmed"):
        await smoke.confirm_native_stopped(services, pid, run_id, timeout=0.01)
    live["bridge"] = False
    with pytest.raises(smoke.SmokeFailure, match="native_stop_unconfirmed"):
        await smoke.confirm_native_stopped(services, pid, run_id, timeout=0.01)
    live["container"] = False
    await smoke.confirm_native_stopped(services, pid, run_id, timeout=0.01)
