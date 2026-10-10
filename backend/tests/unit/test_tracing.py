"""Tracing is off by default and spans never carry content."""
import base64
import logging

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from job_search_platform.integrations import tracing


def test_configure_is_a_noop_without_endpoint(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)
    assert tracing.configure() is False
    with tracing.span("run.execute", operation="evaluate_job") as current:
        assert not current.is_recording()


def test_spans_carry_only_identifiers_and_numbers(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing, "_tracer", provider.get_tracer("test"))
    with tracing.span("run.execute", operation="tailor_cv", run_id="r1", project_id=None):
        tracing.record("llm.round", model="m", latency_ms=12, input_tokens=None, output_tokens=7, run_id="r1")
    spans = {s.name: dict(s.attributes) for s in exporter.get_finished_spans()}
    assert spans["run.execute"] == {"operation": "tailor_cv", "run_id": "r1"}
    assert spans["llm.round"] == {"model": "m", "latency_ms": 12, "output_tokens": 7, "run_id": "r1"}


def test_runtime_usage_validation_nulls_anything_malformed():
    from job_search_platform.integrations.hermes_runtime import _usage
    assert _usage({"model": "m", "input_tokens": 5, "output_tokens": 6}) == {"model": "m", "input_tokens": 5, "output_tokens": 6}
    assert _usage(None) == {"model": None, "input_tokens": None, "output_tokens": None}
    assert _usage({"model": "x" * 121, "input_tokens": -1, "output_tokens": True}) == {"model": None, "input_tokens": None, "output_tokens": None}


class _FakeExporter:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def export(self, spans):
        return None

    def shutdown(self):
        pass

    def force_flush(self, timeout_millis=30000):
        return True


def _keys(directory, mode=0o600, public="pk-lf-a", secret="sk-lf-b"):
    for name, value in (("langfuse-public-key", public), ("langfuse-secret-key", secret)):
        path = directory / name
        path.write_text(value + "\n")
        path.chmod(mode)


def test_langfuse_exporter_uses_trimmed_host_and_basic_auth(tmp_path, monkeypatch):
    _keys(tmp_path)
    monkeypatch.setenv("CORE02_PRIVATE_DIR", str(tmp_path))
    monkeypatch.setenv("LANGFUSE_HOST", " http://127.0.0.1:53000/ ")
    monkeypatch.setattr(tracing, "OTLPSpanExporter", _FakeExporter)
    exporter = tracing._langfuse_exporter()
    assert exporter.kwargs["endpoint"] == "http://127.0.0.1:53000/api/public/otel/v1/traces"
    assert exporter.kwargs["headers"] == {"Authorization": "Basic " + base64.b64encode(b"pk-lf-a:sk-lf-b").decode()}


@pytest.mark.parametrize("setup", ["missing", "empty", "group_readable"])
def test_langfuse_exporter_is_off_without_usable_keys(tmp_path, monkeypatch, caplog, setup):
    if setup == "empty":
        _keys(tmp_path, public="")
    if setup == "group_readable":
        _keys(tmp_path, mode=0o640)
    monkeypatch.setenv("CORE02_PRIVATE_DIR", str(tmp_path))
    monkeypatch.setenv("LANGFUSE_HOST", "http://127.0.0.1:53000")
    monkeypatch.setattr(tracing, "OTLPSpanExporter", _FakeExporter)
    with caplog.at_level(logging.WARNING):
        assert tracing._langfuse_exporter() is None
    assert "langfuse_keys_unavailable" in caplog.text
    assert "sk-lf" not in caplog.text and str(tmp_path) not in caplog.text


def _capture_provider(monkeypatch) -> list:
    installed: list = []
    monkeypatch.setattr(tracing.trace, "set_tracer_provider", installed.append)
    monkeypatch.setattr(tracing.trace, "get_tracer_provider", lambda: None)
    monkeypatch.setattr(tracing, "OTLPSpanExporter", _FakeExporter)
    return installed


def test_configure_prefers_explicit_otlp_endpoint_over_langfuse(monkeypatch):
    installed = _capture_provider(monkeypatch)
    monkeypatch.setattr(tracing, "_langfuse_exporter", lambda: pytest.fail("explicit OTLP endpoint must win"))
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318")
    monkeypatch.setenv("LANGFUSE_HOST", "http://127.0.0.1:53000")
    assert tracing.configure() is True
    assert len(installed) == 1


def test_configure_stays_off_when_langfuse_keys_unusable(monkeypatch):
    installed = _capture_provider(monkeypatch)
    monkeypatch.setattr(tracing, "_langfuse_exporter", lambda: None)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.setenv("LANGFUSE_HOST", "http://127.0.0.1:53000")
    assert tracing.configure() is False
    assert installed == []


def test_llm_round_span_is_a_langfuse_generation(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing, "_tracer", provider.get_tracer("test"))
    tracing.llm_round(run_id="r1", model="ai-analyze", latency_ms=5, input_tokens=3, output_tokens=None)
    (span,) = exporter.get_finished_spans()
    assert span.name == "llm.round"
    assert dict(span.attributes) == {
        "model": "ai-analyze", "latency_ms": 5, "input_tokens": 3, "run_id": "r1",
        "gen_ai.request.model": "ai-analyze", "gen_ai.usage.input_tokens": 3,
        "langfuse.observation.type": "generation",
    }
