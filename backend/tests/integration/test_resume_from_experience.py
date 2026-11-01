"""Builder button "pick from my experience": chosen bank items come back as CV sections the owner then edits. Invented data."""
from __future__ import annotations

import uuid

import pytest

from test_cv_builder import _new_cv, _url, ctx  # noqa: F401 (fixture)
from test_rest_api import _write_headers, api_context  # noqa: F401 (fixture)


def _add(ctx, **body) -> str:
    response = ctx.client.post(f"/v1/projects/{ctx.pid}/experience", json=body, headers=_write_headers(ctx.csrf))
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _pick(ctx, cv_id, ids):
    return ctx.client.post(_url(ctx, cv_id, "/from-experience"), json={"item_ids": ids}, headers=_write_headers(ctx.csrf))


@pytest.mark.integration
def test_only_the_chosen_items_come_back_and_the_draft_is_untouched(ctx):
    kept = _add(ctx, kind="experience", text="ทำรายงานยอดขาย", role="Data Analyst", organization="บริษัท ตัวอย่าง จำกัด")
    skill = _add(ctx, kind="skill", text="SQL")
    _add(ctx, kind="experience", text="งานที่ไม่เลือก", role="Intern", organization="บริษัท อื่น")
    cv_id = _new_cv(ctx)
    response = _pick(ctx, cv_id, [kept, skill])
    assert response.status_code == 200, response.text
    sections = response.json()["resume_data"]["sections"]
    assert [i["position"] for i in sections["experience"]["items"]] == ["Data Analyst"]
    assert sections["experience"]["items"][0]["highlights"] == ["ทำรายงานยอดขาย"]
    assert [i["name"] for i in sections["skills"]["items"]] == ["SQL"]
    assert ctx.client.get(_url(ctx, cv_id)).json()["resume_data"]["sections"]["experience"]["items"] == []  # nothing saved by this call


@pytest.mark.integration
def test_unknown_or_removed_items_and_empty_picks_are_refused(ctx):
    gone = _add(ctx, kind="skill", text="Excel")
    assert ctx.client.delete(f"/v1/projects/{ctx.pid}/experience/{gone}", headers=_write_headers(ctx.csrf)).status_code == 204
    cv_id = _new_cv(ctx)
    assert _pick(ctx, cv_id, [gone]).status_code == 404
    assert _pick(ctx, cv_id, [str(uuid.uuid4())]).status_code == 404
    assert _pick(ctx, cv_id, []).status_code == 422
