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


def test_practice_runs_ask_for_low_reasoning_and_others_keep_the_model_default():
    # Measured 2026-10-20: ~90% of interview_generate output tokens were hidden reasoning (4-5 min).
    source = BRIDGE.read_text()
    start = source.index("REASONING = {")
    namespace: dict = {}
    exec(source[start:source.index("\n}\n", start) + 3], namespace)
    reasoning = namespace["REASONING"]
    low = {"extra_body": {"reasoning": {"effort": "low"}}}
    assert all(reasoning.get(op) == low for op in ("interview_generate", "interview_grade", "interview_report"))
    assert reasoning.get("evaluate_job") is None and reasoning.get("tailor_cv") is None
    assert 'request_overrides=REASONING.get(request.get("operation"))' in source


def test_hermes_default_effort_is_made_to_agree_with_the_env_override():
    """Hermes sends reasoning_effort (default medium) at the top level; a different reasoning.effort in extra_body
    makes OpenRouter answer 400 (seen with gpt-6-luna). The agent must be given the same effort as its config."""
    source = (Path(__file__).resolve().parents[3] / "infra" / "hermes" / "native_bridge.py").read_text()
    assert "reasoning_config=" in source and "_wire_reasoning(" in source
    start = source.index("def _wire_reasoning(")
    namespace = {}
    exec(source[start: source.index("\n\n\n", start)], namespace)
    wire = namespace["_wire_reasoning"]
    assert wire({"extra_body": {"reasoning": {"effort": "low"}}}) == {"enabled": True, "effort": "low"}
    assert wire({"extra_body": {"reasoning": {"effort": "high"}}}) == {"enabled": True, "effort": "high"}
    assert wire(None) is None and wire({}) is None
