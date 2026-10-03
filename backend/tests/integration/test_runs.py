"""Run submission, replay, limits, and ownership regressions on PostgreSQL."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from helpers import (
    grant,
    owner,
    project,
    provider_config,
    revisions,
    run_request,
    session,
)
from job_search_platform.db.models import (
    CVRevision,
    Document,
    DocumentRevision,
    JobRevision,
    ProviderConfiguration,
    Run,
    RunArtifact,
    RunEvent,
    StoredFile,
)
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService, actor_scope
from job_search_platform.workers.queue import PostgresRunQueue
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker


def _service(db_session):
    return RunService(sessionmaker(bind=db_session.get_bind(), expire_on_commit=False))


def _submit(service, actor, project_id, request):
    return asyncio.run(service.submit(actor, project_id, request))


def test_idempotent_replay_keeps_original_implicit_cv_and_config_snapshot(db_session):
    p = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    provider = provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    request = run_request(chat.id, job.id, key="stable-replay")

    first = _submit(service, actor, p.id, request)
    with service.sessions.begin() as db:
        db.add(CVRevision(project_id=p.id, revision=2))
        db.add(
            ProviderConfiguration(
                project_id=p.id,
                provider="synthetic-next",
                model="new-model",
                secret_reference="secret-ref://synthetic/next",
                revision=2,
            )
        )

    replay = _submit(service, actor, p.id, request)
    assert replay.id == first.id
    with service.sessions.begin() as db:
        saved = db.get(Run, first.id)
        assert saved.cv_revision_id == cv.id
        assert saved.provider_configuration_id == provider.id
        assert saved.input_snapshot["cv_revision_id"] == str(cv.id)
        assert saved.config_snapshot["model"] == "test-model"
        assert db.scalar(select(RunEvent.sequence).where(RunEvent.run_id == first.id)) == 1

    with pytest.raises(ServiceError, match="idempotency_conflict"):
        _submit(service, actor, p.id, request.model_copy(update={"output_language": "th"}))


def test_grant_scopes_are_distinct_and_replay_does_not_create_another_run(db_session):
    p = project(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    first_actor, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    second_actor, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    db_session.commit()
    service = _service(db_session)
    request = run_request(chat.id, job.id, key="per-grant")

    first = _submit(service, first_actor, p.id, request)
    assert _submit(service, first_actor, p.id, request).id == first.id
    second = _submit(service, second_actor, p.id, request)
    assert second.id != first.id
    with service.sessions.begin() as db:
        assert db.scalar(select(Run.actor_scope).where(Run.id == first.id)) == actor_scope(first_actor)
        assert db.scalar(select(Run.actor_scope).where(Run.id == second.id)) == actor_scope(second_actor)


def test_project_queue_limit_and_retry_create_a_new_run(db_session):
    p = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, p.id)
    cv, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)

    runs = [_submit(service, actor, p.id, run_request(chat.id, job.id, key=f"queued-{i}")) for i in range(10)]
    with pytest.raises(ServiceError, match="queue_full"):
        _submit(service, actor, p.id, run_request(chat.id, job.id, key="queued-overflow"))

    with service.sessions.begin() as db:
        old = db.get(Run, runs[0].id)
        old.status = "failed"
        changed_job = JobRevision(
            project_id=p.id,
            revision=2,
            title="Different synthetic job",
            description="Changed input",
        )
        db.add(changed_job)
        db.flush()
    retry_request = run_request(chat.id, job.id, key="retry-new-run").model_copy(
        update={"retry_of_id": runs[0].id, "cv_revision_id": cv.id}
    )
    with pytest.raises(ServiceError, match="retry_input_mismatch"):
        _submit(service, actor, p.id, retry_request.model_copy(update={"job_revision_id": changed_job.id}))
    retry = _submit(service, actor, p.id, retry_request)
    assert retry.id != runs[0].id
    assert retry.retry_of_id == runs[0].id


def test_grant_hourly_quota_counts_new_runs_but_not_idempotent_replay(db_session):
    p = project(db_session, "Grant quota")
    actor, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    queue = PostgresRunQueue(service.sessions)
    requests = []
    first_id = None

    for index in range(20):
        request = run_request(chat.id, job.id, key=f"hourly-{index}")
        requests.append(request)
        created = _submit(service, actor, p.id, request)
        if index == 0:
            first_id = created.id
        claimed = queue.claim_next(f"quota-worker-{index}")
        assert claimed is not None and claimed.id == created.id
        queue.finish(created.id, claimed.lease_owner, "completed")

    assert _submit(service, actor, p.id, requests[0]).id == first_id
    with pytest.raises(ServiceError, match="submission_rate_limited"):
        _submit(service, actor, p.id, run_request(chat.id, job.id, key="hourly-overflow"))


def test_grant_cancellation_requires_current_creator_and_terminal_is_immutable(db_session):
    p = project(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    creator, persisted = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    other, _ = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    db_session.commit()
    service = _service(db_session)
    run = _submit(service, creator, p.id, run_request(chat.id, job.id, key="grant-cancel"))

    with pytest.raises(ServiceError, match="forbidden"):
        import asyncio
        asyncio.run(service.cancel(other, p.id, run.id))
    import asyncio
    requested = asyncio.run(service.cancel(creator, p.id, run.id))
    assert requested.status == "cancelled"  # Queued cancellation is immediate.
    repeated = asyncio.run(service.cancel(creator, p.id, run.id))
    assert repeated.status == "cancelled"
    with service.sessions.begin() as db:
        saved = db.get(Run, run.id)
        saved.status = "completed"
        saved.finished_at = saved.created_at
    terminal = asyncio.run(service.cancel(creator, p.id, run.id))
    assert terminal.status == "completed"

    with service.sessions.begin() as db:
        grant_row = db.get(type(persisted), persisted.id)
        grant_row.revoked_at = run.created_at
    with pytest.raises(ServiceError, match="unauthorized"):
        asyncio.run(service.cancel(creator, p.id, run.id))


def test_revoked_creator_grant_is_checked_again_at_dispatch(db_session):
    p = project(db_session, "Revoked before dispatch")
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    actor, persisted = grant(db_session, p.id, capabilities=("jobs:evaluate",))
    db_session.commit()
    service = _service(db_session)
    queued = _submit(service, actor, p.id, run_request(chat.id, job.id, key="revoke-at-dispatch"))
    with service.sessions.begin() as db:
        db.get(type(persisted), persisted.id).revoked_at = queued.created_at
    assert PostgresRunQueue(service.sessions).claim_next("revoked-grant-worker") is None
    with service.sessions.begin() as db:
        saved = db.get(Run, queued.id)
        assert saved.status == "failed"


def test_concurrent_same_key_submission_uses_two_connections(db_session):
    p = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    barrier = Barrier(2)
    request = run_request(chat.id, job.id, key="concurrent-same-key")

    def submit():
        barrier.wait()
        return _submit(service, actor, p.id, request).id

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(lambda _: submit(), range(2)))
    assert ids[0] == ids[1]
    with service.sessions.begin() as db:
        assert db.scalar(select(func.count()).select_from(Run).where(Run.project_id == p.id)) == 1


def test_public_run_event_rejects_non_whitelisted_private_data(db_session):
    from job_search_platform.services.runs import append_event

    p = project(db_session)
    actor = owner(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    view = _submit(service, actor, p.id, run_request(chat.id, job.id))
    with pytest.raises(ServiceError, match="invalid_event_data"), service.sessions.begin() as db:
        run = db.get(Run, view.id)
        append_event(db, run, "run_progress", {"step": "private", "raw_cv": "synthetic PII"})


def test_project_results_reader_sees_other_creator_run_and_only_published_files(db_session):
    p = project(db_session, "Shared results")
    creator = owner(db_session)
    reader, _ = grant(db_session, p.id, capabilities=("results:read",))
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    created = _submit(service, creator, p.id, run_request(chat.id, job.id, key="shared-result"))
    artifacts = {}
    with service.sessions.begin() as db:
        for state in ("published", "pending", "unavailable"):
            document = Document(project_id=p.id, document_type="cover_letter", title=state)
            file = StoredFile(
                project_id=p.id,
                kind="generated_document",
                publication_state=state,
                storage_key=f"synthetic/{state}-{created.id}",
                checksum_sha256="b" * 64,
                size_bytes=1,
                mime_type="text/plain",
                display_name=f"{state}.txt",
            )
            db.add_all([document, file])
            db.flush()
            revision = DocumentRevision(
                project_id=p.id,
                document_id=document.id,
                revision=1,
                file_id=file.id,
            )
            db.add(revision)
            db.flush()
            db.add(
                RunArtifact(
                    project_id=p.id,
                    run_id=created.id,
                    file_id=file.id,
                    document_revision_id=revision.id,
                )
            )
            artifacts[state] = file.id

    shared_view = asyncio.run(service.get(reader, p.id, created.id))
    assert shared_view.id == created.id
    assert shared_view.result_file_ids == (artifacts["published"],)

    async def collect_events():
        return [event async for event in service.events(reader, p.id, created.id, 0)]

    events = asyncio.run(collect_events())
    assert [event.sequence for event in events] == [1]


def test_evaluation_grant_replay_and_cancel_redact_results_after_read_revocation(db_session):
    p = project(db_session, "Revoked result access")
    creator, persisted = grant(
        db_session, p.id, capabilities=("jobs:evaluate", "results:read")
    )
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    request = run_request(chat.id, job.id, key="result-capability-revoked")
    created = _submit(service, creator, p.id, request)

    with service.sessions.begin() as db:
        run = db.get(Run, created.id)
        run.evaluation_result = {"report_markdown": "Synthetic evaluation", "score": 4.0}
        document = Document(project_id=p.id, document_type="cover_letter", title="Synthetic")
        file = StoredFile(
            project_id=p.id,
            kind="generated_document",
            publication_state="published",
            storage_key=f"synthetic/published-{created.id}",
            checksum_sha256="c" * 64,
            size_bytes=1,
            mime_type="text/plain",
            display_name="synthetic.txt",
        )
        db.add_all([document, file])
        db.flush()
        revision = DocumentRevision(
            project_id=p.id,
            document_id=document.id,
            revision=1,
            file_id=file.id,
        )
        db.add(revision)
        db.flush()
        db.add(
            RunArtifact(
                project_id=p.id,
                run_id=created.id,
                file_id=file.id,
                document_revision_id=revision.id,
            )
        )

    with service.sessions.begin() as db:
        grant_row = db.get(type(persisted), persisted.id)
        grant_row.capabilities = ["jobs:evaluate"]

    with service.sessions.begin() as db:
        grant_row = db.get(type(persisted), persisted.id)
        assert grant_row.capabilities == ["jobs:evaluate"]

    replay = _submit(service, creator, p.id, request)
    assert replay.id == created.id
    assert replay.status == "queued"
    assert replay.evaluation_result is None
    assert replay.result_file_ids == ()

    cancelled = asyncio.run(service.cancel(creator, p.id, created.id))
    assert cancelled.status == "cancelled"
    assert cancelled.evaluation_result is None
    assert cancelled.result_file_ids == ()


@pytest.mark.asyncio
async def test_events_reauthorize_between_yields_after_capability_removal(db_session):
    p = project(db_session, "Event authorization refresh")
    reader, persisted = grant(
        db_session, p.id, capabilities=("jobs:evaluate", "results:read")
    )
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    db_session.commit()
    service = _service(db_session)
    created = await service.submit(
        reader, p.id, run_request(chat.id, job.id, key="event-auth-refresh")
    )
    from job_search_platform.services.runs import append_event

    with service.sessions.begin() as db:
        run = db.get(Run, created.id)
        append_event(db, run, "run_progress", {"status": "queued", "progress_percent": 50})

    events = service.events(reader, p.id, created.id, 0)
    assert (await anext(events)).sequence == 1

    with service.sessions.begin() as db:
        grant_row = db.get(type(persisted), persisted.id)
        grant_row.capabilities = ["jobs:evaluate"]

    with pytest.raises(ServiceError, match="forbidden"):
        await anext(events)
