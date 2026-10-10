"""llm_round events, the run requester and grant labels. Synthetic data only."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, provider_config, revisions, run_request, session
from job_search_platform.services.contracts import GrantIssueRequest
from job_search_platform.services.grants import Grants
from job_search_platform.services.runs import RunService
from test_agent_applications import QUESTIONS, _PackRuntime, _good, _prepare
from test_cv_tailoring import _execute_next, _setup
from test_rest_api import api_context  # noqa: F401


class _UsageRuntime(_PackRuntime):
    def __init__(self, *args, usage):
        super().__init__(*args)
        self.usage = usage

    async def events(self, project_id):
        answers = self.script.pop(0) if self.script else []
        yield SimpleNamespace(kind="result", result=json.dumps({"answers": answers}), usage=self.usage)


def _rounds(ctx, run_id):
    from sqlalchemy import select
    from job_search_platform.db.models import RunEvent
    with ctx.sessions() as db:
        rows = db.scalars(select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.sequence))
        return [e.public_data for e in rows if e.public_data.get("step") == "llm_round"]


@pytest.mark.integration
@pytest.mark.parametrize("usage, expected", [
    ({"model": "synthetic-model", "input_tokens": 120, "output_tokens": 30}, ("synthetic-model", 120, 30)),
    (None, (None, None, None)),
])
def test_llm_round_event_reports_usage_or_nulls(api_context, usage, expected):
    ctx = api_context
    csrf, pid, session_, facts, _ = _setup(ctx, [])
    runtime = _UsageRuntime(ctx.tmp_path / "ws", [_good(facts)], usage=usage)
    run_id = _prepare(ctx, csrf, pid, session_).json()["id"]
    _execute_next(ctx, runtime)
    rounds = _rounds(ctx, run_id)
    assert len(rounds) == 1
    event = rounds[0]
    assert (event["model"], event["input_tokens"], event["output_tokens"]) == expected
    assert 0 <= event["latency_ms"] <= 3_600_000
    assert "prompt" not in event and "result" not in event


@pytest.mark.asyncio
async def test_requester_for_owner_and_labelled_grant_and_label_listing(db_session):
    p = project(db_session, "Synthetic telemetry")
    actor = owner(db_session)
    chat = session(db_session, p.id)
    _, job = revisions(db_session, p.id)
    provider_config(db_session, p.id)
    agent, row = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    row.label = "Synthetic agent"
    unlabelled, other = grant(db_session, p.id, capabilities=("jobs:evaluate", "results:read"))
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    service = RunService(sessions)
    mine = await service.submit(actor, p.id, run_request(chat.id, job.id, key="owner-run"))
    theirs = await service.submit(agent, p.id, run_request(chat.id, job.id, key="agent-run"))
    bare = await service.submit(unlabelled, p.id, run_request(chat.id, job.id, key="bare-run"))
    assert mine.requester.kind == "owner" and mine.requester.grant_id is None
    assert theirs.requester.model_dump() == {"kind": "agent", "grant_id": row.id, "label": "Synthetic agent"}
    assert bare.requester.kind == "agent" and bare.requester.label is None
    assert (await service.get(actor, p.id, theirs.id)).requester.label == "Synthetic agent"


@pytest.mark.asyncio
async def test_grant_issued_with_label_lists_it_back(db_session):
    p = project(db_session, "Synthetic label")
    actor = owner(db_session)
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    grants = Grants(sessions)
    when = datetime.now(timezone.utc) + timedelta(hours=1)
    await grants.issue(actor, p.id, GrantIssueRequest(capabilities=frozenset({"results:read"}), expires_at=when, label="  Claude Code  "))
    await grants.issue(actor, p.id, GrantIssueRequest(capabilities=frozenset({"results:read"}), expires_at=when))
    assert sorted(str(v.label) for v in await grants.list(actor, p.id)) == ["Claude Code", "None"]
    for bad in ("", "   ", "x" * 81):
        with pytest.raises(ValueError):
            GrantIssueRequest(capabilities=frozenset({"results:read"}), expires_at=when, label=bad)
