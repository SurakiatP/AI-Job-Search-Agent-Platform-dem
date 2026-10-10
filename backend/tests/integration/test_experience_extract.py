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


class SyntheticObjectStore:
    async def get(self, _key: str) -> bytes:
        return CV_BODY.encode()


class FakeSettings:
    async def trusted_provider(self, *_args, **_kwargs):
        return SimpleNamespace(provider="openrouter", api_key="sk-test", model="m", base_url="")


class FakeRuntime:
    instance_id = uuid.uuid4()

    def __init__(self, answer: str, cv_text: str = CV_BODY) -> None:
        self.projects: dict = {}
        self.answer, self.cv_text, self.submits = answer, cv_text, []

    async def start_project(self, project_id, workspace):
        self.projects[project_id] = SimpleNamespace(process=SimpleNamespace(pid=os.getpid(), returncode=0), workspace=workspace)
        return self.projects[project_id]

    async def parse_input(self, _project_id, _path):
        return SimpleNamespace(text=self.cv_text)

    async def submit(self, project_id, session_id, prompt, instructions, provider, *, operation, tool_gate=None):
        self.submits.append((operation, prompt))

    async def events(self, _project_id):
        yield SimpleNamespace(kind="result", result=self.answer)

    async def stop(self, project_id) -> None:
        return None

    async def close(self, project_id) -> None:
        self.projects.pop(project_id, None)


def _answer(*texts, kind="experience"):
    return json.dumps({"items": [{"kind": kind, "text": t, "role": "Data Engineer", "organization": "SCB",
                                  "period": "2022–2024"} for t in texts]})


async def _run(sessions, tmp_path, actor, p, cv, runtime):
    view = await RunService(sessions).submit_extract(actor, p.id, cv.id)
    queue = PostgresRunQueue(sessions)
    lease = f"executor-{uuid.uuid4()}"
    claimed = queue.claim_next(lease)
    assert claimed is not None and claimed.id == view.id
    await RunExecutor(sessions, queue, runtime, FakeSettings(), object(), SyntheticObjectStore(),
                      workspace_root=tmp_path).execute(claimed, lease)
    return view


def _events(sessions, run_id):
    with sessions() as db:
        return json.dumps(list(db.scalars(select(RunEvent.public_data).where(RunEvent.run_id == run_id))))


@pytest.mark.asyncio
async def test_extract_adds_verbatim_and_rejects_invented(db_session, tmp_path):
    p, actor, cv, revision, sessions = _arrange(db_session)
    runtime = FakeRuntime(_answer("Built Airflow pipelines that cut load time by 40%", "Led 12 engineers"))
    view = await _run(sessions, tmp_path, actor, p, cv, runtime)
    with sessions() as db:
        assert db.get(Run, view.id).status == "completed"
        items = list(db.scalars(select(ExperienceItem).where(ExperienceItem.project_id == p.id)))
        assert [i.text for i in items] == ["Built Airflow pipelines that cut load time by 40%"]
        assert items[0].source == "cv" and items[0].source_cv_revision_id == revision.id
        assert db.get(CVRevision, revision.id).skill_profile["experience"] == {"added": 1, "duplicates": 0, "rejected": 1}
    assert runtime.submits[0][0] == "extract_experience" and "verbatim" in runtime.submits[0][1]
    assert "secret-marker-xyz" not in _events(sessions, view.id) and "sk-test" not in _events(sessions, view.id)


@pytest.mark.asyncio
async def test_second_upload_keeps_earlier_items(db_session, tmp_path):
    p, actor, cv, revision, sessions = _arrange(db_session)
    await _run(sessions, tmp_path, actor, p, cv, FakeRuntime(_answer("Ran BigQuery secret-marker-xyz")))
    with sessions.begin() as db:  # a new revision with different text
        stored = db.get(StoredFile, db.get(CVRevision, revision.id).file_id)
        db.add(CVRevision(project_id=p.id, cv_id=cv.id, revision=2, file_id=stored.id))
    await _run(sessions, tmp_path, actor, p, cv, FakeRuntime(_answer("Built Airflow pipelines that cut load time by 40%")))
    with sessions() as db:
        texts = set(db.scalars(select(ExperienceItem.text).where(ExperienceItem.project_id == p.id, ExperienceItem.removed_at.is_(None))))
    assert texts == {"Ran BigQuery secret-marker-xyz", "Built Airflow pipelines that cut load time by 40%"}


@pytest.mark.asyncio
async def test_extract_thai_cv(db_session, tmp_path):
    p, actor, cv, _, sessions = _arrange(db_session)
    thai = "ประสบการณ์\n• ลดเวลาโหลดข้อมูล ๔๐% ด้วย Airflow"
    await _run(sessions, tmp_path, actor, p, cv, FakeRuntime(_answer("ลดเวลาโหลดข้อมูล 40% ด้วย Airflow"), cv_text=thai))
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(ExperienceItem).where(ExperienceItem.project_id == p.id)) == 1


@pytest.mark.asyncio
async def test_malformed_answer_fails_without_native_text(db_session, tmp_path):
    p, actor, cv, _, sessions = _arrange(db_session)
    view = await _run(sessions, tmp_path, actor, p, cv, FakeRuntime("Sure! secret-marker-xyz {not json"))
    with sessions() as db:
        assert db.get(Run, view.id).status == "failed"
    events = _events(sessions, view.id)
    assert "errors.execution_failed" in events and "secret-marker-xyz" not in events
