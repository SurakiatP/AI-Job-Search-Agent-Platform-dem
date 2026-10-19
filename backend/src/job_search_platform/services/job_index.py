"""Meilisearch job index: documents, settings, incremental sync and swap rebuild (TOR FR-J01)."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.exc import SQLAlchemyError

from job_search_platform.db.models import JobIndexDelete, JobPosting
from job_search_platform.integrations.meili import MeiliError

SETTINGS = {
    "searchableAttributes": ["title", "company", "skills", "category", "location", "description_markdown"],
    "filterableAttributes": ["company", "cities", "work_mode", "category", "seniority", "employment_type",
                             "company_type", "skills", "posting_language", "salary_thb_month_min", "posted_ts"],
    "sortableAttributes": ["posted_ts"],
    "localizedAttributes": [{"attributePatterns": ["title", "description_markdown", "company", "location"],
                             "locales": ["tha", "eng"]}],
    "pagination": {"maxTotalHits": 10000},
    "faceting": {"maxValuesPerFacet": 100},
}


def to_document(p: JobPosting, sources: list[str]) -> dict:
    ts = p.posted_at or p.first_seen_at
    return {
        "id": str(p.id), "slug": p.slug, "title": p.title, "company": p.company, "location": p.location,
        "cities": p.cities, "work_mode": p.work_mode, "skills": p.skills, "category": p.category,
        "posted_at": p.posted_at.isoformat() if p.posted_at else None, "posted_ts": int(ts.timestamp()),
        "seniority": p.seniority, "employment_type": p.employment_type, "company_type": p.company_type,
        "posting_language": p.posting_language, "salary_thb_month_min": p.salary_thb_month_min,
        "source_url": p.source_url, "description_markdown": p.description_markdown or "",
        "reality_stale": p.reality_stale, "missed_runs": p.missed_runs, "sources": sources,
    }


def _sources(db, ids: list) -> dict:
    out: dict = {i: set() for i in ids}
    for pid, cid, source in db.execute(select(JobPosting.id, JobPosting.canonical_id, JobPosting.source).where(
            JobPosting.id.in_(ids) | JobPosting.canonical_id.in_(ids))):
        out.setdefault(cid or pid, set()).add(source)
    return out


def _docs(db, rows: list[JobPosting]) -> list[dict]:
    src = _sources(db, [r.id for r in rows])
    return [to_document(r, sorted(src.get(r.id, set()))) for r in rows]


def _clear(sessions, rows: list) -> None:
    """Clear index_dirty per row only where it was not re-dirtied since it was loaded."""
    with sessions() as db, db.begin():
        for r in rows:
            db.execute(update(JobPosting).where(JobPosting.id == r.id, JobPosting.updated_at == r.updated_at)
                       .values(index_dirty=False))


def sync(sessions, client, index, *, budget_s=300, batch=1000) -> dict:
    out = {"upserted": 0, "deleted": 0, "state": "ok"}
    end = time.monotonic() + budget_s

    def over() -> bool:
        return time.monotonic() > end

    try:
        if not client.index_exists(index):
            rebuild(sessions, client, index, batch=batch)
            return {**out, "state": "rebuilt"}
        with sessions() as db:
            queued = [str(i) for i in db.scalars(select(JobIndexDelete.posting_id).order_by(JobIndexDelete.posting_id))]
        for i in range(0, len(queued), batch):
            if over():
                return {**out, "state": "index_failed"}
            chunk = queued[i:i + batch]
            client.wait(client.delete_documents(index, chunk))
            with sessions() as db, db.begin():
                db.execute(delete(JobIndexDelete).where(JobIndexDelete.posting_id.in_(chunk)))
            out["deleted"] += len(chunk)
        while True:
            with sessions() as db:
                rows = list(db.scalars(select(JobPosting).where(JobPosting.index_dirty).order_by(JobPosting.id)
                                       .limit(batch)))
                if not rows:
                    return out
                if over():
                    return {**out, "state": "index_failed"}
                canon = [r for r in rows if r.canonical_id is None]
                gone = [str(r.id) for r in rows if r.canonical_id is not None]
                docs = _docs(db, canon)
            if docs:
                client.wait(client.add_documents(index, docs))
            if gone:
                client.wait(client.delete_documents(index, gone))
            _clear(sessions, rows)
            out["upserted"] += len(docs)
            out["deleted"] += len(gone)
    except (MeiliError, SQLAlchemyError, OSError):
        return {**out, "state": "index_failed"}


def rebuild(sessions, client, index, *, batch=1000) -> int:
    started = datetime.now(timezone.utc)
    tmp = f"{index}_tmp"
    if client.index_exists(tmp):
        client.wait(client.delete_index(tmp))
    client.wait(client.create_index(tmp))
    client.wait(client.update_settings(tmp, SETTINGS))
    written, last = 0, None
    while True:
        with sessions() as db:
            q = select(JobPosting).where(JobPosting.canonical_id.is_(None)).order_by(JobPosting.id).limit(batch)
            rows = list(db.scalars(q.where(JobPosting.id > last) if last else q))
            docs = _docs(db, rows)
        if not rows:
            break
        client.wait(client.add_documents(tmp, docs))
        written, last = written + len(docs), rows[-1].id
    if not client.index_exists(index):
        client.wait(client.create_index(index))  # swap needs both indexes to exist
    client.wait(client.swap(index, tmp))
    client.wait(client.delete_index(tmp))
    with sessions() as db, db.begin():
        db.execute(update(JobPosting).where(JobPosting.updated_at <= started).values(index_dirty=False))
        db.execute(delete(JobIndexDelete).where(JobIndexDelete.deleted_at < started))
    return written
