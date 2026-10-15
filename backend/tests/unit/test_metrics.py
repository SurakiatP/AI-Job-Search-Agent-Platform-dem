"""WP1 observability: in-process metric helpers (spec: Metrics, Recorded in-process). No network."""
from __future__ import annotations

from prometheus_client import REGISTRY

from job_search_platform.integrations import metrics


def _value(name, **labels):
    return REGISTRY.get_sample_value(name, labels) or 0.0


def test_request_uses_route_template_and_status_class():
    before = _value("jsp_http_requests_total", method="GET", route="/api/v1/projects/{project_id}", status_class="2xx")
    metrics.observe_request("GET", "/api/v1/projects/{project_id}", 204, 0.01)
    after = _value("jsp_http_requests_total", method="GET", route="/api/v1/projects/{project_id}", status_class="2xx")
    assert after == before + 1
    assert _value("jsp_http_request_duration_seconds_count", method="GET", route="/api/v1/projects/{project_id}") >= 1


def test_unmatched_route_and_unknown_method_are_bucketed():
    before = _value("jsp_http_requests_total", method="OTHER", route="other", status_class="4xx")
    metrics.observe_request("BREW", None, 404, 0.001)
    metrics.observe_request("brew", "", 418, 0.001)
    assert _value("jsp_http_requests_total", method="OTHER", route="other", status_class="4xx") == before + 2


def test_run_outcome_and_duration():
    before = _value("jsp_runs_total", operation="evaluate", outcome="completed")
    metrics.observe_run("evaluate", "completed", 2.5)
    metrics.observe_run(None, None, 1.0)
    assert _value("jsp_runs_total", operation="evaluate", outcome="completed") == before + 1
    assert _value("jsp_runs_total", operation="unknown", outcome="error") >= 1
    assert _value("jsp_run_duration_seconds_count", operation="evaluate") >= 1


def test_llm_counts_tokens_only_when_reported():
    model = "m" * 150
    cut = "m" * 100
    before_in = _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="input")
    metrics.observe_llm("jev", model, 0.5, 30, None)
    assert _value("jsp_llm_requests_total", kind="jev", model=cut) >= 1
    assert _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="input") == before_in + 30
    assert _value("jsp_llm_tokens_total", kind="jev", model=cut, direction="output") == 0.0
    metrics.observe_llm("agent_round", None, 0.1, None, None)
    assert _value("jsp_llm_requests_total", kind="agent_round", model="unknown") >= 1


def test_observers_never_raise():
    metrics.observe_request(None, None, "bad", "slow")  # type: ignore[arg-type]
    metrics.observe_run("x", "y", float("nan"))
    metrics.observe_llm("jev", "m", -1, -5, "many")  # type: ignore[arg-type]


def test_kind_and_outcome_labels_are_bounded():
    before = _value("jsp_llm_requests_total", kind="unknown", model="m")
    metrics.observe_llm(None, "m", 0.1, None, None)  # type: ignore[arg-type]
    metrics.observe_llm("weird", "m", 0.1, None, None)
    assert _value("jsp_llm_requests_total", kind="unknown", model="m") == before + 2
    before = _value("jsp_runs_total", operation="evaluate", outcome="error")
    metrics.observe_run("evaluate", "bogus", 1)
    assert _value("jsp_runs_total", operation="evaluate", outcome="error") == before + 1
