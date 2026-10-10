"""Tracing is off by default and spans never carry content."""
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from job_search_platform.integrations import tracing


def test_configure_is_a_noop_without_endpoint(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
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
