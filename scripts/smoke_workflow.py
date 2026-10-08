"""Run an owner-configured real-provider workflow using synthetic CV/job data."""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
import sys

from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from job_search_platform.db.models import (  # noqa: E402
    CVRevision,
    ConversationSession,
    JobRevision,
    OwnerSession,
    Project,
    ProviderConfiguration,
    Run,
    RunArtifact,
    StoredFile,
    ToolConnectorConfiguration,
)
from job_search_platform.db.session import make_engine, make_session_factory  # noqa: E402
from job_search_platform.integrations.hermes_runtime import HermesRuntime  # noqa: E402
from job_search_platform.integrations.object_store import S3ObjectStore  # noqa: E402
from job_search_platform.integrations.secrets import MacOSKeychain  # noqa: E402
from job_search_platform.services.contracts import Actor, RunRequest  # noqa: E402
from job_search_platform.services.documents import Artifacts  # noqa: E402
from job_search_platform.services.errors import ServiceError  # noqa: E402
from job_search_platform.services.runs import RunService  # noqa: E402
from job_search_platform.services.settings import Settings  # noqa: E402
from job_search_platform.workers.executor import RunExecutor  # noqa: E402
from job_search_platform.workers.queue import PostgresRunQueue  # noqa: E402


def _emit(value: dict[str, object]) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


async def _run(project_id: uuid.UUID) -> int:
    required = ("DATABASE_URL", "OBJECT_STORE_ENDPOINT", "OBJECT_STORE_BUCKET",
                "OBJECT_STORE_ACCESS_KEY", "OBJECT_STORE_SECRET_KEY")
    if any(not os.environ.get(name) for name in required):
        _emit({"status": "blocked", "reason": "local_settings_not_configured"})
        return 2
    engine = make_engine()
    sessions = make_session_factory(engine)
    client = None
    try:
        with sessions.begin() as db:
            source_project = db.scalar(select(Project).where(Project.id == project_id))
            if source_project is None:
                _emit({"status": "blocked", "reason": "project_not_found"})
                return 2
            provider = db.scalar(
                select(ProviderConfiguration)
                .where(ProviderConfiguration.project_id.is_(None))
                .order_by(ProviderConfiguration.revision.desc())
                .limit(1)
            )
            if provider is None:
                _emit({"status": "blocked", "reason": "provider_not_configured"})
                return 2
            owner_session = db.scalar(
                select(OwnerSession).where(
                    OwnerSession.revoked_at.is_(None),
                    OwnerSession.expires_at > datetime.now(timezone.utc),
                ).limit(1)
            )
            if owner_session is None:
                _emit({"status": "blocked", "reason": "owner_session_unavailable"})
                return 2
            provider_id = provider.id
            actor = Actor("owner", owner_session.id, None, None, frozenset())

        settings = Settings(sessions, MacOSKeychain())
        trusted = await settings.trusted_provider(configuration_id=provider_id)
        client = _s3_client()
        object_store = S3ObjectStore(client, os.environ["OBJECT_STORE_BUCKET"])

        # Create a separate temporary Project and synthetic revisions. Existing
        # CV, job, session, grant, and run history are never read or modified.
        smoke_project_id = uuid.uuid4()
        file_id = uuid.uuid4()
        storage_key = f"objects/smoke/{smoke_project_id}/{file_id}"
        body = (ROOT / "backend/tests/fixtures/synthetic_cv.txt").read_bytes()
        checksum = hashlib.sha256(body).hexdigest()
        await object_store.put(storage_key, body, checksum)
        with sessions.begin() as db:
            smoke_project = Project(id=smoke_project_id, name=f"CORE-08 synthetic smoke {smoke_project_id}")
            db.add(smoke_project)
            db.flush()
            db.add(ToolConnectorConfiguration(
                project_id=smoke_project_id, adapter_key="career_ops", enabled=True, revision=1
            ))
            stored = StoredFile(
                id=file_id,
                project_id=smoke_project_id,
                kind="cv_original",
                publication_state="published",
                storage_key=storage_key,
                checksum_sha256=checksum,
                size_bytes=len(body),
                mime_type="text/plain",
                display_name="synthetic-cv.txt",
            )
            cv = CVRevision(project_id=smoke_project_id, revision=1, file_id=file_id)
            job = JobRevision(
                project_id=smoke_project_id,
                revision=1,
                title="Synthetic Research Engineer",
                company="Example Research Lab",
                source_url="https://jobs.example.test/synthetic",
                description="Build reliable data systems and communicate results clearly.",
            )
            conversation = ConversationSession(project_id=smoke_project_id, title="Synthetic smoke")
            db.add_all([stored, cv, job, conversation])
            db.flush()
            config_id, cv_id, job_id, session_id = provider_id, cv.id, job.id, conversation.id

        smoke_provider = await settings.trusted_provider(configuration_id=config_id)
        if smoke_provider.provider != trusted.provider or smoke_provider.model != trusted.model:
            raise ServiceError("provider_configuration_changed")
        cache = Path.home() / ".cache" / "job-search-platform"
        runtime_config = json.loads((cache / "hermes-runtime.json").read_text())
        runtime = HermesRuntime(
            runtime_config["image"],
            environment=Path(runtime_config["environment"]),
            hermes_source=Path(runtime_config["hermes"]["source"]),
            career_ops_source=Path(runtime_config["career-ops"]["source"]),
        )
        queue = PostgresRunQueue(sessions)
        artifact_service = Artifacts(
            sessions,
            object_store,
            lambda project, run: runtime.workspace_root / str(project) / str(run) / "staging",
        )
        executor = RunExecutor(
            sessions,
            queue,
            runtime,
            settings,
            artifact_service,
            object_store,
            workspace_root=runtime.workspace_root,
        )
        runs = RunService(sessions)
        evidence: list[dict[str, object]] = []
        for operation, language in (("evaluate_job", "en"), ("draft_documents", "en"), ("draft_documents", "th")):
            run_view = await runs.submit(
                actor,
                smoke_project_id,
                RunRequest(
                    session_id=session_id,
                    operation=operation,
                    cv_revision_id=cv_id,
                    job_revision_id=job_id,
                    output_language=language,
                    idempotency_key=f"core08-{operation}-{language}-{uuid.uuid4()}",
                ),
            )
            claimed = await asyncio.to_thread(queue.claim_next, f"smoke-{uuid.uuid4()}")
            if claimed is None or claimed.id != run_view.id:
                raise ServiceError("smoke_queue_claim_failed")
            await executor.execute(claimed, claimed.lease_owner)
            with sessions() as db:
                saved = db.get(Run, run_view.id)
                artifacts = list(db.scalars(
                    select(StoredFile)
                    .join(RunArtifact, RunArtifact.file_id == StoredFile.id)
                    .where(RunArtifact.project_id == smoke_project_id, RunArtifact.run_id == run_view.id)
                ).all())
                file_proof = []
                for item in artifacts:
                    output = await object_store.get(item.storage_key)
                    digest = hashlib.sha256(output).hexdigest()
                    if digest != item.checksum_sha256:
                        raise ServiceError("smoke_checksum_mismatch")
                    file_proof.append({"file_id": str(item.id), "sha256": digest, "mime_type": item.mime_type})
                evidence.append({
                    "run_id": str(run_view.id),
                    "operation": operation,
                    "language": language,
                    "status": saved.status,
                    "evaluation_report_present": bool(saved.evaluation_result),
                    "artifacts": file_proof,
                })
                if saved.status != "completed":
                    _emit({"status": "failed", "runs": evidence})
                    return 1
        _emit({"status": "complete", "project_id": str(smoke_project_id), "runs": evidence})
        return 0
    except ServiceError as error:
        _emit({"status": "blocked", "reason": error.code})
        return 2
    except Exception:
        _emit({"status": "blocked", "reason": "local_smoke_unavailable"})
        return 2
    finally:
        if client is not None:
            client.close()
        engine.dispose()


def _s3_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["OBJECT_STORE_ENDPOINT"],
        aws_access_key_id=os.environ["OBJECT_STORE_ACCESS_KEY"],
        aws_secret_access_key=os.environ["OBJECT_STORE_SECRET_KEY"],
        region_name=os.environ.get("OBJECT_STORE_REGION", "us-east-1"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic", action="store_true", required=True)
    parser.add_argument("--project-id", required=True, type=uuid.UUID)
    options = parser.parse_args()
    return asyncio.run(_run(options.project_id))


if __name__ == "__main__":
    raise SystemExit(main())
