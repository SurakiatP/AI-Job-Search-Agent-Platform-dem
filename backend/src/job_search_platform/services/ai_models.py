"""Admin AI models: OpenRouter catalog, prices (OpenRouter, then LiteLLM, then manual), LiteLLM registration, per-task settings.

Prices are USD per 1M tokens. An empty cache price means "use the input price" at cost time. The master key is read from
env or the private dir and is never logged or returned. Every network call goes through `_http`, which tests replace.
"""
from __future__ import annotations

import json
import math
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

from sqlalchemy import select

from job_search_platform.db.models import ModelPrice, TaskModelSetting, User
from job_search_platform.integrations.gateway import _OPENER, GatewaySettings, default_private_dir, read_private_file
from job_search_platform.integrations.hermes_runtime import NATIVE_OPERATIONS
from job_search_platform.services import admin_audit
from job_search_platform.services.contracts import (
    AdminModelCatalogItem, AdminModelCreate, AdminModelPrice, AdminOfficialPrice, AdminRegisteredModel, AdminTaskSetting,
    AdminTaskUpdate)
from job_search_platform.services.errors import ServiceError

OPENROUTER_URL = "https://openrouter.ai/api/v1/models"
CATALOG_TTL = 600.0  # seconds
REFRESH_AFTER = timedelta(hours=24)
MAX_BYTES = 12_000_000
MODEL_ID = re.compile(r"[A-Za-z0-9._:/-]{1,120}")  # what GatewaySettings.provider_config accepts
TASKS = (*NATIVE_OPERATIONS, "document_ocr")
CONFIRM = "ใช้โมเดลนี้"
EFFORTS = ("none", "minimal", "low", "medium", "high", "default")

_cache: dict = {"at": 0.0, "items": None}
_lock = threading.Lock()


def _http(method: str, url: str, body: dict | None = None, token: str | None = None, local: bool = False) -> dict:
    """JSON request. `local` uses the gateway opener (no proxy, no redirects) for the LiteLLM URL."""
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(url, method=method, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with (_OPENER.open if local else urlopen)(request, timeout=10) as response:
        return json.loads(response.read(MAX_BYTES) or b"{}")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- prices ---------------------------------------------------------------------------------------------------

def _per_million(value) -> float | None:
    """Per-token price (number or numeric string) to USD per 1M tokens; None when missing, negative or not a number."""
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return round(x * 1e6, 6) if math.isfinite(x) and x >= 0 else None


def _openrouter_price(item: dict) -> dict | None:
    p = item.get("pricing") or {}
    price_in, price_out = _per_million(p.get("prompt")), _per_million(p.get("completion"))
    if price_in is None or price_out is None:
        return None
    return {"price_in": price_in, "price_out": price_out, "price_cache": _per_million(p.get("input_cache_read")), "source": "openrouter"}


def resolve_price(model: str, catalog: list[dict], litellm: dict[str, dict | None]) -> dict | None:
    """Official price: OpenRouter first, then LiteLLM model info. None means the caller must ask for a manual price."""
    for item in catalog:
        if item.get("id") == model and (price := _openrouter_price(item)):
            return price
    return litellm.get(model)


def manual_price(price_in, price_out, price_cache, is_free: bool) -> dict:
    """Validated manual price. Negative or non-number is price_invalid; a zero input/output price needs is_free."""
    def num(value, optional=False):
        if value is None and optional:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ServiceError("price_invalid")
        return float(value)
    price_in, price_out, price_cache = num(price_in), num(price_out), num(price_cache, optional=True)
    if (price_in == 0 or price_out == 0 or price_cache == 0) and not is_free:
        raise ServiceError("price_invalid")
    return {"price_in": price_in, "price_out": price_out, "price_cache": price_cache, "source": "manual"}


def check_gate(verdict: str | None, confirm: str | None) -> None:
    """Apply rule. verdict: green, red, na, or None when no finished test exists. Only green applies without the typed phrase."""
    if verdict is None or (verdict != "green" and confirm != CONFIRM):
        raise ServiceError("benchmark_required")


# ---- OpenRouter and LiteLLM -----------------------------------------------------------------------------------

def catalog_items() -> list[dict]:
    """OpenRouter model list, cached for 10 minutes. 503 when it cannot be fetched."""
    with _lock:
        if _cache["items"] is not None and time.monotonic() - _cache["at"] < CATALOG_TTL:
            return _cache["items"]
        try:
            data = _http("GET", OPENROUTER_URL)["data"]
            items = [i for i in data if isinstance(i, dict) and isinstance(i.get("id"), str)]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ServiceError("service_unavailable", retryable=True) from exc
        _cache.update(at=time.monotonic(), items=items)
        return items


def _master_key() -> str:
    return ((os.environ.get("LITELLM_MASTER_KEY") or "").strip() or read_private_file(default_private_dir(), "litellm-master-key")
            or GatewaySettings.from_env().api_key or "")


def _litellm_info() -> dict[str, dict | None]:
    """Registered gateway model name -> LiteLLM's own price (None when it has none). Empty when the gateway is unreachable."""
    key = _master_key()
    if not key:
        return {}
    try:
        data = _http("GET", GatewaySettings.from_env().base_url + "/model/info", token=key, local=True)["data"]
    except (OSError, ValueError, KeyError, TypeError):
        return {}
    out: dict[str, dict | None] = {}
    for m in data:
        name, info = m.get("model_name"), m.get("model_info") or {}
        if not isinstance(name, str) or name.startswith("gold-"):  # benchmark aliases are temporary
            continue
        price_in, price_out = _per_million(info.get("input_cost_per_token")), _per_million(info.get("output_cost_per_token"))
        known = price_in is not None and price_out is not None and (price_in > 0 or price_out > 0)
        out[name] = {"price_in": price_in, "price_out": price_out, "price_cache": _per_million(info.get("cache_read_input_token_cost")),
                     "source": "litellm"} if known else None
    return out


def _register(model: str) -> None:
    """Idempotent: adds `openrouter/<id>` to the gateway and lets the app's virtual key call it (prod's app key is the master key)."""
    key = _master_key()
    if not key:
        raise ServiceError("gateway_unconfigured")
    gateway = GatewaySettings.from_env()
    try:
        names = {m.get("model_name") for m in _http("GET", gateway.base_url + "/model/info", token=key, local=True).get("data", [])}
        if model not in names:
            upstream = model if model.startswith("openrouter/") else "openrouter/" + model
            _http("POST", gateway.base_url + "/model/new", {"model_name": model, "litellm_params": {
                "model": upstream, "api_key": "os.environ/OPENROUTER_API_KEY", "drop_params": True}}, key, local=True)
            names.add(model)
        if gateway.api_key and gateway.api_key != key:
            allowed = sorted(n for n in names if isinstance(n, str) and not n.startswith("gold-"))
            _http("POST", gateway.base_url + "/key/update", {"key": gateway.api_key, "models": allowed}, key, local=True)
    except (OSError, ValueError, AttributeError) as exc:
        raise ServiceError("service_unavailable", retryable=True) from exc


# ---- registered models ----------------------------------------------------------------------------------------

def current_pair(operation: str, row: TaskModelSetting | None) -> tuple[str, str, str]:
    """(model, effort, source): the stored setting, else AI_MODEL_<OP> / AI_REASONING_<OP> from the environment."""
    if row is not None:
        return row.model, row.effort, "stored"
    model = os.environ.get("AI_MODEL_" + operation.upper(), "").strip()
    if not MODEL_ID.fullmatch(model):
        model = os.environ.get("AI_ANALYZE_MODEL") or "ai-analyze"
    effort = os.environ.get("AI_REASONING_" + operation.upper(), "").strip().lower()
    return model, effort if effort in EFFORTS else "default", "env"


def _used_by(session) -> dict[str, list[str]]:
    rows = {r.operation: r for r in session.scalars(select(TaskModelSetting))}
    used: dict[str, list[str]] = {}
    for op in TASKS:
        used.setdefault(current_pair(op, rows.get(op))[0], []).append(op)
    return used


def _model_view(model: str, row: ModelPrice | None, used: dict, fallback: dict | None = None) -> AdminRegisteredModel:
    official = AdminOfficialPrice(**row.official_available) if row is not None and row.official_available else None
    cache = None if row is None else row.price_cache
    base = {"model": model, "official_price": official, "used_by": used.get(model, []), "is_free": bool(row and row.is_free)}
    if row is not None:
        return AdminRegisteredModel(**base, price_in=float(row.price_in), price_out=float(row.price_out),
                                    price_cache=None if cache is None else float(cache), price_source=row.source, updated_at=row.updated_at)
    f = fallback or {}  # registered in the gateway but no row of ours: show LiteLLM's price if it has one
    return AdminRegisteredModel(**base, price_in=f.get("price_in"), price_out=f.get("price_out"), price_cache=f.get("price_cache"),
                                price_source=f.get("source"), updated_at=_now())


def _get_view(session, model: str) -> AdminRegisteredModel:
    return _model_view(model, session.get(ModelPrice, model), _used_by(session))


def refresh_prices(session, items: list[dict] | None = None) -> int:
    """Rows not touched for 24 h: openrouter-sourced ones follow OpenRouter; manual ones are never overwritten, they only get
    `official_available` when OpenRouter lists a different price. Returns the number of rows changed. Cheap when nothing is due."""
    stale = list(session.scalars(select(ModelPrice).where(ModelPrice.updated_at < _now() - REFRESH_AFTER)))
    if not stale:
        return 0
    by_id = {i["id"]: _openrouter_price(i) for i in (catalog_items() if items is None else items)}
    changed = 0
    for row in stale:
        official = by_id.get(row.model)
        if official is None:
            continue
        if row.source == "openrouter":
            row.price_in, row.price_out, row.price_cache = official["price_in"], official["price_out"], official["price_cache"]
            row.is_free = official["price_in"] == 0 and official["price_out"] == 0
            row.updated_at = _now()
            changed += 1
        elif row.source == "manual":
            same = (float(row.price_in), float(row.price_out)) == (official["price_in"], official["price_out"])
            new = None if same else official
            if new != row.official_available:
                row.official_available = new
                changed += 1
    session.flush()
    return changed


def catalog(session, q: str | None) -> list[AdminModelCatalogItem]:
    items = catalog_items()
    refresh_prices(session, items)
    registered = {r for r in session.scalars(select(ModelPrice.model))} | set(_litellm_info())
    needle = (q or "").strip().lower()
    out = []
    for i in items:
        if needle and needle not in i["id"].lower() and needle not in str(i.get("name") or "").lower():
            continue
        p = _openrouter_price(i) or {}
        ctx = i.get("context_length")
        out.append(AdminModelCatalogItem(id=i["id"], name=str(i.get("name") or i["id"]), price_in=p.get("price_in"),
                                         price_out=p.get("price_out"), price_cache=p.get("price_cache"),
                                         context_length=ctx if isinstance(ctx, int) else None, registered=i["id"] in registered))
    return out


def list_models(session) -> list[AdminRegisteredModel]:
    try:
        refresh_prices(session)
    except ServiceError:
        pass  # OpenRouter down: show what we have
    rows = {r.model: r for r in session.scalars(select(ModelPrice))}
    info, used = _litellm_info(), _used_by(session)
    names = sorted(set(rows) | set(info) | set(used))
    return [_model_view(n, rows.get(n), used, info.get(n)) for n in names]


def create_model(session, actor_id, body: AdminModelCreate) -> AdminRegisteredModel:
    model = body.model.strip()
    if not MODEL_ID.fullmatch(model):
        raise ServiceError("model_invalid")
    try:
        items = catalog_items()
    except ServiceError:
        items = []  # a model can still be added with LiteLLM's or a manual price
    _register(model)
    row = session.get(ModelPrice, model)
    if row is None:
        price = resolve_price(model, items, _litellm_info()) or manual_price(body.price_in, body.price_out, body.price_cache, body.is_free)
        row = ModelPrice(model=model, price_in=price["price_in"], price_out=price["price_out"], price_cache=price["price_cache"],
                         source=price["source"], is_free=body.is_free or (price["source"] != "manual" and price["price_in"] == 0 and price["price_out"] == 0),
                         updated_at=_now())
        session.add(row)
        session.flush()
        admin_audit.record(session, actor_id, "model.add", "model", model,
                           {"source": price["source"], "price_in": price["price_in"], "price_out": price["price_out"]})
    return _get_view(session, model)


def _row_or_404(session, model: str) -> ModelPrice:
    row = session.get(ModelPrice, model)
    if row is None:
        raise ServiceError("not_found")
    return row


def set_price(session, actor_id, body: AdminModelPrice) -> AdminRegisteredModel:
    price = manual_price(body.price_in, body.price_out, body.price_cache, body.is_free)
    row = _row_or_404(session, body.model)
    row.price_in, row.price_out, row.price_cache, row.source = price["price_in"], price["price_out"], price["price_cache"], "manual"
    row.is_free, row.official_available, row.updated_at = body.is_free, None, _now()
    session.flush()
    admin_audit.record(session, actor_id, "model.price", "model", body.model,
                       {"source": "manual", "price_in": price["price_in"], "price_out": price["price_out"]})
    return _get_view(session, body.model)


def use_official_price(session, actor_id, model: str) -> AdminRegisteredModel:
    row = _row_or_404(session, model)
    official = row.official_available
    if not official:
        raise ServiceError("official_price_unavailable")  # 400 by default; the contract documents 409, see rest.py _http_error
    row.price_in, row.price_out, row.price_cache = official["price_in"], official["price_out"], official.get("price_cache")
    row.source, row.is_free = official["source"], official["price_in"] == 0 and official["price_out"] == 0
    row.official_available, row.updated_at = None, _now()
    session.flush()
    admin_audit.record(session, actor_id, "model.price", "model", model,
                       {"source": row.source, "price_in": official["price_in"], "price_out": official["price_out"]})
    return _get_view(session, model)


# ---- per-task settings ----------------------------------------------------------------------------------------

def _summary(bench) -> dict:
    s = getattr(bench, "summary", None)
    return {} if s is None else (s if isinstance(s, dict) else s.model_dump())


def _task_view(session, operation: str, row: TaskModelSetting | None, emails: dict) -> AdminTaskSetting:
    from job_search_platform.services import benchmark  # B5's module, imported late
    model, effort, source = current_pair(operation, row)
    bench = None
    if operation in benchmark.SUPPORTED_OPERATIONS:
        bench = benchmark.latest_for_pair(session, operation, model, effort)
    s = _summary(bench)
    return AdminTaskSetting(
        operation=operation, model=model, effort=effort, source=source,
        benchmark_id=row.benchmark_id if row else None, quality=s.get("quality"), cost_per_call_usd=s.get("cost_per_call_usd"),
        cost_has_manual=bool(s.get("cost_has_manual")), updated_at=row.updated_at if row else None,
        updated_by=emails.get(row.updated_by) if row else None)


def list_tasks(session) -> list[AdminTaskSetting]:
    rows = {r.operation: r for r in session.scalars(select(TaskModelSetting))}
    ids = [r.updated_by for r in rows.values() if r.updated_by]
    emails = dict(session.execute(select(User.id, User.email).where(User.id.in_(ids))).all()) if ids else {}
    return [_task_view(session, op, rows.get(op), emails) for op in TASKS]


def update_task(session, actor_id, operation: str, body: AdminTaskUpdate) -> AdminTaskSetting:
    from job_search_platform.services import benchmark
    if operation not in TASKS:
        raise ServiceError("not_found")
    model = body.model.strip()
    if not MODEL_ID.fullmatch(model):
        raise ServiceError("model_invalid")
    row = session.get(TaskModelSetting, operation)
    old = current_pair(operation, row)
    bench = None
    if operation in benchmark.SUPPORTED_OPERATIONS:
        bench = (benchmark.get(session, body.benchmark_id) if body.benchmark_id
                 else benchmark.latest_for_pair(session, operation, model, body.effort))
        if bench is not None and (bench.operation, bench.model, bench.effort, bench.status) != (operation, model, body.effort, "done"):
            bench = None
        check_gate(None if bench is None else bench.verdict, body.confirm)
    else:  # no gold task for this operation: nothing to test, so the typed phrase is the gate
        check_gate("na", body.confirm)
        if session.get(ModelPrice, model) is None and model not in _used_by(session):
            raise ServiceError("model_invalid")  # a typo here would break every run of the task
    if row is None:
        row = TaskModelSetting(operation=operation)
        session.add(row)
    row.model, row.effort, row.benchmark_id, row.updated_at, row.updated_by = model, body.effort, bench.id if bench else None, _now(), actor_id
    session.flush()
    admin_audit.record(session, actor_id, "task.model", "task", operation, {
        "old_model": old[0], "old_effort": old[1], "new_model": model, "new_effort": body.effort,
        "verdict": bench.verdict if bench else "na", "benchmark_id": str(bench.id) if bench else None})
    return _task_view(session, operation, row, {actor_id: session.scalar(select(User.email).where(User.id == actor_id))})
