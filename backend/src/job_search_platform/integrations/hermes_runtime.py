"""Typed boundary to pinned Hermes, with one trusted process per Project."""
from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import subprocess
from typing import AsyncIterator, Awaitable, Callable, Literal
from uuid import UUID, uuid4

HERMES_REV = "c8301ea6c9b797184df16a9c5dd462400b264ff4"
CAREER_OPS_REV = "c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7"
ROOT = Path(__file__).resolve().parents[4]
CACHE = Path.home() / ".cache/job-search-platform"
ERROR_CODES = frozenset({"project_busy", "provider_not_configured", "native_stop_incomplete",
    "native_skill_loading_failed", "native_response_invalid", "native_start_failed",
    "native_interface_invalid", "input_path_invalid", "artifact_path_invalid",
    "unsupported_export", "export_failed", "native_bridge_failed"})
PARSE_ERRORS = frozenset({"input_path_invalid", "input_size_invalid", "document_expansion_limit",
    "document_invalid", "document_encrypted", "unsupported_input", "scanned_pdf_unsupported",
    "empty_input", "extracted_text_limit"})

class RuntimeErrorCode(RuntimeError):
    """Stable error codes; upstream exception text is private."""

def validate_source(path: Path, revision: str) -> None:
    for args, expected, code in [(["rev-parse", "HEAD"], revision, "source_revision_invalid"),
                                 (["status", "--porcelain", "--untracked-files=all", "--ignored"], "", "source_dirty")]:
        result = subprocess.run(["git", "-C", str(path), *args], capture_output=True, text=True, timeout=30)
        if result.returncode or result.stdout.strip() != expected:
            raise RuntimeErrorCode(code)

@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    model: str
    base_url: str
    api_key: str = field(repr=False)

@dataclass(frozen=True)
class NativeEvent:
    sequence: int
    kind: Literal["progress", "result", "failed"]
    result: str | None = None  # Private native result, not a public event DTO.
    code: str | None = None

@dataclass(frozen=True)
class ParsedInput:
    text: str
    kind: Literal["text", "pdf", "docx"]
    sha256: str

@dataclass
class ProjectRuntime:
    project_id: UUID
    workspace: Path
    process: asyncio.subprocess.Process = field(repr=False)
    container_id: str = ""
    allowed_tools: tuple[str, ...] = ()
    pending: dict[str, asyncio.Future] = field(default_factory=dict, repr=False)
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue, repr=False)
    reader: asyncio.Task | None = field(default=None, repr=False)
    sequence: int = 0
    terminal_received: bool = False
    tool_gate: Callable[[str, str], Awaitable[bool]] | None = field(default=None, repr=False)

class HermesRuntime:
    def __init__(self, image: str, *, hermes_source: Path | None = None,
                 career_ops_source: Path | None = None, environment: Path | None = None,
                 state_root: Path | None = None, workspace_root: Path | None = None):
        if not re.fullmatch(r"(?:[\w./:-]+@)?sha256:[0-9a-f]{64}", image):
            raise RuntimeErrorCode("image_not_pinned")
        self.image = image
        self.hermes_source = hermes_source or CACHE / f"upstream/hermes-{HERMES_REV}"
        self.career_ops_source = career_ops_source or CACHE / f"upstream/career-ops-{CAREER_OPS_REV}"
        self.environment = environment or CACHE / "hermes-environment"
        self.state_root = (state_root or CACHE / "hermes-projects").resolve()
        self.workspace_root = (workspace_root or CACHE / "hermes-workspaces").resolve()
        self.projects: dict[UUID, ProjectRuntime] = {}
        self.instance_id = str(uuid4())

    async def start_project(self, project_id: UUID, workspace: Path) -> ProjectRuntime:
        if not isinstance(project_id, UUID) or project_id in self.projects:
            raise RuntimeErrorCode("project_identity_invalid")
        await asyncio.to_thread(validate_source, self.hermes_source, HERMES_REV)
        await asyncio.to_thread(validate_source, self.career_ops_source, CAREER_OPS_REV)
        workspace = workspace.resolve(strict=True)
        if not workspace.is_dir() or not workspace.is_relative_to(self.workspace_root) or workspace == self.workspace_root:
            raise RuntimeErrorCode("workspace_invalid")
        if any(workspace.is_relative_to(p.workspace) or p.workspace.is_relative_to(workspace)
               for p in self.projects.values()):
            raise RuntimeErrorCode("workspace_overlap")
        workspace.chmod(0o700)
        self._private_directory(self.state_root, self.state_root)
        home = self.state_root / str(project_id)
        self._private_directory(home, self.state_root)
        skills = home / "skills"
        self._private_directory(skills, self.state_root)
        skill = skills / "career-ops"
        if not skill.exists():
            skill.symlink_to(self.career_ops_source / ".agents/skills/career-ops", target_is_directory=True)
        if skill.resolve() != (self.career_ops_source / ".agents/skills/career-ops").resolve():
            raise RuntimeErrorCode("skill_path_invalid")
        process_home = home / "process-home"
        self._private_directory(process_home, self.state_root)
        inputs = workspace / "inputs"
        self._private_directory(inputs, self.workspace_root)
        environment = {
            "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(process_home), "HERMES_HOME": str(home),
            "PYTHONPATH": str(self.hermes_source), "PYTHONDONTWRITEBYTECODE": "1",
            "PLATFORM_PROJECT_ID": str(project_id),
            "PLATFORM_CAREER_OPS_SOURCE": str(self.career_ops_source),
            "TERMINAL_ENV": "docker", "TERMINAL_CWD": "/workspace",
            "TERMINAL_DOCKER_IMAGE": self.image, "TERMINAL_DOCKER_IMAGE_PINNED": "1",
            "TERMINAL_CONTAINER_CPU": "1", "TERMINAL_CONTAINER_MEMORY": "512",
            "TERMINAL_DOCKER_VOLUMES": json.dumps([f"{workspace}:/workspace:rw", f"{inputs}:/workspace/inputs:ro"]),
            "TERMINAL_DOCKER_ENV": json.dumps({"CAREER_OPS_ROOT": "/workspace", "HOME": "/tmp"}),
            "TERMINAL_DOCKER_FORWARD_ENV": "[]", "TERMINAL_DOCKER_NETWORK": "false",
            "TERMINAL_DOCKER_RUN_AS_HOST_USER": "true",
            "TERMINAL_CONTAINER_PERSISTENT": "false", "TERMINAL_DOCKER_PERSIST_ACROSS_PROCESSES": "false",
            "TERMINAL_DOCKER_MOUNT_CWD_TO_WORKSPACE": "false", "TERMINAL_DOCKER_ORPHAN_REAPER": "false",
            "TERMINAL_DOCKER_EXTRA_ARGS": json.dumps(["--label", f"platform.project={project_id}",
                "--label", f"platform.run={workspace.name}", "--label", "platform.task=CORE-03",
                "--cap-drop=ALL", "--security-opt=no-new-privileges",
                "--pids-limit=256", "--read-only", "--shm-size=128m"]),
        }
        extra_args = json.loads(environment["TERMINAL_DOCKER_EXTRA_ARGS"])
        extra_args.extend(["--label", f"platform.instance={self.instance_id}"])
        environment["TERMINAL_DOCKER_EXTRA_ARGS"] = json.dumps(extra_args)
        # Docker context location is configuration, never forward the host environment.
        docker_config = os.environ.get("DOCKER_CONFIG", str(Path.home() / ".docker"))
        if docker_config:
            environment["DOCKER_CONFIG"] = docker_config
        process = await asyncio.create_subprocess_exec(str(self.environment / ".venv/bin/python"),
            "-u", str(ROOT / "infra/hermes/native_bridge.py"), env=environment, cwd=workspace,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, start_new_session=True, limit=2 * 1024 * 1024)
        project = ProjectRuntime(project_id, workspace, process)
        self.projects[project_id] = project
        project.reader = asyncio.create_task(self._read(project))
        try:
            response = await self._request(project, "start")
            if (not re.fullmatch(r"[0-9a-f]{64}", response.get("container_id", ""))
                    or response.get("native_interface") is not True
                    or response.get("skill_loaded") is not True
                    or set(response.get("allowed_tools", [])) != {"terminal", "read_file", "write_file", "patch", "search_files"}):
                raise RuntimeErrorCode("native_response_invalid")
            project.container_id = response["container_id"]
            project.allowed_tools = tuple(response["allowed_tools"])
        except (KeyError, TypeError, ValueError, RuntimeErrorCode):
            await self.close(project_id)
            raise RuntimeErrorCode("native_start_failed") from None
        return project

    @staticmethod
    def _private_directory(path: Path, root: Path) -> None:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeErrorCode("state_path_invalid")
        path.mkdir(parents=True, mode=0o700, exist_ok=True)
        if not path.is_dir():
            raise RuntimeErrorCode("state_path_invalid")
        path.chmod(0o700)

    async def _read(self, project: ProjectRuntime) -> None:
        try:
            while line := await project.process.stdout.readline():
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError()
                if "tool_request" in value:
                    call_id = value.get("tool_request")
                    name = value.get("name")
                    if (
                        set(value) != {"tool_request", "name"}
                        or not isinstance(call_id, str)
                        or not re.fullmatch(r"[0-9a-f]{32}", call_id)
                        or name not in project.allowed_tools
                    ):
                        raise ValueError()
                    asyncio.create_task(self._handle_tool_request(project, call_id, name))
                    continue
                if "event" in value:
                    kind = value["event"]
                    if kind not in ("progress", "result", "failed"):
                        raise ValueError()
                    if kind == "result" and (not isinstance(value.get("result"), str) or len(value["result"].encode()) > 1024 * 1024):
                        raise ValueError()
                    if kind == "failed" and value.get("code") != "native_execution_failed":
                        raise ValueError()
                    if kind in ("result", "failed"):
                        project.terminal_received = True
                    project.sequence += 1
                    await project.event_queue.put(NativeEvent(project.sequence, kind,
                        value.get("result") if kind == "result" else None,
                        value.get("code") if kind == "failed" else None))
                else:
                    if not isinstance(value.get("id"), str):
                        raise ValueError()
                    future = project.pending.pop(value.get("id"), None)
                    if future and not future.done():
                        if "error" in value:
                            error = value["error"]
                            future.set_exception(RuntimeErrorCode(error if isinstance(error, str) and error in ERROR_CODES else "native_response_invalid"))
                        elif isinstance(value.get("result"), dict):
                            future.set_result(value["result"])
                        else:
                            future.set_exception(RuntimeErrorCode("native_response_invalid"))
        except (ValueError, TypeError, asyncio.LimitOverrunError):
            pass
        finally:
            if not project.terminal_received:
                project.sequence += 1
                project.terminal_received = True
                await project.event_queue.put(NativeEvent(project.sequence, "failed", code="native_connection_closed"))
            for future in project.pending.values():
                if not future.done():
                    future.set_exception(RuntimeErrorCode("native_connection_closed"))

    async def _handle_tool_request(self, project: ProjectRuntime, call_id: str, name: str) -> None:
        allowed = False
        if project.tool_gate is not None:
            try:
                allowed = await project.tool_gate(call_id, name)
            except Exception:
                allowed = False
        try:
            await self._request(project, "tool_gate_result", call_id=call_id, allowed=allowed)
        except RuntimeErrorCode:
            # Do not block the reader that must receive the bridge reply.
            return

    async def _request(self, project: ProjectRuntime, method: str, **payload) -> dict:
        request_id = str(uuid4())
        future = asyncio.get_running_loop().create_future()
        project.pending[request_id] = future
        try:
            project.process.stdin.write((json.dumps({"id": request_id, "method": method, **payload}) + "\n").encode())
            await project.process.stdin.drain()
            return await asyncio.wait_for(future, timeout=60)
        except (TimeoutError, BrokenPipeError, ConnectionResetError):
            raise RuntimeErrorCode("native_connection_failed") from None
        finally:
            project.pending.pop(request_id, None)

    async def submit(self, project_id: UUID, session_id: UUID, prompt: str,
                     instructions: str, provider: ProviderConfig | None, *,
                     operation: Literal["evaluate_job", "draft_documents"],
                     tool_gate: Callable[[str, str], Awaitable[bool]] | None = None) -> None:
        if operation not in ("evaluate_job", "draft_documents"):
            raise RuntimeErrorCode("native_response_invalid")
        project = self.projects[project_id]
        project.tool_gate = tool_gate
        project.terminal_received = False
        response = await self._request(project, "submit", session_id=str(session_id),
            prompt=prompt, instructions=instructions, operation=operation,
            provider=None if provider is None else {"provider": provider.provider,
                "model": provider.model, "base_url": provider.base_url, "api_key": provider.api_key})
        if response.get("accepted") is not True:
            raise RuntimeErrorCode("native_response_invalid")

    async def parse_input(self, project_id: UUID, path: str) -> ParsedInput:
        response = await self._request(self.projects[project_id], "parse", path=path)
        if "parse_error" in response:
            code = response["parse_error"]
            raise RuntimeErrorCode(code if isinstance(code, str) and code in PARSE_ERRORS else "document_invalid")
        if (not isinstance(response.get("text"), str)
                or len(response["text"].encode()) > 1024 * 1024
                or response.get("kind") not in ("text", "pdf", "docx")
                or not isinstance(response.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", response["sha256"])):
            raise RuntimeErrorCode("native_response_invalid")
        return ParsedInput(response["text"], response["kind"], response["sha256"])

    async def export_document(self, project_id: UUID, format: Literal["pdf", "docx"],
                              source: str, output: str) -> str:
        response = await self._request(self.projects[project_id], "export", format=format,
                                       source=source, output=output)
        if response.get("output") != output or response.get("format") != format:
            raise RuntimeErrorCode("native_response_invalid")
        return output

    async def events(self, project_id: UUID) -> AsyncIterator[NativeEvent]:
        project = self.projects[project_id]
        while True:
            event = await project.event_queue.get()
            yield event
            if event.kind in ("result", "failed"):
                return

    async def stop(self, project_id: UUID) -> None:
        project = self.projects[project_id]
        native_stopped = False
        try:
            response = await self._request(project, "stop")
            native_stopped = response.get("stopped") is True
        except RuntimeErrorCode:
            pass
        finally:
            await self._cleanup_container(project)
        if not native_stopped:
            raise RuntimeErrorCode("native_stop_incomplete")

    async def health(self, project_id: UUID) -> dict:
        response = await self._request(self.projects[project_id], "health")
        if response.get("alive") is not True or not isinstance(response.get("running"), bool):
            raise RuntimeErrorCode("native_response_invalid")
        return response

    async def _docker(self, *args: str) -> str:
        environment = {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
                       "DOCKER_CONFIG": os.environ.get("DOCKER_CONFIG", str(Path.home() / ".docker"))}
        process = await asyncio.create_subprocess_exec("docker", *args, env=environment,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        try:
            output, _ = await asyncio.wait_for(process.communicate(), timeout=30)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise RuntimeErrorCode("native_stop_incomplete") from None
        if process.returncode:
            raise RuntimeErrorCode("native_stop_incomplete")
        return output.decode().strip()

    async def _cleanup_container(self, project: ProjectRuntime) -> None:
        filters = ["--filter", f"label=platform.project={project.project_id}",
                   "--filter", f"label=platform.run={project.workspace.name}",
                   "--filter", f"label=platform.instance={self.instance_id}",
                   "--filter", "label=platform.task=CORE-03"]
        identities = (await self._docker("ps", "-aq", "--no-trunc", *filters)).splitlines()
        for identity in identities:
            if not re.fullmatch(r"[0-9a-f]{64}", identity):
                raise RuntimeErrorCode("native_stop_incomplete")
            await self._docker("rm", "--force", identity)
        if await self._docker("ps", "-aq", "--no-trunc", *filters):
            raise RuntimeErrorCode("native_stop_incomplete")

    async def stop_recorded_container(
        self,
        project_id: UUID,
        run_id: UUID,
        instance_id: str | None,
        expected_container_id: str | None,
    ) -> bool:
        """Stop only a container whose durable labels match this exact run."""
        if instance_id is not None and not re.fullmatch(r"[0-9a-f-]{36}", instance_id):
            raise RuntimeErrorCode("native_stop_incomplete")
        if expected_container_id is not None and not re.fullmatch(r"[0-9a-f]{64}", expected_container_id):
            raise RuntimeErrorCode("native_stop_incomplete")
        filters = [
            "--filter", f"label=platform.project={project_id}",
            "--filter", f"label=platform.run={run_id}",
            "--filter", "label=platform.task=CORE-03",
        ]
        if instance_id is not None:
            filters.extend(["--filter", f"label=platform.instance={instance_id}"])
        identities = (await self._docker("ps", "-aq", "--no-trunc", *filters)).splitlines()
        if expected_container_id is not None and identities and identities != [expected_container_id]:
            raise RuntimeErrorCode("native_stop_incomplete")
        for identity in identities:
            if not re.fullmatch(r"[0-9a-f]{64}", identity):
                raise RuntimeErrorCode("native_stop_incomplete")
            details = json.loads(await self._docker("inspect", identity))
            if not isinstance(details, list) or len(details) != 1:
                raise RuntimeErrorCode("native_stop_incomplete")
            item = details[0]
            labels = item.get("Config", {}).get("Labels", {})
            if (
                item.get("Id") != identity
                or labels.get("platform.project") != str(project_id)
                or labels.get("platform.run") != str(run_id)
                or labels.get("platform.task") != "CORE-03"
                or (instance_id is not None and labels.get("platform.instance") != instance_id)
            ):
                raise RuntimeErrorCode("native_stop_incomplete")
            await self._docker("rm", "--force", identity)
        if await self._docker("ps", "-aq", "--no-trunc", *filters):
            raise RuntimeErrorCode("native_stop_incomplete")
        return True

    async def close(self, project_id: UUID | None = None) -> None:
        incomplete = False
        for identity in ([project_id] if project_id else list(self.projects)):
            project = self.projects.get(identity)
            if project is None:
                continue
            try:
                await self._request(project, "close")
                await asyncio.wait_for(project.process.wait(), timeout=30)
            except (RuntimeErrorCode, TimeoutError):
                if project.process.returncode is None:
                    project.process.kill()
                await project.process.wait()
            try:
                await self._cleanup_container(project)
            except RuntimeErrorCode:
                incomplete = True
            if project.reader:
                await project.reader
            if incomplete:
                raise RuntimeErrorCode("native_stop_incomplete")
            if project.process.returncode is None:
                raise RuntimeErrorCode("native_stop_incomplete")
            if self.projects.get(identity) is project:
                self.projects.pop(identity)
