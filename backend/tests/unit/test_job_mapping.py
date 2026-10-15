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


def test_match_key_capped_at_700():
    for company, title in (("C" * 2000, "Engineer"), ("ß" * 300, "ß" * 300)):
        row = map_posting("greenhouse", "a", {"id": 1, "title": title, "absolute_url": "https://g/1",
                                              "company_name": company, "location": {"name": "Bangkok"}})
        assert row["match_key"] and len(row["match_key"]) <= 700


import pytest

_OK = {"title": "Engineer", "absolute_url": "https://g/1", "id": 1}


@pytest.mark.parametrize("source,raw", [
    ("greenhouse", "nope"), ("greenhouse", None), ("greenhouse", {**_OK, "location": "Bangkok"}),
    ("smartrecruiters", {"id": "1", "name": "Eng", "ref": "https://s/1", "company": "Acme"}),
    ("smartrecruiters", {"id": "1", "name": "Eng", "ref": "https://s/1", "detail": {"jobAd": "x"}}),
    ("smartrecruiters", {"id": "1", "name": "Eng", "ref": "https://s/1", "typeOfEmployment": "full"}),
    ("freehire", {"public_slug": "s", "title": "Eng", "url": "https://f/1", "reality": "stale"}),
    ("freehire", {"public_slug": "s", "title": "Eng", "url": "https://f/1", "enrichment": {"category": ["x"]}}),
    ("freehire", {"public_slug": "s", "title": "Eng", "url": "https://f/1", "enrichment": {"category": {"a": 1}}}),
    ("lever", {"id": "x", "text": "Eng", "hostedUrl": "https://l/x", "createdAt": 10**20}),
    ("lever", {"id": "x", "text": "Eng", "hostedUrl": "https://l/x", "salaryRange": {"min": 1, "currency": 5, "interval": 7}}),
    ("freehire", {"public_slug": "s", "title": "Eng", "url": "https://f/1", "enrichment": {"salary_min": 1, "salary_currency": 5}}),
    ("freehire", {"public_slug": "s", "title": "Eng", "url": "https://f/1", "enrichment": {"salary_min": 1, "salary_currency": ["T"], "salary_period": ["x"]}}),
])
def test_malformed_shapes_never_raise(source, raw):
    row = map_posting(source, "acme", raw)
    assert row is None or isinstance(row, dict)
    if row:
        assert isinstance(row["category"], str)
        assert row["posted_at"] is None or source != "lever"


def _key(title, **extra):
    return map_posting("greenhouse", "a", {"id": 1, "title": title, "absolute_url": "https://g/1",
                                           "company_name": "Acme", "location": {"name": "Bangkok"}, **extra})["match_key"]


def test_match_key_separates_seniority():
    assert _key("Senior Software Engineer") != _key("Junior Software Engineer")
    assert _key("Software Engineer Intern") != _key("Senior Software Engineer")


def test_match_key_same_seniority_across_aliases_equal():
    assert _key("Senior Software Engineer") == _key("Sr. Software Engineer")
    assert _key("Senior Software Engineer") == _key("อาวุโส Software Engineer")


def _ld(**extra):
    posting = {"@type": "JobPosting", "title": "Data Engineer", "datePosted": "2026-10-14",
               "hiringOrganization": {"name": "Acme Co., Ltd."},
               "jobLocation": {"address": {"addressLocality": "Pathum Wan", "addressRegion": "Bangkok"}},
               "description": "<p>Build pipelines. Call 080-000-0000</p>", "employmentType": "FULL_TIME"}
    posting.update(extra)
    return posting


def test_jobtopgun_posting_maps_json_ld():
    row = map_posting("jobtopgun", None, {"id": "j12-254", "url": "https://www.jobtopgun.com/th/jobs/j12-254",
                                          "posting": _ld(validThrough="2026-10-22", employmentType="INTERN",
                                                         responsibilities="<li>Write SQL</li>",
                                                         baseSalary={"currency": "THB", "value": {
                                                             "value": "negotiable", "unitText": "MONTH"}})})
    assert row["slug"] == "jtg-j12-254" and row["external_id"] == "j12-254" and row["board"] is None
    assert row["company"] == "Acme Co., Ltd." and row["location"] == "Pathum Wan, Bangkok"
    assert row["cities"] == ["Bangkok"] and row["employment_type"] == "internship"
    assert row["valid_through"] == "2026-10-22T23:59:59+07:00" and row["posted_at"] == "2026-10-14"
    assert row["salary_min"] is None and row["salary_thb_month_min"] is None
    assert "Responsibilities" in row["description_markdown"] and "080-000-0000" in row["description_markdown"]


def test_jobbkk_posting_maps_numeric_salary_and_location_list():
    row = map_posting("jobbkk", None, {"id": "1331612", "url": "https://www.jobbkk.com/jobs/detail/157154/1331612",
                                       "posting": _ld(jobLocation=[{"address": {"addressRegion": "Bangkok"}}],
                                                      validThrough="2027-04-18T00:00:00+07:00",
                                                      employmentType=["CONTRACTOR"],
                                                      baseSalary={"currency": "THB", "value": {
                                                          "minValue": 16000, "maxValue": 17000, "unitText": "MONTH"}})})
    assert row["slug"] == "bkk-1331612" and row["source_url"].endswith("/157154/1331612")
    assert (row["salary_min"], row["salary_max"], row["salary_thb_month_min"]) == (16000, 17000, 16000)
    assert row["employment_type"] == "contract" and row["valid_through"] == "2027-04-18T00:00:00+07:00"


def test_crawled_posting_without_title_is_rejected():
    assert map_posting("jobbkk", None, {"id": "1", "url": "https://www.jobbkk.com/jobs/detail/1/1",
                                        "posting": _ld(title="")}) is None


def test_other_sources_have_no_valid_through_key():
    row = map_posting("greenhouse", "acme", {"id": 1, "title": "Engineer", "absolute_url": "https://g/1",
                                             "location": {"name": "Bangkok"}})
    assert "valid_through" not in row
