"""CV tailoring runs (autopilot/interactive), apply and restore, with a scripted fake runtime."""
from __future__ import annotations

import asyncio
import json
import os
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from helpers import cancel_queued_extract_runs
from job_search_platform.db.models import CVRevision, CVRevisionText, Document, DocumentRevision, Run, RunEvent
from job_search_platform.integrations.object_store import S3ObjectStore
from job_search_platform.services.documents import Artifacts
from job_search_platform.workers.executor import RunExecutor
from job_search_platform.workers.queue import PostgresRunQueue
from test_paired_sessions import PREFIX, _project, _session, _upload
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

PDF = b"%PDF-1.7\nSynthetic export\n%%EOF\n"
SENTINEL = "sentinel-zq9"
CV_TEXT = f"Synthetic Person\nGeneral engineer. {SENTINEL}"
JOB = {"title": "Platform Engineer", "company": "Example Co",
       "description": "Needs Python, Docker, Kubernetes and Terraform experience."}


class _Runtime:
    """Replies to each submit with the next scripted JSON; the exporter writes a tiny PDF."""

    instance_id = uuid4()

    def __init__(self, root, script):
        self.projects: dict = {}
        self.root, self.script, self.submits, self.engines = root, list(script), [], []

    async def start_project(self, project_id, workspace):
        self.projects[project_id] = SimpleNamespace(
            process=SimpleNamespace(pid=os.getpid(), returncode=0), workspace=workspace)
        return self.projects[project_id]

    async def parse_input(self, project_id, path):
        return SimpleNamespace(text=CV_TEXT)

    async def submit(self, project_id, session_id, prompt, instructions, provider, **kwargs):
        assert (provider.provider, provider.model, provider.base_url) == ("custom", "ai-analyze", "http://127.0.0.1:4000/v1")
        self.submits.append((session_id, prompt, kwargs))

    async def events(self, project_id):
        edits = self.script.pop(0) if self.script else []
        yield SimpleNamespace(kind="result", result=json.dumps({"edits": edits}))

    async def export_document(self, project_id, fmt, source, output, engine="chromium"):
        self.engines.append(engine)
        # Like the real bridge, the exporter runs the sandbox terminal tool, so it asks the project tool gate.
        gate = getattr(self.projects[project_id], "tool_gate", None)
        if gate is not None and not await gate("export", "terminal"):
            raise RuntimeError("export_failed")
        (self.projects[project_id].workspace / output).write_bytes(PDF)
        return output

    async def stop(self, project_id):
        return None

    async def close(self, project_id=None):
        self.projects.pop(project_id, None)




def _execute_next(ctx, runtime):
    store = S3ObjectStore(ctx.s3, ctx.bucket)
    queue = PostgresRunQueue(ctx.sessions)
    root = ctx.tmp_path / "ws"
    artifacts = Artifacts(ctx.sessions, store, lambda p, r: root / str(p) / str(r) / "staging")
    executor = RunExecutor(ctx.sessions, queue, runtime, artifacts, store, workspace_root=root)
    lease = f"test-{uuid4()}"
    claimed = queue.claim_next(lease)
    assert claimed is not None
    asyncio.run(executor.execute(claimed, lease))
    return claimed.id


def _setup(ctx, script):
    csrf = _owner(ctx)
    pid = _project(ctx, csrf)
    cv = _upload(ctx, csrf, pid).json()
    cancel_queued_extract_runs(ctx.sessions)
    session = _session(ctx, csrf, pid, cv["latest_revision"]["id"], job=JOB).json()
    ctx.client.post(f"{PREFIX}/{pid}/runs/{session['evaluation_run_id']}/cancel", headers=_write_headers(csrf))
    facts = {}
    for key, text in {"docker": "Packaged services with Docker", "k8s": "Operated Kubernetes clusters",
                      "tf": "Wrote Terraform modules", "py": "Wrote Python services"}.items():
        facts[key] = ctx.client.post(f"{PREFIX}/{pid}/experience", headers=_write_headers(csrf),
                                     json={"kind": "skill", "text": text}).json()["id"]
    return csrf, pid, session, facts, _Runtime(ctx.tmp_path / "ws", script)


def _tailor(ctx, csrf, pid, session, key, **extra):
    return ctx.client.post(f"{PREFIX}/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": session["id"], "operation": "tailor_cv", "output_language": "en",
        "idempotency_key": key, **extra})


def _edit(text, *ids, find=""):
    return {"find": find, "text": text, "evidence_ids": list(ids)}


def _run(ctx, run_id):
    with ctx.sessions() as db:
        return db.get(Run, UUID(str(run_id)))


def _revisions(ctx, pid):
    with ctx.sessions() as db:
        return list(db.scalars(select(DocumentRevision).where(DocumentRevision.project_id == UUID(pid))
                               .order_by(DocumentRevision.created_at)))


@pytest.mark.integration
def test_autopilot_gates_edits_stops_and_appends_one_revision(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _Runtime(ctx.tmp_path / "ws", [
        [_edit("Used Python at scale", str(uuid4())),
         _edit("Cut Kubernetes cost by 90%", facts["k8s"]),
         _edit("Packaged services with Docker", facts["docker"])],
        [_edit("Operated Kubernetes clusters", facts["k8s"])],
    ])
    run_id = _tailor(ctx, csrf, pid, session, "t1").json()["id"]
    _execute_next(ctx, runtime)
    run = _run(ctx, run_id)
    assert run.status == "completed"
    payload = run.result_payload
    assert payload["kind"] == "tailor" and payload["mode"] == "autopilot" and payload["base_revision_id"] is None
    assert payload["stop_reason"] == "no_gain"
    assert payload["coverage_before"] == 0.0 and payload["coverage_after"] == 0.5
    statuses = [p["status"] for p in payload["proposals"]]
    assert statuses.count("rejected_by_gate") == 2 and statuses.count("applied") == 2
    assert [r["round"] for r in payload["rounds"]] == [1, 2, 3, 4]
    assert len({sid for sid, *_ in runtime.submits}) == 4
    revisions = _revisions(ctx, pid)
    assert len(revisions) == 1
    assert "Docker" in revisions[0].content_markdown and "Kubernetes" in revisions[0].content_markdown
    assert "Terraform" not in revisions[0].content_markdown and "90%" not in revisions[0].content_markdown
    with ctx.sessions() as db:
        assert db.scalar(select(func.count()).select_from(CVRevision)) == 1
        assert db.scalar(select(CVRevisionText.text)) == CV_TEXT
        events = json.dumps(list(db.scalars(select(RunEvent.public_data).where(RunEvent.run_id == UUID(run_id)))))
    assert SENTINEL not in events and "Docker" not in events and "tailor_round" in events

    # A second autopilot run appends to the same document, starting from its latest revision.
    runtime.script = [[_edit("Wrote Terraform modules", facts["tf"])]]
    second = _tailor(ctx, csrf, pid, session, "t2").json()["id"]
    _execute_next(ctx, runtime)
    revisions = _revisions(ctx, pid)
    assert len(revisions) == 2 and revisions[0].document_id == revisions[1].document_id
    assert revisions[1].content_markdown.startswith(revisions[0].content_markdown)
    assert "Terraform" in revisions[1].content_markdown
    assert _run(ctx, second).result_payload["base_revision_id"] == str(revisions[0].id)


@pytest.mark.integration
def test_autopilot_rejects_an_edit_that_invents_an_employer(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _Runtime(ctx.tmp_path / "ws", [[
        _edit("Packaged services with Docker at Google", facts["docker"]),
        _edit("Operated Kubernetes clusters", facts["k8s"])]])
    run_id = _tailor(ctx, csrf, pid, session, "t-name").json()["id"]
    _execute_next(ctx, runtime)
    proposals = _run(ctx, run_id).result_payload["proposals"]
    assert {p["text"]: p["status"] for p in proposals} == {
        "Operated Kubernetes clusters": "applied", "Packaged services with Docker at Google": "rejected_by_gate"}
    (revision,) = _revisions(ctx, pid)
    assert "Google" not in revision.content_markdown and "Kubernetes" in revision.content_markdown


def _interactive(ctx, csrf, pid, session, facts, key="i1"):
    runtime = _Runtime(ctx.tmp_path / "ws", [[
        _edit("Packaged services with Docker", facts["docker"]),
        _edit("Wrote Terraform modules", facts["tf"]),
        _edit("Invented 12 awards", str(uuid4()))]])
    run_id = _tailor(ctx, csrf, pid, session, key, tailor_mode="interactive").json()["id"]
    _execute_next(ctx, runtime)
    return run_id, runtime


@pytest.mark.integration
def test_interactive_proposals_then_apply_and_restore(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    run_id, runtime = _interactive(ctx, csrf, pid, session, facts)
    run = _run(ctx, run_id)
    assert run.status == "needs_input" and run.result_payload["mode"] == "interactive"
    assert [p["status"] for p in run.result_payload["proposals"]] == ["proposed", "proposed", "rejected_by_gate"]
    assert _revisions(ctx, pid) == []
    url = f"{PREFIX}/{pid}/runs/{run_id}/tailor/apply"
    headers = _write_headers(csrf)
    assert ctx.client.post(url, headers=headers, json={"proposal_ids": [2]}).json()["code"] == "evidence_required"
    assert ctx.client.post(url, headers=headers, json={"proposal_ids": []}).status_code == 422
    applied = ctx.client.post(url, headers=headers, json={"proposal_ids": [0, 1]})
    assert applied.status_code == 202 and applied.json()["operation"] == "export_document"
    assert _run(ctx, run_id).status == "completed"
    assert ctx.client.post(url, headers=headers, json={"proposal_ids": [0]}).json()["code"] == "tailor_already_applied"
    _execute_next(ctx, runtime)
    assert runtime.engines == ["typst"]
    (first,) = _revisions(ctx, pid)
    assert CV_TEXT in first.content_markdown and "Docker" in first.content_markdown and "Terraform" in first.content_markdown

    # Second batch on the same document, then undo it with restore.
    runtime.script = [[_edit("Wrote Python services", facts["py"])]]
    again = _tailor(ctx, csrf, pid, session, "i2", tailor_mode="interactive").json()["id"]
    _execute_next(ctx, runtime)
    assert ctx.client.post(f"{PREFIX}/{pid}/runs/{again}/tailor/apply", headers=headers, json={"proposal_ids": [0]}).status_code == 202
    _execute_next(ctx, runtime)
    assert len(_revisions(ctx, pid)) == 2
    restore = ctx.client.post(f"{PREFIX}/{pid}/documents/{first.document_id}/revisions/{first.id}/restore", headers=headers)
    assert restore.status_code == 202
    assert _run(ctx, restore.json()["id"]).input_snapshot["export_content_markdown"] == first.content_markdown
    _execute_next(ctx, runtime)
    revisions = _revisions(ctx, pid)
    assert len(revisions) == 3 and revisions[2].content_markdown == first.content_markdown
    assert runtime.engines == ["typst"] * 3  # apply, apply, restore all render CVs with typst
    edit = ctx.client.post(f"{PREFIX}/{pid}/documents/{first.document_id}/revisions", headers=headers,
                           json={"content_markdown": "# Hand edited CV"})
    assert edit.status_code == 202
    _execute_next(ctx, runtime)
    assert runtime.engines[-1] == "typst" and len(runtime.engines) == 4  # manual edit too
    assert ctx.client.post(f"{PREFIX}/{pid}/documents/{first.document_id}/revisions/{uuid4()}/restore",
                           headers=headers).status_code == 404


@pytest.mark.integration
def test_tampered_proposal_is_rejected_on_apply(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    run_id, _ = _interactive(ctx, csrf, pid, session, facts)
    with ctx.sessions.begin() as db:
        run = db.get(Run, UUID(run_id))
        payload = json.loads(json.dumps(run.result_payload))
        payload["proposals"][0]["evidence_ids"] = [str(uuid4())]
        run.result_payload = payload
        flag_modified(run, "result_payload")
    response = ctx.client.post(f"{PREFIX}/{pid}/runs/{run_id}/tailor/apply", headers=_write_headers(csrf),
                               json={"proposal_ids": [0, 1]})
    assert response.status_code == 400 and response.json()["code"] == "evidence_required"
    assert _revisions(ctx, pid) == []


@pytest.mark.integration
def test_grant_cannot_apply_or_restore(api_context):
    ctx = api_context
    csrf, pid, *_ = _setup(ctx, [])
    token = ctx.client.post(f"{PREFIX}/{pid}/grants", headers=_write_headers(csrf), json={
        "capabilities": ["results:read", "cv:tailor"], "expires_at": "2099-01-01T00:00:00Z"}).json()["token"]
    ctx.client.cookies.clear()
    bearer = {"Authorization": f"Bearer {token}"}
    apply = ctx.client.post(f"{PREFIX}/{pid}/runs/{uuid4()}/tailor/apply", headers=bearer, json={"proposal_ids": [0]})
    restore = ctx.client.post(f"{PREFIX}/{pid}/documents/{uuid4()}/revisions/{uuid4()}/restore", headers=bearer)
    assert apply.status_code in (401, 403) and restore.status_code in (401, 403)


@pytest.mark.integration
def test_digit_splice_rejected_in_autopilot_and_apply(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    one = ctx.client.post(f"{PREFIX}/{pid}/experience", headers=_write_headers(csrf),
                          json={"kind": "skill", "text": "Led 1 project"}).json()["id"]
    splice = _edit("sentinel-zq1", one, find="sentinel-zq")  # CV has "zq9": would become "zq19"
    runtime = _Runtime(ctx.tmp_path / "ws", [[splice], []])
    run_id = _tailor(ctx, csrf, pid, session, "s1").json()["id"]
    _execute_next(ctx, runtime)
    assert [p["status"] for p in _run(ctx, run_id).result_payload["proposals"]] == ["rejected_by_gate"]
    assert "zq19" not in _revisions(ctx, pid)[0].content_markdown

    runtime.script = [[splice]]
    inter = _tailor(ctx, csrf, pid, session, "s2", tailor_mode="interactive").json()["id"]
    _execute_next(ctx, runtime)
    assert _run(ctx, inter).result_payload["proposals"][0]["status"] == "proposed"
    response = ctx.client.post(f"{PREFIX}/{pid}/runs/{inter}/tailor/apply", headers=_write_headers(csrf),
                               json={"proposal_ids": [0]})
    assert response.status_code == 400 and response.json()["code"] == "evidence_required"


@pytest.mark.integration
def test_concurrent_tailor_runs_and_restore_are_document_busy(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    headers = _write_headers(csrf)
    runtime = _Runtime(ctx.tmp_path / "ws", [[_edit("Wrote Python services", facts["py"])]])
    _tailor(ctx, csrf, pid, session, "b1")
    # Second tailor run for the same job (no document yet) while the first is queued.
    assert _tailor(ctx, csrf, pid, session, "b2").json()["code"] == "document_busy"
    _execute_next(ctx, runtime)
    (first,) = _revisions(ctx, pid)
    # A queued tailor run on the live document blocks restore and further tailor runs.
    queued = _tailor(ctx, csrf, pid, session, "b3")
    assert queued.status_code == 202
    assert _tailor(ctx, csrf, pid, session, "b4").json()["code"] == "document_busy"
    restore = ctx.client.post(f"{PREFIX}/{pid}/documents/{first.document_id}/revisions/{first.id}/restore", headers=headers)
    assert restore.status_code == 409 and restore.json()["code"] == "document_busy"


@pytest.mark.integration
def test_full_starting_coverage_skips_rounds(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _Runtime(ctx.tmp_path / "ws", [[_edit("Wrote Python services", facts["py"])]])

    async def covered(project_id, path):
        return SimpleNamespace(text="Skills: Python, Docker, Kubernetes, Terraform")

    runtime.parse_input = covered
    auto = _tailor(ctx, csrf, pid, session, "f1").json()["id"]
    _execute_next(ctx, runtime)
    run = _run(ctx, auto)
    assert run.status == "completed" and run.result_payload["stop_reason"] == "full_coverage"
    assert run.result_payload["rounds"] == [] and run.result_payload["proposals"] == []
    assert _revisions(ctx, pid) == [] and runtime.submits == []
    inter = _tailor(ctx, csrf, pid, session, "f2", tailor_mode="interactive").json()["id"]
    _execute_next(ctx, runtime)
    assert _run(ctx, inter).result_payload["proposals"] == [] and runtime.submits == []


@pytest.mark.integration
def test_tailor_tool_gate_denies_every_call_but_counts_it(api_context):
    ctx = api_context
    csrf, pid, session, facts, _ = _setup(ctx, [])
    runtime = _Runtime(ctx.tmp_path / "ws", [[_edit("Wrote Python services", facts["py"])]])
    verdicts = []

    async def submit(project_id, session_id, prompt, instructions, provider, **kwargs):
        verdicts.append(await kwargs["tool_gate"]("call-1", "terminal"))

    runtime.submit = submit
    run_id = _tailor(ctx, csrf, pid, session, "g1").json()["id"]
    _execute_next(ctx, runtime)
    assert verdicts and not any(verdicts)
    assert _run(ctx, run_id).tool_calls >= 1


@pytest.mark.integration
def test_key_lost_after_admission_fails_run_with_gateway_message(api_context, monkeypatch, tmp_path):
    ctx = api_context
    csrf, pid, session, facts, runtime = _setup(ctx, [])
    run_id = _tailor(ctx, csrf, pid, session, "lost-key").json()["id"]
    monkeypatch.delenv("LITELLM_API_KEY")
    monkeypatch.setenv("CORE02_PRIVATE_DIR", str(tmp_path))
    _execute_next(ctx, runtime)
    assert _run(ctx, run_id).status == "failed"
    with ctx.sessions() as db:
        events = [e.public_data for e in db.scalars(select(RunEvent).where(RunEvent.run_id == UUID(run_id)))]
    assert any(e["status"] == "failed" and e.get("message_key") == "errors.gateway_unconfigured" for e in events)
