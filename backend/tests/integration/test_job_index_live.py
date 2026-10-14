"""Live Meilisearch check on a throwaway index; skipped when the service is unreachable."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from job_search_platform.integrations import meili
from job_search_platform.services import job_index, job_store
from job_search_platform.services.job_mapping import map_posting


@pytest.fixture
def live():
    try:
        client = meili.client()
        client.request("GET", "/health")
    except Exception:
        pytest.skip("meilisearch_unreachable")
    return client


@pytest.mark.integration
def test_rebuild_then_search_thai_title(live, migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    now = datetime(2026, 10, 14, tzinfo=timezone.utc)
    row = map_posting("lever", "acme", {"id": "t1", "text": "วิศวกรซอฟต์แวร์", "hostedUrl": "https://jobs.lever.co/acme/t1",
                                         "categories": {"location": "Bangkok"}, "createdAt": 1_790_899_200_000,
                                         "company": "Acme"})
    with sessions() as db, db.begin():
        job_store.apply_board(db, "lever", "acme", [row], now)
    index = f"jobs_test_{uuid.uuid4().hex}"
    try:
        assert job_index.rebuild(sessions, live, index) == 1
        result = live.search(index, {"q": "วิศวกร", "limit": 5})
        assert [h["title"] for h in result["hits"]] == ["วิศวกรซอฟต์แวร์"]
    finally:
        try:
            live.delete_index(index)
        except Exception:
            pass
