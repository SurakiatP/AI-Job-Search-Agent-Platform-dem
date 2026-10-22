"""ADR-016 kill switch: the "crawl" list in job_boards.json."""
from __future__ import annotations

import json

from job_search_platform.services import job_store


def _file(tmp_path, data):
    path = tmp_path / "job_boards.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_missing_or_bad_crawl_key_means_no_crawling(tmp_path):
    assert job_store.load_crawl_sites(_file(tmp_path, {"greenhouse": []})) == []
    assert job_store.load_crawl_sites(_file(tmp_path, {"crawl": "jobbkk"})) == []


def test_only_known_sites_in_fixed_order(tmp_path):
    path = _file(tmp_path, {"crawl": ["jobbkk", "jobsdb", "jobtopgun"]})
    assert job_store.load_crawl_sites(path) == ["jobtopgun", "jobbkk"]


def test_write_boards_keeps_the_crawl_key(tmp_path):
    path = _file(tmp_path, {"crawl": ["jobbkk"], "greenhouse": ["old"], "lever": [], "smartrecruiters": []})
    job_store.write_boards({"greenhouse": ["new"], "lever": ["x"], "smartrecruiters": []}, path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["crawl"] == ["jobbkk"] and data["greenhouse"] == ["new"] and data["lever"] == ["x"]


def test_committed_file_enables_both_sites():
    assert job_store.load_crawl_sites() == ["jobtopgun", "jobbkk"]
