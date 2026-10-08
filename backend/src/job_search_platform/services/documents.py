"""Immutable generated document revisions and validated artifact publication."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import stat
import unicodedata
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from job_search_platform.db.models import (
    Approval,
    CVRevision,
    Document,
    DocumentRevision,
    JobRevision,
    Project,
    Run,
    RunArtifact,
    StoredFile,
)
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor,
    DocumentRevisionView,
    DocumentView,
    FileView,
    RevisionView,
)
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.files import (
    MAX_UPLOAD_BYTES,
    _MIME_EXTENSIONS,
    _normalize_declared_type,
    _safe_display_name,
    _sniff_mime,
    _view,
)


_log = logging.getLogger(__name__)


class Artifacts:
    """Publish outputs emitted by a project/run-scoped worker staging area."""

    def __init__(
        self,
        sessions: sessionmaker[Session],
        object_store,
        staging_root_for_run: Callable[[UUID, UUID], Path],
    ) -> None:
        self.sessions = sessions
        self.object_store = object_store
        self.staging_root_for_run = staging_root_for_run

    async def publish(
        self, project_id: UUID, run_id: UUID, validated_manifest: Mapping[str, Any]
    ) -> list[FileView]:
        outputs, source_cv_id, source_job_id, lease_owner = self._validate_manifest(
            project_id, run_id, validated_manifest
        )
        pending: list[tuple[StoredFile, Document, DocumentRevision, RunArtifact, bytes]] = []
        with self.sessions.begin() as db:
            run = db.scalar(
                select(Run)
                .where(Run.project_id == project_id, Run.id == run_id)
                .with_for_update()
            )
            if not _run_publishable(run, lease_owner):
                raise ServiceError("run_not_publishable")
            revise_id = run.input_snapshot.get("document_id")
            for index, output in enumerate(outputs):
                file_id = uuid4()
                document_id = uuid4()
                revision_id = uuid4()
                revision_number = 1
                append_to = None
                if revise_id and index == 0:
                    # Revise: the first draft becomes a new revision of the requested document.
                    append_to = db.scalar(select(Document).where(
                        Document.project_id == project_id, Document.id == UUID(revise_id)).with_for_update())
                    if append_to is None or append_to.trashed_at is not None:
                        raise ServiceError("run_not_publishable")
                    document_id = append_to.id
                    revision_number = db.scalar(select(func.max(DocumentRevision.revision)).where(
                        DocumentRevision.project_id == project_id, DocumentRevision.document_id == document_id)) + 1
                file_row = StoredFile(
                    id=file_id,
                    project_id=project_id,
                    kind="generated_document",
                    publication_state="pending",
                    storage_key=f"objects/{uuid4().hex}",
                    checksum_sha256=output["sha256"],
                    size_bytes=len(output["body"]),
                    mime_type=output["mime_type"],
                    display_name=output["display_name"],
                )
                document = append_to or Document(
                    id=document_id,
                    project_id=project_id,
                    document_type=output["document_type"],
                    title=output["title"],
                )
                revision = DocumentRevision(
                    id=revision_id,
                    project_id=project_id,
                    document_id=document_id,
                    revision=revision_number,
                    file_id=file_id,
                    source_cv_revision_id=source_cv_id,
                    source_job_revision_id=source_job_id,
                    content_markdown=output["content_markdown"],
                )
                association = RunArtifact(
                    project_id=project_id,
                    run_id=run_id,
                    file_id=file_id,
                    document_revision_id=revision_id,
                    lease_owner=lease_owner,
                )
                db.add_all([file_row] if append_to else [file_row, document])
                db.flush()
                db.add(revision)
                db.flush()
                db.add(association)
                pending.append((file_row, document, revision, association, output["body"]))

        try:
            for file_row, _document, _revision, _association, body in pending:
                await self.object_store.put(file_row.storage_key, body, file_row.checksum_sha256)
        except Exception:
            with self.sessions.begin() as db:
                for file_row, _document, _revision, _association, _body in pending:
                    persisted = db.scalar(
                        select(StoredFile)
                        .where(
                            StoredFile.project_id == project_id,
                            StoredFile.id == file_row.id,
                            StoredFile.publication_state == "pending",
                        )
                        .with_for_update()
                    )
                    if persisted is not None:
                        persisted.publication_state = "unavailable"
            raise ServiceError("object_store_unavailable", retryable=True) from None

        try:
            with self.sessions.begin() as db:
                run = db.scalar(
                    select(Run)
                    .where(Run.project_id == project_id, Run.id == run_id)
                    .with_for_update()
                )
                if not _run_publishable(run, lease_owner):
                    raise ServiceError("run_not_publishable")
                for file_row, _document, _revision, _association, _body in pending:
                    persisted = db.scalar(
                        select(StoredFile)
                        .where(
                            StoredFile.project_id == project_id,
                            StoredFile.id == file_row.id,
                            StoredFile.publication_state == "pending",
                        )
                        .with_for_update()
                    )
                    if persisted is None:
                        raise ServiceError("file_unavailable")
                    persisted.publication_state = "published"
        except Exception:
            # Reconciliation owns the durable pending rows and only promotes them after
            # verifying the complete object bytes against their persisted checksum.
            from job_search_platform.services.files import StorageCommitError

            raise StorageCommitError from None

        with self.sessions() as db:
            return [
                _view(
                    db.scalar(
                        select(StoredFile).where(
                            StoredFile.project_id == project_id,
                            StoredFile.id == file_row.id,
                        )
                    )
                )
                for file_row, _document, _revision, _association, _body in pending
            ]

    def _validate_manifest(
        self, project_id: UUID, run_id: UUID, manifest: Mapping[str, Any]
    ) -> tuple[list[dict[str, Any]], UUID, UUID, str | None]:
        if not isinstance(manifest, Mapping):
            raise ServiceError("artifact_manifest_invalid")
        try:
            expected_root = Path(self.staging_root_for_run(project_id, run_id))
            declared_root = Path(manifest["staging_dir"])
            files = manifest["files"]
        except (KeyError, TypeError, ValueError):
            raise ServiceError("artifact_manifest_invalid") from None
        lease_owner = manifest.get("lease_owner")
        if lease_owner is not None and (
            not isinstance(lease_owner, str)
            or not lease_owner.strip()
            or len(lease_owner) > 200
            or any(unicodedata.category(char).startswith("C") for char in lease_owner)
        ):
            raise ServiceError("artifact_manifest_invalid")
        if (
            not expected_root.is_absolute()
            or expected_root.is_symlink()
            or not expected_root.is_dir()
            or declared_root.is_symlink()
            or not declared_root.is_absolute()
        ):
            raise ServiceError("artifact_manifest_invalid")
        try:
            root = expected_root.resolve(strict=True)
            if declared_root.resolve(strict=True) != root:
                raise ServiceError("artifact_manifest_invalid")
            if declared_root != root:
                raise ServiceError("artifact_manifest_invalid")
        except OSError:
            raise ServiceError("artifact_manifest_invalid") from None
        if not isinstance(files, list) or not 1 <= len(files) <= 8:
            raise ServiceError("artifact_manifest_invalid")

        with self.sessions() as db:
            run = db.scalar(
                select(Run).where(Run.project_id == project_id, Run.id == run_id)
            )
            if not _run_publishable(run, lease_owner):
                raise ServiceError("run_not_publishable")
            source_cv_id, source_job_id = run.cv_revision_id, run.job_revision_id

        outputs: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in files:
            if not isinstance(item, Mapping):
                raise ServiceError("artifact_manifest_invalid")
            try:
                relative = PurePosixPath(item["path"])
                document_type = item["document_type"]
                title = item["title"]
                declared_mime = _normalize_declared_type(item["mime_type"])
                digest = item["sha256"]
                source_cv = UUID(str(item.get("source_cv_revision_id", source_cv_id)))
                source_job = UUID(str(item.get("source_job_revision_id", source_job_id)))
                display_name = _safe_display_name(item.get("display_name", relative.name))
            except (KeyError, TypeError, ValueError):
                raise ServiceError("artifact_manifest_invalid") from None
            if (
                relative.is_absolute()
                or not relative.parts
                or any(part in {"", ".", ".."} for part in relative.parts)
                or "\\" in str(item.get("path", ""))
                or document_type not in {"cv", "cover_letter", "application_message"}
                or not isinstance(title, str)
                or not title.strip()
                or len(title) > 300
                or any(unicodedata.category(char).startswith("C") for char in title)
                or source_cv != source_cv_id
                or source_job != source_job_id
                or not isinstance(digest, str)
                or len(digest) != 64
                or any(char not in "0123456789abcdef" for char in digest)
            ):
                raise ServiceError("artifact_manifest_invalid")
            try:
                # Reject links in every path component and hard links before opening.
                cursor = root
                for part in relative.parts:
                    cursor = cursor / part
                    info = cursor.lstat()
                    if stat.S_ISLNK(info.st_mode):
                        raise ServiceError("artifact_path_invalid")
                path_key = relative.as_posix()
                if path_key in seen:
                    raise ServiceError("artifact_path_invalid")
                body = _read_staged_file(root, relative.parts)
            except ServiceError:
                raise
            except OSError:
                raise ServiceError("artifact_path_invalid") from None
            if (
                not body
                or len(body) > MAX_UPLOAD_BYTES
                or declared_mime not in {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
                or _sniff_mime(body) != declared_mime
                or hashlib.sha256(body).hexdigest() != digest
                or Path(display_name).suffix.lower() != _MIME_EXTENSIONS[declared_mime]
            ):
                raise ServiceError("artifact_validation_failed")
            seen.add(path_key)
            preview = item.get("content_markdown")
            if preview is not None:
                if not isinstance(preview, str) or not preview.strip() or len(preview) > 200000:
                    raise ServiceError("artifact_manifest_invalid")
                preview = preview.strip()
            outputs.append(
                {
                    "path": relative,
                    "document_type": document_type,
                    "title": title.strip(),
                    "mime_type": declared_mime,
                    "sha256": digest,
                    "display_name": display_name,
                    "body": body,
                    "content_markdown": preview,
                }
            )
        return outputs, source_cv_id, source_job_id, lease_owner


class Documents:
    """Read published generated-document metadata with persisted authorization."""

    def __init__(self, sessions: sessionmaker[Session], object_store) -> None:
        self.sessions = sessions
        self.object_store = object_store

    async def set_trashed(self, actor: Actor, project_id: UUID, document_id: UUID, trashed: bool) -> None:
        """Owner move to / restore from trash. Idempotent: repeating either keeps the first timestamp."""
        await asyncio.to_thread(self._set_trashed, actor, project_id, document_id, trashed)

    def _set_trashed(self, actor: Actor, project_id: UUID, document_id: UUID, trashed: bool) -> None:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "document")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            document = db.scalar(select(Document).where(
                Document.project_id == project_id, Document.id == document_id).with_for_update())
            if document is None:
                raise ServiceError("not_found")
            if trashed and document.trashed_at is None:
                document.trashed_at = datetime.now(timezone.utc)
            elif not trashed:
                document.trashed_at = None

    async def delete(self, actor: Actor, project_id: UUID, document_id: UUID) -> None:
        """Owner permanent delete of a trashed document: rows commit first, then objects best-effort."""
        storage_keys = await asyncio.to_thread(self._delete_rows, actor, project_id, document_id)
        for key in storage_keys:
            try:
                await self.object_store.delete(key)
            except Exception:
                # Rows are already gone; an orphaned private object is harmless. Never log the key.
                _log.warning("document_object_delete_failed")

    def _delete_rows(self, actor: Actor, project_id: UUID, document_id: UUID) -> list[str]:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "document")
            # Project lock first (as approvals do) so no approval can be requested mid-delete.
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            document = db.scalar(select(Document).where(
                Document.project_id == project_id, Document.id == document_id).with_for_update())
            if document is None:
                raise ServiceError("not_found")
            if document.trashed_at is None:
                raise ServiceError("document_not_trashed")
            revisions = list(db.scalars(select(DocumentRevision).where(
                DocumentRevision.project_id == project_id,
                DocumentRevision.document_id == document_id).with_for_update()))
            revision_ids = [row.id for row in revisions]
            file_ids = {row.file_id for row in revisions if row.file_id is not None}
            files = list(db.scalars(select(StoredFile).where(
                StoredFile.project_id == project_id, StoredFile.id.in_(file_ids)).with_for_update())) if file_ids else []
            if any(file.publication_state == "pending" for file in files):
                raise ServiceError("document_in_use")

            related = and_(Approval.project_id == project_id, or_(
                Approval.revision_id.in_(revision_ids), Approval.target_file_id.in_(file_ids)))
            in_flight = and_(related, or_(
                Approval.consumed_at.is_(None),
                and_(Approval.decision == "approve", Approval.applied_at.is_(None)),
            ))
            if db.scalar(select(func.count()).select_from(Approval).where(in_flight)):
                raise ServiceError("document_in_use")

            # Settled approvals are history that would dangle; dependents go before their targets.
            db.execute(delete(Approval).where(related))
            db.execute(delete(RunArtifact).where(
                RunArtifact.project_id == project_id, RunArtifact.document_revision_id.in_(revision_ids)))
            db.execute(delete(DocumentRevision).where(
                DocumentRevision.project_id == project_id, DocumentRevision.document_id == document_id))
            db.execute(delete(Document).where(Document.project_id == project_id, Document.id == document_id))

            # A file stays when anything else (e.g. a CV promoted from this draft) still points at it.
            kept: set[UUID] = set()
            for column in (CVRevision.file_id, JobRevision.content_file_id, DocumentRevision.file_id,
                           RunArtifact.file_id, Approval.target_file_id):
                kept.update(db.scalars(select(column).where(
                    column.class_.project_id == project_id, column.in_(file_ids))))
            doomed = [file for file in files if file.id not in kept]
            if doomed:
                db.execute(delete(StoredFile).where(
                    StoredFile.project_id == project_id, StoredFile.id.in_([file.id for file in doomed])))
            return [file.storage_key for file in doomed]

    async def list_ready(self, actor: Actor, project_id: UUID) -> list[DocumentView]:
        """Documents outside the trash; owners and grants (REST, MCP, A2A) all see only these."""
        return self._list(actor, project_id, trashed=False)

    async def list_trashed(self, actor: Actor, project_id: UUID) -> list[DocumentView]:
        """Owner-only trash view, newest trashed first."""
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        return self._list(actor, project_id, trashed=True)

    def _list(self, actor: Actor, project_id: UUID, *, trashed: bool) -> list[DocumentView]:
        with self.sessions() as db:
            authorize(db, actor, project_id, "results:read", "generated_document")
            docs = list(
                db.scalars(
                    select(Document)
                    .where(
                        Document.project_id == project_id,
                        Document.trashed_at.is_not(None) if trashed else Document.trashed_at.is_(None),
                    )
                    .order_by(*((Document.trashed_at.desc(), Document.id) if trashed else (Document.created_at, Document.id)))
                )
            )
            result: list[DocumentView] = []
            for doc in docs:
                latest = db.scalar(
                    select(DocumentRevision)
                    .join(StoredFile, StoredFile.id == DocumentRevision.file_id)
                    .where(
                        DocumentRevision.project_id == project_id,
                        DocumentRevision.document_id == doc.id,
                        StoredFile.project_id == project_id,
                        StoredFile.publication_state == "published",
                    )
                    .order_by(DocumentRevision.revision.desc())
                    .limit(1)
                )
                if latest is None:
                    continue
                result.append(_document_view(doc, latest, db, include_content=False))
            return result

    async def get(self, actor: Actor, project_id: UUID, document_id: UUID) -> DocumentView:
        with self.sessions() as db:
            authorize(db, actor, project_id, "results:read", "generated_document")
            doc = db.scalar(
                select(Document).where(
                    Document.project_id == project_id, Document.id == document_id
                )
            )
            if doc is None or doc.trashed_at is not None:
                raise ServiceError("not_found")
            latest = db.scalar(
                select(DocumentRevision)
                .join(StoredFile, StoredFile.id == DocumentRevision.file_id)
                .where(
                    DocumentRevision.project_id == project_id,
                    DocumentRevision.document_id == document_id,
                    StoredFile.project_id == project_id,
                    StoredFile.publication_state == "published",
                )
                .order_by(DocumentRevision.revision.desc())
                .limit(1)
            )
            if latest is None:
                raise ServiceError("not_found")
            return _document_view(doc, latest, db)

    async def revisions(
        self, actor: Actor, project_id: UUID, document_id: UUID
    ) -> list[DocumentRevisionView]:
        with self.sessions() as db:
            authorize(db, actor, project_id, "results:read", "generated_document")
            document = db.scalar(
                select(Document).where(
                    Document.project_id == project_id, Document.id == document_id
                )
            )
            # A trashed document stays previewable to its owner only.
            if document is None or (document.trashed_at is not None and actor.kind != "owner"):
                raise ServiceError("not_found")
            rows = list(
                db.scalars(
                    select(DocumentRevision)
                    .join(StoredFile, StoredFile.id == DocumentRevision.file_id)
                    .where(
                        DocumentRevision.project_id == project_id,
                        DocumentRevision.document_id == document_id,
                        StoredFile.project_id == project_id,
                        StoredFile.publication_state == "published",
                    )
                    .order_by(DocumentRevision.revision)
                )
            )
            manual = set(db.scalars(
                select(RunArtifact.document_revision_id).join(
                    Run, (Run.project_id == RunArtifact.project_id) & (Run.id == RunArtifact.run_id))
                .where(RunArtifact.project_id == project_id, Run.operation == "export_document",
                       RunArtifact.document_revision_id.in_([row.id for row in rows]))))
            return [
                DocumentRevisionView(
                    id=row.id,
                    revision=row.revision,
                    created_at=row.created_at,
                    document_id=row.document_id,
                    source_cv_revision_id=row.source_cv_revision_id,
                    source_job_revision_id=row.source_job_revision_id,
                    file_id=row.file_id,
                    content_markdown=row.content_markdown,
                    origin="manual" if row.id in manual else "agent",
                )
                for row in rows
            ]


def _document_view(document: Document, revision: DocumentRevision, db: Session, *, include_content: bool = True) -> DocumentView:
    source = db.scalar(select(Run).join(RunArtifact, RunArtifact.run_id == Run.id).where(
        RunArtifact.project_id == document.project_id,
        RunArtifact.document_revision_id == revision.id,
        Run.project_id == document.project_id,
    ))
    return DocumentView(
        id=document.id,
        document_type=document.document_type,
        title=document.title,
        content_markdown=revision.content_markdown if include_content else None,
        output_language=source.output_language if source is not None else None,
        source_run_id=source.id if source is not None else None,
        partial=source is None or source.status != "completed",
        trashed_at=document.trashed_at,
        latest_revision=RevisionView(
            id=revision.id,
            revision=revision.revision,
            created_at=revision.created_at,
        ),
    )


def _run_publishable(run: Run | None, manifest_lease_owner: str | None) -> bool:
    now = datetime.now(timezone.utc)
    return (
        run is not None
        and run.operation in {"draft_documents", "export_document"}
        and run.status == "running"
        and run.cancellation_requested_at is None
        and _lease_matches(run, manifest_lease_owner, now, require_unexpired=True)
    )


def _lease_matches(
    run: Run, manifest_lease_owner: str | None, now: datetime, *, require_unexpired: bool
) -> bool:
    if (
        not isinstance(run.lease_owner, str)
        or not run.lease_owner.strip()
        or not isinstance(manifest_lease_owner, str)
        or not manifest_lease_owner.strip()
    ):
        return False
    if manifest_lease_owner != run.lease_owner or run.lease_expires_at is None:
        return False
    expires_at = run.lease_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    else:
        expires_at = expires_at.astimezone(timezone.utc)
    return not require_unexpired or expires_at > now


def _read_staged_file(root: Path, parts: tuple[str, ...]) -> bytes:
    """Open relative to held directory descriptors, never following a swapped link."""
    directory_flag = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    file_flag = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptors: list[int] = []
    try:
        descriptor = os.open(root, directory_flag)
        descriptors.append(descriptor)
        for part in parts[:-1]:
            descriptor = os.open(part, directory_flag, dir_fd=descriptor)
            descriptors.append(descriptor)
        file_descriptor = os.open(parts[-1], file_flag, dir_fd=descriptor)
        descriptors.append(file_descriptor)
        info = os.fstat(file_descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ServiceError("artifact_path_invalid")
        data = bytearray()
        while chunk := os.read(file_descriptor, min(64 * 1024, MAX_UPLOAD_BYTES + 1 - len(data))):
            data.extend(chunk)
            if len(data) > MAX_UPLOAD_BYTES:
                raise ServiceError("artifact_validation_failed")
        return bytes(data)
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
