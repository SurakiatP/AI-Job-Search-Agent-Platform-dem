"""Every operation the executor sends to Hermes is accepted by the runtime and has a Career Ops context in the bridge."""
import importlib.util
from pathlib import Path

from job_search_platform.integrations.hermes_runtime import NATIVE_OPERATIONS

BRIDGE = Path(__file__).resolve().parents[3] / "infra" / "hermes" / "native_bridge.py"


def test_runtime_and_bridge_accept_the_same_operations_including_practice():
    spec = importlib.util.spec_from_file_location("native_bridge_under_test", BRIDGE)
    source = BRIDGE.read_text()
    assert spec is not None and "CAREER_OPS_FILES" in source
    namespace: dict = {}
    start = source.index("CAREER_OPS_FILES = {")
    end = source.index("\n}\n", start) + 3
    exec(source[start:end], namespace)  # only the literal mapping, no bridge imports
    assert set(namespace["CAREER_OPS_FILES"]) == set(NATIVE_OPERATIONS)
    assert {"interview_generate", "interview_grade", "interview_report"} <= set(NATIVE_OPERATIONS)
