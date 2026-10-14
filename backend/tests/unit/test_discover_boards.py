from job_search_platform.services.job_store import discover_boards


def test_discover_parses_ats_urls_and_never_removes():
    rows = [{"url": "https://boards.greenhouse.io/acme/jobs/1"},
            {"url": "https://job-boards.greenhouse.io/beta/jobs/2?gh_src=x"},
            {"url": "https://boards.eu.greenhouse.io/eu1/jobs/4"},
            {"url": "https://job-boards.eu.greenhouse.io/eu2/jobs/5"},
            {"url": "https://boards.greenhouse.io/embed/job_board?for=emb1"},
            {"url": "https://boards.greenhouse.io/embed/job_app?for=emb2&token=9"},
            {"url": "https://boards.greenhouse.io/embed/job_board"},
            {"url": "https://jobs.lever.co/gamma/abc-123"},
            {"url": "https://jobs.smartrecruiters.com/Delta1/744000"},
            {"url": "https://boards.greenhouse.io/../evil/jobs/3"},
            {"url": "https://example.test/careers/1"}]
    out = discover_boards(rows, {"greenhouse": ["zeta"], "lever": [], "smartrecruiters": []})
    assert out == {"greenhouse": ["acme", "beta", "emb1", "emb2", "eu1", "eu2", "zeta"], "lever": ["gamma"],
                   "smartrecruiters": ["Delta1"]}
