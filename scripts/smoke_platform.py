"""Exercise the running platform with synthetic data and an owner-configured provider.

Credentials stay inside the backend/Keychain. Output contains only sanitized evidence.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
import time
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

import httpx
from sqlalchemy import select
from job_search_platform.main import build_services
from job_search_platform.db.models import ProviderConfiguration, Run, StoredFile
from job_search_platform.services.owner_sessions import CSRF_HEADER


class SmokeFailure(Exception):
    """Stable diagnostic without request content, upstream errors or credentials."""


async def confirm_native_stopped(services, project_id, run_id, timeout=30):
    import subprocess
    from job_search_platform.workers.supervisor import _find_native_process
    workspace = services.runtime.workspace_root / str(project_id) / str(run_id)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with services.sessions() as db:
            row = db.get(Run, UUID(str(run_id)))
            terminal_state = row is not None and row.status in {"completed", "failed", "interrupted", "cancelled"}
        if terminal_state:
            native = await asyncio.to_thread(_find_native_process, workspace)
            remaining = await asyncio.to_thread(subprocess.run, [
                "docker", "ps", "-aq", "--filter", f"label=platform.project={project_id}",
                "--filter", f"label=platform.run={run_id}", "--filter", "label=platform.task=CORE-03",
            ], capture_output=True, text=True, timeout=10)
            if native is None and remaining.returncode == 0 and not remaining.stdout.strip():
                return
        await asyncio.sleep(0.2)
    raise SmokeFailure("native_stop_unconfirmed")


async def smoke(origin: str, source_project: UUID | None) -> dict:
    if origin not in {"http://127.0.0.1:8000", "http://localhost:8000"}:
        raise SmokeFailure("smoke_requires_default_owner_loopback")
    services = build_services()
    smoke_project_id = None
    try:
        with services.sessions() as db:
            query = select(ProviderConfiguration).where(
                ~ProviderConfiguration.secret_reference.startswith("restored-unconfigured:")
            ).order_by(ProviderConfiguration.updated_at.desc())
            if source_project:
                query = query.where(ProviderConfiguration.project_id == source_project)
            source = db.scalar(query.limit(1))
            if source is None:
                return {"status": "blocked", "reason": "configure_provider_in_settings"}
            provider = (source.provider, source.model, source.secret_reference, source.base_url)
        async with httpx.AsyncClient(base_url=origin, timeout=90, headers={"Origin": origin}) as client:
            launch = await services.owner_sessions.create_launch_nonce(origin)
            response = await client.post("/api/v1/owner/bootstrap", json={"nonce": launch.nonce})
            if response.status_code != 200:
                raise SmokeFailure("owner_bootstrap_failed")
            client.headers[CSRF_HEADER] = response.json()["csrf_token"]

            async def request(method, path, **kwargs):
                response = await client.request(method, "/api/v1" + path, **kwargs)
                if response.status_code >= 400:
                    raise SmokeFailure("platform_request_failed")
                return response

            project = (await request("POST", "/projects", json={"name": "Synthetic platform smoke"})).json()
            pid = UUID(project["id"])
            smoke_project_id = pid
            with services.sessions.begin() as db:
                # Reuse only the owner's Keychain reference; no raw key enters HTTP or output.
                db.add(ProviderConfiguration(project_id=pid, provider=provider[0], model=provider[1],
                                             secret_reference=provider[2], base_url=provider[3], revision=1))
            session = (await request("POST", f"/projects/{pid}/sessions", json={"title": "Synthetic acceptance"})).json()
            await request("POST", f"/projects/{pid}/cv", files={"file": (
                "synthetic-cv.txt", "Synthetic Candidate\nData analyst, SQL and Python. Three years. Bangkok.", "text/plain")})
            job = (await request("POST", f"/projects/{pid}/jobs", json={
                "title": "Synthetic Bangkok data analyst", "company": "Synthetic Example Co",
                "description": "Synthetic job requires Python, SQL and data analysis in Bangkok."})).json()

            async def submit(operation):
                from uuid import uuid4
                return (await request("POST", f"/projects/{pid}/runs", json={
                    "session_id": session["id"], "operation": operation, "job_revision_id": job["id"],
                    "output_language": "th", "idempotency_key": str(uuid4())})).json()

            async def terminal(run):
                deadline = time.monotonic() + 600
                while time.monotonic() < deadline:
                    view = (await request("GET", f"/projects/{pid}/runs/{run['id']}")).json()
                    if view["status"] in {"completed", "failed", "cancelled", "interrupted"}:
                        return view
                    await asyncio.sleep(0.5)
                raise SmokeFailure("run_timeout")

            evaluation = await terminal(await submit("evaluate_job"))
            if evaluation["status"] != "completed" or not evaluation.get("evaluation_result"):
                raise SmokeFailure("evaluation_not_completed")
            draft = await terminal(await submit("draft_documents"))
            if draft["status"] != "completed" or not draft["result_file_ids"]:
                raise SmokeFailure("draft_not_completed")
            formats = set()
            for file_id in draft["result_file_ids"]:
                download = await request("GET", f"/projects/{pid}/files/{file_id}/download")
                with services.sessions() as db:
                    stored = db.get(StoredFile, UUID(file_id))
                    if stored is None or stored.project_id != pid or hashlib.sha256(download.content).hexdigest() != stored.checksum_sha256:
                        raise SmokeFailure("export_checksum_mismatch")
                    formats.add(stored.mime_type)
                    if stored.mime_type == "application/pdf" and not download.content.startswith(b"%PDF-"):
                        raise SmokeFailure("invalid_pdf_export")
                    if stored.mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and not download.content.startswith(b"PK"):
                        raise SmokeFailure("invalid_docx_export")
            if not {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"} <= formats:
                raise SmokeFailure("required_exports_missing")
            documents = (await request("GET", f"/projects/{pid}/documents")).json()
            owned = [document for document in documents if document["source_run_id"] == draft["id"]]
            if not owned or any(document["output_language"] != "th" or document["partial"] for document in owned):
                raise SmokeFailure("document_language_or_completion_mismatch")
            cancelling = await submit("evaluate_job")
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                with services.sessions() as db:
                    row = db.get(Run, UUID(cancelling["id"]))
                    started = row is not None and row.execution_pid is not None and row.execution_created_at is not None and row.sandbox_id is not None
                    finished = row is not None and row.status in {"completed", "failed", "interrupted", "cancelled"}
                if started:
                    break
                if finished:
                    raise SmokeFailure("cancel_probe_finished_before_native_start")
                await asyncio.sleep(0.1)
            else:
                raise SmokeFailure("cancel_probe_native_start_timeout")
            await request("POST", f"/projects/{pid}/runs/{cancelling['id']}/cancel")
            stopped = await terminal(cancelling)
            await confirm_native_stopped(services, pid, cancelling["id"])
            if stopped["status"] != "cancelled":
                raise SmokeFailure("native_cancel_not_confirmed")
            return {"status": "passed", "evaluation": True, "draft": True,
                    "checksummed_exports": len(draft["result_file_ids"]), "native_cancel": True}
    finally:
        # A failed probe must not leave its own synthetic native work running.
        if smoke_project_id is not None:
            with services.sessions() as db:
                pending = list(db.scalars(select(Run.id).where(
                    Run.project_id == smoke_project_id,
                    Run.status.in_(["queued", "running", "waiting_approval"]),
                )))
            if pending:
                try:
                    async with httpx.AsyncClient(base_url=origin, timeout=30, headers={"Origin": origin}) as cleanup:
                        launch = await services.owner_sessions.create_launch_nonce(origin)
                        auth = await cleanup.post("/api/v1/owner/bootstrap", json={"nonce": launch.nonce})
                        if auth.status_code != 200:
                            raise SmokeFailure("smoke_cleanup_auth_failed")
                        cleanup.headers[CSRF_HEADER] = auth.json()["csrf_token"]
                        for run_id in pending:
                            response = await cleanup.post(f"/api/v1/projects/{smoke_project_id}/runs/{run_id}/cancel")
                            if response.status_code >= 400:
                                raise SmokeFailure("smoke_cleanup_cancel_failed")
                            await confirm_native_stopped(services, smoke_project_id, run_id)
                except Exception:
                    services.engine.dispose()
                    raise SmokeFailure("smoke_cleanup_needs_owner_review") from None
        services.engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:8000")
    parser.add_argument("--configured-project", type=UUID)
    args = parser.parse_args()
    try:
        result = asyncio.run(smoke(args.origin, args.configured_project))
    except SmokeFailure as exc:
        result = {"status": "failed", "reason": str(exc)}
    except Exception:
        result = {"status": "failed", "reason": "platform_smoke_unavailable"}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
