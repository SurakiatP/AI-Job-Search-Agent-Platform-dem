"""CR-IVP-01 PR 2: AI feedback on answers, flashcard check, end-of-set report, project-wide list. Synthetic data."""
from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import func, select

from job_search_platform.db.models import InterviewAttempt, InterviewQuestion, InterviewSet, Run
from test_cv_tailoring import _execute_next, _run, _setup
from test_paired_sessions import PREFIX
from test_practice import _PracticeRuntime, _settle
from test_rest_api import _write_headers, api_context  # noqa: F401

ANSWER = ("The team wanted the largest model. I owned answer quality. "
          "I built a 500-question test set and compared three models. The mid-size model scored about the same.")
SCORES = {"structure": 4, "relevance": 5, "evidence": 3, "clarity": 4, "company_fit": 3}


def _world(ctx):
    """A ready set with one behavioral, one technical and one logistics question; returns ids."""
    csrf, pid, session, facts, _ = _setup(ctx, [])
    _settle(ctx)
    headers = _write_headers(csrf)
    with ctx.sessions.begin() as db:
        row = InterviewSet(project_id=UUID(pid), session_id=UUID(session["id"]), name="Set", level="mid",
                           sections=[{"id": "behavioral", "count": 1}, {"id": "technical", "count": 1},
                                     {"id": "logistics", "count": 1}], reverse_questions=[])
        db.add(row)
        db.flush()
        made = {}
        for n, section in enumerate(("behavioral", "technical", "logistics")):
            q = InterviewQuestion(set_id=row.id, project_id=UUID(pid), section=section, position=n,
                                  prompt=f"{section} question", why="job asks", key_points=["point"], evidence_ids=[])
            db.add(q)
            db.flush()
            made[section] = str(q.id)
        set_id = str(row.id)
    return csrf, headers, pid, session, facts, set_id, made


def _attempt(ctx, headers, pid, question_id, answer=ANSWER):
    saved = ctx.client.post(f"{PREFIX}/{pid}/practice-questions/{question_id}/attempts", json={"answer": answer}, headers=headers)
    assert saved.status_code == 201, saved.text
    return saved.json()["id"]


def _feedback(ctx, headers, pid, attempt_id):
    return ctx.client.post(f"{PREFIX}/{pid}/practice-attempts/{attempt_id}/feedback", headers=headers)


def _detail(ctx, pid, set_id):
    return ctx.client.get(f"{PREFIX}/{pid}/practice-sets/{set_id}").json()


def _question(detail, question_id):
    return next(q for q in detail["questions"] if q["id"] == question_id)


@pytest.mark.integration
def test_ac_ivp_09_feedback_scores_star_spans_and_unused_facts(api_context):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    attempt_id = _attempt(ctx, headers, pid, made["behavioral"])
    queued = _feedback(ctx, headers, pid, attempt_id)
    assert queued.status_code == 202, queued.text
    assert queued.json()["feedback"]["status"] == "pending"
    again = _feedback(ctx, headers, pid, attempt_id)  # idempotent while pending: no second run
    assert again.status_code == 202
    with ctx.sessions() as db:
        runs = db.scalars(select(Run).where(Run.operation == "interview_grade")).all()
    assert len(runs) == 1
    assert _question(_detail(ctx, pid, set_id), made["behavioral"])["attempts"][0]["feedback"]["status"] == "pending"

    reply = {"scores": SCORES, "summary": "Clear story, result needs a number.",
             "star": [{"part": "S", "quote": "The team wanted the largest model."},
                      {"part": "A", "quote": "I built a 500-question test set and compared three models."},
                      {"part": "R", "quote": "words that are not in the answer"}],
             "add": ["Close with the cost you saved"],
             "unused_fact_ids": [facts["docker"], "00000000-0000-4000-8000-000000000000"]}
    runtime = _PracticeRuntime(ctx.tmp_path / "ws", [reply])
    _execute_next(ctx, runtime)
    assert _run(ctx, runs[0].id).status == "completed"
    (_, prompt, kwargs), = runtime.submits
    assert kwargs["operation"] == "interview_grade" and "behavioral question" in prompt and ANSWER in prompt

    feedback = _question(_detail(ctx, pid, set_id), made["behavioral"])["attempts"][0]["feedback"]
    assert feedback["status"] == "done" and feedback["kind"] == "answer"
    assert feedback["scores"] == SCORES and feedback["summary"].startswith("Clear story")
    spans = feedback["star"]
    assert [s["part"] for s in spans] == ["S", "A"]
    for span in spans:
        assert 0 <= span["start"] < span["end"] <= len(ANSWER)
    assert ANSWER[spans[1]["start"]:spans[1]["end"]] == "I built a 500-question test set and compared three models."
    assert feedback["add"] == ["Close with the cost you saved"]
    assert [f["id"] for f in feedback["unused_facts"]] == [facts["docker"]]

    logistics = _feedback(ctx, headers, pid, _attempt(ctx, headers, pid, made["logistics"]))
    assert logistics.status_code == 409 and logistics.json()["code"] == "practice_not_gradable"


@pytest.mark.integration
def test_ivp_feedback_rejects_bad_scores_and_can_be_asked_again(api_context):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    attempt_id = _attempt(ctx, headers, pid, made["behavioral"])
    _feedback(ctx, headers, pid, attempt_id)
    _execute_next(ctx, _PracticeRuntime(ctx.tmp_path / "ws", [{"scores": {**SCORES, "clarity": 9}}]))
    assert _question(_detail(ctx, pid, set_id), made["behavioral"])["attempts"][0]["feedback"]["status"] == "failed"
    retried = _feedback(ctx, headers, pid, attempt_id)
    assert retried.status_code == 202 and retried.json()["feedback"]["status"] == "pending"
    _execute_next(ctx, _PracticeRuntime(ctx.tmp_path / "ws", [{"scores": SCORES}]))
    assert _question(_detail(ctx, pid, set_id), made["behavioral"])["attempts"][0]["feedback"]["status"] == "done"


@pytest.mark.integration
def test_ac_ivp_15_flashcard_answer_check(api_context):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    attempt_id = _attempt(ctx, headers, pid, made["technical"], "HNSW is a graph")
    assert _feedback(ctx, headers, pid, attempt_id).status_code == 202
    _execute_next(ctx, _PracticeRuntime(ctx.tmp_path / "ws", [{"verdict": "partial", "missing": ["memory cost"], "note": "Half right"}]))
    feedback = _question(_detail(ctx, pid, set_id), made["technical"])["attempts"][0]["feedback"]
    assert feedback == {"status": "done", "kind": "card", "verdict": "partial", "missing": ["memory cost"], "note": "Half right"}


@pytest.mark.integration
def test_ac_ivp_11_report_has_no_links_or_percentages_and_only_set_sections(api_context):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    ctx.client.patch(f"{PREFIX}/{pid}/practice-questions/{made['technical']}", json={"card_rating": "learning"}, headers=headers)
    queued = ctx.client.post(f"{PREFIX}/{pid}/practice-sets/{set_id}/report", headers=headers)
    assert queued.status_code == 202, queued.text
    assert queued.json()["report"]["status"] == "pending"
    reply = {"strengths": ["Clear STAR stories", "See https://example.test/course"],
             "skills_to_build": ["Vector index tuning", "Raise your odds by 80%"],
             "plan": ["Review HNSW and IVF trade-offs", "Read www.example.test"],
             "readiness": [{"section": "behavioral", "level": "almost", "note": "Add results"},
                           {"section": "astrology", "level": "ready", "note": "x"},
                           {"section": "technical", "level": "certain", "note": "bad level"}]}
    runtime = _PracticeRuntime(ctx.tmp_path / "ws", [reply])
    _execute_next(ctx, runtime)
    (_, prompt, kwargs), = runtime.submits
    assert kwargs["operation"] == "interview_report" and "technical question" in prompt and "learning" in prompt
    report = _detail(ctx, pid, set_id)["report"]
    assert report["status"] == "done"
    assert report["strengths"] == ["Clear STAR stories"]
    assert report["skills_to_build"] == ["Vector index tuning"]
    assert report["plan"] == ["Review HNSW and IVF trade-offs"]
    assert report["readiness"] == [{"section": "behavioral", "level": "almost", "note": "Add results"}]


@pytest.mark.integration
def test_ac_ivp_10_feedback_and_report_use_the_practice_quota(api_context, monkeypatch):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    attempt_id = _attempt(ctx, headers, pid, made["behavioral"])
    monkeypatch.setenv("USER_DAILY_PRACTICE_QUOTA", "0")
    refused = _feedback(ctx, headers, pid, attempt_id)
    assert refused.status_code == 429 and refused.json()["code"] == "quota_exceeded"
    assert ctx.client.post(f"{PREFIX}/{pid}/practice-sets/{set_id}/report", headers=headers).status_code == 429
    with ctx.sessions() as db:
        assert db.get(InterviewAttempt, UUID(attempt_id)).feedback is None  # nothing half-queued


@pytest.mark.integration
def test_fr_ivp_19_project_list_groups_live_sets_with_their_job(api_context):
    ctx = api_context
    csrf, headers, pid, session, facts, set_id, made = _world(ctx)
    with ctx.sessions.begin() as db:
        db.add(InterviewSet(project_id=UUID(pid), session_id=UUID(session["id"]), name="Gone", level="mid",
                            sections=[{"id": "intro", "count": 1}], reverse_questions=[], deleted_at=func.now()))
    listing = ctx.client.get(f"{PREFIX}/{pid}/practice-sets")
    assert listing.status_code == 200
    rows = listing.json()
    assert [(r["id"], r["job_title"], r["session_id"]) for r in rows] == [(set_id, "Platform Engineer", session["id"])]
    assert rows[0]["question_count"] == 3
    assert ctx.client.delete(f"{PREFIX}/{pid}/sessions/{session['id']}", headers=headers).status_code in (200, 204)
    assert ctx.client.get(f"{PREFIX}/{pid}/practice-sets").json() == []
