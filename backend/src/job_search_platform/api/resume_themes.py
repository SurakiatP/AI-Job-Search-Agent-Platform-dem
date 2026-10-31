"""Resume theme routes (SPEC-RTH): list, save, import, export and delete an owner's custom themes."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, UploadFile
from fastapi.responses import Response

from job_search_platform.api.dependencies import Services, get_services, owner_actor, write_actor
from job_search_platform.services import rate_limits
from job_search_platform.services import resume_theme_store as store
from job_search_platform.services import resume_themes as rt
from job_search_platform.services.errors import ServiceError

router = APIRouter()


def _owner_only(actor) -> None:
    if actor.kind != "user":
        raise ServiceError("forbidden")


def _checked(call, *args) -> rt.ThemeFile:
    try:
        return call(*args)
    except rt.ThemeError as error:
        raise ServiceError("theme_invalid", fields={"rule": error.rule}) from None


@router.get("/resume-themes")
async def list_themes(actor=Depends(owner_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    presets = [{"id": key, "layout": p.layout, "th": p.th, "en": p.en, "ats_safe": rt.flags(p.layout)[0], "photo": rt.flags(p.layout)[1]}
               for key, p in rt.PRESETS.items()]
    with services.sessions() as db:
        return {"presets": presets, "custom": [store.view(t) for t in store.list_custom(db, actor.user_id)]}


@router.post("/resume-themes", status_code=201)
async def save_theme(body: dict[str, Any] = Body(...), actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    theme = _checked(rt.check, {"format": rt.FORMAT, "version": 1, **body})
    with services.sessions.begin() as db:
        rate_limits.hit(db, "resume_theme_write", str(actor.user_id))
        return store.view(store.create(db, actor.user_id, theme.name, theme.layout, theme.tokens))


@router.post("/resume-themes/import", status_code=201)
async def import_theme(file: UploadFile = File(...), actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    theme = _checked(rt.validate_file, await file.read(rt.FILE_MAX_BYTES + 1))
    with services.sessions.begin() as db:
        rate_limits.hit(db, "resume_theme_write", str(actor.user_id))
        return store.view(store.create_unique(db, actor.user_id, theme.name, theme.layout, theme.tokens))


@router.get("/resume-themes/{theme_id}/export")
async def export_theme(theme_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions() as db:
        theme = store.get_owned(db, actor.user_id, theme_id)
        raw = rt.export_file(theme.name, theme.layout, theme.tokens)
    return Response(raw, media_type="application/json", headers={
        "Content-Disposition": "attachment; filename=resume-theme.json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/resume-themes/{theme_id}", status_code=204)
async def delete_theme(theme_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        rate_limits.hit(db, "resume_theme_write", str(actor.user_id))
        store.delete(db, actor.user_id, theme_id)
    return Response(status_code=204)
