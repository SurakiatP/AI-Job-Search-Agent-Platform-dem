"""CR-CVT-01 part 2: CV photo and photo templates (docs/superpowers/specs/2026-10-20-cv-trash-and-photo-templates-design.md)."""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from job_search_platform.db.models import CVRevisionText
from resume_samples import english_short
from test_cv_builder import _new_cv, _save, _url, ctx  # noqa: F401 (fixture)
from test_rest_api import _write_headers, api_context  # noqa: F401 (fixture)

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x01" * 2000 + b"\xff\xd9"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 500


def _photo(ctx, body, name="me.jpg", kind="image/jpeg", pid=None):
    return ctx.client.post(f"/v1/projects/{pid or ctx.pid}/resume-photos", files={"file": (name, body, kind)},
                           headers=_write_headers(ctx.csrf))


def _with_photo(photo_id):
    data = english_short()
    data["basics"]["photo"] = photo_id
    return data


@pytest.mark.integration
def test_ac_cvp_01_photo_reaches_photo_templates_only(ctx):
    uploaded = _photo(ctx, JPEG)
    assert uploaded.status_code == 201, uploaded.text
    photo_id = uploaded.json()["id"]
    shown = ctx.client.get(f"/v1/projects/{ctx.pid}/resume-photos/{photo_id}")
    assert shown.status_code == 200 and shown.content == JPEG and shown.headers["content-type"] == "image/jpeg"

    cv_id = _new_cv(ctx)
    for template in ("lotus", "teak", "saffron"):
        assert _save(ctx, cv_id, _with_photo(photo_id), template_id=template).status_code == 200
        assert ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf)).status_code == 200
        call = ctx.render.calls[-1]
        assert call["photo.jpg"] == JPEG and json.loads(call["theme.json"])["photo"] == "photo.jpg"
        assert call["main.typ"].startswith(f"// {template.capitalize()}".encode())
    assert _save(ctx, cv_id, _with_photo(photo_id), template_id="onyx").status_code == 200
    ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
    call = ctx.render.calls[-1]
    assert not any(name.startswith("photo.") for name in call) and json.loads(call["theme.json"])["photo"] is None

    png = _photo(ctx, PNG, "me.png", "image/png").json()["id"]
    assert _save(ctx, cv_id, _with_photo(png), template_id="lotus").status_code == 200
    ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
    assert ctx.render.calls[-1]["photo.png"] == PNG

    listing = {t["id"]: t for t in ctx.client.get("/v1/resume-templates").json()["templates"]}
    assert {k: (t["ats_safe"], t["photo"]) for k, t in listing.items()} == {
        "onyx": (True, False), "kakuna": (True, False), "ditgar": (False, False),
        "lotus": (True, True), "teak": (False, True), "saffron": (True, True)}


@pytest.mark.integration
@pytest.mark.parametrize("body,name,kind,status", [
    (b"GIF89a" + b"\x00" * 100, "me.gif", "image/gif", 415),
    (b"just text pretending", "me.jpg", "image/jpeg", 415),
    (JPEG[:4] + b"\x00" * (3 * 1024 * 1024), "big.jpg", "image/jpeg", 413),
])
def test_ac_cvp_02_bad_photos_are_rejected(ctx, body, name, kind, status):
    assert _photo(ctx, body, name, kind).status_code == status


@pytest.mark.integration
def test_ac_cvp_02_photo_id_must_be_a_photo_of_this_project(ctx):
    cv_id = _new_cv(ctx)
    other = ctx.client.post("/v1/projects", json={"name": "Other"}, headers=_write_headers(ctx.csrf)).json()["id"]
    foreign = _photo(ctx, JPEG, pid=other).json()["id"]
    for bad in (foreign, "00000000-0000-4000-8000-000000000000", "not-a-uuid"):
        saved = _save(ctx, cv_id, _with_photo(bad))
        assert saved.status_code == 422 and saved.json()["fields"]["path"] == "basics.photo", saved.text
    assert ctx.client.get(f"/v1/projects/{ctx.pid}/resume-photos/{foreign}").status_code == 404
    assert ctx.client.post(f"/v1/projects/{ctx.pid}/resume-photos", files={"file": ("me.jpg", JPEG, "image/jpeg")},
                           headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403


@pytest.mark.integration
def test_ac_cvp_03_photo_never_in_ai_text(ctx):
    photo_id = _photo(ctx, JPEG).json()["id"]
    cv_id = _new_cv(ctx)
    assert _save(ctx, cv_id, _with_photo(photo_id), template_id="lotus").status_code == 200
    published = ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    assert published.status_code == 201, published.text
    with ctx.sessions() as db:
        text = db.scalar(select(CVRevisionText.text).where(CVRevisionText.cv_revision_id == published.json()["id"]))
    assert text and photo_id not in text
