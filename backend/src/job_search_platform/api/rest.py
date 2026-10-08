"""REST routes. Transport code delegates authorization and long workflows to services."""
from __future__ import annotations

import asyncio
import re
from pathlib import PurePath
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import StringConstraints
from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from job_search_platform.api.dependencies import Services, get_services, owner_actor, run_actor, run_write_actor, write_actor
from job_search_platform.db.models import (
    CV, CVRevision, ConversationSession, Document, JobApplicationStatus, JobRevision, Message, Project,
    ProjectPreference, StoredFile, Run, Grant,
    ToolConnectorConfiguration,
)
from job_search_platform.services.authorization import authorize, require_scoped_id
from job_search_platform.services.contracts import (
    ApprovalDecision, ApprovalRequest, ApprovalView, CVRevisionView, CVUpdate, CVView, DocumentEdit, DocumentRevisionView, DocumentView,
    GrantIssueRequest, GrantIssuedView, GrantView, JobApplicationStatusUpdate, JobApplicationStatusView,
    JobCreate, JobRevisionView, MessageCreate,
    OwnerBootstrapRequest, OwnerBootstrapView, PreferencesUpdate, ProjectCreate,
    PreferencesView, ProjectUpdate, ProjectView, ProviderCatalogView, ProviderConnectionTestView,
    ProviderModelsRequest, ProviderModelsView, ProviderSettingsUpdate,
    ProviderSettingsView, RunRequest, RunView, SessionCreate, SessionDeleteResult, SessionUpdate, SessionView, ToolConnectorSettingsView,
    ToolConnectorUpdate, ToolConnectorView, ToolsView,
)
from job_search_platform.services import job_sources
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.owner_sessions import COOKIE_NAME
from job_search_platform.services.runs import actor_scope
from job_search_platform.services.settings import provider_catalog as settings_catalog

router = APIRouter()
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SAFE_FIELDS = frozenset({
    "name", "locale", "output_language", "notifications_enabled", "title", "company",
    "source_url", "description", "content", "filename", "file", "mime_type", "kind",
    "session_id", "operation", "cv_revision_id", "job_revision_id", "idempotency_key",
    "retry_of_id", "cv_id", "document_id", "action", "revision_id", "expected_cv_revision_id", "target_file_id",
    "decision", "capabilities", "expires_at", "provider", "model", "credential", "enabled", "base_url",
})


def _http_error(error: ServiceError) -> JSONResponse:
    code = error.code
    status_code = {
        "unauthorized": 401, "invalid_launch": 401, "invalid_origin": 403,
        "forbidden": 403, "invalid_csrf": 403, "not_found": 404,
        "project_not_empty": 409, "session_busy": 409, "idempotency_conflict": 409,
        "retry_not_allowed": 409, "approval_conflict": 409,
        "job_removed": 409, "cv_in_use": 409, "session_pair_exists": 409, "session_pair_mismatch": 422, "document_in_use": 409, "document_not_trashed": 409,
        "document_busy": 409, "document_source_unavailable": 409,
        "upload_too_large": 413, "unsupported_media_type": 415,
        "job_source_unavailable": 502,
        "queue_full": 429, "submission_rate_limited": 429,
        "object_store_unavailable": 503, "service_unavailable": 503,
        "secret_store_unavailable": 503, "invalid_base_url": 422, "credential_required": 409,
        "provider_models_unavailable": 502,
    }.get(code, 400)
    fields = {key: value for key, value in (error.fields or {}).items() if key in SAFE_FIELDS and isinstance(value, str)}
    body = {
        "code": code if re.fullmatch(r"[a-z][a-z0-9_]{0,79}", code) else "request_failed",
        "message_key": error.message_key if re.fullmatch(r"[a-z][a-z0-9_.]{0,119}", error.message_key) else "errors.request_failed",
        "retryable": bool(error.retryable),
        "correlation_id": str(error.correlation_id),
    }
    if fields:
        body["fields"] = fields
    return JSONResponse(body, status_code=status_code)


def _owner_only(actor) -> None:
    if actor.kind != "owner":
        raise ServiceError("forbidden")


def _require_live_job(db, project_id: UUID, job_id: UUID) -> JobRevision:
    """Resolve a job revision in this project; soft-removed jobs read as missing."""
    row = require_scoped_id(db, JobRevision, project_id, job_id)
    if row.removed_at is not None:
        raise ServiceError("not_found")
    return row


def _session_view(db, row: ConversationSession, evaluation_run_id: UUID | None = None) -> dict[str, Any]:
    view: dict[str, Any] = {"id": row.id, "project_id": row.project_id, "title": row.title,
                            "created_at": row.created_at, "evaluation_run_id": evaluation_run_id}
    if row.cv_revision_id is None:
        return view
    cv_revision = db.get(CVRevision, row.cv_revision_id)
    job = db.get(JobRevision, row.job_revision_id)
    cv = db.scalar(select(CV).where(CV.project_id == row.project_id, CV.id == cv_revision.cv_id))
    outdated = db.scalar(select(exists().where(CVRevision.cv_id == cv_revision.cv_id,
                                               CVRevision.revision > cv_revision.revision)))
    view.update(cv_revision_id=row.cv_revision_id, job_revision_id=row.job_revision_id,
                cv_name=cv.name, cv_revision=cv_revision.revision, job_title=job.title,
                job_company=job.company, cv_outdated=bool(outdated), cv_file_id=cv_revision.file_id)
    return view


def _visible_session(db, project_id: UUID, session_id: UUID) -> ConversationSession:
    row = require_scoped_id(db, ConversationSession, project_id, session_id)
    if row.removed_at is not None:
        raise ServiceError("not_found")
    return row


def _pair_holder(db, row: ConversationSession) -> UUID | None:
    """Visible session already holding this session's CV/job pair, if any."""
    return db.scalar(select(ConversationSession.id).where(
        ConversationSession.project_id == row.project_id, ConversationSession.id != row.id,
        ConversationSession.removed_at.is_(None),
        ConversationSession.cv_revision_id == row.cv_revision_id,
        ConversationSession.job_revision_id == row.job_revision_id))


def _cv_revision_view(revision: CVRevision, file: StoredFile) -> dict[str, Any]:
    return {"id": revision.id, "revision": revision.revision, "created_at": revision.created_at,
            "original_filename": file.display_name, "mime_type": file.mime_type, "size_bytes": file.size_bytes,
            "file_id": file.id}


def _cv_view(db, cv: CV) -> dict[str, Any]:
    rows = db.execute(select(CVRevision, StoredFile).join(
        StoredFile, (StoredFile.project_id == CVRevision.project_id) & (StoredFile.id == CVRevision.file_id)
    ).where(CVRevision.cv_id == cv.id, StoredFile.publication_state == "published")
      .order_by(CVRevision.revision.desc())).all()
    in_use = db.scalar(select(exists().where(
        ConversationSession.project_id == cv.project_id,
        ConversationSession.cv_revision_id.in_(select(CVRevision.id).where(CVRevision.cv_id == cv.id)))))
    return {"id": cv.id, "name": cv.name, "is_primary": cv.is_primary, "created_at": cv.created_at,
            "latest_revision": _cv_revision_view(*rows[0]) if rows else None,
            "revision_count": len(rows), "in_use": bool(in_use)}


def _live_cv(db, project_id: UUID, cv_id: UUID, *, lock: bool = False) -> CV:
    query = select(CV).where(CV.project_id == project_id, CV.id == cv_id, CV.removed_at.is_(None))
    cv = db.scalar(query.with_for_update() if lock else query)
    if cv is None:
        raise ServiceError("not_found")
    return cv


def _new_job_revision(db, project_id: UUID, *, title: str, company: str | None, source_url: str | None,
                      description: str) -> JobRevision:
    """Caller holds the project row lock, which serializes revision numbering."""
    revision = db.scalar(select(func.coalesce(func.max(JobRevision.revision), 0)).where(JobRevision.project_id == project_id)) + 1
    row = JobRevision(project_id=project_id, revision=revision, title=title, company=company,
                      source_url=source_url, description=description)
    db.add(row)
    db.flush()
    return row


def _job_view(row: JobRevision, application_status: str = "saved") -> dict[str, Any]:
    return {"id": row.id, "revision": row.revision, "created_at": row.created_at,
            "title": row.title, "company": row.company, "source_url": row.source_url, "description": row.description,
            "application_status": application_status}


@router.post("/owner/bootstrap", response_model=OwnerBootstrapView)
async def bootstrap(body: OwnerBootstrapRequest, request: Request, services: Services = Depends(get_services)):
    origin = request.headers.get("origin", "")
    host = request.headers.get("host", "")
    exchange = await services.owner_sessions.exchange(body.nonce.get_secret_value(), origin=origin, host=host)
    response = JSONResponse(OwnerBootstrapView(authenticated=True, csrf_token=exchange.csrf_token,
                                               expires_at=exchange.expires_at).model_dump(mode="json"))
    response.set_cookie(COOKIE_NAME, exchange.session_cookie, httponly=True, secure=False,
                        samesite="strict", path="/", expires=exchange.expires_at)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.post("/owner/session", response_model=OwnerBootstrapView)
async def restore_session(request: Request, services: Services = Depends(get_services)):
    cookie = request.cookies.get(COOKIE_NAME)
    if not cookie:
        raise ServiceError("unauthorized")
    session = await services.owner_sessions.current(cookie, origin=request.headers.get("origin", ""),
                                                    host=request.headers.get("host", ""))
    response = JSONResponse(OwnerBootstrapView(authenticated=True, csrf_token=session.csrf_token,
                                               expires_at=session.expires_at).model_dump(mode="json"))
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/projects", response_model=list[ProjectView])
async def list_projects(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        rows = db.scalars(select(Project).order_by(Project.created_at, Project.id)).all()
        return [{"id": row.id, "name": row.name, "created_at": row.created_at} for row in rows]


@router.post("/projects", status_code=201, response_model=ProjectView)
async def create_project(body: ProjectCreate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    row = Project(name=body.name)
    with services.sessions.begin() as db:
        db.add(row)
        db.flush()
        result = {"id": row.id, "name": row.name, "created_at": row.created_at}
    return result


@router.get("/projects/{project_id}", response_model=ProjectView)
async def get_project(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        row = db.get(Project, project_id)
        if row is None:
            raise ServiceError("not_found")
        return {"id": row.id, "name": row.name, "created_at": row.created_at}


@router.patch("/projects/{project_id}", response_model=ProjectView)
async def update_project(project_id: UUID, body: ProjectUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        row = db.get(Project, project_id)
        if row is None:
            raise ServiceError("not_found")
        row.name = body.name
        db.flush()
        return {"id": row.id, "name": row.name, "created_at": row.created_at}


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        row = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
        if row is None:
            raise ServiceError("not_found")
        has_durable_data = any(
            db.scalar(select(func.count()).select_from(model).where(model.project_id == project_id))
            for model in (ConversationSession, JobRevision, CVRevision, Document, StoredFile, Run,
                          ProjectPreference, Grant, ToolConnectorConfiguration)
        )
        if has_durable_data:
            raise ServiceError("project_not_empty")
        db.delete(row)


@router.get("/projects/{project_id}/preferences", response_model=PreferencesView)
async def get_preferences(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "preference")
        row = db.get(ProjectPreference, project_id)
        values = row.values if row else {}
        return {"project_id": project_id, "locale": values.get("locale", "th"),
                "output_language": values.get("output_language", "th"),
                "notifications_enabled": values.get("notifications_enabled", True),
                "updated_at": row.updated_at if row else datetime.now(timezone.utc)}


@router.patch("/projects/{project_id}/preferences", response_model=PreferencesView)
async def set_preferences(project_id: UUID, body: PreferencesUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "manage", "preference")
        project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
        if project is None:
            raise ServiceError("not_found")
        row = db.scalar(select(ProjectPreference).where(ProjectPreference.project_id == project_id).with_for_update())
        if row is None:
            row = ProjectPreference(project_id=project_id, values={})
            db.add(row)
        values = {"locale": "th", "output_language": "th", "notifications_enabled": True, **(row.values or {})}
        values.update(body.model_dump(exclude_unset=True))
        row.values = values
        row.updated_at = datetime.now(timezone.utc)
        db.flush()
        return {"project_id": project_id, **values, "updated_at": row.updated_at}


@router.get("/projects/{project_id}/sessions", response_model=list[SessionView])
async def list_sessions(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "session")
        rows = db.scalars(select(ConversationSession).where(ConversationSession.project_id == project_id,
                                                          ConversationSession.removed_at.is_(None))
                          .order_by(ConversationSession.created_at, ConversationSession.id)).all()
        return [_session_view(db, row) for row in rows]


@router.get("/projects/{project_id}/sessions/{session_id}", response_model=SessionView)
async def get_session(project_id: UUID, session_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "session")
        return _session_view(db, _visible_session(db, project_id, session_id))


@router.post("/projects/{project_id}/sessions", status_code=201, response_model=SessionView)
async def create_session(project_id: UUID, body: SessionCreate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Create a CV + job session and start its evaluation run in the same transaction."""
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "session")
        # Project-first lock order, as in job creation and run submission.
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        cv_revision = require_scoped_id(db, CVRevision, project_id, body.cv_revision_id)
        _live_cv(db, project_id, cv_revision.cv_id)
        if body.job_revision_id is not None:
            job = _require_live_job(db, project_id, body.job_revision_id)
        else:
            inline = body.job
            job = db.scalar(select(JobRevision).where(
                JobRevision.project_id == project_id, JobRevision.removed_at.is_(None),
                JobRevision.description == inline.description,
            ).order_by(JobRevision.revision).limit(1))
            if job is None:
                job = _new_job_revision(db, project_id, title=inline.title, company=inline.company,
                                        source_url=inline.source_url, description=inline.description)
        existing = db.scalar(select(ConversationSession.id).where(
            ConversationSession.project_id == project_id,
            ConversationSession.cv_revision_id == cv_revision.id,
            ConversationSession.job_revision_id == job.id,
            ConversationSession.removed_at.is_(None)))
        if existing is not None:
            raise ServiceError("session_pair_exists", fields={"session_id": str(existing)})
        title = body.title or (f"{job.title} · {job.company}" if job.company else job.title)[:200]
        row = ConversationSession(project_id=project_id, title=title,
                                  cv_revision_id=cv_revision.id, job_revision_id=job.id)
        db.add(row)
        db.flush()
        preferences = db.get(ProjectPreference, project_id)
        run = services.runs._submit_in_transaction(
            db, actor, project_id,
            RunRequest(session_id=row.id, operation="evaluate_job",
                       output_language=(preferences.values if preferences else {}).get("output_language", "th"),
                       idempotency_key=f"session-{row.id}-evaluation"),
            now=datetime.now(timezone.utc), scope=actor_scope(actor))
        return _session_view(db, row, run.id)


@router.patch("/projects/{project_id}/sessions/{session_id}", response_model=SessionView)
async def update_session(project_id: UUID, session_id: UUID, body: SessionUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        row = db.scalar(select(ConversationSession).where(
            ConversationSession.project_id == project_id, ConversationSession.id == session_id).with_for_update())
        if row is None or row.removed_at is not None:
            raise ServiceError("not_found")
        row.title = body.title
        db.flush()
        return _session_view(db, row)


@router.delete("/projects/{project_id}/sessions/{session_id}", response_model=SessionDeleteResult)
async def delete_session(project_id: UUID, session_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Hard-delete a session without runs; hide one with run history (runs, documents and approvals stay)."""
    _owner_only(actor)
    with services.sessions.begin() as db:
        row = db.scalar(select(ConversationSession).where(
            ConversationSession.project_id == project_id, ConversationSession.id == session_id).with_for_update())
        if row is None or row.removed_at is not None:
            raise ServiceError("not_found")
        statuses = set(db.scalars(select(Run.status).where(Run.project_id == project_id, Run.session_id == session_id)))
        if statuses & {"queued", "running", "waiting_approval"}:
            raise ServiceError("session_busy")
        if not statuses:
            db.execute(delete(Message).where(Message.project_id == project_id, Message.session_id == session_id))
            db.delete(row)
            return {"mode": "deleted"}
        row.removed_at = datetime.now(timezone.utc)
        return {"mode": "hidden"}


@router.post("/projects/{project_id}/sessions/{session_id}/restore", response_model=SessionView)
async def restore_session(project_id: UUID, session_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        row = db.scalar(select(ConversationSession).where(
            ConversationSession.project_id == project_id, ConversationSession.id == session_id).with_for_update())
        if row is None:
            raise ServiceError("not_found")
        if row.removed_at is not None:
            if row.cv_revision_id is not None and (holder := _pair_holder(db, row)) is not None:
                raise ServiceError("session_pair_exists", fields={"session_id": str(holder)})
            row.removed_at = None
            db.flush()
        return _session_view(db, row)


@router.get("/projects/{project_id}/sessions/{session_id}/messages")
async def list_messages(project_id: UUID, session_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "message")
        require_scoped_id(db, ConversationSession, project_id, session_id)
        rows = db.scalars(select(Message).where(Message.project_id == project_id, Message.session_id == session_id)
                          .order_by(Message.created_at, Message.id)).all()
        return [{"id": r.id, "session_id": r.session_id, "role": r.role, "content": r.content, "created_at": r.created_at} for r in rows]


@router.post("/projects/{project_id}/sessions/{session_id}/messages", status_code=202)
async def create_message(project_id: UUID, session_id: UUID, body: MessageCreate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "message")
        require_scoped_id(db, ConversationSession, project_id, session_id)
        row = Message(project_id=project_id, session_id=session_id, role="user", content=body.content)
        db.add(row)
        db.flush()
        return {"id": row.id, "session_id": row.session_id, "role": row.role, "content": row.content, "created_at": row.created_at}


@router.get("/projects/{project_id}/jobs", response_model=list[JobRevisionView])
async def list_jobs(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
        rows = db.execute(
            select(JobRevision, JobApplicationStatus.status)
            .outerjoin(
                JobApplicationStatus,
                (JobApplicationStatus.project_id == JobRevision.project_id)
                & (JobApplicationStatus.job_revision_id == JobRevision.id),
            )
            .where(JobRevision.project_id == project_id, JobRevision.removed_at.is_(None))
            .order_by(JobRevision.created_at, JobRevision.revision)
        ).all()
        return [_job_view(row, status or "saved") for row, status in rows]


@router.get("/projects/{project_id}/job-search")
async def search_job_sources(
    project_id: UUID,
    q: Annotated[str, Query(max_length=200)] = "",
    cities: Annotated[str, Query(max_length=400)] = "",
    work_mode: Annotated[str | None, Query(pattern="^(remote|hybrid|onsite)$")] = None,
    posted_within_days: Annotated[int | None, Query(ge=1, le=90)] = None,
    category: Annotated[str | None, Query(pattern=r"^[a-z0-9_-]{1,60}$")] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 20,
    offset: Annotated[int, Query(ge=0, le=1000)] = 0,
    actor=Depends(owner_actor),
    services: Services = Depends(get_services),
):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
    city_list = job_sources.parse_cities(cities)
    if city_list is None:
        raise RequestValidationError([{"loc": ("query", "cities"), "msg": "invalid", "type": "value_error"}])
    return await asyncio.to_thread(
        job_sources.search_jobs, q=q, cities=city_list, work_mode=work_mode,
        posted_within_days=posted_within_days, category=category, limit=limit, offset=offset)


@router.get("/projects/{project_id}/job-search/facets")
async def job_search_facets(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
    return await asyncio.to_thread(job_sources.job_facets)


@router.get(
    "/projects/{project_id}/jobs/{job_id}/application-status",
    response_model=JobApplicationStatusView,
)
async def get_job_application_status(
    project_id: UUID,
    job_id: UUID,
    actor=Depends(owner_actor),
    services: Services = Depends(get_services),
):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
        _require_live_job(db, project_id, job_id)
        row = db.get(JobApplicationStatus, (project_id, job_id))
        return {"job_revision_id": job_id, "application_status": row.status if row else "saved"}


@router.patch(
    "/projects/{project_id}/jobs/{job_id}/application-status",
    response_model=JobApplicationStatusView,
)
async def update_job_application_status(
    project_id: UUID,
    job_id: UUID,
    body: JobApplicationStatusUpdate,
    actor=Depends(write_actor),
    services: Services = Depends(get_services),
):
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        _require_live_job(db, project_id, job_id)
        statement = pg_insert(JobApplicationStatus).values(
            project_id=project_id,
            job_revision_id=job_id,
            status=body.application_status,
        )
        db.execute(
            statement.on_conflict_do_update(
                index_elements=["project_id", "job_revision_id"],
                set_={"status": body.application_status, "updated_at": func.now()},
            )
        )
        return {"job_revision_id": job_id, "application_status": body.application_status}


@router.post("/projects/{project_id}/jobs", status_code=201, response_model=JobRevisionView)
async def create_job(project_id: UUID, body: JobCreate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
        if project is None:
            raise ServiceError("not_found")
        row = _new_job_revision(db, project_id, title=body.title, company=body.company,
                                source_url=body.source_url, description=body.description)
        return _job_view(row)


@router.delete("/projects/{project_id}/jobs/{job_revision_id}", status_code=204)
async def remove_job(project_id: UUID, job_revision_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Soft-remove one saved job revision. Idempotent; runs that used it stay readable."""
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        # Same Project-first lock order as run submission, so a run cannot start on a job mid-removal.
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        row = db.scalar(select(JobRevision).where(
            JobRevision.project_id == project_id, JobRevision.id == job_revision_id).with_for_update())
        if row is None:
            raise ServiceError("not_found")
        if row.removed_at is None:
            row.removed_at = datetime.now(timezone.utc)


@router.delete("/projects/{project_id}/documents/{document_id}", status_code=204)
async def trash_document(project_id: UUID, document_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Move a drafted document to the trash. Idempotent."""
    await services.documents.set_trashed(actor, project_id, document_id, True)


@router.post("/projects/{project_id}/documents/{document_id}/restore", response_model=DocumentView)
async def restore_document(project_id: UUID, document_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Take a document out of the trash. Idempotent: restoring a live document returns it unchanged."""
    await services.documents.set_trashed(actor, project_id, document_id, False)
    return await services.documents.get(actor, project_id, document_id)


@router.delete("/projects/{project_id}/documents/{document_id}/permanent", status_code=204)
async def delete_document_permanently(project_id: UUID, document_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Hard-delete a trashed document with its revisions and unreferenced files."""
    _owner_only(actor)
    await services.documents.delete(actor, project_id, document_id)


@router.get("/projects/{project_id}/documents", response_model=list[DocumentView])
async def list_documents(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.documents.list_ready(actor, project_id)


@router.get("/projects/{project_id}/documents/trash", response_model=list[DocumentView])
async def list_trashed_documents(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.documents.list_trashed(actor, project_id)


@router.get("/projects/{project_id}/documents/{document_id}/revisions", response_model=list[DocumentRevisionView])
async def document_revisions(project_id: UUID, document_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.documents.revisions(actor, project_id, document_id)


@router.post("/projects/{project_id}/documents/{document_id}/revisions", status_code=202, response_model=RunView)
async def edit_document(project_id: UUID, document_id: UUID, body: DocumentEdit, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Owner manual edit: queue a non-LLM export run that appends a revision."""
    _owner_only(actor)
    return await services.runs.submit_export(actor, project_id, document_id, body)


@router.get("/projects/{project_id}/cv", response_model=list[CVRevisionView])
async def get_cv(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    """Legacy: revisions of the primary CV, newest first."""
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "cv")
        rows = db.execute(select(CVRevision, StoredFile).join(
            StoredFile, (StoredFile.project_id == CVRevision.project_id) & (StoredFile.id == CVRevision.file_id)
        ).join(CV, CV.id == CVRevision.cv_id)
          .where(CVRevision.project_id == project_id, StoredFile.publication_state == "published",
                 CV.is_primary, CV.removed_at.is_(None))
          .order_by(CVRevision.revision.desc())).all()
        return [_cv_revision_view(*row) for row in rows]


async def _upload_cv(services, actor, project_id: UUID, file: UploadFile, **target) -> tuple[dict[str, Any], UUID]:
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise ServiceError("upload_too_large")
    view = await services.files.upload(actor, project_id, file, file.content_type or "application/octet-stream",
                                       file.filename or "upload", **target)
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "cv")
        revision = db.scalar(select(CVRevision).where(
            CVRevision.project_id == project_id, CVRevision.file_id == view.id
        ))
        if revision is None:
            raise ServiceError("file_unavailable")
        return ({"id": revision.id, "revision": revision.revision, "created_at": revision.created_at,
                 "original_filename": view.display_name, "mime_type": view.mime_type, "size_bytes": view.size_bytes,
                 "file_id": view.id},
                revision.cv_id)


@router.post("/projects/{project_id}/cv", status_code=201, response_model=CVRevisionView)
async def upload_cv(project_id: UUID, file: UploadFile = File(...), actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Legacy: add a revision to the primary CV, creating it if the project has none."""
    return (await _upload_cv(services, actor, project_id, file))[0]


@router.get("/projects/{project_id}/cvs", response_model=list[CVView])
async def list_cvs(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "cv")
        rows = db.scalars(select(CV).where(CV.project_id == project_id, CV.removed_at.is_(None))
                          .order_by(CV.is_primary.desc(), CV.created_at, CV.id)).all()
        return [_cv_view(db, cv) for cv in rows]


@router.post("/projects/{project_id}/cvs", status_code=201, response_model=CVView)
async def create_cv(project_id: UUID, file: UploadFile = File(...),
                    name: Annotated[str | None, Form(max_length=120)] = None,
                    actor=Depends(write_actor), services: Services = Depends(get_services)):
    """New CV from its first upload; named after the file unless a name is given."""
    cv_name = (name or "").strip() or PurePath(file.filename or "").stem.strip()[:120] or "CV"
    _, new_cv_id = await _upload_cv(services, actor, project_id, file, new_cv_name=cv_name)
    with services.sessions() as db:
        return _cv_view(db, _live_cv(db, project_id, new_cv_id))


@router.post("/projects/{project_id}/cvs/{cv_id}/revisions", status_code=201, response_model=CVRevisionView)
async def add_cv_revision(project_id: UUID, cv_id: UUID, file: UploadFile = File(...),
                          actor=Depends(write_actor), services: Services = Depends(get_services)):
    return (await _upload_cv(services, actor, project_id, file, cv_id=cv_id))[0]


@router.patch("/projects/{project_id}/cvs/{cv_id}", response_model=CVView)
async def update_cv(project_id: UUID, cv_id: UUID, body: CVUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        cv = _live_cv(db, project_id, cv_id, lock=True)
        if body.name is not None:
            cv.name = body.name
        if body.is_primary:
            db.execute(CV.__table__.update().where(CV.project_id == project_id, CV.id != cv.id, CV.is_primary)
                       .values(is_primary=False))
            cv.is_primary = True
        db.flush()
        return _cv_view(db, cv)


@router.delete("/projects/{project_id}/cvs/{cv_id}", status_code=204)
async def delete_cv(project_id: UUID, cv_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Soft-delete a CV no session uses; deleting the primary promotes the newest remaining CV."""
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
            raise ServiceError("not_found")
        cv = _live_cv(db, project_id, cv_id, lock=True)
        if _cv_view(db, cv)["in_use"]:
            raise ServiceError("cv_in_use")
        was_primary = cv.is_primary
        cv.is_primary = False
        cv.removed_at = datetime.now(timezone.utc)
        db.flush()
        if was_primary:
            newest = db.scalar(select(CV).where(CV.project_id == project_id, CV.removed_at.is_(None))
                               .order_by(CV.created_at.desc(), CV.id).limit(1))
            if newest is not None:
                newest.is_primary = True


@router.get("/projects/{project_id}/files/{file_id}/download", response_class=StreamingResponse,
            responses={200: {"description": "Authorized private file stream", "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}})
async def download_file(project_id: UUID, file_id: UUID, actor=Depends(run_actor), services: Services = Depends(get_services)):
    row = await asyncio.to_thread(services.files._authorized_row, actor, project_id, file_id)
    async def chunks() -> AsyncIterator[bytes]:
        async for chunk in services.files.download_stream(actor, project_id, file_id):
            yield chunk
    from urllib.parse import quote
    headers = {"ETag": f'"{row.checksum_sha256}"', "Cache-Control": "private, no-store",
               "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.display_name, safe='')}",
               "X-Content-Type-Options": "nosniff"}
    return StreamingResponse(chunks(), media_type="application/octet-stream", headers=headers)


@router.get("/projects/{project_id}/runs", response_model=list[RunView])
async def list_runs(project_id: UUID, actor=Depends(run_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "run")
        from job_search_platform.db.models import Run
        query = select(Run).where(Run.project_id == project_id).order_by(Run.created_at.desc())
        if actor.kind != "owner":
            query = query.where(Run.operation != "export_document")
        rows = db.scalars(query).all()
    result = []
    for row in rows:
        result.append(await services.runs.get(actor, project_id, row.id))
    return result


@router.post("/projects/{project_id}/runs", status_code=202, response_model=RunView)
async def submit_run(
    project_id: UUID,
    body: RunRequest,
    actor=Depends(run_write_actor),
    services: Services = Depends(get_services),
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)] | None = Header(default=None, alias="Idempotency-Key"),
):
    if idempotency_key is not None and idempotency_key != body.idempotency_key:
        raise ServiceError("idempotency_conflict")
    return await services.runs.submit(actor, project_id, body)


@router.get("/projects/{project_id}/runs/{run_id}", response_model=RunView)
async def get_run(project_id: UUID, run_id: UUID, actor=Depends(run_actor), services: Services = Depends(get_services)):
    return await services.runs.get(actor, project_id, run_id)


@router.post("/projects/{project_id}/runs/{run_id}/cancel", status_code=202, response_model=RunView)
async def cancel_run(project_id: UUID, run_id: UUID, actor=Depends(run_write_actor), services: Services = Depends(get_services)):
    return await services.runs.cancel(actor, project_id, run_id)


@router.get("/projects/{project_id}/approvals", response_model=list[ApprovalView])
async def list_approvals(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    from job_search_platform.db.models import Approval
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "approval")
        ids = db.scalars(select(Approval.id).where(Approval.project_id == project_id).order_by(Approval.expires_at)).all()
    return [await services.approvals.get(actor, project_id, approval_id) for approval_id in ids]


@router.post("/projects/{project_id}/approvals", status_code=201, response_model=ApprovalView)
async def request_approval(project_id: UUID, body: ApprovalRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.approvals.request(actor, project_id, body)


@router.post("/projects/{project_id}/approvals/{approval_id}/decision", response_model=ApprovalView)
async def decide_approval(project_id: UUID, approval_id: UUID, body: ApprovalDecision, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.approvals.resolve(actor, project_id, approval_id, body)


@router.get("/projects/{project_id}/grants", response_model=list[GrantView])
async def list_grants(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.grants.list(actor, project_id)


@router.post("/projects/{project_id}/grants", status_code=201, response_model=GrantIssuedView)
async def issue_grant(project_id: UUID, body: GrantIssueRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.grants.issue(actor, project_id, body)


@router.delete("/projects/{project_id}/grants/{grant_id}", status_code=204)
async def revoke_grant(project_id: UUID, grant_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    await services.grants.revoke(actor, project_id, grant_id)


@router.get("/providers", response_model=ProviderCatalogView)
async def provider_catalog(actor=Depends(owner_actor)):
    return {"providers": settings_catalog()}


@router.get("/settings/provider", response_model=ProviderSettingsView)
async def get_provider(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.settings.get_provider(actor)


@router.put("/settings/provider", response_model=ProviderSettingsView)
async def set_provider(body: ProviderSettingsUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.settings.save_provider(actor, body)


@router.post("/settings/provider/models", response_model=ProviderModelsView)
async def provider_models(body: ProviderModelsRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return {"models": await services.settings.list_models(actor, body)}


@router.post("/settings/provider/test", response_model=ProviderConnectionTestView)
async def test_provider(actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.settings.test_provider(actor)


@router.get("/projects/{project_id}/settings/tools", response_model=ToolConnectorSettingsView)
async def get_tool_settings(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await services.settings.get_tools(actor, project_id)


@router.put("/projects/{project_id}/settings/tools/{adapter}", response_model=ToolConnectorView)
async def set_tool_settings(project_id: UUID, adapter: str, body: ToolConnectorUpdate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    return await services.settings.save_tool(actor, project_id, adapter, body)


@router.get("/tools", response_model=ToolsView)
async def list_tools(actor=Depends(owner_actor)):
    return {"tools": [
        {"name": "evaluate_job", "description": "Compare a supplied job revision with the Project CV.",
         "required_capability": "jobs:evaluate"},
        {"name": "draft_documents", "description": "Prepare application documents from a supplied job revision.",
         "required_capability": "documents:draft"},
        {"name": "get_run", "description": "Read an authorized Project run and its published result view.",
         "required_capability": "results:read"},
        {"name": "cancel_run", "description": "Request cancellation of an authorized Project run.",
         "required_capability": "jobs:evaluate"},
        {"name": "list_results", "description": "List authorized Project runs and generated results.",
         "required_capability": "results:read"},
    ]}
