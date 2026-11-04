"""Model prices and one llm_calls row per model call, priced at call time (later price changes never rewrite history)."""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from job_search_platform.integrations.gateway import real_model
from job_search_platform.db.models import LlmCall, ModelPrice, Project, Run

log = logging.getLogger(__name__)
_PREFIX = "openrouter/"


def price_for(session: Session, model: str) -> tuple[Decimal, Decimal, Decimal | None, str] | None:
    """(price_in, price_out, price_cache, source) per 1M tokens, or None when unpriced. A model may be stored with
    or without the openrouter/ prefix. A free model prices at zero."""
    model = real_model(model)
    bare = model.removeprefix(_PREFIX)
    rows = {r.model: r for r in session.scalars(select(ModelPrice).where(ModelPrice.model.in_({model, bare, _PREFIX + bare})))}
    row = rows.get(model) or rows.get(bare) or rows.get(_PREFIX + bare)
    if row is None:
        return None
    if row.is_free:
        return Decimal(0), Decimal(0), Decimal(0), row.source
    return row.price_in, row.price_out, row.price_cache, row.source


def cost_usd(price: tuple | None, input_tokens: int, output_tokens: int, cached_tokens: int) -> Decimal | None:
    if price is None:
        return None
    price_in, price_out, price_cache, _ = price
    cached = min(max(cached_tokens, 0), input_tokens)
    total = (input_tokens - cached) * price_in + cached * (price_in if price_cache is None else price_cache) + output_tokens * price_out
    return (total / Decimal(1_000_000)).quantize(Decimal("0.00000001"))


def record_call(session: Session, *, run_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None, operation: str,
                model: str, input_tokens: int | None, output_tokens: int | None, cached_tokens: int | None = None,
                api_calls: int | None = None, latency_ms: int | None = None) -> LlmCall:
    """Add one llm_calls row with the price snapshot. The caller owns the transaction."""
    input_tokens, output_tokens, cached_tokens = input_tokens or 0, output_tokens or 0, cached_tokens or 0
    if user_id is None and run_id is not None:
        user_id = session.scalar(select(Project.user_id).join(Run, Run.project_id == Project.id).where(Run.id == run_id))
    price = price_for(session, model)
    row = LlmCall(run_id=run_id, user_id=user_id, operation=operation, model=model[:200], input_tokens=input_tokens,
                  output_tokens=output_tokens, cached_tokens=cached_tokens, api_calls=api_calls or 1, latency_ms=latency_ms,
                  price_in=price and price[0], price_out=price and price[1], price_cache=price and price[2],
                  price_source=price and price[3], cost_usd=cost_usd(price, input_tokens, output_tokens, cached_tokens))
    session.add(row)
    return row
