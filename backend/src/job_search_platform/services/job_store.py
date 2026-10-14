"""WP5 job store: upsert per board, close rule, dedup clusters, description purge (spec D6, D8, D9)."""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from job_search_platform.db.models import IngestRun, JobPosting
from job_search_platform.integrations import job_boards
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.job_mapping import map_posting

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
               .values(canonical_id=None, index_dirty=True, updated_at=now))
    db.flush()
    return merged


def purge_descriptions(db: Session, now: datetime) -> int:
    return db.execute(update(JobPosting).where(
        JobPosting.closed_at < now - PURGE_AFTER, JobPosting.description_markdown.is_not(None))
        .values(description_markdown=None)).rowcount


RUN_DEADLINE = timedelta(minutes=20)
BOARDS_FILE = Path(__file__).resolve().parents[1] / "data" / "job_boards.json"
_log = logging.getLogger("jsp.ingest")


def load_boards(path: Path | None = None) -> dict[str, list[str]]:
    data = json.loads((path or BOARDS_FILE).read_text(encoding="utf-8"))
    return {source: sorted({b for b in data.get(source, []) if job_boards.valid_board(b)})
            for source in ("greenhouse", "lever", "smartrecruiters")}


def run_ingest(sessions, *, boards, sources=job_boards.SOURCES, fetch=job_boards.fetch_board,
               clock=lambda: datetime.now(timezone.utc), sleep=time.sleep) -> IngestRun:
    """One hourly run (spec D5): each board in its own transaction; failed/skipped boards never count as missing."""
    # dedicated autocommit connection: advisory lock is per backend, so it must stay on this one connection
    with sessions.kw["bind"].connect().execution_options(isolation_level="AUTOCOMMIT") as lock:
        if not lock.scalar(text("SELECT pg_try_advisory_lock(hashtext('ingest'))")):
            raise ServiceError("ingest_running")
        try:
            started = clock()
            run = IngestRun(id=uuid.uuid4(), started_at=started, status="running", per_board={})
            with sessions.begin() as db:
                db.add(run)
            per_board, totals = {}, {"fetched": 0, "created": 0, "updated": 0, "closed": 0}
            targets = [(s, None) for s in sources if s == "freehire"] + [
                (s, b) for s in sources if s != "freehire" for b in boards.get(s, [])]
            for source, board in targets:
                key = f"{source}:{board or '-'}"
                if clock() - started > RUN_DEADLINE:
                    per_board[key] = {"state": "skipped"}
                    continue
                try:
                    raw = fetch(source, board, sleep=sleep)
                    rows = [r for r in (map_posting(source, board, item) for item in raw) if r]
                    with sessions.begin() as db:
                        counts = apply_board(db, source, board, rows, clock())
                    per_board[key] = {"state": "ok", **counts}
                    for name in totals:
                        totals[name] += counts[name]
                except job_boards.BoardError as exc:
                    per_board[key] = {"state": "failed", "error": str(exc)[:80]}
                except Exception as exc:  # one poison board must not abort the run (LEARNINGS 2026-10-14)
                    per_board[key] = {"state": "failed", "error": type(exc).__name__}
                    _log.exception("ingest_board_failed", extra={"route": key})
            now = clock()
            states = [v["state"] for v in per_board.values()]
            status = ("failed" if states and all(x != "ok" for x in states)
                      else "partial" if any(x != "ok" for x in states) else "ok")
            try:
                with sessions.begin() as db:
                    merged = recompute_clusters(db, now)
                    purge_descriptions(db, now)
                    row = db.get(IngestRun, run.id)
                    row.status, row.per_board, row.finished_at, row.merged = status, per_board, now, merged
                    for name, value in totals.items():
                        setattr(row, name, value)
            except Exception:
                with sessions.begin() as db:  # never leave the run 'running'; keep per-board results
                    row = db.get(IngestRun, run.id)
                    row.status, row.per_board, row.finished_at = "failed", per_board, now
                    for name, value in totals.items():
                        setattr(row, name, value)
                raise
            _log.info("ingest_run_finished", extra={"status": row.status})
            return row
        finally:
            try:
                lock.execute(text("SELECT pg_advisory_unlock(hashtext('ingest'))"))
            except Exception:  # must not mask the run's result or exception
                _log.exception("ingest_unlock_failed")


_ATS_HOSTS = {"boards.greenhouse.io": "greenhouse", "job-boards.greenhouse.io": "greenhouse",
              "boards.eu.greenhouse.io": "greenhouse", "job-boards.eu.greenhouse.io": "greenhouse",
              "jobs.lever.co": "lever", "jobs.smartrecruiters.com": "smartrecruiters"}


def discover_boards(freehire_rows: list[dict], current: dict[str, list[str]]) -> dict[str, list[str]]:
    """Board tokens from freehire's Thai postings' ATS URLs; additive only (spec D10)."""
    found = {source: set(current.get(source, [])) for source in ("greenhouse", "lever", "smartrecruiters")}
    for row in freehire_rows:
        parts = urlsplit(str(row.get("url") or ""))
        source = _ATS_HOSTS.get(parts.netloc.lower())
        segments = [s for s in parts.path.split("/") if s]
        if not (source and segments):
            continue
        token = segments[0]
        if source == "greenhouse" and token == "embed":  # embed/job_board?for=<token>
            token = parse_qs(parts.query).get("for", [""])[0]
        if token != "embed" and job_boards.valid_board(token):
            found[source].add(token)
    return {source: sorted(tokens) for source, tokens in found.items()}
