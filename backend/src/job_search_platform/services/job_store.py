"""WP5 job store: upsert per board, delete rule, retention, dedup clusters, crawler passes (spec D6, D8, D9; part 3)."""
from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import delete, func, literal, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, defer

from job_search_platform.db.models import IngestRun, JobIndexDelete, JobPosting, JobPostingTombstone
from job_search_platform.integrations import job_boards
from job_search_platform.services import job_index
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.job_mapping import map_posting

MAX_AGE = timedelta(days=90)
DELETE_AFTER_MISSES = 2
TOMBSTONE_UNSEEN = timedelta(days=7)
TOMBSTONE_MAX = timedelta(days=180)
RUN_LOG_MAX = timedelta(days=90)
DEDUP_WINDOW = timedelta(days=30)
SHRINK_MIN_STORED = 20
SHRINK_RATIO = 0.5
STUCK_RUN = timedelta(days=1)

CHUNK = 5000  # ids per IN (...) query; psycopg caps a statement at 65,535 parameters


def _chunks(values) -> list[list]:
    values = list(values)
    return [values[i:i + CHUNK] for i in range(0, len(values), CHUNK)]


def parse_ts(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def delete_postings(db: Session, ids: list[uuid.UUID], now: datetime, *, tombstone: bool) -> int:
    """The only row delete: queue search-index deletes, flag cluster members dirty, optionally tombstone."""
    if not ids:
        return 0
    # members of a deleted canonical lose canonical_id via FK SET NULL; flag them so the index re-syncs them
    db.execute(update(JobPosting).where(JobPosting.canonical_id.in_(ids)).values(index_dirty=True, updated_at=now))
    if tombstone:
        db.execute(pg_insert(JobPostingTombstone).from_select(
            ["source", "external_id", "deleted_at", "last_seen_at"],
            select(JobPosting.source, JobPosting.external_id, literal(now), literal(now)).where(JobPosting.id.in_(ids)),
        ).on_conflict_do_nothing())
    db.execute(pg_insert(JobIndexDelete).values([{"posting_id": i, "deleted_at": now} for i in ids])
               .on_conflict_do_nothing())
    return db.execute(delete(JobPosting).where(JobPosting.id.in_(ids))).rowcount


def upsert_postings(db: Session, source: str, board: str | None, rows: list[dict], now: datetime,
                    existing: dict[str, JobPosting] | None = None) -> tuple[dict, set[str], list[uuid.UUID]]:
    """Upsert half of apply_board, shared with the crawler: (counts, external_ids seen, stored rows now too old).
    `existing` defaults to this source's stored rows with the incoming ids."""
    rows = list({r["external_id"]: r for r in rows}.values())  # last duplicate wins
    ids = [r["external_id"] for r in rows]
    if existing is None:
        existing = {p.external_id: p for chunk in _chunks(ids) for p in db.scalars(select(JobPosting).where(
            JobPosting.source == source, JobPosting.external_id.in_(chunk)))}
    other_board, tombstoned = set(), set()
    for chunk in _chunks(ids):
        other_board |= set(db.scalars(select(JobPosting.external_id).where(
            JobPosting.source == source, JobPosting.board.is_distinct_from(board), JobPosting.external_id.in_(chunk))))
        tombstoned |= set(db.scalars(select(JobPostingTombstone.external_id).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk))))
    counts = {"created": 0, "updated": 0, "skipped_old": 0, "skipped_dup": 0}
    seen, too_old = set(), []
    for values in rows:
        values = dict(values, posted_at=parse_ts(values.get("posted_at")))
        if "valid_through" in values:
            values["valid_through"] = parse_ts(values["valid_through"])
        external_id = values["external_id"]
        seen.add(external_id)
        row = existing.get(external_id)
        if values["posted_at"] is not None and values["posted_at"] < now - MAX_AGE:
            counts["skipped_old"] += 1
            if row is not None:
                too_old.append(row.id)
            continue
        if external_id in tombstoned:
            db.execute(update(JobPostingTombstone).where(
                JobPostingTombstone.source == source, JobPostingTombstone.external_id == external_id)
                .values(last_seen_at=now))
            continue
        if row is None and external_id in other_board:  # same source id already stored under another board
            counts["skipped_dup"] += 1
            continue
        if row is None:
            db.add(JobPosting(id=uuid.uuid4(), first_seen_at=now, last_seen_at=now, updated_at=now,
                              index_dirty=True, **values))
            counts["created"] += 1
            continue
        row.last_seen_at, row.missed_runs = now, 0
        if row.content_hash != values["content_hash"]:
            for key, value in values.items():
                setattr(row, key, value)
            row.index_dirty, row.updated_at = True, now
            counts["updated"] += 1
    db.flush()
    return counts, seen, too_old


def apply_board(db: Session, source: str, board: str | None, rows: list[dict], now: datetime) -> dict:
    """One successfully fetched board: upsert what was seen, count a miss for what was not, delete after two."""
    rows = list({r["external_id"]: r for r in rows}.values())  # last duplicate wins
    existing = {p.external_id: p for p in db.scalars(select(JobPosting).where(
        JobPosting.source == source, JobPosting.board.is_(None) if board is None else JobPosting.board == board))}
    if existing and (not rows or (len(existing) >= SHRINK_MIN_STORED and len(rows) < len(existing) * SHRINK_RATIO)):
        raise job_boards.BoardError("suspicious_shrink")  # likely a truncated fetch: keep rows, count no misses
    upserted, seen, too_old = upsert_postings(db, source, board, rows, now, existing)
    counts = {"fetched": len(rows), **upserted, "deleted": 0}
    missing = []
    for external_id, row in existing.items():
        if external_id in seen:
            continue
        row.missed_runs += 1
        if row.missed_runs >= DELETE_AFTER_MISSES:
            missing.append(row.id)
    db.flush()
    counts["deleted"] = (delete_postings(db, too_old, now, tombstone=True)  # tombstoned so the source copy stays out
                         + delete_postings(db, missing, now, tombstone=False))
    db.flush()
    return counts


def touch_seen(db: Session, source: str, external_ids: set[str], now: datetime) -> tuple[set[str], set[str]]:
    """Crawler discovery: mark listed postings and tombstones seen; returns (stored ids, tombstoned ids) among them."""
    stored, tombstoned = set(), set()
    for chunk in _chunks(sorted(external_ids)):
        stored |= set(db.scalars(select(JobPosting.external_id).where(
            JobPosting.source == source, JobPosting.external_id.in_(chunk))))
        tombstoned |= set(db.scalars(select(JobPostingTombstone.external_id).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk))))
    for chunk in _chunks(sorted(stored)):
        db.execute(update(JobPosting).where(JobPosting.source == source, JobPosting.external_id.in_(chunk))
                   .values(last_seen_at=now, missed_runs=0))
    for chunk in _chunks(sorted(tombstoned)):
        db.execute(update(JobPostingTombstone).where(
            JobPostingTombstone.source == source, JobPostingTombstone.external_id.in_(chunk)).values(last_seen_at=now))
    return stored, tombstoned


def miss_unseen(db: Session, source: str, since: datetime, now: datetime) -> int:
    """A complete crawler discovery pass: a miss for postings not seen since `since`, delete at two (spec C7)."""
    of_source = JobPosting.source == source
    stored = db.scalar(select(func.count()).select_from(JobPosting).where(of_source))
    seen = db.scalar(select(func.count()).select_from(JobPosting).where(of_source, JobPosting.last_seen_at >= since))
    if stored and (not seen or (stored >= SHRINK_MIN_STORED and seen < stored * SHRINK_RATIO)):
        raise job_boards.BoardError("suspicious_shrink")  # likely a broken listing: count no misses
    db.execute(update(JobPosting).where(of_source, JobPosting.last_seen_at < since)
               .values(missed_runs=JobPosting.missed_runs + 1))
    ids = list(db.scalars(select(JobPosting.id).where(of_source, JobPosting.missed_runs >= DELETE_AFTER_MISSES)))
    return delete_postings(db, ids, now, tombstone=False)


def tombstone_ids(db: Session, source: str, external_ids: list[str], now: datetime) -> None:
    """Crawler: a detail page with no live posting (removed, expired, older than 90 days) is not fetched again."""
    ids = sorted(set(external_ids))  # one row per key: ON CONFLICT DO UPDATE cannot touch a row twice
    if ids:
        db.execute(pg_insert(JobPostingTombstone).values(
            [{"source": source, "external_id": e, "deleted_at": now, "last_seen_at": now} for e in ids])
            .on_conflict_do_update(index_elements=["source", "external_id"], set_={"last_seen_at": now}))


def retire(db: Session, now: datetime) -> int:
    """Delete postings older than MAX_AGE (posted_at, else first_seen_at) or past validThrough; tombstone them."""
    ids = list(db.scalars(select(JobPosting.id).where(or_(
        func.coalesce(JobPosting.posted_at, JobPosting.first_seen_at) < now - MAX_AGE,
        JobPosting.valid_through < now))))
    return delete_postings(db, ids, now, tombstone=True)


def prune(db: Session, now: datetime) -> None:
    db.execute(delete(JobPostingTombstone).where(or_(
        JobPostingTombstone.last_seen_at < now - TOMBSTONE_UNSEEN, JobPostingTombstone.deleted_at < now - TOMBSTONE_MAX)))
    db.execute(delete(IngestRun).where(or_(
        (IngestRun.started_at < now - RUN_LOG_MAX) & (IngestRun.status != "running"),
        (IngestRun.started_at < now - STUCK_RUN) & (IngestRun.status == "running"))))  # SIGKILLed runs


def recompute_clusters(db: Session, now: datetime) -> int:
    """Union-find over url_key and (match_key within 30 days); canonical = earliest first_seen member.

    ponytail: full recompute in Python over all postings each run (~10k rows); move to incremental
    when the store passes ~200k.
    """
    rows = list(db.scalars(select(JobPosting).options(defer(JobPosting.description_markdown))))
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
    db.flush()
    return merged


RUN_DEADLINE = timedelta(minutes=20)
BOARDS_FILE = Path(__file__).resolve().parents[1] / "data" / "job_boards.json"
_log = logging.getLogger("jsp.ingest")


def load_boards(path: Path | None = None) -> dict[str, list[str]]:
    data = json.loads((path or BOARDS_FILE).read_text(encoding="utf-8"))
    return {source: sorted({b for b in data.get(source, []) if job_boards.valid_board(b)})
            for source in ("greenhouse", "lever", "smartrecruiters")}


def run_ingest(sessions, *, boards, sources=job_boards.SOURCES, fetch=job_boards.fetch_board,
               clock=lambda: datetime.now(timezone.utc), sleep=time.sleep, index=None) -> IngestRun:
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
            per_board, totals = {}, {"fetched": 0, "created": 0, "updated": 0, "deleted": 0}
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
                    totals["deleted"] += retire(db, now)
                    merged = recompute_clusters(db, now)
                    prune(db, now)
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
            if index is not None:  # after commit, still under the advisory lock: two runs never sync at once
                client, name = index
                result = job_index.sync(sessions, client, name)
                per_board["index"] = result
                if result["state"] == "index_failed" and row.status == "ok":
                    row.status = "partial"
                with sessions.begin() as db:
                    stored = db.get(IngestRun, run.id)
                    stored.per_board, stored.status = per_board, row.status
                row.per_board = per_board
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
