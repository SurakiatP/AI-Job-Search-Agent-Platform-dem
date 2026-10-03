"""Project-scoped uploads and authenticated file reads."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import shutil
import unicodedata
from collections.abc import AsyncIterator, Iterable
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import CVRevision, Project, Run, RunArtifact, StoredFile
from job_search_platform.integrations.hermes_runtime import PARSE_ERRORS, RuntimeErrorCode
from job_search_platform.integrations.object_store import ObjectMissing, ObjectTooLarge
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import Actor, FileView
from job_search_platform.services.errors import ServiceError

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_STREAM_SECONDS = 60
MAX_PARSE_SECONDS = 40
CHUNK_SIZE = 64 * 1024
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MIME_EXTENSIONS = {"text/plain": ".txt", "application/pdf": ".pdf", DOCX_MIME: ".docx"}


class StorageCommitError(ServiceError):
    """An object was stored but its published metadata transaction failed."""

    def __init__(self) -> None:
        super().__init__("storage_commit_failed", retryable=True)


class Files:
    """Owns upload validation, parser sandbox staging, and file publication."""

    def __init__(self, sessions: sessionmaker[Session], object_store, parser) -> None:
        self.sessions = sessions
        self.object_store = object_store
        self.parser = parser

    async def upload(
        self,
        actor: Actor,
        project_id: UUID,
        stream,
        declared_type: str,
        display_name: str,
        *,
        kind: str = "cv_original",
    ) -> FileView:
        if kind not in {"cv_original", "job_source", "chat_attachment"}:
            raise ServiceError("upload_kind_invalid")
        safe_name = _safe_display_name(display_name)
        mime = _normalize_declared_type(declared_type)
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "upload", "upload")
            _require_project(db, project_id)

        body = await _read_limited(stream)
        actual_mime = _sniff_mime(body)
        if actual_mime != mime:
            raise ServiceError("unsupported_media_type", fields={"mime_type": "mismatch"})
        suffix = Path(safe_name).suffix.lower()
        if suffix and suffix != _MIME_EXTENSIONS[mime]:
            raise ServiceError("unsupported_media_type", fields={"filename": "extension_mismatch"})

        parsed = await self._parse_in_sandbox(project_id, body, mime)
        digest = hashlib.sha256(body).hexdigest()
        if parsed.sha256 != digest or not parsed.text.strip():
            raise ServiceError("document_invalid")

        file_id = uuid4()
        storage_key = f"objects/{uuid4().hex}"
        row = StoredFile(
            id=file_id,
            project_id=project_id,
            kind=kind,
            publication_state="pending",
            storage_key=storage_key,
            checksum_sha256=digest,
            size_bytes=len(body),
            mime_type=mime,
            display_name=safe_name,
        )
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "upload", "upload")
                _require_project(db, project_id)
                db.add(row)
                db.flush()
        except SQLAlchemyError:
            raise StorageCommitError from None

        try:
            await self.object_store.put(storage_key, body, digest)
        except Exception:
            self._mark_unavailable(file_id, project_id)
            raise ServiceError("object_store_unavailable", retryable=True) from None

        try:
            with self.sessions.begin() as db:
                persisted = db.scalar(
                    select(StoredFile)
                    .where(StoredFile.project_id == project_id, StoredFile.id == file_id)
                    .with_for_update()
                )
                if persisted is None or persisted.publication_state != "pending":
                    raise ServiceError("file_unavailable")
                persisted.publication_state = "published"
                if kind == "cv_original":
                    _add_cv_revision(db, project_id, file_id)
        except Exception:
            # The pending row is durable from the earlier transaction. Reconciliation
            # verifies the object bytes before it can make that row visible.
            raise StorageCommitError from None

        with self.sessions() as db:
            persisted = db.scalar(
                select(StoredFile).where(
                    StoredFile.project_id == project_id, StoredFile.id == file_id
                )
            )
            return _view(persisted)

    async def list_ready(self, actor: Actor, project_id: UUID) -> list[FileView]:
        with self.sessions() as db:
            _require_project(db, project_id)
            authorize(db, actor, project_id, "results:read", "generated_document")
            rows = list(
                db.scalars(
                    select(StoredFile)
                    .where(
                        StoredFile.project_id == project_id,
                        StoredFile.publication_state == "published",
                    )
                    .order_by(StoredFile.created_at, StoredFile.id)
                )
            )
            visible: list[FileView] = []
            for row in rows:
                try:
                    _authorize_file(db, actor, project_id, row)
                except ServiceError as exc:
                    if exc.code == "forbidden":
                        continue
                    raise
                visible.append(_view(row))
            return visible

    async def download_stream(
        self, actor: Actor, project_id: UUID, file_id: UUID
    ) -> AsyncIterator[bytes]:
        row = self._authorized_row(actor, project_id, file_id)
        try:
            body = await self.object_store.get(row.storage_key)
        except ObjectMissing:
            self._mark_unavailable(file_id, project_id)
            raise ServiceError("file_unavailable") from None
        except ObjectTooLarge:
            self._mark_unavailable(file_id, project_id)
            raise ServiceError("file_integrity_failed") from None
        except Exception:
            raise ServiceError("object_store_unavailable", retryable=True) from None
        if len(body) != row.size_bytes or hashlib.sha256(body).hexdigest() != row.checksum_sha256:
            self._mark_unavailable(file_id, project_id)
            raise ServiceError("file_integrity_failed")
        for offset in range(0, len(body), CHUNK_SIZE):
            self._reauthorize_file(actor, project_id, file_id)
            yield body[offset : offset + CHUNK_SIZE]

    async def reconcile_pending(self) -> int:
        with self.sessions() as db:
            pending = list(
                db.scalars(
                    select(StoredFile).where(StoredFile.publication_state == "pending")
                )
            )
            candidates = [
                (
                    row.id,
                    row.project_id,
                    row.storage_key,
                    row.checksum_sha256,
                    row.size_bytes,
                    row.mime_type,
                    row.kind,
                )
                for row in pending
            ]
        published = 0
        for file_id, project_id, storage_key, checksum, size, mime_type, kind in candidates:
            try:
                body = await self.object_store.get(storage_key)
                valid = (
                    len(body) == size
                    and hashlib.sha256(body).hexdigest() == checksum
                    and _sniff_mime(body) == mime_type
                )
            except ObjectMissing:
                valid = False
            except ObjectTooLarge:
                valid = False
            except ServiceError:
                valid = False
            except Exception:
                continue
            try:
                with self.sessions.begin() as db:
                    if kind == "generated_document":
                        linked = db.execute(
                            select(Run, RunArtifact.lease_owner)
                            .join(RunArtifact, RunArtifact.run_id == Run.id)
                            .where(
                                RunArtifact.project_id == project_id,
                                RunArtifact.file_id == file_id,
                                Run.project_id == project_id,
                            )
                            .with_for_update()
                        ).one_or_none()
                        if linked is None:
                            valid = False
                        else:
                            run, artifact_lease_owner = linked
                            if not _pending_artifact_publishable(run, artifact_lease_owner):
                                valid = False
                    row = db.scalar(
                        select(StoredFile)
                        .where(
                            StoredFile.project_id == project_id,
                            StoredFile.id == file_id,
                            StoredFile.publication_state == "pending",
                        )
                        .with_for_update()
                    )
                    if row is None:
                        continue
                    if not valid:
                        row.publication_state = "unavailable"
                    else:
                        row.publication_state = "published"
                        if kind == "cv_original":
                            _add_cv_revision(db, project_id, file_id)
                        published += 1
            except SQLAlchemyError:
                continue
        return published

    async def _parse_in_sandbox(self, project_id: UUID, body: bytes, mime: str):
        # A parse request gets a short-lived isolated runtime of its own. It does not
        # borrow the active worker's writable workspace or share its native tool RPC.
        if hasattr(self.parser, "start_project") and hasattr(self.parser, "workspace_root"):
            return await self._parse_in_private_runtime(body, mime)
        try:
            runtime_project = self.parser.projects.get(project_id)
            if runtime_project is None:
                raise RuntimeErrorCode("input_path_invalid")
            workspace = Path(runtime_project.workspace).resolve(strict=True)
            input_dir = workspace / "inputs"
            if input_dir.is_symlink() or not input_dir.resolve(strict=True).is_relative_to(workspace):
                raise RuntimeErrorCode("input_path_invalid")
            staged = input_dir / f"upload-{uuid4().hex}{_MIME_EXTENSIONS[mime]}"
            flags = "xb"
            with staged.open(flags) as target:
                target.write(body)
            staged.chmod(0o600)
            try:
                return await asyncio.wait_for(
                    self.parser.parse_input(project_id, f"inputs/{staged.name}"),
                    timeout=MAX_PARSE_SECONDS,
                )
            finally:
                staged.unlink(missing_ok=True)
        except RuntimeErrorCode as exc:
            code = str(exc)
            raise ServiceError(code if code in PARSE_ERRORS else "document_invalid") from None
        except TimeoutError:
            raise ServiceError("document_parse_timeout", retryable=True) from None
        except ServiceError:
            raise
        except Exception:
            raise ServiceError("document_invalid") from None

    async def _parse_in_private_runtime(self, body: bytes, mime: str):
        runtime_id = uuid4()
        workspace_root = Path(self.parser.workspace_root)
        workspace_root.mkdir(parents=True, mode=0o700, exist_ok=True)
        if workspace_root.is_symlink():
            raise ServiceError("document_invalid")
        workspace_root = workspace_root.resolve(strict=True)
        workspace_root.chmod(0o700)
        workspace = workspace_root / f"upload-parse-{runtime_id.hex}"
        state_root = Path(self.parser.state_root)
        state_path = state_root / str(runtime_id)
        started = False
        staged: Path | None = None
        try:
            workspace.mkdir(mode=0o700)
            inputs = workspace / "inputs"
            inputs.mkdir(mode=0o700)
            await asyncio.wait_for(
                self.parser.start_project(runtime_id, workspace), timeout=120
            )
            started = True
            staged = inputs / f"upload-{uuid4().hex}{_MIME_EXTENSIONS[mime]}"
            with staged.open("xb") as target:
                target.write(body)
            staged.chmod(0o600)
            return await asyncio.wait_for(
                self.parser.parse_input(runtime_id, f"inputs/{staged.name}"),
                timeout=MAX_PARSE_SECONDS,
            )
        except RuntimeErrorCode as exc:
            code = str(exc)
            raise ServiceError(code if code in PARSE_ERRORS else "document_invalid") from None
        except TimeoutError:
            raise ServiceError("document_parse_timeout", retryable=True) from None
        except ServiceError:
            raise
        except Exception:
            raise ServiceError("document_invalid") from None
        finally:
            if staged is not None:
                staged.unlink(missing_ok=True)
            if started:
                try:
                    await self.parser.stop(runtime_id)
                except Exception:
                    # HermesRuntime.stop performs a forced container cleanup even when
                    # its graceful stop acknowledgement fails; keep the error generic.
                    raise ServiceError("parser_stop_failed", retryable=True) from None
                finally:
                    self.parser.projects.pop(runtime_id, None)
            for candidate, trusted_root in ((workspace, workspace_root), (state_path, state_root)):
                if candidate.exists() or candidate.is_symlink():
                    try:
                        resolved_parent = candidate.parent.resolve(strict=True)
                        if resolved_parent == trusted_root.resolve(strict=True) and not candidate.is_symlink():
                            shutil.rmtree(candidate)
                        elif candidate.is_symlink():
                            candidate.unlink()
                    except OSError:
                        raise ServiceError("parser_cleanup_failed", retryable=True) from None

    def _authorized_row(self, actor: Actor, project_id: UUID, file_id: UUID) -> StoredFile:
        with self.sessions() as db:
            row = db.scalar(
                select(StoredFile).where(
                    StoredFile.project_id == project_id,
                    StoredFile.id == file_id,
                    StoredFile.publication_state == "published",
                )
            )
            if row is None:
                raise ServiceError("not_found")
            _authorize_file(db, actor, project_id, row)
            return row

    def _reauthorize_file(self, actor: Actor, project_id: UUID, file_id: UUID) -> None:
        with self.sessions() as db:
            row = db.scalar(
                select(StoredFile).where(
                    StoredFile.project_id == project_id,
                    StoredFile.id == file_id,
                    StoredFile.publication_state == "published",
                )
            )
            if row is None:
                raise ServiceError("not_found")
            _authorize_file(db, actor, project_id, row)

    def _mark_unavailable(self, file_id: UUID, project_id: UUID) -> None:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(
                    select(StoredFile)
                    .where(StoredFile.project_id == project_id, StoredFile.id == file_id)
                    .with_for_update()
                )
                if row is not None and row.publication_state in {"pending", "published"}:
                    row.publication_state = "unavailable"
        except SQLAlchemyError:
            return


def _safe_display_name(value: str) -> str:
    if not isinstance(value, str):
        raise ServiceError("filename_invalid")
    name = unicodedata.normalize("NFKC", value).strip()
    if (
        not name
        or len(name) > 255
        or name in {".", ".."}
        or "/" in name
        or "\\" in name
        or any(unicodedata.category(char).startswith("C") for char in name)
    ):
        raise ServiceError("filename_invalid")
    return name


def _normalize_declared_type(value: str) -> str:
    if not isinstance(value, str):
        raise ServiceError("unsupported_media_type")
    mime = value.split(";", 1)[0].strip().lower()
    if mime not in _MIME_EXTENSIONS:
        raise ServiceError("unsupported_media_type")
    return mime


def _sniff_mime(body: bytes) -> str:
    if not body:
        raise ServiceError("empty_input")
    if body.startswith(b"PK\x03\x04"):
        return DOCX_MIME
    if body[:1024].find(b"%PDF-") >= 0:
        return "application/pdf"
    if b"\0" not in body:
        try:
            body.decode("utf-8")
        except UnicodeDecodeError:
            pass
        else:
            return "text/plain"
    raise ServiceError("unsupported_media_type")


async def _read_limited(stream) -> bytes:
    chunks: list[bytes] = []
    size = 0
    try:
        async with asyncio.timeout(MAX_STREAM_SECONDS):
            if hasattr(stream, "read"):
                while True:
                    read = stream.read
                    limit = min(CHUNK_SIZE, MAX_UPLOAD_BYTES + 1 - size)
                    if inspect.iscoroutinefunction(read):
                        chunk = await read(limit)
                    else:
                        chunk = await asyncio.to_thread(read, limit)
                        if inspect.isawaitable(chunk):
                            chunk = await chunk
                    if not chunk:
                        break
                    if not isinstance(chunk, (bytes, bytearray, memoryview)):
                        raise ServiceError("upload_stream_invalid")
                    chunk = bytes(chunk)
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise ServiceError("upload_too_large")
                    chunks.append(chunk)
            else:
                async for chunk in stream:
                    if not isinstance(chunk, (bytes, bytearray, memoryview)):
                        raise ServiceError("upload_stream_invalid")
                    chunk = bytes(chunk)
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise ServiceError("upload_too_large")
                    chunks.append(chunk)
    except TimeoutError:
        raise ServiceError("upload_timeout", retryable=True) from None
    except ServiceError:
        raise
    except Exception:
        raise ServiceError("upload_read_failed") from None
    return b"".join(chunks)


def _require_project(db: Session, project_id: UUID) -> None:
    if db.scalar(select(Project.id).where(Project.id == project_id)) is None:
        raise ServiceError("not_found")


def _add_cv_revision(db: Session, project_id: UUID, file_id: UUID) -> None:
    # Serialize revision numbering for concurrent uploads in the same Project.
    db.scalar(select(Project.id).where(Project.id == project_id).with_for_update())
    existing = db.scalar(
        select(CVRevision.id).where(
            CVRevision.project_id == project_id, CVRevision.file_id == file_id
        )
    )
    if existing is not None:
        return
    revision = db.scalar(
        select(func.coalesce(func.max(CVRevision.revision), 0) + 1).where(
            CVRevision.project_id == project_id
        )
    )
    db.add(CVRevision(project_id=project_id, revision=revision, file_id=file_id))


def _authorize_file(db: Session, actor: Actor, project_id: UUID, row: StoredFile) -> None:
    if row.kind == "generated_document":
        authorize(db, actor, project_id, "results:read", "generated_document")
    else:
        authorize(db, actor, project_id, "read", "cv_original")


def _pending_artifact_publishable(run: Run, artifact_lease_owner: str | None) -> bool:
    if (
        run.operation != "draft_documents"
        or run.status != "running"
        or run.cancellation_requested_at is not None
        or run.lease_owner is None
        or artifact_lease_owner != run.lease_owner
        or run.lease_expires_at is None
    ):
        return False
    expires_at = run.lease_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = expires_at.astimezone(timezone.utc)
    return expires_at > datetime.now(timezone.utc)


def _view(row: StoredFile) -> FileView:
    return FileView(
        id=row.id,
        kind=row.kind,
        publication_state=row.publication_state,
        display_name=row.display_name,
        mime_type=row.mime_type,
        size_bytes=row.size_bytes,
        checksum_sha256=row.checksum_sha256,
        created_at=row.created_at,
    )
