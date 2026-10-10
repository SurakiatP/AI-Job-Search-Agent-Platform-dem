"""Optional OpenTelemetry tracing. Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set.

Spans carry identifiers, model names, latencies and token counts only, never prompts or outputs.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

SERVICE_NAME = "job-search-platform"
_tracer = trace.get_tracer(SERVICE_NAME)


def configure() -> bool:
    """Install the OTLP HTTP exporter once; a no-op without an endpoint."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return False
    if isinstance(trace.get_tracer_provider(), TracerProvider):
        return True
    provider = TracerProvider(resource=Resource.create({"service.name": SERVICE_NAME}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    return True


@contextmanager
def span(name: str, **attrs: Any) -> Iterator[Any]:
    """Start a span with scalar attributes; None values are dropped. Cheap with the default no-op provider."""
    with _tracer.start_as_current_span(
        name, attributes={k: (str(v) if not isinstance(v, (int, float, bool, str)) else v)
                          for k, v in attrs.items() if v is not None}
    ) as current:
        yield current


def record(name: str, **attrs: Any) -> None:
    with span(name, **attrs):
        pass
