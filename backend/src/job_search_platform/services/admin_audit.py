"""Append-only admin audit log: one row per admin action, metadata only (PDPA)."""
from __future__ import annotations

import base64
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, tuple_

from job_search_platform.db.models import AdminAuditLog, User
from job_search_platform.services.errors import ServiceError

PAGE = 50
_SCALAR = (str, int, float, bool, type(None))


def _clean(detail: dict) -> dict:
    """Keeps ids, counts, codes and model names. Nested values and long text (which could be user content) are dropped."""
    if not isinstance(detail, dict):
        raise TypeError("audit detail must be a dict")
    return {str(k)[:64]: (v[:200] if isinstance(v, str) else v) for k, v in detail.items() if isinstance(v, _SCALAR)}


def record(session, actor_user_id: UUID | None, action: str, target_type: str, target_id: str | UUID | None,
           detail: dict | None = None) -> AdminAuditLog:
    """Adds the row to the caller's transaction, so the action and its audit row commit or roll back together."""
    row = AdminAuditLog(actor_user_id=actor_user_id, action=action[:64], target_type=target_type[:32],
                        target_id=None if target_id is None else str(target_id)[:64], detail=_clean(detail or {}))
    session.add(row)
    session.flush()
    return row


def _decode(cursor: str) -> tuple[datetime, UUID]:
    try:
        at, ident = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(at), UUID(ident)
    except Exception as exc:  # noqa: BLE001 - any malformed cursor is the caller's error
        raise ServiceError("invalid_cursor") from exc


def list(session, filters: dict | None = None, cursor: str | None = None, limit: int = PAGE) -> dict:  # noqa: A001
    """Newest first. filters: action, actor (user id), since (datetime). Returns {"items": [...], "next_cursor": str | None}."""
    filters = filters or {}
    query = (select(AdminAuditLog, User.email).outerjoin(User, User.id == AdminAuditLog.actor_user_id)
             .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit + 1))
    if filters.get("action"):
        query = query.where(AdminAuditLog.action == filters["action"])
    if filters.get("actor"):
        query = query.where(AdminAuditLog.actor_user_id == filters["actor"])
    if filters.get("since"):
        query = query.where(AdminAuditLog.created_at >= filters["since"])
    if cursor:
        query = query.where(tuple_(AdminAuditLog.created_at, AdminAuditLog.id) < tuple_(*_decode(cursor)))
    rows = session.execute(query).all()
    page = rows[:limit]
    items = [{"id": str(r.id), "actor_email": email, "action": r.action, "target_type": r.target_type, "target_id": r.target_id,
              "detail": r.detail, "created_at": r.created_at.isoformat()} for r, email in page]
    last = page[-1][0] if len(rows) > limit else None
    nxt = base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.id}".encode()).decode() if last else None
    return {"items": items, "next_cursor": nxt}
