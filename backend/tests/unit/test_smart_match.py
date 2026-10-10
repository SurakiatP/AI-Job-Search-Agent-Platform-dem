from job_search_platform.services import job_sources, smart_match
from job_search_platform.services.skill_coverage import skill_mentions


def _job(slug="a", title="Dev", company="Acme", text="", skills=(), age=1):
    return {"slug": slug, "title": title, "company": company, "description_markdown": text,
            "skills": list(skills), "age_days": age}


def _answers(role=3.0, role_conf=0.9, seniority=(0, 0, 1, 0), blocker=0.0, have=(), must=()):
    out = {"role_fit": {"score": role, "confidence": role_conf},
           "seniority_fit": {"probabilities": {str(i): p for i, p in enumerate(seniority)}},
           "hard_blocker": {"noul": blocker}}
    for i, (h, m) in enumerate(zip(have, must)):
        out[f"skill_{i}"], out[f"must_{i}"] = {"noul": h}, {"noul": m}
    return out


def test_skill_mentions_keep_alias_surface_and_order():
    found = skill_mentions("We use ReactJS with Docker และ Python")
    names = [name for _, name, _ in found]
    assert names.index("React") < names.index("Docker") < names.index("Python")
    assert dict((n, s) for _, n, s in found)["React"] == "ReactJS"


def test_job_skills_posting_order_dedups_tags_and_caps():
    job = _job(text="Docker then Python", skills=["python", "Kubernetes", "Weird Tool"])
    assert smart_match.job_skills(job)[:4] == ["Docker", "Python", "Kubernetes", "Weird Tool"]
    many = _job(text=" ".join(["Python", "SQL", "Docker", "React", "Java", "Go lang", "Kubernetes", "AWS",
                                "Azure", "GCP", "TypeScript", "Node.js", "Vue", "Angular"]))
    assert len(smart_match.job_skills(many)) == smart_match.MAX_SKILLS


def test_combine_weights_must_have_double_and_penalty():
    full = smart_match.combine(_answers(have=(1.0, 0.0), must=(1.0, 0.0)), ["Python", "Go"])
    # role 1.0, skills (2*1 + 1*0)/3, seniority 1.0 -> 0.5 + 0.3*2/3 + 0.2 = 0.9
    assert full["fit_percent"] == 90 and full["band"] == 5
    assert full["skills_evidenced"] == ["Python"] and full["nice_missing"] == ["Go"] and full["must_missing"] == []
    blocked = smart_match.combine(_answers(blocker=1.0, have=(1.0, 0.0), must=(1.0, 0.0)), ["Python", "Go"])
    assert blocked["fit_percent"] == 45 and blocked["hard_blocker"] is True


def test_combine_no_skills_uses_role_and_int_probability_keys_and_uncertain():
    answers = _answers(role=1.5, role_conf=0.3)
    answers["seniority_fit"]["probabilities"] = {0: 0.0, 1: 1.0, 2: 0.0, 3: 0.0}
    out = smart_match.combine(answers, [])
    # role 0.5, skills = role 0.5, seniority 0.5 -> 50
    assert out["fit_percent"] == 50 and out["uncertain"] is True and out["seniority"] == "below"


def test_band_edges():
    assert [smart_match.band(v) for v in (24, 25, 39, 40, 54, 55, 69, 70, 100)] == [1, 2, 2, 3, 3, 4, 4, 5, 5]


def test_pick_categories_threshold_cap_and_fallback():
    assert smart_match.pick_categories({"probabilities": {"a": 0.5, "b": 0.3, "c": 0.26}}) == ["a", "b"]
    assert smart_match.pick_categories({"probabilities": {"a": 0.2, "b": 0.1}}) == ["a"]


def test_highlight_terms_surfaces_and_unknown_names():
    out = smart_match.highlight_terms("Need ReactJS, ภาษาไทย", ["React"], ["Weird Tool"])
    assert out == {"matched": {"React": "ReactJS"}, "missing": {"Weird Tool": "Weird Tool"}}


def test_hidden_company_normalized_and_null_company_never_hidden():
    hidden = {("company", smart_match.company_key("Acme  Co")), ("job", "x")}
    assert smart_match.is_hidden(_job(slug="y", company="acme co"), hidden)
    assert smart_match.is_hidden(_job(slug="x", company=None), hidden)
    assert not smart_match.is_hidden(_job(slug="z", company=None), {("company", "")})


def test_content_hash_changes_with_description():
    assert smart_match.content_hash(_job(text="a")) != smart_match.content_hash(_job(text="b"))


def test_build_pool_splits_categories_dedups_and_sorts_newest(monkeypatch):
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        rows = {"it": [_job("s1", age=3), _job("s2", age=1)], "data": [_job("s2", age=1), _job("s3", age=0)]}
        return {"items": rows.get(kwargs["category"], []), "total": 10}

    monkeypatch.setattr(job_sources, "search_jobs", fake)
    page = smart_match.build_pool(q="", cities=[], work_mode=None, posted_within_days=None, category=None,
                                  pool=100, offset=100, cv_categories=["it", "data"])
    assert [j["slug"] for j in page["items"]] == ["s3", "s2", "s1"] and page["total"] == 20
    assert {c["limit"] for c in calls} == {50} and {c["offset"] for c in calls} == {50}
    smart_match.build_pool(q="react", cities=[], work_mode=None, posted_within_days=None, category=None,
                           pool=100, offset=0, cv_categories=["it"])
    assert calls[-1]["q"] == "react" and calls[-1]["category"] is None and calls[-1]["limit"] == 100
