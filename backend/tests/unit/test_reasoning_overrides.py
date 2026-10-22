"""Per-operation thinking effort comes from AI_REASONING_<OPERATION> in .env; bad values are ignored."""
from job_search_platform.integrations.hermes_runtime import reasoning_overrides


def test_reads_only_known_operations_and_valid_levels():
    env = {"AI_REASONING_EXTRACT_EXPERIENCE": "low", "AI_REASONING_EVALUATE_JOB": "HIGH", "AI_REASONING_TAILOR_CV": "turbo",
           "AI_REASONING_NOT_AN_OP": "low", "AI_REASONING_APPLY_PREPARE": "default"}
    assert reasoning_overrides(env) == {"extract_experience": "low", "evaluate_job": "high", "apply_prepare": "default"}


def test_empty_environment_gives_nothing():
    assert reasoning_overrides({}) == {}


def test_model_per_operation_from_env(monkeypatch):
    from job_search_platform.integrations.gateway import GatewaySettings
    g = GatewaySettings("http://x", "k", "ai-analyze", "jev")
    monkeypatch.setenv("AI_MODEL_TAILOR_CV", "ai-fast")
    monkeypatch.setenv("AI_MODEL_APPLY_PREPARE", "bad name!")  # not a plain model name: ignored
    assert g.provider_config("tailor_cv").model == "ai-fast"
    assert g.provider_config("apply_prepare").model == "ai-analyze"
    assert g.provider_config("evaluate_job").model == "ai-analyze"
    assert g.provider_config().model == "ai-analyze"
