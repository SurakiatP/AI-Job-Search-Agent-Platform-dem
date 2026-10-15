"""WP1 observability: scrape-time collector, source grouping, cache and failure rules. Fake sessions only."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from prometheus_client import CollectorRegistry

from job_search_platform import config
from job_search_platform.integrations import metrics


@pytest.mark.parametrize("key,source", [
    ("freehire:-", "freehire"), ("greenhouse:agoda", "greenhouse"), ("lever:x", "lever"),
    ("smartrecruiters:y", "smartrecruiters"), ("crawl:jobtopgun", "jobtopgun"), ("crawl:jobbkk", "jobbkk"),
    ("index", None), ("", None), ("crawl:", None), ("unknown:z", None),
])
def test_source_of(key, source):
    assert metrics.source_of(key) == source


T1 = datetime(2026, 10, 15, 3, tzinfo=timezone.utc)
T0 = datetime(2026, 10, 15, 2, tzinfo=timezone.utc)
RUNS = [  # newest first
    SimpleNamespace(status="partial", finished_at=T1, per_board={
        "greenhouse:a": {"state": "failed", "error": "status_500"},
        "greenhouse:b": {"state": "ok", "fetched": 3, "created": 1, "deleted": 0},
        "crawl:jobbkk": {"state": "failed", "error": "http_429", "fetched": 2, "created": 2, "deleted": 0},
        "index": {"state": "ok"}, "freehire:-": "garbage"}),
    SimpleNamespace(status="ok", finished_at=T0, per_board={
        "crawl:jobbkk": {"state": "ok", "fetched": 5, "created": 5, "deleted": 1}}),
]


class _Db:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, 0

    def __call__(self):
        return self

    def __enter__(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("db down")
        return self

    def __exit__(self, *exc):
        return False


def _collector(db, probe=lambda: 1234, clock=None):
    collector = metrics.ScrapeCollector(db, probe, clock=clock or (lambda: 0.0), ttl=30.0)
    collector._query = lambda session: {  # the SQL is covered by the integration test
        "runs_in_state": {"queued": 2, "running": 1}, "postings": {"jobbkk": 7, "greenhouse": 3},
        "last_run": {"ok": T0.timestamp(), "partial": T1.timestamp()}, "recent_runs": RUNS}
    registry = CollectorRegistry()
    registry.register(collector)
    return collector, registry


def test_collector_reports_sources_with_any_ok_rule():
    _, registry = _collector(_Db())
    get = registry.get_sample_value
    assert get("jsp_db_up") == 1 and get("jsp_search_up") == 1 and get("jsp_search_documents") == 1234
    assert get("jsp_runs_in_state", {"status": "queued"}) == 2
    assert get("jsp_job_postings", {"source": "jobbkk"}) == 7
    assert get("jsp_ingest_source_state", {"source": "greenhouse", "state": "ok"}) == 1
    assert get("jsp_ingest_source_state", {"source": "greenhouse", "state": "failed"}) == 0
    assert get("jsp_ingest_source_state", {"source": "jobbkk", "state": "failed"}) == 1
    assert get("jsp_ingest_source_rows", {"source": "greenhouse", "kind": "fetched"}) == 3
    assert get("jsp_ingest_source_last_success_timestamp_seconds", {"source": "jobbkk"}) == T0.timestamp()
    assert get("jsp_ingest_source_last_success_timestamp_seconds", {"source": "greenhouse"}) == T1.timestamp()
    assert get("jsp_ingest_last_run_timestamp_seconds", {"status": "partial"}) == T1.timestamp()
    assert get("jsp_ingest_source_state", {"source": "index", "state": "ok"}) is None


def test_collector_caches_for_ttl():
    now = [0.0]
    db = _Db()
    _, registry = _collector(db, clock=lambda: now[0])
    registry.get_sample_value("jsp_db_up")
    registry.get_sample_value("jsp_db_up")
    now[0] = 29.0
    registry.get_sample_value("jsp_db_up")
    assert db.calls == 1
    now[0] = 31.0
    registry.get_sample_value("jsp_db_up")
    assert db.calls == 2


def test_db_failure_reports_down_and_omits_series():
    _, registry = _collector(_Db(fail=True))
    assert registry.get_sample_value("jsp_db_up") == 0
    assert registry.get_sample_value("jsp_runs_in_state", {"status": "queued"}) is None
    assert registry.get_sample_value("jsp_search_up") == 1


def test_search_failure_reports_down():
    def broken():
        raise OSError("refused")
    _, registry = _collector(_Db(), probe=broken)
    assert registry.get_sample_value("jsp_search_up") == 0
    assert registry.get_sample_value("jsp_search_documents") is None
    assert registry.get_sample_value("jsp_db_up") == 1


def test_metrics_config(monkeypatch):
    monkeypatch.delenv("METRICS_PORT", raising=False)
    monkeypatch.delenv("METRICS_HOST", raising=False)
    assert config.metrics_port() is None and config.metrics_host() == "127.0.0.1"
    monkeypatch.setenv("METRICS_PORT", "59464")
    monkeypatch.setenv("METRICS_HOST", "::1")
    assert config.metrics_port() == 59464 and config.metrics_host() == "::1"
    for bad in ("0.0.0.0", "192.168.1.5", "example.test", "::"):
        monkeypatch.setenv("METRICS_HOST", bad)
        with pytest.raises(ValueError, match="metrics_host_not_loopback"):
            config.metrics_host()


def test_concurrent_scrape_does_not_wait_for_rebuild():
    import threading
    entered, release = threading.Event(), threading.Event()
    collector, _ = _collector(_Db())

    def slow():
        entered.set()
        release.wait(5)
        return []
    collector._build = slow
    worker = threading.Thread(target=collector.collect)
    worker.start()
    assert entered.wait(5)
    names = {f.name for f in collector.collect()}  # no cache yet
    assert names == {"jsp_db_up", "jsp_search_up"}
    release.set()
    worker.join(5)
    collector._families = [metrics.GaugeMetricFamily("jsp_db_up", "x", value=1)]
    collector._at = None
    entered.clear()
    release.clear()
    worker = threading.Thread(target=collector.collect)
    worker.start()
    assert entered.wait(5)
    assert [f.name for f in collector.collect()] == ["jsp_db_up"]  # previous cache
    release.set()
    worker.join(5)


def test_meili_probe_uses_two_second_timeout(monkeypatch):
    from job_search_platform.integrations import meili
    seen = []

    def transport(method, url, headers, body, timeout):
        seen.append(timeout)
        return 200, b'{"numberOfDocuments": 7}'
    monkeypatch.setattr(meili, "client", lambda: meili.Meili("http://x", "k", transport=transport))
    assert metrics.meili_probe() == 7 and seen == [2]


def test_failed_bind_does_not_leak_registration():
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        s.listen()
        port = s.getsockname()[1]
        with pytest.raises(OSError):
            metrics.start_listener("127.0.0.1", port, _Db(), lambda: 1)
    with socket.socket() as f:
        f.bind(("127.0.0.1", 0))
        free = f.getsockname()[1]
    metrics.start_listener("127.0.0.1", free, _Db(), lambda: 1)()
