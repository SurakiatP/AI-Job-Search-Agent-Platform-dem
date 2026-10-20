"""Resume data helpers and the three Typst templates (TC-CVB-04/06, template render checks)."""
from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from resume_samples import english_short, thai_long  # noqa: E402
from job_search_platform.services import resume as rs  # noqa: E402

IMAGE_ID = Path.home() / ".cache/job-search-platform/hermes-image-build/image-id"


def _luminance(hexcode: str) -> float:
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexcode[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def test_accents_pass_wcag_aa_on_white_both_ways():
    for name, hexcode in rs.ACCENTS.items():
        ratio = (1.0 + 0.05) / (_luminance(hexcode) + 0.05)
        assert ratio >= 4.5, (name, round(ratio, 2))


def test_tc_cvb_06_plain_text_and_facts_skip_references_and_hidden_sections():
    data = rs.ResumeData.model_validate(thai_long())
    data.sections.projects.hidden = True
    text = rs.plain_text(data, "th")
    assert "สมหญิง" not in text and "referee@example.test" not in text
    assert "ระบบพยากรณ์ยอดขาย" not in text and "ประสบการณ์ทำงาน" in text
    facts = rs.bank_facts(data, "th")
    assert facts and not any("สมหญิง" in fact["text"] for fact in facts)
    assert all(1 <= len(fact["text"]) <= 1000 for fact in facts)


def test_order_keeps_every_section_once():
    data = rs.ResumeData.model_validate({"order": ["skills", "summary"]})
    assert data.order[:2] == ["skills", "summary"] and sorted(data.order) == sorted(rs.SECTIONS)


def _docker_ready() -> bool:
    if not IMAGE_ID.exists() or shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "info"], capture_output=True, timeout=20).returncode == 0


@pytest.mark.skipif(not _docker_ready(), reason="needs Docker and the built Hermes image")
@pytest.mark.parametrize("template", sorted(rs.TEMPLATES))
@pytest.mark.parametrize("sample,lang", [(thai_long, "th"), (english_short, "en")])
def test_template_renders_a_pdf_with_every_heading(template, sample, lang, tmp_path):
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    runtime = HermesRuntime(IMAGE_ID.read_text().strip())
    data = rs.ResumeData.model_validate(sample())
    pdf = asyncio.run(runtime.render_typst(rs.render_bundle(data, template, "teal", lang)))
    assert pdf.startswith(b"%PDF-")
    path = tmp_path / "cv.pdf"
    path.write_bytes(pdf)
    pdftotext = shutil.which("pdftotext") or "/opt/homebrew/bin/pdftotext"
    if not os.path.exists(pdftotext):
        pytest.skip("pdftotext not installed")
    text = subprocess.run([pdftotext, str(path), "-"], capture_output=True, text=True).stdout
    labels = rs.LABELS[lang]
    for name in data.order:
        section_items = [] if name in ("summary", "personal") else getattr(data.sections, name).items
        if (name == "summary" and data.summary.content) or section_items:
            assert labels[name] in text, (template, name)
    assert data.basics.email in text


def test_tc_cvb_08_edits_land_only_in_summary_and_bullets():
    data = rs.ResumeData.model_validate(thai_long())
    first = data.sections.experience.items[0].highlights[0]
    edits = [{"find": first, "text": first + "\n- ใช้ Python วิเคราะห์ข้อมูล", "evidence_ids": []},
             {"find": "", "text": "- นำเสนอผลต่อผู้บริหาร", "evidence_ids": []},
             {"find": "สมชาย ตัวอย่าง", "text": "คนอื่น", "evidence_ids": []},
             {"find": "บริษัท ตัวอย่าง จำกัด", "text": "บริษัทอื่น", "evidence_ids": []},
             {"find": "2023-01", "text": "2019-01", "evidence_ids": []}]
    new, placed, unplaced = rs.apply_text_edits(data, edits)
    highlights = new.sections.experience.items[0].highlights
    assert highlights[0] == first and highlights[1] == "ใช้ Python วิเคราะห์ข้อมูล"
    assert highlights[-1] == "นำเสนอผลต่อผู้บริหาร" and len(placed) == 2 and len(unplaced) == 3
    assert new.basics == data.basics and new.sections.experience.items[0].company == "บริษัท ตัวอย่าง จำกัด"
    assert new.sections.experience.items[0].start == "2023-01"


def _thai_address(full: bool = False) -> rs.ResumeData:
    data = rs.ResumeData.model_validate(english_short())
    data.basics.address = rs.Address(line="99/1 ถ.สุขุมวิท", subdistrict="บางนาใต้", district="บางนา", province="TH-10", postcode="10260")
    data.basics.address_full = full
    return data


def test_cr02_thai_address_shows_district_and_province_unless_full_is_chosen():
    assert rs.address_text(_thai_address(), "th") == "บางนา, กรุงเทพมหานคร"
    assert rs.address_text(_thai_address(), "en") == "บางนา, Bangkok"
    assert rs.address_text(_thai_address(full=True), "th") == "99/1 ถ.สุขุมวิท, บางนาใต้, บางนา, กรุงเทพมหานคร 10260"
    legacy = rs.ResumeData.model_validate(english_short())  # drafts saved before CR-02 keep their location text
    assert rs.address_text(legacy, "en") == legacy.basics.location
    with pytest.raises(ValueError):
        rs.Address(province="Bangkok")  # province is an ISO code from the list
    with pytest.raises(ValueError):
        rs.Address(postcode="1026")


def test_cr02_personal_details_are_hidden_by_default_and_never_reach_ai():
    data = _thai_address(full=True)
    data.personal = rs.Personal(birth_date="15 มีนาคม 2541", nationality="ไทย", military_status="ผ่านการเกณฑ์ทหารแล้ว",
                                line_id="line-secret-id", expected_salary="45,000 บาท")
    assert data.personal_hidden is True
    data.personal_hidden = False
    text = rs.plain_text(data, "th")
    for secret in ("15 มีนาคม 2541", "line-secret-id", "45,000", "99/1", "10260", "บางนาใต้"):
        assert secret not in text, secret
    assert "บางนา, กรุงเทพมหานคร" in text  # the short place is fine for matching jobs by location
    assert "personal" in data.order and data.order.index("personal") == 1


def test_cr02_render_bundle_carries_the_address_and_personal_rows():
    data = _thai_address()
    data.personal = rs.Personal(nationality="ไทย")
    data.personal_hidden = False
    theme = __import__("json").loads(rs.render_bundle(data, "onyx", "teal", "th")["theme.json"])
    assert theme["address"] == "บางนา, กรุงเทพมหานคร"
    assert theme["personal"] == [["สัญชาติ", "ไทย"]]
    data.personal_hidden = True
    assert __import__("json").loads(rs.render_bundle(data, "onyx", "teal", "th")["theme.json"])["personal"] == []


@pytest.mark.skipif(not _docker_ready(), reason="needs Docker and the built Hermes image")
@pytest.mark.parametrize("template", sorted(rs.TEMPLATES))
def test_cr02_long_cv_has_page_footer_address_and_personal_details(template, tmp_path):
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    data = rs.ResumeData.model_validate(english_short())
    from uuid import uuid4
    base = data.sections.experience.items[0]
    lines = [f"Delivered measurable improvement number {n} across the platform and its users" for n in range(5)]
    data.sections.experience.items = [base.model_copy(update={"id": str(uuid4()), "highlights": lines}) for _ in range(12)]
    data.basics.address = rs.Address(district="Bang Na", province="TH-10")
    data.personal = rs.Personal(nationality="Thai")
    data.personal_hidden = False
    runtime = HermesRuntime(IMAGE_ID.read_text().strip())
    pdf = asyncio.run(runtime.render_typst(rs.render_bundle(data, template, "teal", "en")))
    path = tmp_path / "cv.pdf"
    path.write_bytes(pdf)
    pdftotext = shutil.which("pdftotext") or "/opt/homebrew/bin/pdftotext"
    if not os.path.exists(pdftotext):
        pytest.skip("pdftotext not installed")
    pages = subprocess.run([pdftotext, str(path), "-"], capture_output=True, text=True).stdout.split("\f")
    pages = [p for p in pages if p.strip()]
    assert len(pages) >= 2
    assert "Bang Na, Bangkok" in pages[0] and "Personal details" in pages[0] and "Thai" in pages[0]
    assert "Page 1/" not in pages[0]
    assert f"Page 2/{len(pages)}" in pages[1] and data.basics.name in pages[1]


@pytest.mark.skipif(not _docker_ready(), reason="needs Docker and the built Hermes image")
@pytest.mark.xfail(strict=True, raises=AssertionError, reason=(
    "Known upstream bug: Typst/krilla writes the whole Thai cluster for each mark glyph the font repositions, "
    "so copied or ATS-extracted text repeats it ('ชั่' -> 'ชั่ชั่'). Seen on Typst 0.14.2 and 0.15.1 with every "
    "Thai font tried; https://github.com/LaurenzV/krilla/issues/411. Strict: when an upgrade fixes it this "
    "test starts passing and fails the run, so drop the marker then."))
def test_thai_pdf_text_layer_matches_the_source_text(tmp_path):
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    runtime = HermesRuntime(IMAGE_ID.read_text().strip())
    pdf = asyncio.run(runtime.render_typst(rs.render_bundle(rs.ResumeData.model_validate(thai_long()), "onyx", "teal", "th")))
    path = tmp_path / "cv.pdf"
    path.write_bytes(pdf)
    pdftotext = shutil.which("pdftotext") or "/opt/homebrew/bin/pdftotext"
    if not os.path.exists(pdftotext):
        pytest.skip("pdftotext not installed")
    text = subprocess.run([pdftotext, str(path), "-"], capture_output=True, text=True).stdout
    for word in ("ใช้ติดตาม", "ชั่วโมง", "ตัวชี้วัด"):
        assert word in text, word
