"""Draft kinds (one live document per kind and job), manual edit exports and migration 0010."""
from __future__ import annotations

import asyncio
import json
import os
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text

from job_search_platform.db.models import Document, DocumentRevision, Run
from job_search_platform.integrations.object_store import S3ObjectStore
from job_search_platform.services.documents import Artifacts
from helpers import cancel_queued_extract_runs, grant
from job_search_platform.services.contracts import DocumentEdit
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.executor import RunExecutor
from job_search_platform.workers.queue import PostgresRunQueue
from test_paired_sessions import JOB, PREFIX, _project, _session, _upload
from test_rest_api import ROOT_FOR_MIGRATIONS, _owner, _write_headers, api_context  # noqa: F401

PDF = b"%PDF-1.7\nSynthetic export\n%%EOF\n"


class _FakeRuntime:
    """Stands in for Hermes: the 'model' writes a draft; the exporter writes a tiny PDF."""

    instance_id = uuid4()

    def __init__(self, workspace_root, declared_type="cover_letter"):
        self.projects: dict = {}
        self.root = workspace_root
        self.declared_type = declared_type
        self.submits: list[tuple] = []
        self.exports: list[tuple] = []
        self.parsed = 0

    async def start_project(self, project_id, workspace):
        self.projects[project_id] = SimpleNamespace(
            process=SimpleNamespace(pid=os.getpid(), returncode=0), workspace=workspace)
        return self.projects[project_id]

    async def parse_input(self, project_id, path):
        self.parsed += 1
        return SimpleNamespace(text="Synthetic CV text")

    async def submit(self, project_id, session_id, prompt, instructions, provider, **kwargs):
        self.submits.append((prompt, kwargs))
        (self.projects[project_id].workspace / "staging" / "draft.md").write_text(
            f"Drafted {len(self.submits)}", encoding="utf-8")

    async def events(self, project_id):
        manifest = {"drafts": [{"path": "staging/draft.md", "document_type": self.declared_type,
                                "title": "Synthetic draft", "format": "pdf"}]}
        yield SimpleNamespace(kind="result", result=json.dumps(manifest))

    async def export_document(self, project_id, fmt, source, output):
        self.exports.append((fmt, source, output))
        (self.projects[project_id].workspace / output).write_bytes(PDF)
        return output

    async def stop(self, project_id):
        return None

    async def close(self, project_id=None):
        self.projects.pop(project_id, None)


class _Settings:
    async def trusted_provider(self, *_args, **_kwargs):
        return None


def _execute_next(ctx, runtime):
    """Claim the next queued run and execute it with the fake runtime."""
    store = S3ObjectStore(ctx.s3, ctx.bucket)
    queue = PostgresRunQueue(ctx.sessions)
    root = ctx.tmp_path / "ws"
    artifacts = Artifacts(ctx.sessions, store, lambda p, r: root / str(p) / str(r) / "staging")
    executor = RunExecutor(ctx.sessions, queue, runtime, _Settings(), artifacts, store, workspace_root=root)
    lease = f"test-{uuid4()}"
    claimed = queue.claim_next(lease)
    assert claimed is not None
    asyncio.run(executor.execute(claimed, lease))
    return claimed.id


def _draft(ctx, csrf, pid, session_id, key, **extra):
    return ctx.client.post(f"{PREFIX}/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": session_id, "operation": "draft_documents", "output_language": "en",
        "idempotency_key": key, **extra})


def _setup(ctx, tmp_declared="cover_letter"):
    csrf = _owner(ctx)
    pid = _project(ctx, csrf)
    cv = _upload(ctx, csrf, pid).json()
    cancel_queued_extract_runs(ctx.sessions)
    session = _session(ctx, csrf, pid, cv["latest_revision"]["id"], job=JOB).json()
    # Creating a paired session queues its evaluation; drop it so the next claim is ours.
    ctx.client.post(f"{PREFIX}/{pid}/runs/{session['evaluation_run_id']}/cancel", headers=_write_headers(csrf))
    return csrf, pid, session, _FakeRuntime(ctx.tmp_path / "ws", tmp_declared)


def _docs(ctx, pid):
    return ctx.client.get(f"{PREFIX}/{pid}/documents").json()


@pytest.mark.integration
def test_draft_kind_validation_and_owner_only(api_context):
    csrf, pid, session, _ = _setup(api_context)
    assert _draft(api_context, csrf, pid, session["id"], "k1", draft_kind="poem").status_code == 422
    evaluate = api_context.client.post(f"{PREFIX}/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": session["id"], "operation": "evaluate_job", "output_language": "en",
        "idempotency_key": "k2", "draft_kind": "cover_letter"})
    assert evaluate.status_code == 422
    assert _draft(api_context, csrf, pid, session["id"], "k3", draft_kind="application_message").status_code == 202


@pytest.mark.integration
def test_draft_kind_forces_type_and_second_draft_of_same_kind_appends_revision(api_context):
    csrf, pid, session, runtime = _setup(api_context, tmp_declared="cover_letter")
    # The model declares cover_letter, but the owner asked for an application message.
    assert _draft(api_context, csrf, pid, session["id"], "m1", draft_kind="application_message").status_code == 202
    _execute_next(api_context, runtime)
    assert "application message" in runtime.submits[0][0]
    docs = _docs(api_context, pid)
    assert [d["document_type"] for d in docs] == ["application_message"]
    message_id = docs[0]["id"]

    # Same kind again: a new revision of the same document, with the previous draft snapshotted.
    again = _draft(api_context, csrf, pid, session["id"], "m2", draft_kind="application_message")
    assert again.status_code == 202
    with api_context.sessions() as db:
        snapshot = db.get(Run, UUID(again.json()["id"])).input_snapshot
    assert snapshot["document_id"] == message_id and snapshot["previous_draft"] == "Drafted 1"
    _execute_next(api_context, runtime)
    assert len(_docs(api_context, pid)) == 1
    revisions = api_context.client.get(f"{PREFIX}/{pid}/documents/{message_id}/revisions").json()
    assert [(r["revision"], r["origin"]) for r in revisions] == [(1, "agent"), (2, "agent")]

    # A different kind creates its own document.
    assert _draft(api_context, csrf, pid, session["id"], "c1", draft_kind="cover_letter").status_code == 202
    _execute_next(api_context, runtime)
    assert sorted(d["document_type"] for d in _docs(api_context, pid)) == ["application_message", "cover_letter"]

    # Replaying the first request is idempotent even though a document now exists.
    replay = _draft(api_context, csrf, pid, session["id"], "m1", draft_kind="application_message")
    assert replay.status_code == 202

    # A trashed document is not resolved: a fresh one is created.
    api_context.client.delete(f"{PREFIX}/{pid}/documents/{message_id}", headers=_write_headers(csrf))
    assert _draft(api_context, csrf, pid, session["id"], "m3", draft_kind="application_message").status_code == 202
    _execute_next(api_context, runtime)
    live = [d for d in _docs(api_context, pid) if d["document_type"] == "application_message"]
    assert len(live) == 1 and live[0]["id"] != message_id


@pytest.mark.integration
def test_manual_edit_exports_without_llm_and_appends_manual_revision(api_context):
    csrf, pid, session, runtime = _setup(api_context)
    headers = _write_headers(csrf)
    assert _draft(api_context, csrf, pid, session["id"], "d1", draft_kind="cover_letter").status_code == 202
    _execute_next(api_context, runtime)
    doc_id = _docs(api_context, pid)[0]["id"]
    url = f"{PREFIX}/{pid}/documents/{doc_id}/revisions"

    assert api_context.client.post(url, headers=headers, json={"content_markdown": ""}).status_code == 422
    assert api_context.client.post(url, headers=headers, json={"content_markdown": "x" * 200001}).status_code == 422
    assert api_context.client.post(url, headers=headers, json={"content_markdown": "x", "format": "txt"}).status_code == 422
    assert api_context.client.post(url, json={"content_markdown": "x"}).status_code in (401, 403)

    edited = "# Hand edited\n\nสวัสดี"
    queued = api_context.client.post(url, headers=headers, json={"content_markdown": edited})
    assert queued.status_code == 202, queued.text
    run = queued.json()
    assert run["operation"] == "export_document" and run["status"] == "queued"
    # Second edit while the first is queued is rejected.
    busy = api_context.client.post(url, headers=headers, json={"content_markdown": "again"})
    assert busy.status_code == 409 and busy.json()["code"] == "document_busy"

    submits, parsed = len(runtime.submits), runtime.parsed
    _execute_next(api_context, runtime)
    assert len(runtime.submits) == submits and runtime.parsed == parsed  # no LLM, no CV parse
    assert runtime.exports[-1][0] == "pdf"
    finished = api_context.client.get(f"{PREFIX}/{pid}/runs/{run['id']}").json()
    assert finished["status"] == "completed" and len(finished["result_file_ids"]) == 1

    revisions = api_context.client.get(url).json()
    assert [(r["revision"], r["origin"]) for r in revisions] == [(1, "agent"), (2, "manual")]
    assert revisions[1]["content_markdown"] == edited
    assert revisions[1]["source_job_revision_id"] == session["job_revision_id"]
    assert _docs(api_context, pid)[0]["latest_revision"]["revision"] == 2

    # An AI revise now starts from the manual text.
    revise = _draft(api_context, csrf, pid, session["id"], "d2", draft_kind="cover_letter")
    with api_context.sessions() as db:
        assert db.get(Run, UUID(revise.json()["id"])).input_snapshot["previous_draft"] == edited
    _execute_next(api_context, runtime)
    assert api_context.client.get(url).json()[-1]["origin"] == "agent"


@pytest.mark.integration
def test_manual_edit_missing_trashed_foreign_and_hidden_from_grants(api_context):
    csrf, pid, session, runtime = _setup(api_context)
    headers = _write_headers(csrf)
    assert _draft(api_context, csrf, pid, session["id"], "d1", draft_kind="cover_letter").status_code == 202
    _execute_next(api_context, runtime)
    doc_id = _docs(api_context, pid)[0]["id"]
    body = {"content_markdown": "edit"}

    assert api_context.client.post(f"{PREFIX}/{pid}/documents/{uuid4()}/revisions", headers=headers, json=body).status_code == 404
    other = _project(api_context, csrf, "Other")
    assert api_context.client.post(f"{PREFIX}/{other}/documents/{doc_id}/revisions", headers=headers, json=body).status_code == 404

    queued = api_context.client.post(f"{PREFIX}/{pid}/documents/{doc_id}/revisions", headers=headers, json=body).json()
    # Grants cannot see the owner-only run through the run service.
    with api_context.sessions.begin() as db:
        actor, _ = grant(db, UUID(pid), capabilities=("results:read", "documents:draft"))
    runs = api_context.client.app.state.services.runs
    with pytest.raises(ServiceError) as hidden:
        asyncio.run(runs.get(actor, UUID(pid), UUID(queued["id"])))
    assert hidden.value.code == "not_found"
    with pytest.raises(ServiceError) as forbidden:
        asyncio.run(runs.submit_export(actor, UUID(pid), UUID(doc_id), DocumentEdit(content_markdown="x")))
    assert forbidden.value.code == "forbidden"
    _execute_next(api_context, runtime)

    api_context.client.delete(f"{PREFIX}/{pid}/documents/{doc_id}", headers=headers)
    assert api_context.client.post(f"{PREFIX}/{pid}/documents/{doc_id}/revisions", headers=headers, json=body).status_code == 404


@pytest.mark.integration
def test_export_document_is_not_a_request_operation(api_context):
    csrf, pid, session, _ = _setup(api_context)
    response = api_context.client.post(f"{PREFIX}/{pid}/runs", headers=_write_headers(csrf), json={
        "session_id": session["id"], "operation": "export_document", "output_language": "en",
        "idempotency_key": "x1"})
    assert response.status_code == 422
    from job_search_platform.api import mcp
    from job_search_platform.services.contracts import ToolsView
    tools = api_context.client.get(f"{PREFIX}/{pid}/tools")
    assert "export_document" not in tools.text
    assert "export_document" not in json.dumps(ToolsView.model_json_schema()["$defs"]["ToolDescriptor"]["properties"]["name"])
    assert not hasattr(mcp, "export_document")


@pytest.mark.integration
def test_migration_0010_extends_run_operation_check(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))
    with postgres_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0009_paired_sessions")

        def constraint():
            return connection.execute(text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_runs_operation'")).scalar()

        assert "export_document" not in constraint()
        command.upgrade(config, "0010_export_document_operation")
        assert "export_document" in constraint()
        command.downgrade(config, "0009_paired_sessions")
        assert "export_document" not in constraint()
