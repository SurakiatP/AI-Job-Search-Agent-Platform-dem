"""Admin AI models routes against real PostgreSQL. OpenRouter and LiteLLM calls are replaced; synthetic data only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from helpers import user as make_user
from job_search_platform.api.admin import router as admin_router
from job_search_platform.api.dependencies import get_services, owner_actor, write_actor
from job_search_platform.api.rest import _http_error
from job_search_platform.db.models import AdminAuditLog, BenchmarkRun, ModelPrice, TaskModelSetting, User
from job_search_platform.services import ai_models, benchmark
from job_search_platform.services.contracts import AdminBenchmark
from job_search_platform.services.errors import ServiceError

pytestmark = pytest.mark.integration
OLD = datetime.now(timezone.utc) - timedelta(days=2)
CAT = [
    {"id": "acme/fast", "name": "Acme Fast", "context_length": 1000,
     "pricing": {"prompt": "0.00000015", "completion": "0.0000006", "input_cache_read": "0.00000003"}},
    {"id": "acme/free", "name": "Acme Free", "pricing": {"prompt": "0", "completion": "0"}},
    {"id": "acme/unpriced", "name": "Acme Mystery", "pricing": {"prompt": "-1", "completion": "-1"}},
]


@pytest.fixture
def web(db_session, migrated_engine, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-master-test")
    ai_models._cache.update(at=0.0, items=None)
    admin, plain = make_user(db_session), make_user(db_session)
    db_session.execute(update(User).where(User.id == admin.user_id).values(is_admin=True))
    db_session.commit()
    sessions = sessionmaker(bind=migrated_engine, expire_on_commit=False)
    current = {"actor": admin}
    state = SimpleNamespace(calls=[], catalog=list(CAT), gateway=[{"model_name": "ai-analyze", "model_info": {}}], down=False)

    def http(method, url, body=None, token=None, local=False):
        state.calls.append((method, url, body))
        if url == ai_models.OPENROUTER_URL:
            if state.down:
                raise OSError("down")
            return {"data": state.catalog}
        if url.endswith("/model/info"):
            return {"data": state.gateway}
        return {}
    monkeypatch.setattr(ai_models, "_http", http)
    app = FastAPI()
    app.include_router(admin_router, prefix="/v1")
    app.dependency_overrides[get_services] = lambda: SimpleNamespace(sessions=sessions)
    app.dependency_overrides[owner_actor] = app.dependency_overrides[write_actor] = lambda: current["actor"]
    app.add_exception_handler(ServiceError, lambda _r, exc: _http_error(exc))
    return SimpleNamespace(client=TestClient(app), state=state, sessions=sessions, current=current, admin=admin, plain=plain)


def audit(web):
    with web.sessions() as db:
        return [(a.action, a.target_type, a.target_id, a.detail) for a in db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at))]


def done_benchmark(web, operation, model, effort, verdict, quality=80.0):
    with web.sessions.begin() as db:
        row = BenchmarkRun(operation=operation, model=model, effort=effort, status="done", verdict=verdict, created_by=web.admin.user_id,
                           started_at=OLD, finished_at=datetime.now(timezone.utc), cases=[{"id": "c1", "state": "ok"}],
                           summary={"quality": quality, "p50_seconds": 1.0, "p95_seconds": 2.0, "cost_per_call_usd": 0.01,
                                    "cost_has_manual": False, "errors": 0, "truncations": 0})
        db.add(row)
        db.flush()
        return str(row.id)


def test_non_admin_is_refused_everywhere(web):
    web.current["actor"] = web.plain
    c = web.client
    assert c.get("/v1/admin/models/catalog").status_code == 403
    assert c.get("/v1/admin/models").status_code == 403
    assert c.post("/v1/admin/models", json={"model": "acme/fast"}).status_code == 403
    assert c.put("/v1/admin/tasks/tailor_cv", json={"model": "acme/fast", "effort": "low"}).status_code == 403
    assert c.get("/v1/admin/benchmarks").status_code == 403
    assert web.state.calls == []


def test_catalog_filters_marks_registered_and_caches(web):
    web.state.gateway.append({"model_name": "acme/free", "model_info": {}})
    items = web.client.get("/v1/admin/models/catalog").json()
    assert [i["id"] for i in items] == ["acme/fast", "acme/free", "acme/unpriced"]
    fast = items[0]
    assert (fast["price_in"], fast["price_out"], fast["price_cache"], fast["registered"]) == (0.15, 0.6, 0.03, False)
    assert items[1]["registered"] is True and items[2]["price_in"] is None
    assert [i["id"] for i in web.client.get("/v1/admin/models/catalog?q=MYSTERY").json()] == ["acme/unpriced"]  # name match
    assert [i["id"] for i in web.client.get("/v1/admin/models/catalog?q=free").json()] == ["acme/free"]
    assert sum(1 for c in web.state.calls if c[1] == ai_models.OPENROUTER_URL) == 1
    web.state.down, _ = True, ai_models._cache.update(at=0.0, items=None)
    assert web.client.get("/v1/admin/models/catalog").status_code == 503


def test_add_model_uses_openrouter_price_registers_it_and_audits(web):
    r = web.client.post("/v1/admin/models", json={"model": "acme/fast", "price_in": 99})  # official price wins over the body
    assert r.status_code == 201
    body = r.json()
    assert (body["price_in"], body["price_out"], body["price_cache"], body["price_source"], body["is_free"]) == (0.15, 0.6, 0.03, "openrouter", False)
    new = [c for c in web.state.calls if c[1].endswith("/model/new")][0]
    assert new[2]["model_name"] == "acme/fast" and new[2]["litellm_params"]["model"] == "openrouter/acme/fast"
    key = [c for c in web.state.calls if c[1].endswith("/key/update")][0]
    assert key[2]["key"] == "sk-test-gateway" and "acme/fast" in key[2]["models"]  # the app's virtual key may call it
    assert audit(web)[0][:3] == ("model.add", "model", "acme/fast")
    again = web.client.post("/v1/admin/models", json={"model": "acme/fast"})
    assert again.status_code == 201 and len([a for a in audit(web) if a[0] == "model.add"]) == 1
    free = web.client.post("/v1/admin/models", json={"model": "acme/free"}).json()
    assert free["is_free"] is True and free["price_in"] == 0
    names = {m["model"]: m for m in web.client.get("/v1/admin/models").json()}
    assert {"acme/fast", "acme/free", "ai-analyze"} <= set(names)
    assert names["acme/fast"]["used_by"] == [] and "tailor_cv" in names["ai-analyze"]["used_by"]


def test_add_model_without_official_price_needs_a_valid_manual_one(web):
    c = web.client
    assert c.post("/v1/admin/models", json={"model": "acme/unpriced"}).json()["code"] == "price_invalid"
    assert c.post("/v1/admin/models", json={"model": "acme/unpriced", "price_in": 0, "price_out": 0}).status_code == 422
    r = c.post("/v1/admin/models", json={"model": "acme/unpriced", "price_in": 1, "price_out": 2, "price_cache": 0.5})
    assert r.status_code == 201 and r.json()["price_source"] == "manual" and r.json()["price_cache"] == 0.5
    r = c.post("/v1/admin/models", json={"model": "acme/gift", "price_in": 0, "price_out": 0, "is_free": True})
    assert r.status_code == 201 and r.json()["is_free"] is True
    assert c.post("/v1/admin/models", json={"model": "bad id!", "price_in": 1, "price_out": 1}).json()["code"] == "model_invalid"
    assert c.post("/v1/admin/models", json={"model": "acme/neg", "price_in": -1, "price_out": 1}).status_code == 422


def test_litellm_price_is_the_second_source(web):
    web.state.gateway.append({"model_name": "acme/local", "model_info": {"input_cost_per_token": 2e-6, "output_cost_per_token": 4e-6}})
    r = web.client.post("/v1/admin/models", json={"model": "acme/local"}).json()
    assert (r["price_in"], r["price_out"], r["price_source"]) == (2.0, 4.0, "litellm")


def test_manual_price_then_official_appears_then_use_it(web):
    c = web.client
    c.post("/v1/admin/models", json={"model": "acme/unpriced", "price_in": 1, "price_out": 2})
    assert c.put("/v1/admin/models/price", json={"model": "nope", "price_in": 1, "price_out": 1}).status_code == 404
    assert c.put("/v1/admin/models/price", json={"model": "acme/unpriced", "price_in": 0, "price_out": 1}).json()["code"] == "price_invalid"
    r = c.put("/v1/admin/models/price", json={"model": "acme/unpriced", "price_in": 3, "price_out": 4}).json()
    assert (r["price_in"], r["price_cache"], r["price_source"], r["official_price"]) == (3.0, None, "manual", None)
    assert c.post("/v1/admin/models/use-official-price", json={"model": "acme/unpriced"}).json()["code"] == "official_price_unavailable"
    assert c.post("/v1/admin/models/use-official-price", json={"model": "nope"}).status_code == 404
    # OpenRouter now lists a price; the daily pass flags it but keeps the manual price
    web.state.catalog[2]["pricing"] = {"prompt": "0.000001", "completion": "0.000002"}
    with web.sessions.begin() as db:
        db.execute(update(ModelPrice).values(updated_at=OLD))
    ai_models._cache.update(at=0.0, items=None)
    listed = {m["model"]: m for m in c.get("/v1/admin/models").json()}["acme/unpriced"]
    assert listed["price_source"] == "manual" and listed["price_in"] == 3.0
    assert listed["official_price"] == {"price_in": 1.0, "price_out": 2.0, "price_cache": None, "source": "openrouter"}
    used = c.post("/v1/admin/models/use-official-price", json={"model": "acme/unpriced"}).json()
    assert (used["price_in"], used["price_source"], used["official_price"]) == (1.0, "openrouter", None)
    assert [a[0] for a in audit(web)] == ["model.add", "model.price", "model.price"]


def test_daily_refresh_updates_openrouter_rows_only(web):
    c = web.client
    c.post("/v1/admin/models", json={"model": "acme/fast"})
    c.post("/v1/admin/models", json={"model": "acme/unpriced", "price_in": 1, "price_out": 2})
    web.state.catalog[0]["pricing"] = {"prompt": "0.0000002", "completion": "0.0000008"}
    ai_models._cache.update(at=0.0, items=None)
    c.get("/v1/admin/models/catalog")  # fresh rows (< 24 h) are left alone
    assert {m["model"]: m for m in c.get("/v1/admin/models").json()}["acme/fast"]["price_in"] == 0.15
    with web.sessions.begin() as db:
        db.execute(update(ModelPrice).values(updated_at=OLD))
    c.get("/v1/admin/models/catalog")
    rows = {m["model"]: m for m in c.get("/v1/admin/models").json()}
    assert (rows["acme/fast"]["price_in"], rows["acme/fast"]["price_out"], rows["acme/fast"]["price_cache"]) == (0.2, 0.8, None)
    assert rows["acme/unpriced"]["price_in"] == 1.0  # manual untouched


def test_tasks_list_and_apply_rule(web, monkeypatch):
    monkeypatch.setenv("AI_MODEL_TAILOR_CV", "acme/fast")
    c = web.client
    tasks = {t["operation"]: t for t in c.get("/v1/admin/tasks").json()}
    assert len(tasks) == 9 and "document_ocr" in tasks and tasks["tailor_cv"]["source"] == "env" and tasks["tailor_cv"]["model"] == "acme/fast"
    path = "/v1/admin/tasks/tailor_cv"
    assert c.put("/v1/admin/tasks/nope", json={"model": "acme/fast", "effort": "low"}).status_code == 404
    assert c.put(path, json={"model": "bad id!", "effort": "low"}).json()["code"] == "model_invalid"
    assert c.put(path, json={"model": "acme/free", "effort": "low"}).json()["code"] == "benchmark_required"  # never tested
    green = done_benchmark(web, "tailor_cv", "acme/free", "low", "green", 91.5)
    r = c.put(path, json={"model": "acme/free", "effort": "low"})
    assert r.status_code == 200
    body = r.json()
    assert (body["model"], body["effort"], body["source"], body["benchmark_id"], body["quality"], body["cost_per_call_usd"]) == (
        "acme/free", "low", "stored", green, 91.5, 0.01)
    assert body["updated_by"] and body["updated_at"]
    old, new = audit(web)[0][3], None
    assert audit(web)[0][:3] == ("task.model", "task", "tailor_cv")
    assert old == {"old_model": "acme/fast", "old_effort": "default", "new_model": "acme/free", "new_effort": "low", "verdict": "green", "benchmark_id": green}
    # a test of another pair does not count; a red one needs the typed phrase
    assert c.put(path, json={"model": "acme/free", "effort": "high"}).json()["code"] == "benchmark_required"
    red = done_benchmark(web, "tailor_cv", "acme/fast", "high", "red", 60)
    assert c.put(path, json={"model": "acme/fast", "effort": "high"}).json()["code"] == "benchmark_required"
    assert c.put(path, json={"model": "acme/fast", "effort": "high", "confirm": "yes"}).json()["code"] == "benchmark_required"
    ok = c.put(path, json={"model": "acme/fast", "effort": "high", "confirm": ai_models.CONFIRM, "benchmark_id": red})
    assert ok.status_code == 200 and ok.json()["benchmark_id"] == red
    assert c.put(path, json={"model": "acme/free", "effort": "low", "benchmark_id": red}).json()["code"] == "benchmark_required"  # wrong pair
    with web.sessions() as db:
        assert db.get(TaskModelSetting, "tailor_cv").model == "acme/fast"


def test_task_without_gold_task_needs_phrase_and_a_known_model(web, monkeypatch):
    monkeypatch.setattr(benchmark, "SUPPORTED_OPERATIONS", benchmark.SUPPORTED_OPERATIONS - {"document_ocr"})  # every real task has a gold test now
    c = web.client
    c.post("/v1/admin/models", json={"model": "acme/fast"})
    path = "/v1/admin/tasks/document_ocr"
    assert c.put(path, json={"model": "acme/fast", "effort": "default"}).json()["code"] == "benchmark_required"
    assert c.put(path, json={"model": "typo/none", "effort": "default", "confirm": ai_models.CONFIRM}).json()["code"] == "model_invalid"
    r = c.put(path, json={"model": "acme/fast", "effort": "default", "confirm": ai_models.CONFIRM})
    assert r.status_code == 200 and r.json()["benchmark_id"] is None and r.json()["quality"] is None
    assert audit(web)[-1][3]["verdict"] == "na"


def test_benchmark_routes_call_the_service_and_audit(web, monkeypatch):
    seen = []

    def start(session, actor_id, operation, model, effort):
        seen.append((actor_id, operation, model, effort))
        row = BenchmarkRun(operation=operation, model=model, effort=effort, status="queued", created_by=actor_id, cases=[])
        session.add(row)
        session.commit()
        return AdminBenchmark(id=row.id, operation=operation, model=model, effort=effort, status="queued", cases=[], summary=None,
                              baseline=None, verdict="na", created_by=str(actor_id), started_at=None, finished_at=None)
    monkeypatch.setattr(benchmark, "start", start)
    c = web.client
    r = c.post("/v1/admin/benchmarks", json={"operation": "tailor_cv", "model": "acme/fast", "effort": "low"})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    assert seen == [(web.admin.user_id, "tailor_cv", "acme/fast", "low")]
    assert audit(web)[0][:3] == ("benchmark.start", "benchmark", r.json()["id"])
    assert c.get(f"/v1/admin/benchmarks/{r.json()['id']}").json()["model"] == "acme/fast"
    assert len(c.get("/v1/admin/benchmarks").json()) == 1 and c.get("/v1/admin/benchmarks?operation=evaluate_job").json() == []
    assert c.get("/v1/admin/benchmarks/00000000-0000-0000-0000-000000000000").status_code == 404
    assert c.post("/v1/admin/benchmarks", json={"operation": "tailor_cv", "model": "acme/fast"}).status_code == 422
