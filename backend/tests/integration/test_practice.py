"""CR-IVP-01 interview practice, PR 1 (docs/superpowers/specs/2026-10-20-interview-practice-design.md). Synthetic data."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import func, select, update

from job_search_platform.db.models import InterviewAttempt, InterviewQuestion, InterviewSet, Run
from resume_samples import thai_long
from test_cv_builder import _Render
from test_cv_tailoring import JOB, _Runtime, _execute_next, _run, _setup
from test_paired_sessions import PREFIX, _project, _session
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401


class _PracticeRuntime(_Runtime):
    """Replies to each submit with the next scripted practice JSON."""

    async def events(self, project_id):
        reply = self.script.pop(0) if self.script else {}
        yield SimpleNamespace(kind="result", result=json.dumps(reply))


def _q(section, prompt, *, answer=None, ids=(), points=("point",), why="because the job asks"):
    return {"section": section, "prompt": prompt, "why": why, "key_points": list(points),
            "model_answer": answer, "evidence_ids": list(ids)}


def _create(ctx, csrf, pid, sid, sections=None, **extra):
    body = {"name": "ชุดซ้อม 1", "level": "mid",
            "sections": [{"id": "behavioral", "count": 3}, {"id": "technical", "count": 4}] if sections is None else sections, **extra}
    return ctx.client.post(f"{PREFIX}/{pid}/sessions/{sid}/practice-sets", json=body, headers=_write_headers(csrf))


def _detail(ctx, pid, set_id):
    return ctx.client.get(f"{PREFIX}/{pid}/practice-sets/{set_id}")


def _settle(ctx):
    with ctx.sessions.begin() as db:
        db.execute(update(Run).where(Run.status.in_(("queued", "running")), Run.operation != "interview_generate")
                   .values(status="cancelled", finished_at=datetime.now(timezone.utc)))


@pytest.mark.integration
def test_ac_ivp_01_and_02_generate_keeps_requested_counts_and_gates_model_answers(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    _settle(ctx)
    created = _create(ctx, csrf, pid, session["id"])
    assert created.status_code == 201, created.text
    view = created.json()
    assert view["status"] == "generating" and view["name"] == "ชุดซ้อม 1" and view["run_id"]
    assert _run(ctx, view["run_id"]).operation == "interview_generate"
    reply = {
        "questions": [
            _q("behavioral", "Tell me about shipping containers", answer="Packaged services with Docker", ids=[facts["docker"]]),
            _q("behavioral", "Tell me about a cluster", answer="Operated 40 Kubernetes clusters", ids=[facts["k8s"]]),  # 40 is unsupported
            _q("behavioral", "Tell me about Terraform", answer="Wrote Terraform modules", ids=[]),  # uncited
            _q("behavioral", "A fourth one beyond the count"),
            *[_q("technical", f"Card {n}", points=("HNSW is a graph index", "IVF clusters vectors")) for n in range(5)],
            _q("astrology", "Unknown section"),
            _q("technical", ""),  # empty prompt dropped
        ],
        "reverse_questions": ["How is the team organised?", "What does success look like in 90 days?"],
    }
    runtime = _PracticeRuntime(ctx.tmp_path / "ws", [reply])
    _execute_next(ctx, runtime)
    assert _run(ctx, view["run_id"]).status == "completed"
    (_, prompt, kwargs), = runtime.submits
    assert kwargs["operation"] == "interview_generate"
    assert JOB["title"] in prompt and "behavioral" in prompt and "Packaged services with Docker" in prompt

    detail = _detail(ctx, pid, view["id"]).json()
    assert detail["status"] == "ready" and detail["reverse_questions"][0] == "How is the team organised?"
    questions = detail["questions"]
    assert [q["section"] for q in questions] == ["behavioral"] * 3 + ["technical"] * 4
    assert all(q["why"] for q in questions) and [q["position"] for q in questions] == list(range(7))
    assert questions[0]["model_answer"] == "Packaged services with Docker" and questions[0]["evidence_ids"] == [facts["docker"]]
    assert questions[1]["model_answer"] is None and questions[2]["model_answer"] is None  # AC-IVP-02
    assert questions[3]["key_points"] == ["HNSW is a graph index", "IVF clusters vectors"]
    listing = ctx.client.get(f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets").json()
    assert [(s["id"], s["question_count"], s["ready_count"]) for s in listing] == [(view["id"], 7, 0)]
    runs = ctx.client.get(f"{PREFIX}/{pid}/runs")
    assert runs.status_code == 200 and "interview_generate" in {r["operation"] for r in runs.json()}


@pytest.mark.integration
def test_ivp_failed_generation_shows_failed_and_retry_queues_a_new_run(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    _settle(ctx)
    view = _create(ctx, csrf, pid, session["id"]).json()
    _execute_next(ctx, _PracticeRuntime(ctx.tmp_path / "ws", [{"questions": []}]))
    assert _run(ctx, view["run_id"]).status == "failed"
    assert _detail(ctx, pid, view["id"]).json()["status"] == "failed"
    retried = ctx.client.post(f"{PREFIX}/{pid}/practice-sets/{view['id']}/retry", headers=_write_headers(csrf))
    assert retried.status_code == 200 and retried.json()["status"] == "generating" and retried.json()["run_id"] != view["run_id"]
    busy = ctx.client.post(f"{PREFIX}/{pid}/practice-sets/{view['id']}/retry", headers=_write_headers(csrf))
    assert busy.status_code == 409 and busy.json()["code"] == "practice_set_busy"


@pytest.mark.integration
def test_ac_ivp_05_rename_delete_undo_and_set_limit(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    headers = _write_headers(csrf)
    view = _create(ctx, csrf, pid, session["id"]).json()
    url = f"{PREFIX}/{pid}/practice-sets/{view['id']}"
    renamed = ctx.client.patch(url, json={"name": "รอบสอง"}, headers=headers)
    assert renamed.status_code == 200 and renamed.json()["name"] == "รอบสอง"
    assert ctx.client.patch(url, json={"name": ""}, headers=headers).status_code == 422
    assert ctx.client.delete(url, headers=headers).status_code == 204
    assert ctx.client.get(f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets").json() == []
    assert _detail(ctx, pid, view["id"]).status_code == 404
    restored = ctx.client.post(f"{url}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["name"] == "รอบสอง"
    with ctx.sessions.begin() as db:
        for n in range(19):
            db.add(InterviewSet(project_id=UUID(pid), session_id=UUID(session["id"]), name=f"s{n}", level="mid",
                                sections=[{"id": "intro", "count": 1}]))
    full = _create(ctx, csrf, pid, session["id"])
    assert full.status_code == 409 and full.json()["code"] == "practice_set_limit"
    for bad in ([{"id": "intro", "count": 7}], [{"id": "astrology", "count": 1}], [],
                [{"id": s, "count": 6} for s in ("intro", "behavioral", "situational", "technical", "gaps", "company")]):
        assert _create(ctx, csrf, pid, session["id"], sections=bad).status_code == 422, bad


@pytest.mark.integration
def test_ac_ivp_07_attempts_ready_and_card_rating(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    headers = _write_headers(csrf)
    view = _create(ctx, csrf, pid, session["id"]).json()
    with ctx.sessions.begin() as db:
        written = InterviewQuestion(set_id=UUID(view["id"]), project_id=UUID(pid), section="behavioral", position=0,
                                    prompt="Tell me about a time", why="job asks", key_points=[], evidence_ids=[])
        card = InterviewQuestion(set_id=UUID(view["id"]), project_id=UUID(pid), section="technical", position=1,
                                 prompt="HNSW vs IVF", why="job uses pgvector", key_points=["graph"], evidence_ids=[])
        db.add_all([written, card])
        db.flush()
        qid, cid = written.id, card.id
    qurl = f"{PREFIX}/{pid}/practice-questions/{qid}"
    for n in range(21):
        saved = ctx.client.post(f"{qurl}/attempts", json={"answer": f"answer {n}"}, headers=headers)
        assert saved.status_code == 201, saved.text
    assert ctx.client.post(f"{qurl}/attempts", json={"answer": "x" * 4001}, headers=headers).status_code == 422
    assert ctx.client.patch(qurl, json={"ready": True}, headers=headers).json()["ready"] is True
    rated = ctx.client.patch(f"{PREFIX}/{pid}/practice-questions/{cid}", json={"card_rating": "learning"}, headers=headers)
    assert rated.status_code == 200 and rated.json()["card_rating"] == "learning"
    assert ctx.client.patch(qurl, json={"card_rating": "maybe"}, headers=headers).status_code == 422
    detail = _detail(ctx, pid, view["id"]).json()
    attempts = detail["questions"][0]["attempts"]
    assert len(attempts) == 20 and attempts[0]["answer"] == "answer 20" and attempts[-1]["answer"] == "answer 1"
    listing = ctx.client.get(f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets").json()
    assert listing[0]["ready_count"] == 1 and listing[0]["known_count"] == 0


@pytest.mark.integration
def test_ac_ivp_10_practice_has_its_own_daily_quota(api_context, monkeypatch):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    with ctx.sessions() as db:
        main_runs = db.scalar(select(func.count()).select_from(Run))
    assert main_runs >= 2  # the session's evaluation and the CV extraction
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", "0")
    monkeypatch.setenv("USER_DAILY_PRACTICE_QUOTA", "1")
    assert _create(ctx, csrf, pid, session["id"]).status_code == 201  # main runs do not count here
    refused = _create(ctx, csrf, pid, session["id"], name="second")
    assert refused.status_code == 429 and refused.json()["code"] == "quota_exceeded"
    with ctx.sessions() as db:
        assert db.scalar(select(func.count()).select_from(InterviewSet)) == 1  # nothing half-created
    # Practice runs never use the main quota: exactly the main runs fit under it.
    from job_search_platform.services.quota import enforce_run_gates
    monkeypatch.setenv("USER_DAILY_RUN_QUOTA", str(main_runs + 1))
    with ctx.sessions.begin() as db:
        enforce_run_gates(db, UUID(pid))


@pytest.mark.integration
def test_ac_ivp_03_personal_details_never_reach_the_prompt(api_context):
    ctx = api_context
    ctx.runtime.render_typst = _Render()
    csrf = _owner(ctx)
    headers = _write_headers(csrf)
    pid = _project(ctx, csrf)
    cv_id = ctx.client.post(f"{PREFIX}/{pid}/cvs/builder", json={"name": "CV"}, headers=headers).json()["id"]
    draft = ctx.client.get(f"{PREFIX}/{pid}/cvs/{cv_id}/draft").json()
    data = thai_long()
    data["personal"] = {"expected_salary": "SALARY-SENTINEL-45000", "line_id": "LINE-SENTINEL"}
    data["personal_hidden"] = False
    assert ctx.client.put(f"{PREFIX}/{pid}/cvs/{cv_id}/draft", headers=headers, json={
        "resume_data": data, "template_id": "onyx", "accent": "indigo", "document_language": "th",
        "updated_at": draft["updated_at"]}).status_code == 200
    revision = ctx.client.post(f"{PREFIX}/{pid}/cvs/{cv_id}/draft/publish", headers=headers).json()
    session = _session(ctx, csrf, pid, revision["id"], job=JOB).json()
    _settle(ctx)
    with ctx.sessions.begin() as db:  # the session's own evaluation is not under test
        db.execute(update(Run).where(Run.operation == "evaluate_job").values(status="cancelled"))
    view = _create(ctx, csrf, pid, session["id"], sections=[{"id": "logistics", "count": 2}]).json()
    runtime = _PracticeRuntime(ctx.tmp_path / "ws", [{"questions": [_q("logistics", "Expected salary?")]}])
    _execute_next(ctx, runtime)
    (_, prompt, _kwargs), = runtime.submits
    assert "SENTINEL" not in prompt
    assert _detail(ctx, pid, view["id"]).json()["questions"][0]["section"] == "logistics"


@pytest.mark.integration
def test_ac_ivp_04_owner_only_and_project_scoped(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    view = _create(ctx, csrf, pid, session["id"]).json()
    other = _project(ctx, csrf, "Other")
    assert _detail(ctx, other, view["id"]).status_code == 404
    assert ctx.client.patch(f"{PREFIX}/{other}/practice-sets/{view['id']}", json={"name": "x"},
                            headers=_write_headers(csrf)).status_code == 404
    token = ctx.client.post(f"{PREFIX}/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["results:read", "documents:draft"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    ctx.client.cookies.clear()
    for method, url in (("GET", f"{PREFIX}/{pid}/practice-sets/{view['id']}"),
                        ("GET", f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets"),
                        ("POST", f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets")):
        denied = ctx.client.request(method, url, headers={"Authorization": f"Bearer {token}"}, json={})
        assert denied.status_code in (401, 403, 404), (method, url, denied.status_code)


@pytest.mark.integration
def test_ivp_purging_the_session_deletes_its_sets(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    headers = _write_headers(csrf)
    view = _create(ctx, csrf, pid, session["id"]).json()
    _execute_next(ctx, _PracticeRuntime(ctx.tmp_path / "ws", [{"questions": [_q("behavioral", "Q")]}]))
    with ctx.sessions() as db:
        question_id = db.scalar(select(InterviewQuestion.id))
    ctx.client.post(f"{PREFIX}/{pid}/practice-questions/{question_id}/attempts", json={"answer": "a"}, headers=headers)
    assert ctx.client.delete(f"{PREFIX}/{pid}/sessions/{session['id']}", headers=headers).status_code in (200, 204)
    assert ctx.client.get(f"{PREFIX}/{pid}/sessions/{session['id']}/practice-sets").status_code == 404
    # A run that published a kept document keeps the session as a tombstone; its sets must still go.
    from test_rest_api import _seed_completed_run, _seed_document
    _seed_document(ctx, pid, "kept.pdf", run_id=_seed_completed_run(ctx, pid, session["id"], key="kept-doc"))
    assert ctx.client.delete(f"{PREFIX}/{pid}/sessions/{session['id']}/permanent", headers=headers).status_code == 204
    with ctx.sessions() as db:
        assert db.get(InterviewSet, UUID(view["id"])) is None
        assert db.scalar(select(func.count()).select_from(InterviewAttempt)) == 0
