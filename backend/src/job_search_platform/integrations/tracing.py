"""Optional OpenTelemetry tracing: an OTLP collector or the self-hosted Langfuse; off unless configured.

Spans carry identifiers, model names, latencies and token counts only, never prompts or outputs.
"""
from __future__ import annotations

import base64
import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from job_search_platform.integrations.gateway import default_private_dir, read_private_file

logger = logging.getLogger(__name__)
SERVICE_NAME = "job-search-platform"
_tracer = trace.get_tracer(SERVICE_NAME)


def _langfuse_exporter() -> OTLPSpanExporter | None:
    """OTLP exporter for the self-hosted Langfuse, or None until its project keys exist."""
    host = os.environ.get("LANGFUSE_HOST", "").strip().rstrip("/")
    private_dir = default_private_dir()
    public = read_private_file(private_dir, "langfuse-public-key")
    secret = read_private_file(private_dir, "langfuse-secret-key")
    if not (host and public and secret):
        logger.warning("langfuse_keys_unavailable")
        return None
    token = base64.b64encode(f"{public}:{secret}".encode()).decode()
    return OTLPSpanExporter(endpoint=f"{host}/api/public/otel/v1/traces", headers={"Authorization": f"Basic {token}"})


def configure() -> bool:
    """Install one OTLP HTTP exporter: an explicit OTLP endpoint wins, else Langfuse; a no-op without either."""
    explicit = bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"))
    if not explicit and not os.environ.get("LANGFUSE_HOST", "").strip():
        return False
    if isinstance(trace.get_tracer_provider(), TracerProvider):
        return True
    exporter = OTLPSpanExporter() if explicit else _langfuse_exporter()
    if exporter is None:
        return False
    provider = TracerProvider(resource=Resource.create({"service.name": SERVICE_NAME}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
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


def llm_round(*, run_id: Any, model: str | None, latency_ms: int, input_tokens: int | None, output_tokens: int | None) -> None:
    """One llm.round span that Langfuse renders as a generation. Metadata only."""
    record("llm.round", model=model, latency_ms=latency_ms, input_tokens=input_tokens,
           output_tokens=output_tokens, run_id=run_id,
           **{"gen_ai.request.model": model, "gen_ai.usage.input_tokens": input_tokens,
              "gen_ai.usage.output_tokens": output_tokens, "langfuse.observation.type": "generation"})
