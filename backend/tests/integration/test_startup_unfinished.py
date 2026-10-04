"""Real PostgreSQL and native cleanup proof for manual restart recovery."""
from pathlib import Path
import json
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session
from job_search_platform.db.models import Run, RunEvent
from job_search_platform.integrations.hermes_runtime import HermesRuntime
from job_search_platform.services.runs import RunService
from job_search_platform.workers.queue import PostgresRunQueue
from job_search_platform.workers.supervisor import WorkerSupervisor


@pytest.mark.parametrize("unfinished_status", ["queued", "waiting_approval"])
@pytest.mark.asyncio
async def test_startup_interrupts_unfinished_work_without_redispatch(db_session, tmp_path, unfinished_status):
    p = project(db_session, "Synthetic restart recovery")
    actor = owner(db_session)
    conversation = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    service = RunService(sessions)
    request = run_request(conversation.id, job.id)
    view = await service.submit(actor, p.id, request)
    with sessions.begin() as db:
        db.get(Run, view.id).status = unfinished_status
    config = json.loads((Path.home() / ".cache/job-search-platform/hermes-runtime.json").read_text())
    runtime = HermesRuntime(
        config["image"], environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]), workspace_root=tmp_path,
    )
    queue = PostgresRunQueue(sessions)
    supervisor = WorkerSupervisor(sessions, queue, object(), runtime)
    await supervisor.reconcile_startup()
    await supervisor.reconcile_startup()
    with sessions() as db:
        recovered = db.get(Run, view.id)
        assert recovered.status == "interrupted"
        assert recovered.finished_at is not None
        assert recovered.lease_owner is None
        assert recovered.lease_expires_at is None
        assert recovered.active_started_at is None
        events = list(db.scalars(select(RunEvent).where(RunEvent.run_id == view.id)))
        assert sum(event.event_type == "run_interrupted" for event in events) == 1
    assert queue.claim_next("synthetic-post-restart") is None
    retry = await service.submit(actor, p.id, request.model_copy(update={
        "retry_of_id": view.id, "idempotency_key": str(uuid.uuid4()),
    }))
    claimed = queue.claim_next("synthetic-manual-retry")
    assert claimed is not None and claimed.id == retry.id and claimed.id != view.id
