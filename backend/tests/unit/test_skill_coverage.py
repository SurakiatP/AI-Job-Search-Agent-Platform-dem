from job_search_platform.services.skill_coverage import DICTIONARY_SIZE, compute_skill_coverage

JOB = "Senior engineer: React, Next.js, TypeScript and PostgreSQL. ภาษาอังกฤษ required."


def test_dictionary_is_curated_size():
    assert 150 <= DICTIONARY_SIZE <= 250


def test_aliases_thai_ordering_and_ratio():
    cv = "Built apps with ReactJS and nextjs on postgres. อ่านเขียนภาษาอังกฤษได้"
    result = compute_skill_coverage(cv, JOB)
    assert result == {
        "required": ["React", "Next.js", "TypeScript", "PostgreSQL", "English"],
        "matched": ["React", "Next.js", "PostgreSQL", "English"],
        "missing": ["TypeScript"],
        "ratio": 0.8,
        "method": "keyword_dictionary_v1",
    }


def test_case_insensitive_and_word_boundaries():
    result = compute_skill_coverage("JAVASCRIPT", "We use Java and JavaScript. Not javascripty.")
    assert result["required"] == ["Java", "JavaScript"]
    assert result["matched"] == ["JavaScript"] and result["missing"] == ["Java"]


def test_short_ambiguous_words_do_not_match():
    assert compute_skill_coverage("python sql", "A good go-getter; spring 2025; r&d in C-suite") is None
    result = compute_skill_coverage("golang", "Python and Go (golang) services")
    assert result["required"] == ["Python", "Go"] and result["matched"] == ["Go"]


def test_fewer_than_two_job_skills_returns_none():
    assert compute_skill_coverage("Python SQL", "We need Python.") is None
    assert compute_skill_coverage("Python SQL", "") is None


def test_no_cv_overlap_is_zero():
    result = compute_skill_coverage("nothing relevant", "Docker and Kubernetes")
    assert result["ratio"] == 0.0 and result["matched"] == []


def test_thai_cv_phrasing_counts_as_evidence():
    cv = "รองรับโหมดมืดและภาษาไทย/อังกฤษ ใส่ใจประสิทธิภาพ และ lazy loading"
    result = compute_skill_coverage(cv, "Fluent English and performance optimization required")
    assert result["matched"] == ["English", "Performance Optimization"]
