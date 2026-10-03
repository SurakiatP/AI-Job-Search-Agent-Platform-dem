import pytest
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, session, revisions, provider_config, grant, run_request
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService


async def test_project_reader_can_read_owner_created_run_but_cannot_cancel(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor, p = owner(db), project(db)
        s = session(db, p.id)
        cv, job = revisions(db, p.id)
        provider_config(db, p.id)
        reader, _ = grant(db, p.id, capabilities=("results:read",))
        request = run_request(s.id, job.id, cv_revision_id=cv.id)
    svc = RunService(factory)
    submitted = await svc.submit(actor, p.id, request)
    read = await svc.get(reader, p.id, submitted.id)
    assert read.id == submitted.id
    events = svc.events(reader, p.id, submitted.id, 0)
    assert (await anext(events)).sequence == 1
    await events.aclose()
    with pytest.raises(ServiceError, match="forbidden"):
        await svc.cancel(reader, p.id, submitted.id)
