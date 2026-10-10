from __future__ import annotations

import hashlib
import json
import os
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, primary_cv, project
from job_search_platform.db.models import CVRevision, ExperienceItem, ProviderConfiguration, Run, RunEvent, StoredFile
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.executor import RunExecutor
from job_search_platform.workers.queue import PostgresRunQueue

CV_BODY = "Data Engineer, SCB (2022–2024)\n• Built Airflow pipelines that cut load time by 40%\n• Ran BigQuery secret-marker-xyz"


def _provider(db) -> None:
    revision = (db.scalar(select(func.max(ProviderConfiguration.revision)).where(ProviderConfiguration.project_id.is_(None))) or 0) + 1
    db.add(ProviderConfiguration(project_id=None, provider="openrouter", model="m",
                                 secret_reference=f"keychain:{uuid.uuid4()}", revision=revision))


def _arrange(db_session, *, with_provider=True):
    p = project(db_session, "Synthetic extract")
    actor = owner(db_session)
    body = CV_BODY.encode()
    stored = StoredFile(project_id=p.id, kind="cv_original", publication_state="published",
                        storage_key="synthetic/extract-cv.txt", checksum_sha256=hashlib.sha256(body).hexdigest(),
                        size_bytes=len(body), mime_type="text/plain", display_name="cv.txt")
    db_session.add(stored)
    db_session.flush()
    cv = primary_cv(db_session, p.id)
    revision = CVRevision(project_id=p.id, cv_id=cv.id, revision=1, file_id=stored.id)
    db_session.add(revision)
    if with_provider:
        _provider(db_session)
    db_session.commit()
    return p, actor, cv, revision, sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)


@pytest.mark.asyncio
async def test_submit_extract_dedups_skips_completed_and_hides_from_grants(db_session):
    p, actor, cv, revision, sessions = _arrange(db_session)
    service = RunService(sessions)
    first = await service.submit_extract(actor, p.id, cv.id, automatic=True)
    assert first.operation == "extract_experience"
    assert (await service.submit_extract(actor, p.id, cv.id)).id == first.id
    with sessions.begin() as db:
        db.get(Run, first.id).status = "completed"
    assert await service.submit_extract(actor, p.id, cv.id, automatic=True) is None
    again = await service.submit_extract(actor, p.id, cv.id)
    assert again is not None and again.id != first.id

    grant_actor, _ = grant(db_session, p.id, capabilities=("results:read", "jobs:evaluate"))
    db_session.commit()
    with pytest.raises(ServiceError) as denied:
        await service.submit_extract(grant_actor, p.id, cv.id)
    assert denied.value.code == "forbidden"
    with pytest.raises(ServiceError) as hidden:
        await service.get(grant_actor, p.id, first.id)
    assert hidden.value.code == "not_found"


@pytest.mark.asyncio
async def test_submit_extract_requires_provider(db_session):
    p, actor, cv, _, sessions = _arrange(db_session, with_provider=False)
    with pytest.raises(ServiceError) as missing:
        await RunService(sessions).submit_extract(actor, p.id, cv.id)
    assert missing.value.code == "provider_configuration_required"
