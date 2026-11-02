"""Storage side of SPEC-RTH: an owner's custom themes, which style a draft uses, and where a theme is still in use."""
from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import func, select

from job_search_platform.db.models import CVRevision, DocumentRevision, ResumeDraft, ResumeTheme
from job_search_platform.services import resume_themes as rt
from job_search_platform.services.errors import ServiceError

CUSTOM = re.compile(r"custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")


def valid_style_id(template_id: str) -> bool:
    return template_id in rt.PRESETS or CUSTOM.fullmatch(template_id) is not None


def view(theme: ResumeTheme) -> dict:
    ats, photo = rt.flags(theme.layout)
    return {"id": theme.id, "name": theme.name, "layout": theme.layout, "tokens": theme.tokens, "ats_safe": ats, "photo": photo,
            "created_at": theme.created_at}


def list_custom(db, owner_id: UUID) -> list[ResumeTheme]:
    return list(db.scalars(select(ResumeTheme).where(ResumeTheme.owner_id == owner_id).order_by(ResumeTheme.created_at, ResumeTheme.id)))


def get_owned(db, owner_id: UUID, theme_id: UUID) -> ResumeTheme:
    theme = db.scalar(select(ResumeTheme).where(ResumeTheme.id == theme_id, ResumeTheme.owner_id == owner_id))
    if theme is None:
        raise ServiceError("not_found")
    return theme


def create(db, owner_id: UUID, name: str, layout: str, tokens: rt.TokensModel) -> ResumeTheme:
    """Locks the owner's rows so the limit and the unique name hold under concurrent saves."""
    existing = db.scalars(select(ResumeTheme).where(ResumeTheme.owner_id == owner_id).with_for_update()).all()
    if len(existing) >= rt.MAX_CUSTOM_THEMES:
        raise ServiceError("theme_limit")
    if name in {t.name for t in existing}:
        raise ServiceError("duplicate")
    theme = ResumeTheme(owner_id=owner_id, name=name, layout=layout, tokens=tokens.model_dump())
    db.add(theme)
    db.flush()
    return theme


def create_unique(db, owner_id: UUID, name: str, layout: str, tokens: rt.TokensModel) -> ResumeTheme:
    """Import path: a name that is taken gets a numeric suffix instead of failing."""
    taken = {n for (n,) in db.execute(select(ResumeTheme.name).where(ResumeTheme.owner_id == owner_id))}
    return create(db, owner_id, rt.unique_name(name, taken), layout, tokens)


def used_by(db, theme_id: UUID) -> int:
    """Drafts and published revisions (CV and document) that carry this theme."""
    style = f"custom:{theme_id}"
    count = db.scalar(select(func.count()).select_from(ResumeDraft).where(ResumeDraft.template_id == style)) or 0
    for model in (CVRevision, DocumentRevision):
        count += db.scalar(select(func.count()).select_from(model).where(model.resume_style["template_id"].as_string() == style)) or 0
    return count


def delete(db, owner_id: UUID, theme_id: UUID) -> None:
    theme = get_owned(db, owner_id, theme_id)
    count = used_by(db, theme_id)
    if count:
        raise ServiceError("theme_in_use", fields={"used_by": str(count)})
    db.delete(theme)
    db.flush()


def resolve(db, owner_id: UUID, template_id: str, accent: str) -> tuple[str, dict | None]:
    """(layout, tokens) to render: a preset keeps the owner's accent choice, a custom theme brings its own."""
    if template_id in rt.PRESETS:
        return rt.resolve(template_id, accent)
    match = CUSTOM.fullmatch(template_id)
    if match is None:
        raise ServiceError("resume_invalid", fields={"path": "template_id"})
    try:
        theme = get_owned(db, owner_id, UUID(match.group(1)))
    except ServiceError:
        raise ServiceError("resume_invalid", fields={"path": "template_id"}) from None
    return theme.layout, theme.tokens


def layout_of(db, owner_id: UUID, template_id: str) -> str:
    return rt.PRESETS[template_id].layout if template_id in rt.PRESETS else resolve(db, owner_id, template_id, "indigo")[0]



