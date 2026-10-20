"""CR-API-01: /v1 for immediate answers, /v1/async for background work, health at the root."""
from __future__ import annotations

import pytest

from test_rest_api import api_context  # noqa: F401 (fixture)

ASYNC_PATHS = {
    "/async/projects/{project_id}/agent-runs",
    "/async/projects/{project_id}/agent-runs/{run_id}/cancel",
    "/async/projects/{project_id}/agent-runs/{run_id}/cv-tailoring/apply",
    "/async/projects/{project_id}/sessions/{session_id}/messages",
    "/async/projects/{project_id}/smart-matches",
    "/async/projects/{project_id}/cvs/{cv_id}/skill-profiles",
    "/async/projects/{project_id}/cvs/{cv_id}/experience-extractions",
    "/async/projects/{project_id}/documents/{document_id}/revisions",
    "/async/projects/{project_id}/documents/{document_id}/revisions/{revision_id}/restore",
    "/async/projects/{project_id}/saved-searches/{saved_search_id}/previews",
    "/async/projects/{project_id}/webhooks/{webhook_id}/test-deliveries",
    "/async/projects/{project_id}/webhooks/deliveries/{delivery_id}/redeliveries",
    "/async/projects/{project_id}/practice-attempts/{attempt_id}/feedback",
    "/async/projects/{project_id}/practice-sets/{set_id}/report",
}


@pytest.mark.integration
def test_tc_api_01_paths_split_into_v1_and_v1_async(api_context):
    schema = api_context.client.get("/openapi.json").json()
    assert schema["servers"] == [{"url": "/v1"}]
    paths = set(schema["paths"]) - {"/health", "/health/ready"}
    assert {p for p in paths if p.startswith("/async/")} == ASYNC_PATHS
    for path in ASYNC_PATHS:
        operation = schema["paths"][path]["post"]
        assert "202" in operation["responses"], path
        assert "poll" in operation["description"].lower(), path  # AC-API-05


@pytest.mark.integration
def test_tc_api_02_health_at_the_root_without_a_session(api_context):
    client = api_context.client
    client.cookies.clear()
    live = client.get("/health")
    assert live.status_code == 200 and live.json() == {"status": "ok"}
    assert live.headers["cache-control"] == "no-store"
    ready = client.get("/health/ready")
    assert ready.status_code in (200, 503) and ready.headers["cache-control"] == "no-store"
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/health"]["servers"] == [{"url": "/"}]


@pytest.mark.integration
@pytest.mark.parametrize(("method", "old", "new"), [
    ("POST", "/api/v1/projects", "/v1/projects"),
    ("GET", "/api/v1/projects/p1/runs", "/v1/projects/p1/runs"),
    ("POST", "/api/v1/projects/p1/runs", "/v1/async/projects/p1/agent-runs"),
    ("POST", "/api/v1/projects/p1/practice-sets/s1/report", "/v1/async/projects/p1/practice-sets/s1/report"),
    ("GET", "/api/v1/health", "/health"),
])
def test_tc_api_03_old_prefix_answers_410_with_the_new_path(api_context, method, old, new):
    response = api_context.client.request(method, old)
    assert response.status_code == 410
    body = response.json()
    assert body["code"] == "api_moved" and body["fields"]["location"] == new
