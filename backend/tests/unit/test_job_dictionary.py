"""WP5 Thai dictionary and dictionary-only enrichment. Synthetic text only."""
from __future__ import annotations

import pytest

from job_search_platform.services import job_dictionary as jd


def test_parser_skips_comments_and_blank_lines():
    assert jd.parse_dictionary("# head\n\nA = x, y\nB =\n") == [("A", ["x", "y"]), ("B", [])]


def test_locations_cover_all_77_provinces_with_unique_aliases():
    codes = {code for code, _ in jd._PROVINCES.values()}
    assert len(codes) == 77
    assert len(jd._PROVINCES) == len(set(jd._PROVINCES))  # alias -> province is a function


def test_locations_alias_collision_raises():
    with pytest.raises(ValueError):
        jd._build_provinces("TH-10|Bangkok = x\nTH-11|Samut Prakan = X\n")


def test_roles_aliases_unique():
    seen: set[str] = set()
    for name, pattern, _ in jd._ROLES:
        assert name not in seen, name
        seen.add(name)


@pytest.mark.parametrize("text, code", [
    ("Bangkok, Thailand", "TH-10"), ("กรุงเทพมหานคร", "TH-10"), ("กทม.", "TH-10"),
    ("Khlong Toei, Bangkok", "TH-10"), ("เขตบางรัก", "TH-10"), ("Chon Buri, Thailand", "TH-20"),
    ("ชลบุรี", "TH-20"), ("Chiang Mai", "TH-50"), ("Remote", None), (None, None),
    ("Phra Nakhon Si Ayutthaya", "TH-14"), ("Bueng Kan", "TH-38"), ("นราธิวาส", "TH-96"),
])
def test_province_of(text, code):
    found = jd.province_of(text)
    assert (found[0] if found else None) == code


@pytest.mark.parametrize("title, seniority", [
    ("Senior Backend Engineer", "senior"), ("Sr. Accountant", "senior"), ("วิศวกรอาวุโส", "senior"),
    ("Software Engineering Intern", "intern"), ("นักศึกษาฝึกงาน การตลาด", "intern"),
    ("Junior Designer", "junior"), ("Engineering Lead", "lead"), ("Head of Sales", "c_level"),
    ("Accountant", None),
])
def test_seniority_of(title, seniority):
    assert jd.seniority_of(title) == seniority


@pytest.mark.parametrize("title, category", [
    ("Backend Engineer", "backend"), ("โปรแกรมเมอร์", "software_engineering"),
    ("Senior Accountant", "finance"), ("นักบัญชี", "finance"), ("Sales Executive", "sales"),
    ("พนักงานขาย", "sales"), ("Digital Marketing Specialist", "marketing"), ("HR Business Partner", "hr"),
])
def test_role_category(title, category):
    assert jd.role_of(title)[1] == category


def test_unknown_role_is_none():
    assert jd.role_of("Synthetic Wizard of Things") is None


def test_categories_are_freehire_vocabulary():
    assert len(jd._ROLES) >= 90
    for _, _, category in jd._ROLES:
        assert category in jd.CATEGORIES


@pytest.mark.parametrize("text, mode", [
    ("Remote - Thailand", "remote"), ("ทำงานที่บ้าน", "remote"), ("Hybrid, Bangkok", "hybrid"),
    ("Bangkok office", None),
])
def test_work_mode_of(text, mode):
    assert jd.work_mode_of(text) == mode


def test_posting_language():
    assert jd.posting_language_of("รับสมัครโปรแกรมเมอร์ ด่วน Python") == "th"
    assert jd.posting_language_of("Backend engineer, Python, ภาษาไทย a plus") == "en"


def test_skills_of_are_filter_slugs_in_order_capped():
    text = "Python, React, Docker, Kubernetes, Terraform, Go via golang, Java, Kotlin, Swift, PHP"
    found = jd.skills_of(text)
    assert found[:3] == ["python", "react", "docker"] and len(found) == 8
    assert all(jd.SKILL_SLUG.match(s) for s in found)
