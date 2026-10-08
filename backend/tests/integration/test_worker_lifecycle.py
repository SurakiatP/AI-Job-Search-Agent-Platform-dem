from __future__ import annotations

from importlib import import_module, util
from pathlib import Path
import sys
import asyncio
import hashlib
import json
import os
import shutil
import uuid
from threading import Event, Thread
from time import sleep
from datetime import datetime, timezone
from types import ModuleType, SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, provider_config, revisions, run_request, session, primary_cv
from job_search_platform.db.models import CVRevision, JobRevision, Run, StoredFile
from job_search_platform.integrations.hermes_runtime import HermesRuntime, RuntimeErrorCode
from job_search_platform.services.runs import RunService
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.queue import PostgresRunQueue
from job_search_platform.workers.supervisor import WorkerSupervisor
from job_search_platform.workers.executor import RunExecutor

def _run_sandbox_type():
    spec = util.find_spec("job_search_platform.workers.sandbox")
    assert spec is not None, "run sandbox implementation is missing"
    return import_module("job_search_platform.workers.sandbox").RunSandbox


def _tool_gate_module():
    repository = Path(__file__).resolve().parents[3]
    if str(repository) not in sys.path:
        sys.path.insert(0, str(repository))
    spec = util.find_spec("infra.hermes.tool_gate")
    assert spec is not None, "native tool gate implementation is missing"
    return import_module("infra.hermes.tool_gate")


def test_run_sandbox_separates_projects_and_keeps_inputs_read_only(tmp_path: Path) -> None:
    RunSandbox = _run_sandbox_type()
    first = RunSandbox(tmp_path, "project-a", "run-a")
    second = RunSandbox(tmp_path, "project-b", "run-a")

    first.prepare()
    second.prepare()
    input_path = first.write_input("cv.txt", "Synthetic CV")

    assert input_path.read_text() == "Synthetic CV"
    assert input_path.stat().st_mode & 0o222 == 0
    assert first.workspace != second.workspace
    assert first.workspace.is_relative_to(tmp_path)
    assert second.workspace.is_relative_to(tmp_path)

    with pytest.raises(PermissionError):
        input_path.write_text("changed")


def test_run_sandbox_rejects_paths_that_escape_owned_directories(tmp_path: Path) -> None:
    RunSandbox = _run_sandbox_type()
    sandbox = RunSandbox(tmp_path, "project-a", "run-a")
    sandbox.prepare()

    with pytest.raises(ValueError, match="sandbox_path_invalid"):
        sandbox.write_input("../other.txt", "Synthetic")

    with pytest.raises(ValueError, match="sandbox_path_invalid"):
        sandbox.staging_path("/tmp/out.pdf")


def test_run_sandbox_removes_inherited_provider_environment(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-provider-secret")
    RunSandbox = _run_sandbox_type()
    sandbox = RunSandbox(tmp_path, "project-a", "run-a")
    sandbox.prepare()

    environment = sandbox.native_environment()

    assert "OPENAI_API_KEY" not in environment
    assert "HOME" in environment
    assert environment["PLATFORM_PROJECT_ID"] == "project-a"


def test_native_tool_gate_waits_for_backend_allowance_and_emits_no_arguments() -> None:
    ToolCallGate = _tool_gate_module().ToolCallGate
    messages: list[dict[str, object]] = []
    gate = ToolCallGate(messages.append, timeout=1)
    completed = Event()
    allowed: list[bool] = []

    def reserve() -> None:
        allowed.append(gate.authorize("terminal"))
        completed.set()

    worker = Thread(target=reserve)
    worker.start()
    for _ in range(100):
        if messages:
            break
        sleep(0.005)

    assert messages and set(messages[0]) == {"tool_request", "name"}
    assert not completed.is_set()
    assert gate.resolve(messages[0]["tool_request"], True)
    worker.join(timeout=1)

    assert completed.is_set()
    assert allowed == [True]


def test_native_tool_gate_denies_unknown_reply_and_times_out_closed() -> None:
    module = _tool_gate_module()
    gate = module.ToolCallGate(lambda _message: None, timeout=0.01)

    assert not gate.resolve("unknown-call", True)
    with pytest.raises(module.ToolCallDenied):
        gate.authorize("write_file")


@pytest.mark.asyncio
async def test_supervisor_closes_bridge_even_when_native_stop_ack_fails() -> None:
    project_id = uuid.uuid4()
    project = SimpleNamespace(process=SimpleNamespace(returncode=None))
    runtime = SimpleNamespace(projects={project_id: project})

    async def stop(_project_id):
        raise RuntimeError("synthetic stop acknowledgement failure")

    async def close(_project_id):
        project.process.returncode = -9
        runtime.projects.pop(project_id)

    runtime.stop = stop
    runtime.close = close
    supervisor = WorkerSupervisor(None, None, None, runtime)

    assert await supervisor._stop_active(SimpleNamespace(project_id=project_id))
    assert project.process.returncode == -9
    assert project_id not in runtime.projects


def test_evaluation_result_accepts_only_the_public_report_contract() -> None:
    spec = util.find_spec("job_search_platform.workers.executor")
    assert spec is not None, "run executor implementation is missing"
    parse = import_module("job_search_platform.workers.executor").parse_evaluation_result

    result = parse('{"report_markdown":"Synthetic evidence","score":4.0}')

    assert result.report_markdown == "Synthetic evidence"
    assert result.score == 4.0
    with pytest.raises(ValueError, match="native_response_invalid"):
        parse('{"report_markdown":"Synthetic evidence","score":4,"raw_trace":"private"}')


def test_native_output_cannot_supply_skill_coverage() -> None:
    parse = import_module("job_search_platform.workers.executor").parse_evaluation_result
    coverage = '{"required":["A","B"],"matched":["A"],"missing":["B"],"ratio":0.5,"method":"x"}'
    with pytest.raises(ValueError, match="native_response_invalid"):
        parse('{"report_markdown":"Synthetic","skill_coverage":' + coverage + "}")


def test_native_json_wrapped_in_one_markdown_fence_is_accepted() -> None:
    executor = import_module("job_search_platform.workers.executor")

    result = executor.parse_evaluation_result('```json\n{"report_markdown":"Synthetic","score":3.5}\n```')
    assert result.score == 3.5
    drafts = executor.parse_draft_manifest(
        '```\n{"drafts":[{"path":"cv.md","document_type":"cv","title":"Synthetic","format":"pdf"}]}\n```')
    assert drafts[0]["path"] == "cv.md"
    with pytest.raises(ValueError, match="native_response_invalid"):
        executor.parse_evaluation_result('Here you go:\n```json\n{"report_markdown":"Synthetic","score":3.5}\n```')


def test_draft_manifest_requires_safe_staging_relative_paths() -> None:
    spec = util.find_spec("job_search_platform.workers.executor")
    assert spec is not None, "run executor implementation is missing"
    parse = import_module("job_search_platform.workers.executor").parse_draft_manifest

    drafts = parse('{"drafts":[{"path":"cover.md","document_type":"cover_letter","title":"Synthetic cover","format":"pdf"}]}')
    assert drafts[0]["path"] == "cover.md"

    with pytest.raises(ValueError, match="native_response_invalid"):
        parse('{"drafts":[{"path":"../outside.md","document_type":"cover_letter","title":"Synthetic","format":"pdf"}]}')


@pytest.mark.asyncio
async def test_native_tool_budget_is_reserved_before_the_actual_side_effect(db_session, tmp_path: Path) -> None:
    db_project = project(db_session, "Synthetic worker gate")
    actor = owner(db_session)
    conversation = session(db_session, db_project.id)
    _, job = revisions(db_session, db_project.id)
    provider_config(db_session, db_project.id)
    db_session.commit()

    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    service = RunService(sessions)
    view = await service.submit(actor, db_project.id, run_request(conversation.id, job.id))
    queue = PostgresRunQueue(sessions)
    lease_owner = f"test-{uuid.uuid4()}"
    claimed = queue.claim_next(lease_owner)
    assert claimed is not None and claimed.id == view.id
    with sessions.begin() as db:
        db.get(Run, view.id).tool_calls = 28

    cache = Path.home() / ".cache" / "job-search-platform"
    config = json.loads((cache / "hermes-runtime.json").read_text())
    runtime_root = cache / "hermes-proofs" / f"core08-{uuid.uuid4()}"
    runtime = HermesRuntime(
        config["image"],
        environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
        workspace_root=runtime_root,
    )
    workspace = runtime.workspace_root / str(db_project.id) / str(view.id)
    workspace.mkdir(parents=True)
    native = await runtime.start_project(db_project.id, workspace)

    reserved_calls: list[str] = []

    async def reserve(_call_id: str, name: str) -> bool:
        try:
            await asyncio.to_thread(queue.reserve_tool_call, view.id, lease_owner)
            reserved_calls.append(name)
            return True
        except Exception:
            return False

    native.tool_gate = reserve
    try:
        inputs = workspace / "inputs"
        (inputs / "cv.txt").write_text("SYNTHETIC_CV_INPUT: Thai and English profile", encoding="utf-8")
        parsed = await runtime.parse_input(db_project.id, "inputs/cv.txt")
        assert "SYNTHETIC_CV_INPUT" in parsed.text
        assert len(reserved_calls) == 1
        with sessions() as db:
            assert db.get(Run, view.id).tool_calls == 29
        accepted = await runtime._request(
            native,
            "tool",
            name="write_file",
            arguments={"path": "/workspace/gate.txt", "content": "SYNTHETIC_GATE"},
        )
        assert not accepted.get("error"), accepted
        denied = await runtime._request(
            native,
            "tool",
            name="write_file",
            arguments={"path": "/workspace/gate.txt", "content": "MUST_NOT_WRITE"},
        )
        assert denied.get("error") == "tool_call_denied", denied
        assert (workspace / "gate.txt").read_text() == "SYNTHETIC_GATE"
        with sessions() as db:
            persisted = db.get(Run, view.id)
        assert persisted.tool_calls == 30
        assert persisted.status == "failed"

        retry_request = run_request(
            conversation.id, job.id, key=f"synthetic-cancel-{uuid.uuid4()}"
        ).model_copy(update={"retry_of_id": view.id})
        retry = await service.submit(actor, db_project.id, retry_request)
        cancel_lease = f"cancel-{uuid.uuid4()}"
        cancel_run = queue.claim_next(cancel_lease)
        assert cancel_run is not None and cancel_run.id == retry.id
        await runtime.close(db_project.id)

        cancel_workspace = runtime_root / str(db_project.id) / str(retry.id)
        cancel_workspace.mkdir(parents=True)
        cancel_native = await runtime.start_project(db_project.id, cancel_workspace)

        async def reserve_cancel_tool(_call_id: str, _name: str) -> bool:
            try:
                await asyncio.to_thread(queue.reserve_tool_call, retry.id, cancel_lease)
                return True
            except Exception:
                return False

        cancel_native.tool_gate = reserve_cancel_tool
        running_tool = asyncio.create_task(
            runtime._request(
                cancel_native,
                "tool",
                name="terminal",
                arguments={"command": "touch /workspace/cancel-marker && sleep 60", "timeout": 90},
            )
        )
        marker = cancel_workspace / "cancel-marker"
        for _ in range(200):
            if marker.exists():
                break
            await asyncio.sleep(0.05)
        assert marker.exists(), "native terminal tool did not start"
        requested = await service.cancel(actor, db_project.id, retry.id)
        assert requested.status == "running"
        with sessions() as db:
            assert db.get(Run, retry.id).cancellation_requested_at is not None
        cancel_executor = RunExecutor(
            sessions, queue, runtime, object(), object(), object(), workspace_root=runtime_root
        )
        await cancel_executor._stop(db_project.id, started=True)
        await asyncio.wait_for(running_tool, timeout=5)
        assert db_project.id not in runtime.projects
        await asyncio.to_thread(
            queue.finish,
            retry.id,
            cancel_lease,
            "cancelled",
            message_key="errors.cancelled",
        )
        assert (await service.get(actor, db_project.id, retry.id)).status == "cancelled"
    finally:
        await runtime.close(db_project.id)
        shutil.rmtree(runtime_root, ignore_errors=True)


@pytest.mark.parametrize("persisted_failure", [False, True])
@pytest.mark.asyncio
async def test_startup_reconciliation_stops_container_after_bridge_crash(
    db_session, persisted_failure: bool
) -> None:
    db_project = project(db_session, "Synthetic bridge recovery")
    actor = owner(db_session)
    conversation = session(db_session, db_project.id)
    _, job = revisions(db_session, db_project.id)
    provider_config(db_session, db_project.id)
    db_session.commit()

    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    view = await RunService(sessions).submit(
        actor, db_project.id, run_request(conversation.id, job.id)
    )
    queue = PostgresRunQueue(sessions)
    lease_owner = f"recovery-{uuid.uuid4()}"
    claimed = queue.claim_next(lease_owner)
    assert claimed is not None and claimed.id == view.id

    cache = Path.home() / ".cache" / "job-search-platform"
    config = json.loads((cache / "hermes-runtime.json").read_text())
    runtime_root = cache / "hermes-proofs" / f"core08-recovery-{uuid.uuid4()}"
    runtime = HermesRuntime(
        config["image"],
        environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
        workspace_root=runtime_root,
    )
    workspace = runtime_root / str(db_project.id) / str(view.id)
    workspace.mkdir(parents=True)
    try:
        native = await runtime.start_project(db_project.id, workspace)
        supervisor_module = import_module("job_search_platform.workers.supervisor")
        created_at = supervisor_module.process_birth(native.process.pid)
        assert created_at is not None
        with sessions.begin() as db:
            run = db.get(Run, view.id)
            run.execution_pid = native.process.pid
            run.execution_created_at = created_at
            run.sandbox_id = str(workspace)
            run.adapter_instance_id = runtime.instance_id
            previous_finished_at = None
            if persisted_failure:
                previous_finished_at = datetime.now(timezone.utc)
                run.status = "failed"
                run.finished_at = previous_finished_at
                run.lease_owner = None
                run.lease_expires_at = None

        if not persisted_failure:
            native.process.kill()
            await native.process.wait()
        supervisor = WorkerSupervisor(sessions, queue, object(), runtime)
        await supervisor.reconcile_startup()
        if persisted_failure:
            assert native.process.returncode is not None
        with sessions() as db:
            recovered = db.get(Run, view.id)
            assert recovered.status == ("failed" if persisted_failure else "interrupted")
            if persisted_failure:
                assert recovered.finished_at == previous_finished_at
            else:
                assert recovered.finished_at is not None
        remaining = await runtime._docker(
            "ps", "-aq", "--no-trunc",
            "--filter", f"label=platform.project={db_project.id}",
            "--filter", f"label=platform.run={view.id}",
            "--filter", f"label=platform.instance={runtime.instance_id}",
            "--filter", "label=platform.task=CORE-03",
        )
        assert not remaining
    finally:
        await runtime.close(db_project.id)
        shutil.rmtree(runtime_root, ignore_errors=True)


@pytest.mark.asyncio
async def test_executor_parses_supplied_cv_before_offline_provider_failure(db_session) -> None:
    db_project = project(db_session, "Synthetic executor CV")
    actor = owner(db_session)
    conversation = session(db_session, db_project.id)
    body = b"SYNTHETIC_EXECUTOR_CV: bilingual profile\n"
    stored = StoredFile(
        project_id=db_project.id,
        kind="cv_original",
        publication_state="published",
        storage_key="synthetic/executor-cv.txt",
        checksum_sha256=hashlib.sha256(body).hexdigest(),
        size_bytes=len(body),
        mime_type="text/plain",
        display_name="synthetic-cv.txt",
    )
    db_session.add(stored)
    db_session.flush()
    cv = CVRevision(project_id=db_project.id, cv_id=primary_cv(db_session, db_project.id).id, revision=1, file_id=stored.id)
    job = JobRevision(
        project_id=db_project.id,
        revision=1,
        title="Synthetic Engineer",
        description="Synthetic job description",
        company="Example Co",
        source_url="https://jobs.example.test/1",
    )
    db_session.add_all([cv, job])
    provider_config(db_session, db_project.id)
    db_session.commit()

    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    view = await RunService(sessions).submit(
        actor, db_project.id, run_request(conversation.id, job.id)
    )
    queue = PostgresRunQueue(sessions)
    lease_owner = f"executor-{uuid.uuid4()}"
    claimed = queue.claim_next(lease_owner)
    assert claimed is not None and claimed.id == view.id

    cache = Path.home() / ".cache" / "job-search-platform"
    config = json.loads((cache / "hermes-runtime.json").read_text())
    runtime_root = cache / "hermes-proofs" / f"core08-executor-{uuid.uuid4()}"
    runtime = HermesRuntime(
        config["image"],
        environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
        workspace_root=runtime_root,
    )

    class SyntheticObjectStore:
        async def get(self, _key: str) -> bytes:
            return body

    class OfflineSettings:
        async def trusted_provider(self, *_args, **_kwargs):
            return None

    executor = RunExecutor(
        sessions,
        queue,
        runtime,
        OfflineSettings(),
        object(),
        SyntheticObjectStore(),
        workspace_root=runtime_root,
    )
    try:
        await executor.execute(claimed, lease_owner)
        with sessions() as db:
            finished = db.get(Run, view.id)
            assert finished.status == "failed"
            assert finished.tool_calls >= 1
        cv_copy = runtime_root / str(db_project.id) / str(view.id) / "inputs" / "cv-source.txt"
        assert cv_copy.read_bytes() == body
        assert db_project.id not in runtime.projects
    finally:
        await runtime.close(db_project.id)
        shutil.rmtree(runtime_root, ignore_errors=True)


@pytest.mark.asyncio
async def test_completed_evaluation_stores_deterministic_skill_coverage(db_session, tmp_path: Path) -> None:
    db_project = project(db_session, "Synthetic coverage")
    actor = owner(db_session)
    conversation = session(db_session, db_project.id)
    body = b"Synthetic CV: ReactJS, Python and postgres."
    stored = StoredFile(
        project_id=db_project.id, kind="cv_original", publication_state="published",
        storage_key="synthetic/coverage-cv.txt", checksum_sha256=hashlib.sha256(body).hexdigest(),
        size_bytes=len(body), mime_type="text/plain", display_name="synthetic-cv.txt",
    )
    db_session.add(stored)
    db_session.flush()
    job = JobRevision(
        project_id=db_project.id, revision=1, title="Product Engineer",
        description="React, TypeScript and PostgreSQL.", company="Example Co",
        source_url="https://jobs.example.test/coverage",
    )
    db_session.add_all([CVRevision(project_id=db_project.id, cv_id=primary_cv(db_session, db_project.id).id, revision=1, file_id=stored.id), job])
    provider_config(db_session, db_project.id)
    db_session.commit()

    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    view = await RunService(sessions).submit(actor, db_project.id, run_request(conversation.id, job.id))
    queue = PostgresRunQueue(sessions)
    lease_owner = f"executor-{uuid.uuid4()}"
    claimed = queue.claim_next(lease_owner)
    assert claimed is not None and claimed.id == view.id

    class FakeRuntime:
        instance_id = uuid.uuid4()

        def __init__(self) -> None:
            self.projects: dict = {}

        async def start_project(self, project_id, workspace):
            self.projects[project_id] = SimpleNamespace(
                process=SimpleNamespace(pid=os.getpid(), returncode=0), workspace=workspace
            )
            return self.projects[project_id]

        async def parse_input(self, _project_id, _path):
            return SimpleNamespace(text=body.decode())

        async def submit(self, *_args, **_kwargs) -> None:
            return None

        async def events(self, _project_id):
            yield SimpleNamespace(kind="result", result='{"report_markdown":"Synthetic report","score":4.0}')

        async def stop(self, project_id) -> None:
            return None

        async def close(self, project_id) -> None:
            self.projects.pop(project_id, None)

    class SyntheticObjectStore:
        async def get(self, _key: str) -> bytes:
            return body

    class FakeSettings:
        async def trusted_provider(self, *_args, **_kwargs):
            return None

    executor = RunExecutor(
        sessions, queue, FakeRuntime(), FakeSettings(), object(), SyntheticObjectStore(),
        workspace_root=tmp_path,
    )
    await executor.execute(claimed, lease_owner)
    with sessions() as db:
        finished = db.get(Run, view.id)
        assert finished.status == "completed"
        assert finished.evaluation_result["score"] == 4.0
        assert finished.evaluation_result["skill_coverage"] == {
            "required": ["React", "TypeScript", "PostgreSQL"],
            "matched": ["React", "PostgreSQL"],
            "missing": ["TypeScript"],
            "ratio": 0.67,
            "method": "keyword_dictionary_v1",
        }
    assert (await RunService(sessions).get(actor, db_project.id, view.id)).evaluation_result.skill_coverage.ratio == 0.67


@pytest.mark.asyncio
async def test_failed_bridge_and_container_cleanup_keeps_runtime_claim_unproven() -> None:
    class Process:
        returncode = None

        def kill(self) -> None:
            self.returncode = 0

        async def wait(self) -> int:
            return self.returncode

    project_id = uuid.uuid4()
    process = Process()
    project_runtime = SimpleNamespace(process=process, reader=None)
    runtime = HermesRuntime.__new__(HermesRuntime)
    runtime.projects = {project_id: project_runtime}

    async def fail_bridge_close(_project, _command):
        raise RuntimeErrorCode("native_bridge_failed")

    async def fail_container_cleanup(_project):
        raise RuntimeErrorCode("native_stop_incomplete")

    async def fail_stop(_project_id):
        raise RuntimeErrorCode("native_stop_incomplete")

    runtime._request = fail_bridge_close
    runtime._cleanup_container = fail_container_cleanup
    runtime.stop = fail_stop
    executor = RunExecutor.__new__(RunExecutor)
    executor.runtime = runtime

    with pytest.raises(ServiceError) as failure:
        await executor._stop(project_id, started=True)

    assert failure.value.code == "native_stop_incomplete"
    assert process.returncode is not None
    assert runtime.projects[project_id] is project_runtime


def test_bridge_parent_pipe_eof_interrupts_agent_and_cleans_container(monkeypatch) -> None:
    bridge_path = Path(__file__).resolve().parents[3] / "infra" / "hermes" / "native_bridge.py"
    monkeypatch.syspath_prepend(str(bridge_path.parent))
    monkeypatch.setenv("PLATFORM_PROJECT_ID", str(uuid.uuid4()))

    tools = ModuleType("tools")
    tools.__path__ = []
    terminal = ModuleType("tools.terminal_tool")
    environments = ModuleType("tools.environments")
    environments.__path__ = []
    docker_backend = ModuleType("tools.environments.docker")
    files = ModuleType("tools.file_tools")
    lifecycle = ModuleType("tools.terminal_tool_lifecycle")
    registry_module = ModuleType("tools.registry")
    skills = ModuleType("tools.skills_tool")

    calls = []

    class Environment:
        def wait_for_cleanup(self, timeout):
            calls.append(("environment", timeout))

    class Agent:
        def interrupt(self, *, hard_cancel):
            calls.append(("interrupt", hard_cancel))

        def close(self):
            calls.append(("agent_close",))

    class AgentThread:
        def join(self, timeout):
            calls.append(("thread_join", timeout))

        def is_alive(self):
            return False

    environment = Environment()
    terminal._active_environments = {"owned": environment}
    terminal.terminal_tool = lambda *_args, **_kwargs: "{}"
    lifecycle.cleanup_vm = lambda task_id, force_remove: calls.append(
        ("cleanup_vm", task_id, force_remove)
    )
    registry_module.registry = SimpleNamespace(dispatch=lambda *_args, **_kwargs: "{}")
    skills.skill_view = lambda *_args, **_kwargs: "{}"

    for name, module in {
        "tools": tools,
        "tools.terminal_tool": terminal,
        "tools.environments": environments,
        "tools.environments.docker": docker_backend,
        "tools.file_tools": files,
        "tools.terminal_tool_lifecycle": lifecycle,
        "tools.registry": registry_module,
        "tools.skills_tool": skills,
    }.items():
        monkeypatch.setitem(sys.modules, name, module)

    original_stdout = sys.stdout
    spec = util.spec_from_file_location("core08_native_bridge_test", bridge_path)
    assert spec is not None and spec.loader is not None
    bridge = util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    monkeypatch.setattr(sys, "stdout", original_stdout)
    read_fd, write_fd = os.pipe()
    os.close(write_fd)
    parent_pipe = os.fdopen(read_fd, "r")
    monkeypatch.setattr(sys, "stdin", parent_pipe)
    bridge.INPUT_CLOSED.clear()
    bridge.REQUESTS = __import__("queue").Queue()
    bridge.agent = Agent()
    bridge.thread = AgentThread()

    try:
        bridge.main()
    finally:
        parent_pipe.close()

    assert bridge.INPUT_CLOSED.is_set()
    assert ("interrupt", True) in calls
    assert ("agent_close",) in calls
    assert ("cleanup_vm", bridge.task_id, True) in calls
    assert ("environment", 20) in calls
    assert ("thread_join", 10) in calls


@pytest.mark.parametrize(
    "heartbeat_state",
    [
        SimpleNamespace(status="failed", cancellation_requested_at=None),
        SimpleNamespace(status="running", cancellation_requested_at=object()),
    ],
    ids=["active-limit", "cancellation"],
)
@pytest.mark.asyncio
async def test_progress_stream_cannot_suppress_heartbeat_or_cancellation(heartbeat_state) -> None:
    class ProgressRuntime:
        async def events(self, _project_id):
            while True:
                await asyncio.sleep(0.01)
                yield SimpleNamespace(kind="progress")

    class HeartbeatQueue:
        calls = 0

        def heartbeat(self, _run_id, _lease_owner):
            self.calls += 1
            return heartbeat_state

    executor = RunExecutor.__new__(RunExecutor)
    executor.queue = HeartbeatQueue()
    run = SimpleNamespace(id=uuid.uuid4(), project_id=uuid.uuid4())

    async def stream_progress_forever():
        async for _event in ProgressRuntime().events(run.project_id):
            pass

    execution = asyncio.create_task(stream_progress_forever())
    reason: dict[str, str] = {}
    monitor = asyncio.create_task(
        executor._monitor_claim(run, "lease-owner", execution, reason)
    )
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(execution, timeout=3)
    await monitor
    assert executor.queue.calls >= 1
    assert reason["code"] in {"execution_stopped", "cancellation_requested"}


@pytest.mark.asyncio
async def test_claim_monitor_cancels_slow_export_before_publication(monkeypatch) -> None:
    executor_module = import_module("job_search_platform.workers.executor")
    monkeypatch.setattr(executor_module, "CLAIM_HEARTBEAT_INTERVAL_SECONDS", 0.01)

    class HeartbeatQueue:
        calls = 0
        finishes = []

        def heartbeat(self, _run_id, _lease_owner):
            self.calls += 1
            cancellation = object() if self.calls >= 2 else None
            return SimpleNamespace(status="running", cancellation_requested_at=cancellation)

        def finish(self, _run_id, _lease_owner, status, **_kwargs):
            self.finishes.append(status)

    executor = RunExecutor.__new__(RunExecutor)
    executor.queue = HeartbeatQueue()
    executor.runtime = SimpleNamespace(projects={})
    export_started = asyncio.Event()
    published = False

    async def slow_export(_run, _lease_owner):
        nonlocal published
        export_started.set()
        await asyncio.sleep(10)
        published = True

    executor._execute_claimed = slow_export
    run = SimpleNamespace(id=uuid.uuid4(), project_id=uuid.uuid4())
    await asyncio.wait_for(executor.execute(run, "lease-owner"), timeout=1)

    assert export_started.is_set()
    assert not published
    assert executor.queue.finishes == ["cancelled"]
