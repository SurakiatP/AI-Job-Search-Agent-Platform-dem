"""Tailoring a builder CV keeps its template and touches only the summary and bullets (TC-CVB-08..12, CR-01)."""
from __future__ import annotations

import json
from uuid import UUID

import pytest
from sqlalchemy import func, select

from helpers import cancel_queued_extract_runs
from job_search_platform.db.models import DocumentRevision, ExperienceItem, ResumeDraft
from test_cv_builder import _Render
from test_cv_tailoring import JOB, PREFIX, _Runtime, _edit, _execute_next, _revisions, _run, _tailor
from test_paired_sessions import _project, _session
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401 (fixture)

DATA = {
    "basics": {"name": "Alex Example", "headline": "Engineer", "email": "alex@example.test"},
    "summary": {"content": "General engineer."},
    "sections": {"experience": {"items": [{"id": "00000000-0000-0000-0000-000000000001", "company": "Example Co",
                                           "position": "Engineer", "start": "2022-01", "current": True,
                                           "highlights": ["Built internal tools"]}]},
                 "education": {"items": [{"id": "00000000-0000-0000-0000-000000000002", "institution": "Example University", "degree": "BSc"}]}},
}


class _TemplateRuntime(_Runtime):
    def __init__(self, root, script):
        super().__init__(root, script)
        self.render = _Render()

    async def render_typst(self, files, main="main.typ"):
        return await self.render(files, main)


def _builder_session(ctx, script, *, template="kakuna", accent="teal"):
    ctx.runtime.render_typst = _Render()
    csrf = _owner(ctx)
    pid = _project(ctx, csrf)
    cv_id = ctx.client.post(f"{PREFIX}/{pid}/cvs/builder", json={"name": "Builder CV"}, headers=_write_headers(csrf)).json()["id"]
    draft = ctx.client.get(f"{PREFIX}/{pid}/cvs/{cv_id}/draft").json()
    saved = ctx.client.put(f"{PREFIX}/{pid}/cvs/{cv_id}/draft", headers=_write_headers(csrf), json={
        "resume_data": DATA, "template_id": template, "accent": accent, "document_language": "en", "updated_at": draft["updated_at"]})
    assert saved.status_code == 200, saved.text
    revision = ctx.client.post(f"{PREFIX}/{pid}/cvs/{cv_id}/draft/publish", headers=_write_headers(csrf)).json()
    cancel_queued_extract_runs(ctx.sessions)
    session = _session(ctx, csrf, pid, revision["id"], job=JOB).json()
    ctx.client.post(f"{PREFIX}/{pid}/runs/{session['evaluation_run_id']}/cancel", headers=_write_headers(csrf))
    facts = {key: ctx.client.post(f"{PREFIX}/{pid}/experience", headers=_write_headers(csrf), json={"kind": "skill", "text": text}).json()["id"]
             for key, text in {"docker": "Packaged services with Docker", "py": "Wrote Python services"}.items()}
    return csrf, pid, session, facts, _TemplateRuntime(ctx.tmp_path / "ws", script)


def _tailored(ctx, pid):
    revision = _revisions(ctx, pid)[-1]
    assert revision.resume_data is not None, "tailored builder CV must keep resume data"
    return revision


@pytest.mark.integration
def test_tc_cvb_08_and_10_autopilot_keeps_template_and_protected_fields(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime = _builder_session(ctx, [])
    runtime.script = [[
        _edit("Jamie Other", facts["docker"], find="Alex Example"),
        _edit("Other Co", facts["docker"], find="Example Co"),
        _edit("2019-01", facts["docker"], find="2022-01"),
        _edit("Packaged services with Docker", facts["docker"]),
    ]]
    assert _tailor(ctx, csrf, pid, session, "auto-1").status_code == 202
    _execute_next(ctx, runtime)
    revision = _tailored(ctx, pid)
    data = revision.resume_data
    assert data["basics"]["name"] == "Alex Example"
    item = data["sections"]["experience"]["items"][0]
    assert (item["company"], item["start"]) == ("Example Co", "2022-01")
    assert "Packaged services with Docker" in item["highlights"]
    assert revision.resume_style == {"template_id": "kakuna", "accent": "teal"}
    theme = json.loads(runtime.render.calls[-1]["theme.json"])
    assert theme["accent"] == "#115E59" and runtime.render.calls[-1]["main.typ"].startswith(b"// Kakuna")
    assert runtime.engines == []  # the Markdown exporter is not used for builder CVs
    payload = _run(ctx, _run_id(ctx, pid)).result_payload
    assert payload["structured"] is True
    assert sum(p["status"] == "rejected_by_gate" for p in payload["proposals"]) >= 3
    with ctx.sessions() as db:
        draft = db.scalar(select(ResumeDraft).where(ResumeDraft.document_id == revision.document_id))
    assert draft is not None and draft.template_id == "kakuna"
    assert "the summary paragraph and the bullet lines" in runtime.submits[0][1]


def _run_id(ctx, pid):
    from job_search_platform.db.models import Run
    with ctx.sessions() as db:
        return db.scalar(select(Run.id).where(Run.project_id == UUID(pid), Run.operation == "tailor_cv").order_by(Run.created_at.desc()).limit(1))


@pytest.mark.integration
def test_tc_cvb_09_unevidenced_bullet_is_rejected(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime = _builder_session(ctx, [])
    runtime.script = [[_edit("Operated Kubernetes clusters in production", facts["py"]),
                       _edit("Wrote Python services", facts["py"])]]
    _tailor(ctx, csrf, pid, session, "auto-2")
    _execute_next(ctx, runtime)
    highlights = _tailored(ctx, pid).resume_data["sections"]["experience"]["items"][0]["highlights"]
    assert "Wrote Python services" in highlights
    assert not any("Kubernetes" in line for line in highlights)


@pytest.mark.integration
def test_tc_cvb_10_interactive_apply_keeps_template(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime = _builder_session(ctx, [], template="onyx", accent="rose")
    runtime.script = [[_edit("Packaged services with Docker", facts["docker"]), _edit("X", facts["docker"], find="Alex Example")]]
    response = _tailor(ctx, csrf, pid, session, "inter-1", tailor_mode="interactive")
    assert response.status_code == 202, response.text
    run_id = _execute_next(ctx, runtime)
    proposals = _run(ctx, run_id).result_payload["proposals"]
    assert [p["status"] for p in proposals] == ["proposed", "rejected_by_gate"]
    applied = ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/tailor/apply", headers=_write_headers(csrf), json={"proposal_ids": [0]})
    assert applied.status_code in (200, 202), applied.text
    _execute_next(ctx, runtime)
    revision = _tailored(ctx, pid)
    assert revision.resume_style == {"template_id": "onyx", "accent": "rose"}
    assert "Packaged services with Docker" in revision.resume_data["sections"]["experience"]["items"][0]["highlights"]


@pytest.mark.integration
def test_tc_cvb_12_owner_edit_of_tailored_cv_makes_a_version_and_leaves_the_bank(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime = _builder_session(ctx, [])
    runtime.script = [[_edit("Packaged services with Docker", facts["docker"])]]
    _tailor(ctx, csrf, pid, session, "auto-3")
    _execute_next(ctx, runtime)
    document_id = str(_tailored(ctx, pid).document_id)
    with ctx.sessions() as db:
        bank = db.scalar(select(func.count()).select_from(ExperienceItem).where(ExperienceItem.project_id == UUID(pid), ExperienceItem.removed_at.is_(None)))
    draft = ctx.client.get(f"{PREFIX}/{pid}/documents/{document_id}/draft").json()
    data = draft["resume_data"]
    data["sections"]["experience"]["items"][0]["highlights"][0] = "Led the internal tools team"
    saved = ctx.client.put(f"{PREFIX}/{pid}/documents/{document_id}/draft", headers=_write_headers(csrf), json={
        "resume_data": data, "template_id": "ditgar", "accent": "slate", "document_language": "en", "updated_at": draft["updated_at"]})
    assert saved.status_code == 200, saved.text
    published = ctx.client.post(f"{PREFIX}/{pid}/documents/{document_id}/draft/publish", headers=_write_headers(csrf))
    assert published.status_code == 201, published.text
    latest = _revisions(ctx, pid)[-1]
    assert latest.revision == 2 and latest.resume_style == {"template_id": "ditgar", "accent": "slate"}
    assert latest.resume_data["sections"]["experience"]["items"][0]["highlights"][0] == "Led the internal tools team"
    with ctx.sessions() as db:
        after = db.scalar(select(func.count()).select_from(ExperienceItem).where(ExperienceItem.project_id == UUID(pid), ExperienceItem.removed_at.is_(None)))
        assert db.scalar(select(ExperienceItem.id).where(ExperienceItem.text == "Led the internal tools team")) is None
    assert after == bank
    listed = {d["id"]: d for d in ctx.client.get(f"{PREFIX}/{pid}/documents").json()}
    assert listed[document_id]["has_builder_draft"] is True and listed[document_id]["partial"] is False
