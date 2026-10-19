"""CV builder routes: templates, drafts, real-PDF preview and publishing a version (spec 2026-10-19-cv-builder)."""
from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import datetime, timezone
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError
from sqlalchemy import func, select

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.db.models import (CV, CVRevision, CVRevisionText, Document, DocumentRevision, ExperienceItem,
                                           Project, ResumeDraft, Run, StoredFile)
from job_search_platform.services import rate_limits
from job_search_platform.services import resume as rs
from job_search_platform.services.authorization import authorize
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.experience import MAX_ITEMS, text_hash

router = APIRouter()


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BuilderCreate(_Body):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    from_experience: bool = False
    document_language: Literal["th", "en"] = "th"


class DraftUpdate(_Body):
    resume_data: dict[str, Any]
    template_id: Literal["onyx", "kakuna", "ditgar"]
    accent: Literal["indigo", "blue", "teal", "green", "rose", "slate"]
    document_language: Literal["th", "en"]
    updated_at: datetime


def _owner_only(actor) -> None:
    if actor.kind != "user":
        raise ServiceError("forbidden")


def parse_resume(raw: dict[str, Any]) -> rs.ResumeData:
    if len(json.dumps(raw, ensure_ascii=False).encode()) > rs.MAX_BYTES:
        raise ServiceError("resume_invalid", fields={"path": "resume_data"})
    try:
        return rs.ResumeData.model_validate(raw)
    except ValidationError as exc:
        location = ".".join(str(part) for part in exc.errors()[0]["loc"])
        raise ServiceError("resume_invalid", fields={"path": location[:200]}) from None


def _view(draft: ResumeDraft) -> dict[str, Any]:
    return {"id": draft.id, "cv_id": draft.cv_id, "document_id": draft.document_id, "resume_data": draft.resume_data,
            "template_id": draft.template_id, "accent": draft.accent, "document_language": draft.document_language,
            "ats_safe": rs.TEMPLATES[draft.template_id], "updated_at": draft.updated_at}


def _draft(db, actor, project_id: UUID, *, cv_id: UUID | None = None, document_id: UUID | None = None,
           action: str = "read", lock: bool = False) -> ResumeDraft:
    _owner_only(actor)
    authorize(db, actor, project_id, action, "cv" if cv_id else "document")
    query = select(ResumeDraft).where(ResumeDraft.project_id == project_id,
                                      ResumeDraft.cv_id == cv_id if cv_id else ResumeDraft.document_id == document_id)
    draft = db.scalar(query.with_for_update() if lock else query)
    if draft is None:
        raise ServiceError("not_found")
    if cv_id and db.scalar(select(CV.id).where(CV.id == cv_id, CV.removed_at.is_(None))) is None:
        raise ServiceError("not_found")
    if document_id and db.scalar(select(Document.id).where(Document.id == document_id, Document.trashed_at.is_(None))) is None:
        raise ServiceError("not_found")
    return draft


async def _render(services: Services, draft_data: rs.ResumeData, template: str, accent: str, lang: str) -> bytes:
    try:
        return await services.runtime.render_typst(rs.render_bundle(draft_data, template, accent, lang))
    except ServiceError:
        raise
    except Exception:  # sandbox, docker or compile failure: the draft stays as it is
        raise ServiceError("render_failed", retryable=True) from None


@router.get("/resume-templates")
async def resume_templates(actor=Depends(owner_actor)):
    return {"templates": [{"id": key, "ats_safe": safe} for key, safe in rs.TEMPLATES.items()],
            "accents": [{"id": key, "hex": value} for key, value in rs.ACCENTS.items()]}


@router.post("/projects/{project_id}/cvs/builder", status_code=201)
async def create_builder_cv(project_id: UUID, body: BuilderCreate, actor=Depends(write_actor),
                            services: Services = Depends(get_services)):
    from job_search_platform.api.rest import _cv_view

    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        primary = db.scalar(select(CV.id).where(CV.project_id == project_id, CV.is_primary, CV.removed_at.is_(None)))
        cv = CV(project_id=project_id, name=body.name, is_primary=primary is None)
        db.add(cv)
        db.flush()
        rows = db.scalars(select(ExperienceItem).where(
            ExperienceItem.project_id == project_id, ExperienceItem.removed_at.is_(None))
            .order_by(ExperienceItem.created_at, ExperienceItem.id)).all() if body.from_experience else []
        data = rs.from_bank(list(rows)) if rows else rs.ResumeData()
        db.add(ResumeDraft(project_id=project_id, cv_id=cv.id, resume_data=data.model_dump(), template_id="onyx",
                           accent="indigo", document_language=body.document_language))
        db.flush()
        return _cv_view(db, cv)


def _key(kind: str, owner_id: UUID) -> dict[str, UUID]:
    return {"cv_id": owner_id} if kind == "cv" else {"document_id": owner_id}


async def _get(kind, project_id, owner_id, actor, services):
    with services.sessions() as db:
        return _view(_draft(db, actor, project_id, **_key(kind, owner_id)))


async def _put(kind, project_id, owner_id, body: DraftUpdate, actor, services):
    data = parse_resume(body.resume_data)
    with services.sessions.begin() as db:
        draft = _draft(db, actor, project_id, **_key(kind, owner_id), action="write", lock=True)
        rate_limits.hit(db, "resume_draft_save", str(actor.user_id))
        if draft.updated_at != body.updated_at:
            raise ServiceError("draft_conflict")
        draft.resume_data, draft.template_id, draft.accent = data.model_dump(), body.template_id, body.accent
        draft.document_language, draft.updated_at = body.document_language, datetime.now(timezone.utc)
        db.flush()
        return _view(draft)


async def _preview(kind, project_id, owner_id, actor, services):
    with services.sessions.begin() as db:
        draft = _draft(db, actor, project_id, **_key(kind, owner_id))
        rate_limits.hit(db, "resume_preview", str(actor.user_id))
        data, options = parse_resume(draft.resume_data), (draft.template_id, draft.accent, draft.document_language)
    pdf = await _render(services, data, *options)
    return Response(pdf, media_type="application/pdf", headers={
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=preview.pdf"})


async def _publish(kind, project_id, owner_id, actor, services):
    with services.sessions() as db:
        draft = _draft(db, actor, project_id, **_key(kind, owner_id), action="write")
        data, stamp = parse_resume(draft.resume_data), draft.updated_at
        options = (draft.template_id, draft.accent, draft.document_language)
    if not data.basics.name or rs.is_empty(data):
        raise ServiceError("resume_incomplete")
    pdf = await _render(services, data, *options)
    file_id = await _store_pdf(services, actor, project_id, pdf, data.basics.name)
    if kind == "cv":
        return _publish_cv(services, actor, project_id, owner_id, file_id, data, options, stamp)
    return _publish_document(services, actor, project_id, owner_id, file_id, data, options, stamp)


CV_DRAFT = "/projects/{project_id}/cvs/{cv_id}/draft"
DOC_DRAFT = "/projects/{project_id}/documents/{document_id}/draft"


@router.get(CV_DRAFT)
async def get_cv_draft(project_id: UUID, cv_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await _get("cv", project_id, cv_id, actor, services)


@router.put(CV_DRAFT)
async def put_cv_draft(project_id: UUID, cv_id: UUID, body: DraftUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _put("cv", project_id, cv_id, body, actor, services)


@router.post(CV_DRAFT + "/preview")
async def preview_cv_draft(project_id: UUID, cv_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _preview("cv", project_id, cv_id, actor, services)


@router.post(CV_DRAFT + "/publish", status_code=201)
async def publish_cv_draft(project_id: UUID, cv_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _publish("cv", project_id, cv_id, actor, services)


@router.get(DOC_DRAFT)
async def get_document_draft(project_id: UUID, document_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await _get("document", project_id, document_id, actor, services)


@router.put(DOC_DRAFT)
async def put_document_draft(project_id: UUID, document_id: UUID, body: DraftUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _put("document", project_id, document_id, body, actor, services)


@router.post(DOC_DRAFT + "/preview")
async def preview_document_draft(project_id: UUID, document_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _preview("document", project_id, document_id, actor, services)


@router.post(DOC_DRAFT + "/publish", status_code=201)
async def publish_document_draft(project_id: UUID, document_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await _publish("document", project_id, document_id, actor, services)


async def _store_pdf(services: Services, actor, project_id: UUID, pdf: bytes, name: str) -> UUID:
    """Pending file row, then the object; the publishing transaction makes it visible together with its revision."""
    digest, file_id, storage_key = hashlib.sha256(pdf).hexdigest(), uuid4(), f"objects/{uuid4().hex}"
    safe = "".join(ch for ch in name if ch.isalnum() or unicodedata.category(ch).startswith("M") or ch in " -_").strip()[:80] or "CV"
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        db.add(StoredFile(id=file_id, project_id=project_id, kind="resume_render", publication_state="pending",
                          storage_key=storage_key, checksum_sha256=digest, size_bytes=len(pdf),
                          mime_type="application/pdf", display_name=f"{safe}.pdf"))
    try:
        await services.files.object_store.put(storage_key, pdf, digest)
    except Exception:
        with services.sessions.begin() as db:
            row = db.get(StoredFile, file_id)
            if row is not None:
                row.publication_state = "unavailable"
        raise ServiceError("object_store_unavailable", retryable=True) from None
    return file_id


def _claim_file(db, project_id: UUID, file_id: UUID) -> StoredFile:
    row = db.scalar(select(StoredFile).where(StoredFile.project_id == project_id, StoredFile.id == file_id,
                                             StoredFile.publication_state == "pending").with_for_update())
    if row is None:
        raise ServiceError("file_unavailable")
    row.publication_state = "published"
    return row


def _check_stamp(db, actor, project_id: UUID, stamp: datetime, **owner) -> ResumeDraft:
    draft = _draft(db, actor, project_id, **owner, action="write", lock=True)
    if draft.updated_at != stamp:  # edited while rendering: publish what the owner now sees instead
        raise ServiceError("draft_conflict")
    return draft


def _publish_cv(services, actor, project_id, cv_id, file_id, data: rs.ResumeData, options, stamp):
    from job_search_platform.api.rest import _cv_revision_view

    template, accent, lang = options
    with services.sessions.begin() as db:
        db.scalar(select(Project.id).where(Project.id == project_id).with_for_update())
        _check_stamp(db, actor, project_id, stamp, cv_id=cv_id)
        stored = _claim_file(db, project_id, file_id)
        number = db.scalar(select(func.coalesce(func.max(CVRevision.revision), 0) + 1).where(CVRevision.cv_id == cv_id))
        revision = CVRevision(project_id=project_id, cv_id=cv_id, revision=number, file_id=file_id,
                              resume_data=data.model_dump(), resume_style={"template_id": template, "accent": accent})
        db.add(revision)
        db.flush()
        db.add(CVRevisionText(cv_revision_id=revision.id, project_id=project_id, text=rs.plain_text(data, lang)[:200000] or data.basics.name))
        sync_bank(db, project_id, cv_id, rs.bank_facts(data, lang))
        db.flush()
        return _cv_revision_view(revision, stored)


def _publish_document(services, actor, project_id, document_id, file_id, data: rs.ResumeData, options, stamp):
    template, accent, _ = options
    with services.sessions.begin() as db:
        db.scalar(select(Project.id).where(Project.id == project_id).with_for_update())
        _check_stamp(db, actor, project_id, stamp, document_id=document_id)
        busy = db.scalar(select(func.count()).select_from(Run).where(
            Run.project_id == project_id, Run.status.in_(("queued", "running", "waiting_approval")),
            Run.input_snapshot["document_id"].as_string() == str(document_id)))
        if busy:
            raise ServiceError("document_busy")
        _claim_file(db, project_id, file_id)
        latest = db.scalar(select(DocumentRevision).where(DocumentRevision.document_id == document_id)
                           .order_by(DocumentRevision.revision.desc()).limit(1))
        revision = DocumentRevision(project_id=project_id, document_id=document_id,
                                    revision=(latest.revision if latest else 0) + 1, file_id=file_id,
                                    source_cv_revision_id=latest.source_cv_revision_id if latest else None,
                                    source_job_revision_id=latest.source_job_revision_id if latest else None,
                                    resume_data=data.model_dump(), resume_style={"template_id": template, "accent": accent})
        db.add(revision)
        db.flush()
        return {"id": revision.id, "revision": revision.revision, "created_at": revision.created_at,
                "document_id": document_id, "file_id": file_id, "source_cv_revision_id": revision.source_cv_revision_id,
                "source_job_revision_id": revision.source_job_revision_id, "origin": "manual"}


def sync_bank(db, project_id: UUID, cv_id: UUID, facts: list[dict]) -> None:
    """Owner facts of this builder CV become exactly `facts`: stale ones are soft-removed, removed ones revived,
    new ones added. Facts from other sources are never touched (the hash is unique per project)."""
    now = datetime.now(timezone.utc)
    wanted = {text_hash(fact["text"]): fact for fact in facts}
    for row in db.scalars(select(ExperienceItem).where(
            ExperienceItem.project_id == project_id, ExperienceItem.builder_cv_id == cv_id,
            ExperienceItem.removed_at.is_(None)).with_for_update()):
        if row.text_hash not in wanted:
            row.removed_at = now
    db.flush()
    existing = {row.text_hash: row for row in db.scalars(select(ExperienceItem).where(
        ExperienceItem.project_id == project_id, ExperienceItem.text_hash.in_(list(wanted))).with_for_update())}
    live = db.scalar(select(func.count()).select_from(ExperienceItem).where(
        ExperienceItem.project_id == project_id, ExperienceItem.removed_at.is_(None))) or 0
    for digest, fact in wanted.items():
        row = existing.get(digest)
        if row is not None and row.removed_at is None:
            continue
        if live >= MAX_ITEMS:
            raise ServiceError("bank_full")
        live += 1
        if row is not None:
            row.removed_at = None
            if row.source == "owner":
                row.builder_cv_id = cv_id
            continue
        db.add(ExperienceItem(project_id=project_id, kind=fact["kind"], text=fact["text"], role=fact["role"],
                              organization=fact["organization"], period=fact["period"], source="owner",
                              source_cv_revision_id=None, builder_cv_id=cv_id, text_hash=digest))
