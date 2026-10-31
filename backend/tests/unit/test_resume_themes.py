"""SPEC-RTH slice 1: theme model, theme file validation, presets and the render bundle (TC-RTH-01..04)."""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from resume_samples import english_short, thai_long  # noqa: E402
from job_search_platform.services import resume as rs  # noqa: E402
from job_search_platform.services import resume_themes as rt  # noqa: E402
from test_resume import IMAGE_ID, _docker_ready  # noqa: E402

OLD_KEYS = {"accent", "lang", "references_on_request", "address", "personal", "photo"}
DROP = object()
GOOD = {"format": "jsp-resume-theme", "version": 1, "name": "My theme", "layout": "onyx",
        "tokens": {"accent": "#3730A3", "font_pair": "serif", "size": "normal", "density": "relaxed", "heading_style": "rule"}}


def _file(**changes) -> bytes:
    body = json.loads(json.dumps(GOOD))
    for key, value in changes.items():
        if key.startswith("tokens."):
            body["tokens"][key.split(".", 1)[1]] = value
        elif value is DROP:
            body.pop(key)
        else:
            body[key] = value
    return json.dumps(body).encode()


@pytest.mark.parametrize("template", ["onyx", "kakuna", "ditgar", "lotus", "teak", "saffron"])
@pytest.mark.parametrize("lang,sample", [("th", thai_long), ("en", english_short)])
def test_tc_rth_01_old_ids_keep_their_bundle(template, lang, sample):
    files = rs.render_bundle(rs.ResumeData.model_validate(sample()), template, "teal", lang)
    assert set(json.loads(files["theme.json"])) == OLD_KEYS
    assert files["main.typ"] == (rs.TEMPLATE_DIR / f"{template}.typ").read_bytes()


@pytest.mark.parametrize("changes", [
    {"extra": 1}, {"tokens.accent": "#FFFF00"}, {"tokens.accent": "red"}, {"tokens.accent": "#12345"},
    {"layout": "../x"}, {"layout": "nope"}, {"tokens.font_pair": "comic"}, {"tokens.size": "huge"},
    {"tokens.density": "tight"}, {"tokens.heading_style": "neon"}, {"tokens.extra": "x"},
    {"name": ""}, {"name": "x" * 61}, {"name": "a\u0000b"}, {"format": "other"}, {"version": 2}, {"layout": DROP},
], ids=lambda c: next(iter(c)) + "=" + str(next(iter(c.values())))[:12])
def test_tc_rth_02_bad_files_are_rejected_whole(changes):
    with pytest.raises(rt.ThemeError) as caught:
        rt.validate_file(_file(**changes))
    assert caught.value.rule


@pytest.mark.parametrize("raw", [b"not json", b"[]", b"{" + b" " * 5000 + b"}", "ธ".encode().replace(b"\xb8", b"\xff")])
def test_tc_rth_02_non_json_and_oversize_are_rejected(raw):
    with pytest.raises(rt.ThemeError):
        rt.validate_file(raw)


def test_tc_rth_02_good_file_is_accepted_and_rule_names_the_field():
    theme = rt.validate_file(_file())
    assert (theme.name, theme.layout, theme.tokens.accent) == ("My theme", "onyx", "#3730A3")
    with pytest.raises(rt.ThemeError) as caught:
        rt.validate_file(_file(**{"tokens.accent": "#FFFF00"}))
    assert "accent" in caught.value.rule


def test_tc_rth_03_export_then_import_round_trips_without_owner_data():
    theme = rt.validate_file(_file())
    raw = rt.export_file(theme.name, theme.layout, theme.tokens)
    again = rt.validate_file(raw)
    assert again == theme
    assert set(json.loads(raw)) == {"format", "version", "name", "layout", "tokens"}


def test_unique_name_adds_a_numeric_suffix():
    assert rt.unique_name("My theme", {"My theme", "My theme 2"}) == "My theme 3"
    assert rt.unique_name("Other", {"My theme"}) == "Other"


def test_twelve_presets_with_valid_layouts_and_passing_contrast():
    assert len(rt.PRESETS) == 12
    assert {"onyx", "kakuna", "ditgar", "lotus", "teak", "saffron"} <= set(rt.PRESETS)
    for key, preset in rt.PRESETS.items():
        assert preset.layout in rs.TEMPLATES and (rs.TEMPLATE_DIR / f"{preset.layout}.typ").exists(), key
        assert preset.th and preset.en, key
        rt.TokensModel.model_validate(preset.tokens)


def test_flags_are_derived_from_the_layout():
    assert rt.flags("onyx") == (True, False)
    assert rt.flags("teak") == (False, True)
    assert rt.flags("lotus") == (True, True)


def test_contrast_rule_covers_white_and_the_heading_band_tint():
    assert rt.accent_ok("#3730A3") and not rt.accent_ok("#FFFF00") and not rt.accent_ok("#9CA3AF")


def test_tokens_reach_theme_json_only_when_not_default():
    data = rs.ResumeData.model_validate(english_short())
    custom = rs.render_bundle(data, "onyx", "teal", "en", tokens={"accent": "#3730A3", "font_pair": "serif", "size": "normal",
                                                                  "density": "relaxed", "heading_style": "rule"})
    theme = json.loads(custom["theme.json"])
    assert theme["accent"] == "#3730A3"
    assert (theme["font_pair"], theme["density"], theme["heading_style"]) == ("serif", "relaxed", "rule")
    assert "size" not in theme  # default values are not written, so old output stays identical


def test_render_bundle_rejects_a_bad_layout_or_accent_in_tokens():
    data = rs.ResumeData.model_validate(english_short())
    with pytest.raises(ValueError):
        rs.render_bundle(data, "nope", "teal", "en", tokens={"accent": "#3730A3"})
    with pytest.raises(ValueError):
        rs.render_bundle(data, "onyx", "teal", "en", tokens={"accent": "javascript:1"})


@pytest.mark.skipif(not _docker_ready(), reason="needs Docker and the built Hermes image")
@pytest.mark.parametrize("preset", sorted(rt.PRESETS))
@pytest.mark.parametrize("sample,lang", [(thai_long, "th"), (english_short, "en")])
def test_tc_rth_04_every_preset_renders(preset, sample, lang, tmp_path):
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    data = rs.ResumeData.model_validate(sample())
    layout, tokens = rt.resolve(preset, "teal")
    pdf = asyncio.run(HermesRuntime(IMAGE_ID.read_text().strip()).render_typst(rs.render_bundle(data, layout, "teal", lang, tokens=tokens)))
    assert pdf.startswith(b"%PDF-")
    pdftotext = shutil.which("pdftotext") or "/opt/homebrew/bin/pdftotext"
    path = tmp_path / "cv.pdf"
    path.write_bytes(pdf)
    text = subprocess.run([pdftotext, str(path), "-"], capture_output=True, text=True).stdout
    assert data.basics.name.split()[0] in text
    assert data.basics.email in text
