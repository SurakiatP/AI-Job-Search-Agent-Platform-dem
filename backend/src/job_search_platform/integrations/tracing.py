"""Optional OpenTelemetry tracing: an OTLP collector or the self-hosted Langfuse; off unless configured.

Spans carry identifiers, model names, latencies and token counts only, never prompts or outputs.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Iterator

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)
SERVICE_NAME = "job-search-platform"
_tracer = trace.get_tracer(SERVICE_NAME)
_configured = False


def _langfuse_exporter() -> OTLPSpanExporter | None:
    """OTLP exporter for the self-hosted Langfuse, or None until its project keys exist."""
    # Local import: gateway → jev → tracing would otherwise be a cycle.
    from job_search_platform.integrations.gateway import default_private_dir, read_private_file

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
    global _tracer, _configured
    if _configured:
        return True
    exporter = OTLPSpanExporter() if explicit else _langfuse_exporter()
    if exporter is None:
        return False
    provider = TracerProvider(resource=Resource.create({"service.name": SERVICE_NAME}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    # Private provider: a global one would also export FastAPI's HTTP spans (one trace per request, query strings).
    _tracer = provider.get_tracer(SERVICE_NAME)
    _configured = True
    return True


@contextmanager
def span(name: str, start_time: int | None = None, **attrs: Any) -> Iterator[Any]:
    """Start a span with scalar attributes; None values are dropped. Cheap with the default no-op provider."""
    with _tracer.start_as_current_span(
        name, start_time=start_time, attributes={k: (str(v) if not isinstance(v, (int, float, bool, str)) else v)
                          for k, v in attrs.items() if v is not None}
    ) as current:
        yield current


def record(name: str, **attrs: Any) -> None:
    with span(name, **attrs):
        pass


def llm_round(*, run_id: Any, model: str | None, latency_ms: int, input_tokens: int | None, output_tokens: int | None) -> None:
    """One llm.round span that Langfuse renders as a generation. Metadata only."""
    with span("llm.round", model=model, latency_ms=latency_ms, input_tokens=input_tokens,
              output_tokens=output_tokens, run_id=run_id, start_time=time.time_ns() - latency_ms * 1_000_000,
              **{"gen_ai.request.model": model, "gen_ai.usage.input_tokens": input_tokens,
                 "gen_ai.usage.output_tokens": output_tokens, "langfuse.observation.type": "generation"}):
        pass


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def jev_decision(*, model: str, served_model: str | None, latency_ms: int, usage: Any) -> None:
    """One jev.decide generation with OpenRouter's reported tokens and cost. Never state, questions or answers."""
    usage = usage if isinstance(usage, dict) else {}
    input_tokens, output_tokens = _count(usage.get("input_tokens")), _count(usage.get("output_tokens"))
    cost = usage.get("cost")
    cost = float(cost) if isinstance(cost, (int, float)) and not isinstance(cost, bool) and cost >= 0 else None
    with span("jev.decide", model=model, served_model=served_model, latency_ms=latency_ms,
              input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost,
              start_time=time.time_ns() - latency_ms * 1_000_000,
              **{"gen_ai.request.model": model, "gen_ai.usage.input_tokens": input_tokens,
                 "gen_ai.usage.output_tokens": output_tokens, "gen_ai.usage.cost": cost,
                 "langfuse.observation.cost_details": json.dumps({"total": cost}) if cost is not None else None,
                 "langfuse.observation.type": "generation"}):
        pass
