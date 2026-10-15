"""WP1 observability: real SQL over a migrated database, and the loopback listener serving the registry."""
from __future__ import annotations

import socket
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from job_search_platform.api.dependencies import Services
from job_search_platform.db.models import IngestRun, JobPosting
from job_search_platform.integrations import metrics
from job_search_platform.main import create_app

NOW = datetime.now(timezone.utc)


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _posting(source, ext, canonical=None):
    return JobPosting(id=uuid.uuid4(), source=source, external_id=ext, slug=f"{source}-{ext}", title="Engineer",
                      source_url=f"https://example.test/{ext}", first_seen_at=NOW, last_seen_at=NOW,
                      content_hash="h", updated_at=NOW, canonical_id=canonical)


@pytest.mark.integration
def test_collector_sql_against_migrated_database(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        first = _posting("jobbkk", "1")
        db.add(first)
        db.flush()
        db.add_all([_posting("jobbkk", "2"), _posting("greenhouse", "3", canonical=first.id)])
        db.add(IngestRun(id=uuid.uuid4(), started_at=NOW - timedelta(minutes=5), finished_at=NOW, status="ok",
                         per_board={"crawl:jobbkk": {"state": "ok", "fetched": 2, "created": 2, "deleted": 0}}))
    collector = metrics.ScrapeCollector(sessions, lambda: 0)
    values = {(s.name, tuple(sorted(s.labels.items()))): s.value for m in collector.collect() for s in m.samples}
    assert values[("jsp_db_up", ())] == 1
    assert values[("jsp_job_postings", (("source", "jobbkk"),))] == 2
    assert ("jsp_job_postings", (("source", "greenhouse"),)) not in values  # non-canonical rows are excluded
    assert values[("jsp_ingest_source_state", (("source", "jobbkk"), ("state", "ok")))] == 1


class _Async:
    async def start(self):
        pass

    async def close(self):
        pass

    async def reconcile_pending(self):
        pass


def test_listener_serves_registry_on_loopback_and_app_has_no_metrics_route(monkeypatch):
    port = _free_port()
    monkeypatch.setenv("METRICS_PORT", str(port))
    monkeypatch.setattr(metrics, "meili_probe", lambda: 5)
    services = Services(sessions=lambda: (_ for _ in ()).throw(RuntimeError("no db")), owner_sessions=None,
                        files=_Async(), documents=None, runs=None, grants=None, settings=None, approvals=None,
                        supervisor=_Async(), runtime=_Async(), queue=None)
    with TestClient(create_app(services)) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/metrics").status_code == 404  # never on the app port
        body = urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=5).read().decode()
        assert 'jsp_http_requests_total{method="GET",route="/health",status_class="2xx"}' in body
        assert "jsp_db_up 0.0" in body and "jsp_search_documents 5.0" in body
    with pytest.raises(OSError):
        urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=2)  # stopped with the app


def test_bad_metrics_host_fails_startup(monkeypatch):
    monkeypatch.setenv("METRICS_PORT", str(_free_port()))
    monkeypatch.setenv("METRICS_HOST", "0.0.0.0")
    services = Services(sessions=None, owner_sessions=None, files=_Async(), documents=None, runs=None, grants=None,
                        settings=None, approvals=None, supervisor=_Async(), runtime=_Async(), queue=None)
    with pytest.raises(ValueError, match="metrics_host_not_loopback"):
        with TestClient(create_app(services)):
            pass


def test_listener_bind_failure_is_not_fatal(monkeypatch):
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        monkeypatch.setenv("METRICS_PORT", str(busy.getsockname()[1]))
        services = Services(sessions=None, owner_sessions=None, files=_Async(), documents=None, runs=None,
                            grants=None, settings=None, approvals=None, supervisor=_Async(), runtime=_Async(),
                            queue=None)
        with TestClient(create_app(services)) as client:
            assert client.get("/api/v1/health").status_code == 200
