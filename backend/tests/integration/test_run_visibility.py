"""SEC-B06: agent tokens list runs with the scope they carry, and never see owner-only runs (practice, export)."""
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, session
from job_search_platform.api.rest import list_runs
from job_search_platform.db.models import Run
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService


def _run(db, p, sess, cv, job, operation):
    row = Run(project_id=p.id, actor_scope="owner", idempotency_key=uuid4().hex, request_digest="0" * 64,
              operation=operation, session_id=sess.id, cv_revision_id=cv.id, job_revision_id=job.id,
              provider_configuration_id=provider_config(db).id, input_snapshot={}, config_snapshot={},
              output_language="en", status="completed")
    db.add(row)
    db.flush()
    return row.id


@pytest.fixture
def world(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
        sess = session(db, p.id)
        cv, job = revisions(db, p.id)
        ids = {op: _run(db, p, sess, cv, job, op)
               for op in ("evaluate_job", "export_document", "interview_generate", "interview_grade", "interview_report")}
        agent, _ = grant(db, p.id, capabilities=("results:read",))
    return SimpleNamespace(services=SimpleNamespace(sessions=factory, runs=RunService(factory)),
                           owner=actor, agent=agent, project=p, ids=ids)


async def test_rest_run_list_works_for_the_scope_agent_tokens_carry(world):
    rows = await list_runs(world.project.id, world.agent, world.services)
    assert [row.id for row in rows] == [world.ids["evaluate_job"]]  # no practice or export runs


async def test_owner_still_lists_runs_including_practice(world):
    rows = await list_runs(world.project.id, world.owner, world.services)
    assert {row.id for row in rows} >= {world.ids["evaluate_job"], world.ids["interview_generate"]}


@pytest.mark.parametrize("operation", ["interview_generate", "interview_grade", "interview_report", "export_document"])
async def test_agent_token_cannot_read_owner_only_runs(world, operation):
    with pytest.raises(ServiceError) as err:
        await world.services.runs.get(world.agent, world.project.id, world.ids[operation])
    assert err.value.code == "not_found"
