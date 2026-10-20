"""CV builder: drafts, preview, publish (docs/tests/TC-CVB.md). Test names start with the TC id they prove."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from helpers import login_cookie, user as make_user
from job_search_platform.db.models import CVRevision, CVRevisionText, ExperienceItem, StoredFile
from resume_samples import english_short, thai_long
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401 (fixture)

DATA = Path(__file__).resolve().parents[3] / "tests" / "data" / "cvb"
REF = ("สมหญิง", "referee@example.test", "000-111-2222")


class _Render:
    def __init__(self):
        self.calls, self.fail = [], False

    async def __call__(self, files, main="main.typ"):
        self.calls.append({name: body for name, body in files.items()})
        if self.fail:
            raise RuntimeError("compile failed")
        return b"%PDF-1.7\nSynthetic builder render\n%%EOF\n"


@pytest.fixture
def ctx(api_context):
    api_context.render = _Render()
    api_context.runtime.render_typst = api_context.render
    api_context.csrf = _owner(api_context)
    response = api_context.client.post("/api/v1/projects", json={"name": "Builder"}, headers=_write_headers(api_context.csrf))
    assert response.status_code == 201, response.text
    api_context.pid = response.json()["id"]
    return api_context


def _new_cv(ctx, **body) -> str:
    response = ctx.client.post(f"/api/v1/projects/{ctx.pid}/cvs/builder", json={"name": "CV ทดลอง", **body},
                               headers=_write_headers(ctx.csrf))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _url(ctx, cv_id, tail=""):
    return f"/api/v1/projects/{ctx.pid}/cvs/{cv_id}/draft{tail}"


def _save(ctx, cv_id, data, **extra):
    draft = ctx.client.get(_url(ctx, cv_id)).json()
    body = {"resume_data": data, "template_id": "onyx", "accent": "indigo", "document_language": "th",
            "updated_at": draft["updated_at"], **extra}
    return ctx.client.put(_url(ctx, cv_id), json=body, headers=_write_headers(ctx.csrf))


def _counts(ctx):
    with ctx.sessions() as db:
        return tuple(db.scalar(select(func.count()).select_from(model)) for model in (CVRevision, CVRevisionText))


@pytest.mark.integration
def test_tc_cvb_01_build_publish_and_list(ctx):
    cv_id = _new_cv(ctx)
    assert _save(ctx, cv_id, thai_long()).status_code == 200
    published = ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    assert published.status_code == 201, published.text
    assert published.json()["revision"] == 1 and published.json()["mime_type"] == "application/pdf"
    cvs = ctx.client.get(f"/api/v1/projects/{ctx.pid}/cvs").json()
    assert [c["latest_revision"]["revision"] for c in cvs if c["id"] == cv_id] == [1]
    with ctx.sessions() as db:
        text = db.scalar(select(CVRevisionText.text).where(CVRevisionText.cv_revision_id == published.json()["id"]))
        live = db.scalars(select(ExperienceItem).where(ExperienceItem.builder_cv_id == cv_id, ExperienceItem.removed_at.is_(None))).all()
    assert "สมชาย ตัวอย่าง" in text and "ประสบการณ์ทำงาน" in text
    assert {row.kind for row in live} >= {"experience", "education", "skill", "language", "interest"}


@pytest.mark.integration
def test_tc_cvb_03_draft_conflict(ctx):
    cv_id = _new_cv(ctx)
    stale = ctx.client.get(_url(ctx, cv_id)).json()["updated_at"]
    first = _save(ctx, cv_id, english_short())
    assert first.status_code == 200 and first.json()["updated_at"] != stale
    second = ctx.client.put(_url(ctx, cv_id), json={"resume_data": thai_long(), "template_id": "onyx", "accent": "indigo",
                                                     "document_language": "th", "updated_at": stale},
                            headers=_write_headers(ctx.csrf))
    assert second.status_code == 409 and second.json()["code"] == "draft_conflict"
    assert ctx.client.get(_url(ctx, cv_id)).json()["resume_data"]["basics"]["name"] == "Alex Example"


@pytest.mark.integration
def test_tc_cvb_04_template_and_accent_reach_the_render(ctx):
    cv_id = _new_cv(ctx)
    for template, accent, hexcode in (("onyx", "indigo", "#3730A3"), ("ditgar", "teal", "#115E59")):
        assert _save(ctx, cv_id, english_short(), template_id=template, accent=accent).status_code == 200
        preview = ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
        assert preview.status_code == 200 and preview.headers["content-type"] == "application/pdf"
        call = ctx.render.calls[-1]
        assert json.loads(call["theme.json"])["accent"] == hexcode
        assert call["main.typ"].startswith(f"// {template.capitalize()}".encode())
    listing = ctx.client.get("/api/v1/resume-templates").json()
    assert {t["id"]: t["ats_safe"] for t in listing["templates"]} == {  # CR-CVT-01 added the photo templates
        "onyx": True, "kakuna": True, "ditgar": False, "lotus": True, "teak": False, "saffron": True}
    assert len(listing["accents"]) == 6


@pytest.mark.integration
def test_tc_cvb_05_render_failure_writes_nothing(ctx):
    cv_id = _new_cv(ctx)
    _save(ctx, cv_id, english_short())
    assert ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).status_code == 201
    before, draft_before = _counts(ctx), ctx.client.get(_url(ctx, cv_id)).json()
    with ctx.sessions() as db:
        files_before = db.scalar(select(func.count()).select_from(StoredFile).where(StoredFile.publication_state == "published"))
    ctx.render.fail = True
    failed = ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    assert failed.status_code == 502 and failed.json()["code"] == "render_failed"
    with ctx.sessions() as db:
        files_after = db.scalar(select(func.count()).select_from(StoredFile).where(StoredFile.publication_state == "published"))
    assert _counts(ctx) == before and files_after == files_before
    assert ctx.client.get(_url(ctx, cv_id)).json() == draft_before
    ctx.render.fail = False
    assert ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).json()["revision"] == 2


@pytest.mark.integration
def test_tc_cvb_06_references_never_in_text_or_bank(ctx):
    cv_id = _new_cv(ctx)
    _save(ctx, cv_id, thai_long())
    revision = ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).json()
    with ctx.sessions() as db:
        text = db.scalar(select(CVRevisionText.text).where(CVRevisionText.cv_revision_id == revision["id"]))
        bank = " ".join(db.scalars(select(ExperienceItem.text).where(ExperienceItem.project_id == ctx.pid)))
    assert not any(value in text or value in bank for value in REF)
    data = thai_long() | {"references_on_request": True}
    _save(ctx, cv_id, data)
    ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(ctx.csrf))
    printed = json.loads(ctx.render.calls[-1]["resume.json"])
    assert printed["sections"]["references"]["items"] == [] and json.loads(ctx.render.calls[-1]["theme.json"])["references_on_request"]


@pytest.mark.integration
def test_tc_cvb_06_republish_replaces_only_this_cvs_bank_rows(ctx):
    owner_fact = ctx.client.post(f"/api/v1/projects/{ctx.pid}/experience", json={"kind": "skill", "text": "Excel"},
                                 headers=_write_headers(ctx.csrf))
    assert owner_fact.status_code == 201, owner_fact.text
    cv_id = _new_cv(ctx)
    _save(ctx, cv_id, thai_long())
    ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    _save(ctx, cv_id, english_short())
    ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    with ctx.sessions() as db:
        live = set(db.scalars(select(ExperienceItem.text).where(ExperienceItem.project_id == ctx.pid, ExperienceItem.removed_at.is_(None))))
    assert "Excel" in live and "Built REST APIs in FastAPI" in live
    assert not any("แดชบอร์ด" in text for text in live)
    _save(ctx, cv_id, thai_long())
    ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    with ctx.sessions() as db:
        live = set(db.scalars(select(ExperienceItem.text).where(ExperienceItem.project_id == ctx.pid, ExperienceItem.removed_at.is_(None))))
    assert any("แดชบอร์ด" in text for text in live)  # a removed fact comes back when the owner restores it


def _patched(path: str, value):
    data = thai_long()
    if path == "size_bytes":
        data["summary"]["content"] = "ก" * 999
        data["sections"]["interests"]["items"] = [{"id": f"00000000-0000-0000-0000-{i:012d}", "name": "ก" * 200} for i in range(50)]
        data["sections"]["skills"]["items"] = [{"id": f"00000000-0000-0000-0001-{i:012d}", "name": "ก" * 200, "level": None,
                                                "keywords": ["ข" * 200] * 20} for i in range(50)]
        return data, {}
    if path in ("template_id", "accent"):
        return data, {path: value}
    if isinstance(value, dict) and "repeat" in value:
        value = value["repeat"] * value["times"]
    keys = path.replace("]", "").replace("[", ".").split(".")
    target = data
    for part in keys[:-1]:
        target = target[int(part)] if part.isdigit() else target[part]
    last = keys[-1]
    if isinstance(value, dict) and "count" in value:
        sample = target[last][0] if target[last] else ""
        value = [({**sample, "id": f"00000000-0000-0000-0002-{i:012d}"} if isinstance(sample, dict) else "งาน") for i in range(value["count"])]
    if last.isdigit():
        target[int(last)] = value
    else:
        target[last] = value
    return data, {}


@pytest.mark.integration
@pytest.mark.parametrize("row", json.loads((DATA / "TC-CVB-14.json").read_text(encoding="utf-8")), ids=lambda r: r["name"])
def test_tc_cvb_14_validation(ctx, row):
    cv_id = _new_cv(ctx)
    (path, value), = row["input"].items()
    data, extra = _patched(path, value)
    response = _save(ctx, cv_id, data, **extra)
    assert response.status_code == row["expected"], response.text
    if row["expected"] == 422 and path not in ("template_id", "accent"):
        assert response.json()["code"] == "resume_invalid" and response.json()["fields"]["path"]


@pytest.mark.integration
def test_tc_cvb_14_publish_needs_name_and_content(ctx):
    cv_id = _new_cv(ctx)
    _save(ctx, cv_id, {"basics": {"name": ""}, "summary": {"content": "x"}})
    assert ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).json()["code"] == "resume_incomplete"
    _save(ctx, cv_id, {"basics": {"name": "ชื่อ"}})
    assert ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf)).json()["code"] == "resume_incomplete"


@pytest.mark.integration
def test_tc_cvb_15_owner_only_and_project_scoped(ctx):
    cv_id = _new_cv(ctx)
    # Another account, own session, cannot see this project's draft.
    with ctx.sessions.begin() as db:
        other = make_user(db, email="other-builder@example.test").user_id
    saved = dict(ctx.client.cookies)
    cookie, csrf = login_cookie(ctx.client.app.state.services, other)
    ctx.client.cookies.set("jsp_owner_session", cookie)
    assert ctx.client.get(_url(ctx, cv_id)).status_code in (403, 404)
    assert ctx.client.post(_url(ctx, cv_id, "/preview"), headers=_write_headers(csrf)).status_code in (403, 404)
    ctx.client.cookies.clear()
    ctx.client.cookies.update(saved)
    # Same owner without the CSRF header.
    assert ctx.client.put(_url(ctx, cv_id), json={}, headers={"Origin": "http://127.0.0.1:8765"}).status_code == 403
    # Uploaded CVs and unknown ids have no draft.
    assert ctx.client.get(_url(ctx, "00000000-0000-0000-0000-000000000000")).status_code == 404


@pytest.mark.integration
def test_tc_cvb_15_draft_save_rate_limit(ctx):
    cv_id = _new_cv(ctx)
    codes = [_save(ctx, cv_id, english_short()).status_code for _ in range(61)]
    assert codes[:60] == [200] * 60 and codes[60] == 429


@pytest.mark.integration
def test_tc_cvb_01_start_from_experience_bank(ctx):
    ctx.client.post(f"/api/v1/projects/{ctx.pid}/experience", json={"kind": "experience", "text": "ทำรายงานยอดขาย",
                    "role": "Data Analyst", "organization": "บริษัท ตัวอย่าง จำกัด"}, headers=_write_headers(ctx.csrf))
    cv_id = _new_cv(ctx, from_experience=True)
    data = ctx.client.get(_url(ctx, cv_id)).json()["resume_data"]
    item = data["sections"]["experience"]["items"][0]
    assert item["position"] == "Data Analyst" and item["highlights"] == ["ทำรายงานยอดขาย"]


@pytest.mark.integration
def test_cr02_draft_carries_the_cv_name_and_rename_works_from_the_builder(ctx):
    cv_id = _new_cv(ctx)
    assert ctx.client.get(_url(ctx, cv_id)).json()["name"] == "CV ทดลอง"
    renamed = ctx.client.patch(f"/api/v1/projects/{ctx.pid}/cvs/{cv_id}", json={"name": "CV สาย AI"}, headers=_write_headers(ctx.csrf))
    assert renamed.status_code == 200, renamed.text
    assert ctx.client.get(_url(ctx, cv_id)).json()["name"] == "CV สาย AI"
    assert ctx.client.patch(f"/api/v1/projects/{ctx.pid}/cvs/{cv_id}", json={"name": "  "}, headers=_write_headers(ctx.csrf)).status_code == 422


@pytest.mark.integration
def test_cr02_templates_list_provinces(ctx):
    provinces = ctx.client.get("/api/v1/resume-templates").json()["provinces"]
    assert len(provinces) == 77 and {"id": "TH-10", "en": "Bangkok", "th": "กรุงเทพมหานคร"} in provinces


@pytest.mark.integration
def test_cr02_address_and_personal_details_round_trip_but_stay_out_of_ai_text(ctx):
    cv_id = _new_cv(ctx)
    data = english_short()
    data["basics"]["address"] = {"line": "99/1", "subdistrict": "Bang Na Tai", "district": "Bang Na", "province": "TH-10", "postcode": "10260"}
    data["personal"] = {"line_id": "secret-line-id", "nationality": "Thai"}
    data["personal_hidden"] = False
    assert _save(ctx, cv_id, data).status_code == 200
    saved = ctx.client.get(_url(ctx, cv_id)).json()["resume_data"]
    assert saved["basics"]["address"]["postcode"] == "10260" and saved["personal"]["line_id"] == "secret-line-id"
    published = ctx.client.post(_url(ctx, cv_id, "/publish"), headers=_write_headers(ctx.csrf))
    assert published.status_code == 201, published.text
    with ctx.sessions() as db:
        text = db.scalar(select(CVRevisionText.text).where(CVRevisionText.cv_revision_id == published.json()["id"]))
    assert "secret-line-id" not in text and "10260" not in text and "Bang Na, กรุงเทพมหานคร" in text  # draft language is th
    bad = dict(data, basics=dict(data["basics"], address=dict(data["basics"]["address"], province="Bangkok")))
    response = _save(ctx, cv_id, bad)
    assert response.status_code == 422 and response.json()["fields"]["path"] == "basics.address.province"
