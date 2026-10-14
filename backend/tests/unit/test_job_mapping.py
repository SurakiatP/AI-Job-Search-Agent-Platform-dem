"""raw upstream posting -> store row; synthetic payloads only."""
from __future__ import annotations

from job_search_platform.services.job_mapping import map_posting


def test_freehire_keeps_slug_and_upstream_enrichment():
    row = map_posting("freehire", None, {
        "public_slug": "eng-acme-abc", "external_id": ":1", "title": "Senior Backend Engineer", "company": "Acme",
        "url": "https://Jobs.Example.test/1/?utm_source=x", "location": "Bangkok, Thailand", "cities": ["Bangkok"],
        "work_mode": "hybrid", "skills": ["python"], "posted_at": "2026-10-01T00:00:00Z",
        "description": "Build APIs", "reality": {"class": "stale"},
        "enrichment": {"category": "backend", "posting_language": "en", "seniority": "senior",
                       "salary_min": 50000, "salary_max": 80000, "salary_currency": "THB", "salary_period": "month"}})
    assert row["slug"] == "eng-acme-abc" and row["external_id"] == "eng-acme-abc"
    assert row["category"] == "backend" and row["reality_stale"] is True and row["province"] == "TH-10"
    assert row["url_key"] == "https://jobs.example.test/1" and row["salary_thb_month_min"] == 50000


def test_greenhouse_enriches_from_dictionary():
    row = map_posting("greenhouse", "acme", {
        "id": 42, "title": "โปรแกรมเมอร์ อาวุโส", "absolute_url": "https://boards.greenhouse.io/acme/jobs/42",
        "location": {"name": "Bangkok, Thailand"}, "content": "&lt;p&gt;Python และ React&lt;/p&gt;",
        "updated_at": "2026-10-02T00:00:00Z", "company_name": "Acme Co., Ltd."})
    assert row["slug"] == "gh-acme-42" and row["company"] == "Acme Co., Ltd."
    assert row["category"] == "software_engineering" and row["seniority"] == "senior"
    assert row["skills"][:2] == ["python", "react"] and row["posting_language"] == "th"
    assert row["description_markdown"] == "Python และ React" and row["cities"] == ["Bangkok"]


def test_unknown_category_is_other():
    row = map_posting("lever", "acme", {"id": "x", "text": "Synthetic Wizard", "hostedUrl": "https://l/x",
                                        "categories": {"location": "Bangkok"}})
    assert row["category"] == "other" and row["company"] == "acme"


def test_yearly_thb_salary_is_divided_and_foreign_currency_left_null():
    lever = {"id": "y", "text": "Accountant", "hostedUrl": "https://l/y", "categories": {"location": "Bangkok"},
             "salaryRange": {"min": 600000, "max": 900000, "currency": "THB", "interval": "per-year-salary"}}
    row = map_posting("lever", "acme", lever)
    assert row["salary_thb_month_min"] == 50000 and row["salary_period"] == "year"
    lever["salaryRange"]["currency"] = "USD"
    assert map_posting("lever", "acme", lever)["salary_thb_month_min"] is None


def test_missing_identity_is_none():
    assert map_posting("greenhouse", "acme", {"title": "x"}) is None


def test_content_hash_ignores_nothing_but_is_stable():
    raw = {"id": 1, "title": "Engineer", "absolute_url": "https://g/1", "location": {"name": "Bangkok"}}
    assert map_posting("greenhouse", "a", raw)["content_hash"] == map_posting("greenhouse", "a", dict(raw))["content_hash"]


def test_description_capped():
    raw = {"id": 1, "title": "Engineer", "absolute_url": "https://g/1", "location": {"name": "Bangkok"},
           "content": "x" * 60000}
    assert len(map_posting("greenhouse", "a", raw)["description_markdown"]) == 50000
