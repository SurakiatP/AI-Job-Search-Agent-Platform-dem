"""WP5 job store: upsert per board, close rule, dedup clusters, description purge (spec D6, D8, D9)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from job_search_platform.db.models import JobPosting

CLOSE_AFTER_MISSES = 2
DEDUP_WINDOW = timedelta(days=30)
PURGE_AFTER = timedelta(days=90)


def _parse_ts(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def apply_board(db: Session, source: str, board: str | None, rows: list[dict], now: datetime) -> dict:
    """One successfully fetched board: upsert what was seen, count a miss for what was not."""
    counts = {"fetched": len(rows), "created": 0, "updated": 0, "closed": 0}
    existing = {p.external_id: p for p in db.scalars(select(JobPosting).where(
        JobPosting.source == source, JobPosting.board.is_(None) if board is None else JobPosting.board == board))}
    seen = set()
    for values in rows:
        values = dict(values, posted_at=_parse_ts(values.get("posted_at")))
        seen.add(values["external_id"])
        row = existing.get(values["external_id"])
        if row is None:
            db.add(JobPosting(id=uuid.uuid4(), first_seen_at=now, last_seen_at=now, updated_at=now,
                              index_dirty=True, **values))
            counts["created"] += 1
            continue
        row.last_seen_at, row.missed_runs = now, 0
        if row.closed_at is not None:
            row.closed_at, row.index_dirty, row.updated_at = None, True, now
        if row.content_hash != values["content_hash"]:
            for key, value in values.items():
                setattr(row, key, value)
            row.index_dirty, row.updated_at = True, now
            counts["updated"] += 1
    for external_id, row in existing.items():
        if external_id in seen or row.closed_at is not None:
            continue
        row.missed_runs += 1
        if row.missed_runs >= CLOSE_AFTER_MISSES:
            row.closed_at, row.index_dirty, row.updated_at = now, True, now
            counts["closed"] += 1
    db.flush()
    return counts
