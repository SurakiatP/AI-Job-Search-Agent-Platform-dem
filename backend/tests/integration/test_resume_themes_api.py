"""SPEC-RTH slice 2: theme storage and API (docs/tests/TC-RTH.md TC-RTH-02/03/05/06). Invented data only."""
from __future__ import annotations

import json

import pytest

from helpers import login_cookie, user as make_user
from resume_samples import english_short
from test_cv_builder import _new_cv, _save, _url, ctx  # noqa: F401 (fixture)
from test_rest_api import _write_headers, api_context  # noqa: F401 (fixture)

TOKENS = {"accent": "#3730A3", "font_pair": "serif", "size": "normal", "density": "relaxed", "heading_style": "band"}


def _save_theme(ctx, name="My theme", layout="onyx", tokens=None):
    return ctx.client.post("/v1/resume-themes", json={"name": name, "layout": layout, "tokens": tokens or TOKENS},
                           headers=_write_headers(ctx.csrf))


def _import(ctx, raw: bytes):
    return ctx.client.post("/v1/resume-themes/import", files={"file": ("theme.json", raw, "application/json")},
                           headers=_write_headers(ctx.csrf))


def _as_other(ctx):
    with ctx.sessions.begin() as db:
        other = make_user(db, email="other-theme@example.test").user_id
    saved = dict(ctx.client.cookies)
    cookie, csrf = login_cookie(ctx.client.app.state.services, other)
    ctx.client.cookies.set("jsp_owner_session", cookie)
    return saved, csrf


def _back(ctx, saved):
    ctx.client.cookies.clear()
    ctx.client.cookies.update(saved)


@pytest.mark.integration
def test_tc_rth_list_has_twelve_presets_and_the_old_templates_endpoint_lists_them_too(ctx):
    body = ctx.client.get("/v1/resume-themes").json()
    assert len(body["presets"]) == 12 and body["custom"] == []
    assert {"id": "teak", "layout": "teak", "ats_safe": False, "photo": True} .items() <= next(p for p in body["presets"] if p["id"] == "teak").items()
    assert len(ctx.client.get("/v1/resume-templates").json()["templates"]) == 12


@pytest.mark.integration
def test_tc_rth_03_save_export_import_round_trip(ctx):
    saved = _save_theme(ctx)
    assert saved.status_code == 201, saved.text
    theme_id = saved.json()["id"]
    exported = ctx.client.get(f"/v1/resume-themes/{theme_id}/export")
    assert exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
    file = json.loads(exported.content)
    assert set(file) == {"format", "version", "name", "layout", "tokens"} and file["name"] == "My theme"
    again = _import(ctx, exported.content)
    assert again.status_code == 201, again.text
    assert again.json()["name"] == "My theme 2" and again.json()["tokens"] == saved.json()["tokens"]
    assert _save_theme(ctx).status_code == 409  # same name


@pytest.mark.integration
@pytest.mark.parametrize("raw,rule", [
    (b"not json", "not_json"), (b'{"format":"jsp-resume-theme","version":1,"name":"x","layout":"onyx","tokens":{"accent":"#FFFF00"}}', "tokens.accent"),
    (b'{"format":"jsp-resume-theme","version":1,"name":"x","layout":"../x","tokens":{"accent":"#3730A3"}}', "layout"),
    (b'{"format":"jsp-resume-theme","version":1,"name":"x","layout":"onyx","tokens":{"accent":"#3730A3"},"extra":1}', "extra"),
    (b" " * 5000, "file_size"),
])
def test_tc_rth_02_bad_import_saves_nothing_and_names_the_rule(ctx, raw, rule):
    response = _import(ctx, raw)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "theme_invalid" and response.json()["fields"]["rule"] == rule
    assert ctx.client.get("/v1/resume-themes").json()["custom"] == []


@pytest.mark.integration
def test_tc_rth_save_rejects_bad_tokens_and_enforces_the_limit(ctx):
    assert _save_theme(ctx, tokens={**TOKENS, "accent": "#FFFF00"}).status_code == 422
    assert _save_theme(ctx, layout="nope").status_code == 422
    for number in range(20):
        assert _save_theme(ctx, name=f"Theme {number}").status_code == 201
    over = _save_theme(ctx, name="One too many")
    assert over.status_code == 409 and over.json()["code"] == "theme_limit"


@pytest.mark.integration
def test_tc_rth_use_a_custom_theme_on_a_cv_preview_publish_and_delete_block(ctx):
    theme_id = _save_theme(ctx).json()["id"]
    cv_id = _new_cv(ctx)
    style = f"custom:{theme_id}"
    saved = _save(ctx, cv_id, english_short(), template_id=style)
    assert saved.status_code == 200, saved.text
    assert saved.json()["template_id"] == style and saved.json()["ats_safe"] is True
    assert ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf)).status_code == 200
    call = ctx.render.calls[-1]
    theme = json.loads(call["theme.json"])
    assert theme["accent"] == "#3730A3" and theme["font_pair"] == "serif" and theme["heading_style"] == "band" and "size" not in theme
    assert call["main.typ"].startswith(b"// Onyx")
    blocked = ctx.client.delete(f"/v1/resume-themes/{theme_id}", headers=_write_headers(ctx.csrf))
    assert blocked.status_code == 409 and blocked.json()["code"] == "theme_in_use" and blocked.json()["fields"]["used_by"] == "1"
    # Publishing keeps the style in the revision, so it still counts after the draft switches back.
    assert ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).status_code == 201
    assert _save(ctx, cv_id, english_short(), template_id="onyx").status_code == 200
    again = ctx.client.delete(f"/v1/resume-themes/{theme_id}", headers=_write_headers(ctx.csrf))
    assert again.status_code == 409 and again.json()["fields"]["used_by"] == "1"


@pytest.mark.integration
def test_tc_rth_unused_theme_can_be_deleted(ctx):
    theme_id = _save_theme(ctx).json()["id"]
    assert ctx.client.delete(f"/v1/resume-themes/{theme_id}", headers=_write_headers(ctx.csrf)).status_code == 204
    assert ctx.client.get("/v1/resume-themes").json()["custom"] == []


@pytest.mark.integration
def test_tc_rth_05_themes_are_private_to_their_owner(ctx):
    theme_id = _save_theme(ctx).json()["id"]
    cv_id = _new_cv(ctx)
    saved, csrf = _as_other(ctx)
    assert ctx.client.get("/v1/resume-themes").json()["custom"] == []
    assert ctx.client.get(f"/v1/resume-themes/{theme_id}/export").status_code == 404
    assert ctx.client.delete(f"/v1/resume-themes/{theme_id}", headers=_write_headers(csrf)).status_code == 404
    _back(ctx, saved)
    # The owner cannot point a draft at an id that is not theirs or does not exist.
    unknown = _save(ctx, cv_id, english_short(), template_id="custom:00000000-0000-0000-0000-000000000000")
    assert unknown.status_code == 422 and unknown.json()["code"] == "resume_invalid"
    assert _save(ctx, cv_id, english_short(), template_id="custom:not-a-uuid").status_code == 422
    assert _save(ctx, cv_id, english_short(), template_id="../../x").status_code == 422


@pytest.mark.integration
def test_tc_rth_new_presets_render_with_their_layout_and_the_chosen_accent(ctx):
    cv_id = _new_cv(ctx)
    assert _save(ctx, cv_id, english_short(), template_id="banner", accent="teal").status_code == 200
    ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
    call = ctx.render.calls[-1]
    theme = json.loads(call["theme.json"])
    assert call["main.typ"].startswith(b"// Kakuna") and theme["accent"] == "#115E59" and theme["heading_style"] == "band"
    assert _save(ctx, cv_id, english_short(), template_id="kakuna", accent="teal").status_code == 200
    ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
    assert set(json.loads(ctx.render.calls[-1]["theme.json"])) - {"sample"} == {"accent", "lang", "references_on_request", "address", "personal", "photo"}


@pytest.mark.integration
def test_tc_rth_06_theme_preview_uses_unsaved_tokens_and_rejects_bad_ones(ctx):
    cv_id = _new_cv(ctx)
    assert _save(ctx, cv_id, english_short()).status_code == 200
    good = ctx.client.post(_url(ctx, cv_id, "/theme-preview"), json={"layout": "onyx", "tokens": TOKENS}, headers=_write_headers(ctx.csrf))
    assert good.status_code == 200 and good.content.startswith(b"%PDF-")
    assert json.loads(ctx.render.calls[-1]["theme.json"])["density"] == "relaxed"
    before = len(ctx.render.calls)
    bad = ctx.client.post(_url(ctx, cv_id, "/theme-preview"), json={"layout": "onyx", "tokens": {**TOKENS, "accent": "#FFFF00"}},
                          headers=_write_headers(ctx.csrf))
    assert bad.status_code == 422 and bad.json()["code"] == "theme_invalid" and len(ctx.render.calls) == before
    ctx.render.fail = True
    assert ctx.client.post(_url(ctx, cv_id, "/theme-preview"), json={"layout": "onyx", "tokens": TOKENS},
                           headers=_write_headers(ctx.csrf)).status_code == 502


@pytest.mark.integration
def test_preview_of_an_empty_cv_sends_marked_sample_content_but_never_stores_it(ctx):
    cv_id = _new_cv(ctx)
    for tail, payload in (("/preview", None), ("/theme-preview", {"layout": "onyx", "tokens": TOKENS})):
        response = ctx.client.post(_url(ctx, cv_id, tail), json=payload, headers=_write_headers(ctx.csrf)) if payload else \
            ctx.client.post(_url(ctx, cv_id, tail), headers=_write_headers(ctx.csrf))
        assert response.status_code == 200
        call = ctx.render.calls[-1]
        assert json.loads(call["theme.json"])["sample"]["parts"] == ["basics", "summary", "experience", "education", "skills"]
        assert json.loads(call["resume.json"])["basics"]["name"] == "ชื่อ นามสกุล"
    stored = ctx.client.get(_url(ctx, cv_id)).json()["resume_data"]
    assert stored["basics"]["name"] == "" and stored["sections"]["experience"]["items"] == []  # the draft itself stays empty
