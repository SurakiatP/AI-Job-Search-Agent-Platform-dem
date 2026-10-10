"""Bounded PostgreSQL worker dispatch and conservative crash recovery."""
from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import Run, RunArtifact, StoredFile
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.runs import append_event
from job_search_platform.workers.queue import MAX_ACTIVE_PROJECTS


def process_birth(pid: int) -> datetime | None:
    """Read process start time without logging its command or environment."""
    if type(pid) is not int or pid <= 0:
        return None
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "lstart="], capture_output=True, text=True, timeout=5
    )
    if result.returncode != 0:
        return None
    try:
        return datetime.strptime(" ".join(result.stdout.split()), "%a %b %d %H:%M:%S %Y").astimezone()
    except ValueError:
        return None


def _process_matches(pid: int | None, created_at: datetime | None, workspace: Path) -> bool:
    if pid is None or created_at is None or type(pid) is not int or pid <= 0:
        return False
    birth = process_birth(pid)
    if birth is None or abs((birth - _utc(created_at)).total_seconds()) > 1:
        return False
    try:
        if os.getpgid(pid) != pid:
            return False
        command = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if command.returncode != 0 or "infra/hermes/native_bridge.py" not in command.stdout:
            return False
        cwd = subprocess.run(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return cwd.returncode == 0 and f"n{workspace.resolve()}" in cwd.stdout.splitlines()
    except (OSError, subprocess.SubprocessError):
        return False


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _recorded_process_alive(pid: int | None, created_at: datetime | None) -> bool:
    if pid is None or created_at is None:
        return False
    birth = process_birth(pid)
    return birth is not None and abs((birth - _utc(created_at)).total_seconds()) <= 1


def _find_native_process(workspace: Path) -> tuple[int, datetime] | None:
    try:
        listing = subprocess.run(
            ["ps", "-axo", "pid=,command="],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise ServiceError("native_stop_incomplete") from exc
    if listing.returncode != 0:
        raise ServiceError("native_stop_incomplete")
    matches: list[tuple[int, datetime]] = []
    for line in listing.stdout.splitlines():
        fields = line.strip().split(maxsplit=1)
        if len(fields) != 2 or "infra/hermes/native_bridge.py" not in fields[1]:
            continue
        try:
            pid = int(fields[0])
        except ValueError:
            continue
        created_at = process_birth(pid)
        if created_at is not None and _process_matches(pid, created_at, workspace):
            matches.append((pid, created_at))
    if len(matches) > 1:
        raise ServiceError("native_stop_incomplete")
    return matches[0] if matches else None


class WorkerSupervisor:
    """Dispatch up to the shared queue cap and stop real execution on shutdown."""

    def __init__(
        self,
        sessions: sessionmaker[Session],
        queue,
        executor,
        runtime,
        *,
        poll_interval: float = 0.5,
        shutdown_timeout: float = 30,
    ) -> None:
        self.sessions = sessions
        self.queue = queue
        self.executor = executor
        self.runtime = runtime
        self.poll_interval = poll_interval
        self.shutdown_timeout = shutdown_timeout
        self.lease_owner = f"worker-{uuid.uuid4()}"
        self._active: dict[uuid.UUID, tuple[Run, asyncio.Task]] = {}
        self._closing = asyncio.Event()
        self._dispatcher: asyncio.Task | None = None

    async def start(self) -> None:
        await self.reconcile_startup()
        if self._dispatcher is None:
            self._dispatcher = asyncio.create_task(self._dispatch_loop())

    async def _dispatch_loop(self) -> None:
        while not self._closing.is_set():
            if len(self._active) >= MAX_ACTIVE_PROJECTS:
                await asyncio.sleep(self.poll_interval)
                continue
            run = await asyncio.to_thread(self.queue.claim_next, self.lease_owner)
            if run is None:
                await asyncio.sleep(self.poll_interval)
                continue
            task = asyncio.create_task(self._execute_claim(run))
            self._active[run.id] = (run, task)
            task.add_done_callback(lambda _task, run_id=run.id: self._active.pop(run_id, None))

    async def _execute_claim(self, run: Run) -> None:
        try:
            await self.executor.execute(run, self.lease_owner)
        except asyncio.CancelledError:
            raise
        except Exception:
            # The executor has its own safe failure path; this catches broken
            # adapters without exposing exception text in public run events.
            if not await self._stop_active(run):
                return
            try:
                await asyncio.to_thread(
                    self.queue.finish,
                    run.id,
                    self.lease_owner,
                    "failed",
                    message_key="errors.execution_failed",
                )
            except ServiceError:
                return

    async def close(self) -> None:
        self._closing.set()
        if self._dispatcher is not None:
            self._dispatcher.cancel()
            await asyncio.gather(self._dispatcher, return_exceptions=True)
            self._dispatcher = None
        tasks = [task for _run, task in self._active.values()]
        if tasks:
            _done, pending = await asyncio.wait(tasks, timeout=self.shutdown_timeout)
            pending_runs = [(run, task) for run, task in tuple(self._active.values()) if task in pending]
            for run, task in pending_runs:
                if task not in pending:
                    continue
                if not await self._stop_active(run):
                    raise ServiceError("native_stop_incomplete")
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
                for run, _task in pending_runs:
                    await self._finish_interrupted(run)

    async def _stop_active(self, run: Run) -> bool:
        if run.project_id not in self.runtime.projects:
            return True
        project = self.runtime.projects[run.project_id]
        try:
            await asyncio.wait_for(self.runtime.stop(run.project_id), timeout=20)
        except Exception:
            pass
        try:
            await asyncio.wait_for(self.runtime.close(run.project_id), timeout=75)
        except Exception:
            return False
        return project.process.returncode is not None and run.project_id not in self.runtime.projects

    async def _finish_interrupted(self, run: Run) -> None:
        await asyncio.to_thread(self.queue.interrupt_or_resume, run.id, message_key="errors.worker_shutdown")

    async def reconcile_startup(self) -> None:
        """Stop only validated project/run containers and resume or interrupt old runs."""
        with self.sessions() as db:
            stale_runs = list(
                db.scalars(select(Run).where(Run.status.in_(("queued", "running", "waiting_approval", "failed")))).all()
            )
        for stale in stale_runs:
            if stale.status == "failed" and not any(
                value is not None
                for value in (stale.execution_pid, stale.sandbox_id, stale.adapter_instance_id)
            ):
                continue
            workspace = Path(stale.sandbox_id) if stale.sandbox_id else (
                self.runtime.workspace_root / str(stale.project_id) / str(stale.id)
            )
            stopped_container = await self.runtime.stop_recorded_container(
                stale.project_id,
                stale.id,
                str(stale.adapter_instance_id) if stale.adapter_instance_id is not None else None,
                None,
            )
            native_pid = stale.execution_pid
            native_created_at = stale.execution_created_at
            if native_pid is None:
                native_process = _find_native_process(workspace)
                if native_process is not None:
                    native_pid, native_created_at = native_process
            elif native_created_at is None:
                raise ServiceError("native_stop_incomplete")
            if native_pid is not None and _process_matches(
                native_pid, native_created_at, workspace
            ):
                try:
                    os.killpg(native_pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                await asyncio.sleep(0.1)
                if _process_matches(native_pid, native_created_at, workspace):
                    try:
                        os.killpg(native_pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            if native_pid is not None:
                for _ in range(20):
                    if not _recorded_process_alive(native_pid, native_created_at):
                        break
                    await asyncio.sleep(0.05)
                if _recorded_process_alive(native_pid, native_created_at):
                    raise ServiceError("native_stop_incomplete")
            if stopped_container and stale.status == "running":
                # queued never held a sandbox (the dispatcher claims it as is) and waiting_approval keeps waiting.
                await asyncio.to_thread(self.queue.interrupt_or_resume, stale.id, message_key="errors.worker_interrupted")
        await asyncio.to_thread(self._reconcile_pending_artifacts)

    def _reconcile_pending_artifacts(self) -> None:
        with self.sessions.begin() as db:
            pending = db.execute(
                select(StoredFile, RunArtifact, Run)
                .join(RunArtifact, RunArtifact.file_id == StoredFile.id)
                .join(Run, Run.id == RunArtifact.run_id)
                .where(StoredFile.publication_state == "pending")
                .with_for_update(of=(StoredFile, Run))
            ).all()
            now = datetime.now(timezone.utc)
            for file, association, run in pending:
                live_provenance = (
                    run.status == "running"
                    and run.lease_owner is not None
                    and association.lease_owner == run.lease_owner
                    and run.lease_expires_at is not None
                    and _utc(run.lease_expires_at) > now
                )
                if not live_provenance:
                    file.publication_state = "unavailable"
