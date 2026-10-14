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
    rows = list({r["external_id"]: r for r in rows}.values())  # last duplicate wins
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


def recompute_clusters(db: Session, now: datetime) -> int:
    """Union-find over url_key and (match_key within 30 days); canonical = earliest first_seen open member.

    ponytail: full recompute in Python over all open postings each run (~10k rows); move to incremental
    when the store passes ~200k.
    """
    rows = list(db.scalars(select(JobPosting).where(JobPosting.closed_at.is_(None))))
    parent = {r.id: r.id for r in rows}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    by_url: dict[str, uuid.UUID] = {}
    by_match: dict[str, list[JobPosting]] = {}
    for r in rows:
        if r.url_key:
            if r.url_key in by_url:
                union(by_url[r.url_key], r.id)
            else:
                by_url[r.url_key] = r.id
        if r.match_key:
            by_match.setdefault(r.match_key, []).append(r)
    for group in by_match.values():
        group.sort(key=lambda r: r.posted_at or r.first_seen_at)
        for a, b in zip(group, group[1:]):
            if (b.posted_at or b.first_seen_at) - (a.posted_at or a.first_seen_at) <= DEDUP_WINDOW:
                union(a.id, b.id)
    clusters: dict[uuid.UUID, list[JobPosting]] = {}
    for r in rows:
        clusters.setdefault(find(r.id), []).append(r)
    merged = 0
    for members in clusters.values():
        canonical = min(members, key=lambda r: (r.first_seen_at, str(r.id)))
        for r in members:
            target = None if r is canonical else canonical.id
            if r.canonical_id != target:
                r.canonical_id, r.index_dirty, r.updated_at = target, True, now
            merged += target is not None
    # closed postings never stay canonical of an open one, and never point at anything
    db.execute(update(JobPosting).where(JobPosting.closed_at.is_not(None), JobPosting.canonical_id.is_not(None))
               .values(canonical_id=None))
    db.flush()
    return merged


def purge_descriptions(db: Session, now: datetime) -> int:
    return db.execute(update(JobPosting).where(
        JobPosting.closed_at < now - PURGE_AFTER, JobPosting.description_markdown.is_not(None))
        .values(description_markdown=None)).rowcount
