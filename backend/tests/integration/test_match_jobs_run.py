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
from job_search_platform.db.models import (
    CVRevision, CVRevisionText, JobMatchScore, JobSearchHidden, ProviderConfiguration, Run, RunEvent, StoredFile,
)
from job_search_platform.integrations.jev import JEV_MODEL
from job_search_platform.services import job_sources, smart_match
from job_search_platform.services.contracts import MatchRunRequest
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import RunService
from job_search_platform.workers.executor import RunExecutor
from job_search_platform.workers.queue import PostgresRunQueue

CV_BODY = b"Synthetic CV: Python, Docker. secret-marker-xyz"
COMPANIES = {"j1": "Acme", "j2": "Hidden Co", "j3": "Beta"}


def _raw_job(slug: str) -> dict:
    return {"public_slug": slug, "title": f"Dev {slug}", "company": COMPANIES[slug], "skills": ["Python"],
            "description": f"Build services in Python and Docker for {slug}.", "cities": ["Bangkok"],
            "work_mode": "remote", "reality": {"age_days": 2, "class": "fresh"}, "enrichment": {"category": "it"},
            "url": f"https://jobs.example.test/{slug}"}


def _fake_fetch(url: str) -> dict:
    if "/jobs/facets" in url:
        return {"data": {"total": 3, "facets": {"category": {"it": 3}}}}
    return {"data": [_raw_job(s) for s in COMPANIES], "meta": {"total": 3}}


class FakeJev:
    def __init__(self, fail_for: str | None = None, fail_all: bool = False) -> None:
        self.calls: list[tuple] = []
        self.postings: list[str] = []
        self.fail_for, self.fail_all = fail_for, fail_all

    def decide(self, state: dict, questions: dict) -> dict:
        self.calls.append((tuple(sorted(state)), tuple(sorted(questions))))
        self.postings.append(state.get("job_posting", ""))
        if "category" in questions:
            return {"category": {"probabilities": {"it": 0.9}}}
        if self.fail_all or (self.fail_for and self.fail_for in state["job_posting"]):
            raise ServiceError("jev_failed")
        answers = {"role_fit": {"score": 3, "confidence": 0.9}, "seniority_fit": {"probabilities": {"2": 1.0}},
                   "hard_blocker": {"noul": 0.0}}
        for name in questions:
            if name.startswith(("skill_", "must_")):
                answers[name] = {"noul": 1.0}
        return answers


class FakeRuntime:
    instance_id = uuid.uuid4()

    def __init__(self) -> None:
        self.projects: dict = {}
        self.parses = 0

    async def start_project(self, project_id, workspace):
        self.projects[project_id] = SimpleNamespace(process=SimpleNamespace(pid=os.getpid(), returncode=0), workspace=workspace)
        return self.projects[project_id]

    async def parse_input(self, _project_id, _path):
        self.parses += 1
        return SimpleNamespace(text=CV_BODY.decode())

    async def submit(self, *_args, **_kwargs) -> None:
        raise AssertionError("match_jobs must not call the Hermes model")

    async def stop(self, project_id) -> None:
        return None

    async def close(self, project_id) -> None:
        self.projects.pop(project_id, None)


class SyntheticObjectStore:
    async def get(self, _key: str) -> bytes:
        return CV_BODY


class FakeSettings:
    async def trusted_provider(self, *_args, **_kwargs):
        return SimpleNamespace(provider="openrouter", api_key="sk-test", model="m", base_url="")


def _provider(db, provider: str = "openrouter") -> None:
    revision = (db.scalar(select(func.max(ProviderConfiguration.revision)).where(ProviderConfiguration.project_id.is_(None))) or 0) + 1
    db.add(ProviderConfiguration(project_id=None, provider=provider, model="m",
                                 secret_reference=f"keychain:{uuid.uuid4()}", revision=revision))


def _arrange(db_session, monkeypatch, provider: str = "openrouter"):
    db_project = project(db_session, "Synthetic match")
    actor = owner(db_session)
    stored = StoredFile(project_id=db_project.id, kind="cv_original", publication_state="published",
                        storage_key="synthetic/match-cv.txt", checksum_sha256=hashlib.sha256(CV_BODY).hexdigest(),
                        size_bytes=len(CV_BODY), mime_type="text/plain", display_name="synthetic-cv.txt")
    db_session.add(stored)
    db_session.flush()
    cv = primary_cv(db_session, db_project.id)
    revision = CVRevision(project_id=db_project.id, cv_id=cv.id, revision=1, file_id=stored.id)
    db_session.add(revision)
    _provider(db_session, provider)
    db_session.flush()
    db_session.add(JobSearchHidden(project_id=db_project.id, kind="company",
                                   value=smart_match.company_key("Hidden Co"), label="Hidden Co"))
    db_session.commit()
    job_sources._cache.clear()
    monkeypatch.setattr(job_sources, "fetch_json", _fake_fetch)
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    return db_project, actor, revision, sessions


async def _run_once(sessions, tmp_path, actor, project_id, request, runtime, fake):
    view = await RunService(sessions).submit_match(actor, project_id, request)
    queue = PostgresRunQueue(sessions)
    lease_owner = f"executor-{uuid.uuid4()}"
    claimed = queue.claim_next(lease_owner)
    assert claimed is not None and claimed.id == view.id
    executor = RunExecutor(sessions, queue, runtime, FakeSettings(), object(), SyntheticObjectStore(),
                           workspace_root=tmp_path, jev_factory=lambda key: fake)
    await executor.execute(claimed, lease_owner)
    return view


def _scores(sessions, revision_id):
    with sessions() as db:
        return list(db.scalars(select(JobMatchScore).where(JobMatchScore.cv_revision_id == revision_id)))


@pytest.mark.asyncio
async def test_match_run_parses_once_scores_pool_and_reuses_cache(db_session, tmp_path, monkeypatch):
    db_project, actor, revision, sessions = _arrange(db_session, monkeypatch)
    fake, runtime = FakeJev(), FakeRuntime()
    request = MatchRunRequest(cv_revision_id=revision.id)

    view = await _run_once(sessions, tmp_path, actor, db_project.id, request, runtime, fake)

    with sessions() as db:
        run = db.get(Run, view.id)
        assert run.status == "completed" and run.operation == "match_jobs"
        text = db.get(CVRevisionText, revision.id)
        assert text is not None and text.text == CV_BODY.decode()
        profile = db.get(CVRevision, revision.id).skill_profile
        assert profile["categories"] == ["it"] and profile["categories_model"] == JEV_MODEL
        events = json.dumps(list(db.scalars(select(RunEvent.public_data).where(RunEvent.run_id == view.id))))
        assert "secret-marker-xyz" not in events and "sk-test" not in events
        assert "secret-marker-xyz" not in json.dumps(run.input_snapshot) and "sk-test" not in json.dumps(run.config_snapshot)
    assert runtime.parses == 1
    rows = {row.job_slug: row for row in _scores(sessions, revision.id)}
    assert set(rows) == {"j1", "j3"}
    jobs = {s: job_sources.map_item(_raw_job(s)) for s in ("j1", "j3")}
    for slug, row in rows.items():
        assert row.model == JEV_MODEL and row.fit_percent == 100 and row.uncertain is False
        assert row.content_hash == smart_match.content_hash(jobs[slug])
    assert not any("Hidden Co" in posting for posting in fake.postings)
    assert sum(1 for call in fake.calls if "category" in call[1]) == 1

    calls_before = len(fake.calls)
    second = await _run_once(sessions, tmp_path, actor, db_project.id, request, runtime, fake)
    assert second.id != view.id
    with sessions() as db:
        assert db.get(Run, second.id).status == "completed"
    assert runtime.parses == 1  # stored text reused
    assert len(fake.calls) == calls_before  # categories and scores all cached
    assert len(_scores(sessions, revision.id)) == 2


@pytest.mark.asyncio
async def test_match_run_fails_cleanly_when_every_jev_call_fails(db_session, tmp_path, monkeypatch):
    db_project, actor, revision, sessions = _arrange(db_session, monkeypatch)
    fake = FakeJev(fail_all=True)
    view = await _run_once(sessions, tmp_path, actor, db_project.id,
                           MatchRunRequest(cv_revision_id=revision.id, q="dev"), FakeRuntime(), fake)
    with sessions() as db:
        assert db.get(Run, view.id).status == "failed"
        events = json.dumps(list(db.scalars(select(RunEvent.public_data).where(RunEvent.run_id == view.id))))
    assert "errors.jev_failed" in events and "sk-test" not in events
    assert not any("category" in call[1] for call in fake.calls)
    assert _scores(sessions, revision.id) == []


@pytest.mark.asyncio
async def test_match_run_partial_failure_keeps_scored_jobs(db_session, tmp_path, monkeypatch):
    db_project, actor, revision, sessions = _arrange(db_session, monkeypatch)
    view = await _run_once(sessions, tmp_path, actor, db_project.id,
                           MatchRunRequest(cv_revision_id=revision.id, q="dev"), FakeRuntime(), FakeJev(fail_for="j2"))
    with sessions() as db:
        assert db.get(Run, view.id).status == "completed"
    assert {row.job_slug for row in _scores(sessions, revision.id)} == {"j1", "j3"}


@pytest.mark.asyncio
async def test_submit_match_dedups_active_run_and_requires_openrouter(db_session, monkeypatch):
    db_project, actor, revision, sessions = _arrange(db_session, monkeypatch)
    service = RunService(sessions)
    first = await service.submit_match(actor, db_project.id, MatchRunRequest(cv_revision_id=revision.id))
    same = await service.submit_match(actor, db_project.id, MatchRunRequest(cv_revision_id=revision.id))
    other = await service.submit_match(actor, db_project.id, MatchRunRequest(cv_revision_id=revision.id, q="dev"))
    assert same.id == first.id and other.id != first.id

    grant_actor, _ = grant(db_session, db_project.id, capabilities=("results:read",))
    db_session.commit()
    with pytest.raises(ServiceError) as denied:
        await service.submit_match(grant_actor, db_project.id, MatchRunRequest(cv_revision_id=revision.id))
    assert denied.value.code == "forbidden"
    with pytest.raises(ServiceError) as hidden:  # same rule as profile_cv: grants never see owner-only runs
        await service.get(grant_actor, db_project.id, first.id)
    assert hidden.value.code == "not_found"
    assert (await service.get(actor, db_project.id, first.id)).operation == "match_jobs"

    _provider(db_session, "gemini")
    db_session.commit()
    with pytest.raises(ServiceError) as unavailable:
        await service.submit_match(actor, db_project.id, MatchRunRequest(cv_revision_id=revision.id, q="new"))
    assert unavailable.value.code == "jev_unavailable"
