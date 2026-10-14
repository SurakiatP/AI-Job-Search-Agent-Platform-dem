# Saved-Search Digests (TOR FR-J05, email channel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a job seeker save job-search filters per project and receive a scheduled plain-text email listing only matching jobs they were not sent before, with in-app management and one-click unsubscribe.

**Architecture:** Two new tables: `saved_searches` and `saved_search_seen`. One service module, `services/saved_searches.py`, holds CRUD, scheduling, digest collection, mail rendering and unsubscribe. The existing `WorkerSupervisor` housekeeping step (every 300 s) calls `SavedSearches.housekeeping()`. Owner REST routes and one public unsubscribe route expose the service. The Search page gets a "Saved searches" panel, and there is a public `/digest/unsubscribe` page.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.1, Alembic (raw SQL migrations), PostgreSQL 17, stdlib `zoneinfo`/`secrets`/`hashlib`, React 19 + Vite + Tailwind 4, Radix dialog (installed), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-saved-search-digests-design.md`

## Global Constraints

- Channel: email only, sent to the project owner's own verified account address. There is no other outbound channel and nothing is ever sent to third parties (TOR §1).
- Agents (grants) get no access to saved searches. Every saved-search route is owner-only.
- Job data comes live from `services/job_sources.search_jobs`. Only seen slugs are stored, never job payloads.
- No new dependencies, backend or frontend.
- Delivery time: 08:00 `Asia/Bangkok`. `daily`, or `weekly` on Monday.
- Limits:
  - at most 10 saved searches per project
  - name 1–80 characters (trimmed) and unique per project
  - a digest lists at most 20 jobs posted within the last 7 days
  - seen slugs are pruned after 90 days
- Rate limits:
  - `digest_preview`: 5 per hour per user
  - `digest_unsubscribe_ip`: 30 per hour per IP
- Delivery gates, all of which must hold:
  - the user's email is verified
  - the user is not disabled
  - the project preference `notifications_enabled` is not false (default true)
  - the saved search has `digest_enabled`
- Mail subjects:
  - th `งานใหม่ {n} ตำแหน่ง: {name}`
  - en `{n} new jobs: {name}`
- The frontend follows the last tracked `DESIGN.md` (`git show eb9bace^:DESIGN.md`):
  - indigo accent
  - shadcn primitives in `frontend/src/components/ui`
  - targets of at least 40 px
  - no horizontal overflow at 320 px
  - all copy in Thai and English
- Worktree: `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/digests`, branch `feat/saved-search-digests`.
  - Run `rtk npm ci --prefix frontend && rtk npm ci --prefix tests` once before frontend work (Task 5).
  - Prefix shell commands with `rtk`.
- Backend tests, run from `backend/`:
  - `uv run --locked pytest <path> -q`
  - non-integration: `uv run --locked pytest -q -m "not integration"`
  - integration tests use the running local Postgres (55432) and MinIO (59000)
  - known baseline integration failures, which you can ignore:
    - `test_application_startup::test_actual_built_frontend_with_production_rest_upload_and_session_restore`
    - `test_storage_infrastructure::test_real_postgres_minio_checksum_and_restart_proof`
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Freehire is down or slow at delivery time.** Nothing is recorded, the next 300-s tick retries, and the same row is not retried in a tight loop within one `run_due` call. Pinned by `test_source_failure_records_nothing_and_does_not_spin` (Task 3).
2. **A digest re-enabled after weeks off** must not fire immediately for a stale past slot. Its `next_run_at` is recomputed from now. Pinned by `test_reenable_recomputes_next_run` (Task 2).
3. **Thai names and long Thai filter text in the email and the panel** must not break rendering or overflow at 320 px. Pinned by `test_render_digest_thai` (Task 3) and the 320 px e2e (Task 5).
4. **The same slug appears twice in one freehire page.** It is listed once and recorded once, with no PK violation. Pinned by `test_duplicate_slugs_in_one_page_are_sent_once` (Task 3).
5. **Two app instances run `run_due` at once.** Each digest is sent exactly once (`SKIP LOCKED`). Pinned by `test_concurrent_run_due_sends_once` (Task 3).

## Plan rulings against the spec

1. Reuse existing error codes instead of adding near-duplicates:
   - `email_unverified` (403) in place of the spec's `email_not_verified` (409)
   - `invalid_token` (400) in place of the spec's 404
2. `POST /digest/unsubscribe` follows the existing public-route pattern of `/auth/verify-email`: no session, no Origin check. The token is the only authority, and the route is rate-limited per IP.
3. The digest mail templates live in `services/saved_searches.py`, which owns the feature, rather than in `services/accounts.py`.
4. `WorkerSupervisor` gets a separate `digests` hook with its own error guard, so a failing account purge cannot block digests and the reverse also holds.
5. Re-enabling a digest (`digest_enabled` false → true) recomputes `next_run_at`, so it does not fire at once for a stale slot.
6. The Saved searches panel header is always visible because it holds the Save button. The list itself is hidden when empty.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/migrations/versions/0024_saved_searches.py` (new) | Two tables, constraints, indexes |
| `backend/src/job_search_platform/db/models.py` | `SavedSearch`, `SavedSearchSeen` |
| `backend/src/job_search_platform/services/contracts.py` | `SavedSearchFilters` (shared with `MatchRunRequest`), saved-search DTOs |
| `backend/src/job_search_platform/services/saved_searches.py` (new) | CRUD, `next_slot`, unsubscribe, collect, `run_due`, preview, prune, mail render |
| `backend/src/job_search_platform/services/rate_limits.py` | Two new buckets |
| `backend/src/job_search_platform/services/authorization.py` | `saved_search` owner-only resource |
| `backend/src/job_search_platform/workers/supervisor.py` | `digests` housekeeping hook |
| `backend/src/job_search_platform/main.py`, `api/dependencies.py` | Wiring, `Services.saved_searches` |
| `backend/src/job_search_platform/api/rest.py`, `api/accounts.py` | Owner routes; public unsubscribe; error status codes |
| `docs/contracts/application-api.yaml` | New paths and schemas |
| `frontend/src/features/search/SavedSearches.tsx` (new) | Panel, save dialog, filter↔URL helpers |
| `frontend/src/features/digest/UnsubscribePage.tsx` (new) | Public unsubscribe page |
| `tests/e2e/saved-searches.spec.ts` (new) | Browser tests |

---

### Task 1: Schema, models and contracts

Model: Sonnet. The `MatchRunRequest` refactor needs care.

**Files:**
- Create: `backend/migrations/versions/0024_saved_searches.py`
- Modify: `backend/src/job_search_platform/db/models.py`. Add two classes at the end of the file.
- Modify: `backend/src/job_search_platform/services/contracts.py`:
  - split `MatchRunRequest` (line ~44) into `SavedSearchFilters` + `MatchRunRequest(SavedSearchFilters)`
  - add the DTOs before `class ToolDescriptor`
- Modify: `backend/src/job_search_platform/services/authorization.py`. Add `"saved_search"` to `OWNER_ONLY_RESOURCES`.
- Modify: `backend/src/job_search_platform/api/rest.py`, the error status map (line ~60-76). Add `"saved_search_limit": 409, "saved_search_name_taken": 409, "mail_unavailable": 503`.
- Test: `backend/tests/integration/test_saved_search_schema.py`, `backend/tests/unit/test_saved_search_contracts.py`

**Interfaces:**
- Produces:
  - ORM `SavedSearch(id, project_id, name, filters: dict, frequency, digest_enabled, unsubscribe_token_hash: bytes, next_run_at, last_sent_at, created_at)` and `SavedSearchSeen(saved_search_id, slug, seen_at)`.
  - DTOs `SavedSearchFilters`, `SavedSearchCreate`, `SavedSearchUpdate`, `SavedSearchView`, `DigestStatusView`, `SavedSearchListView`, `DigestPreviewView`, and the type alias `DigestFrequency`.
  - `MatchRunRequest` keeps exactly its current fields and validation.

- [ ] **Step 1: Write the failing tests**

`backend/tests/unit/test_saved_search_contracts.py`:

```python
"""FR-J05 contracts: shared filter rules, saved-search DTOs. Synthetic data only."""
from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_search_platform.services.contracts import (
    MatchRunRequest, SavedSearchCreate, SavedSearchFilters, SavedSearchUpdate,
)


def test_match_run_request_keeps_its_fields_and_rules():
    assert set(MatchRunRequest.model_fields) == {
        "cv_revision_id", "q", "cities", "work_mode", "posted_within_days", "category", "seniority",
        "employment_type", "company_type", "skills", "posting_language", "salary_min", "pool", "offset"}
    request = MatchRunRequest(cv_revision_id=uuid4(), skills=["sql", "python", "sql"], seniority=["senior", "junior"])
    assert request.skills == ["python", "sql"] and request.seniority == ["junior", "senior"]
    with pytest.raises(ValidationError):
        MatchRunRequest(cv_revision_id=uuid4(), skills=["a", "b", "c", "d", "e", "f"])


def test_saved_search_filters_reject_run_only_fields():
    assert SavedSearchFilters(q="data", cities=["Bangkok"]).q == "data"
    for extra in ({"cv_revision_id": str(uuid4())}, {"posted_within_days": 7}, {"pool": 10}):
        with pytest.raises(ValidationError):
            SavedSearchFilters(**extra)
    with pytest.raises(ValidationError):
        SavedSearchFilters(work_mode="sometimes")


def test_create_and_update_rules():
    created = SavedSearchCreate(name="  งานข้อมูล กรุงเทพ  ", filters={"q": "data"})
    assert created.name == "งานข้อมูล กรุงเทพ" and created.frequency == "daily"
    for bad in ("", "   ", "x" * 81):
        with pytest.raises(ValidationError):
            SavedSearchCreate(name=bad)
    with pytest.raises(ValidationError):
        SavedSearchCreate(name="ok", frequency="hourly")
    with pytest.raises(ValidationError):
        SavedSearchUpdate()
    assert SavedSearchUpdate(digest_enabled=False).digest_enabled is False
```

`backend/tests/integration/test_saved_search_schema.py`:

```python
"""FR-J05 schema: saved_searches and saved_search_seen. Synthetic data only."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from helpers import owner, project
from job_search_platform.db.models import Project, SavedSearch, SavedSearchSeen, User


def _saved(db, project_id, name="Synthetic search", frequency="daily"):
    row = SavedSearch(project_id=project_id, name=name, filters={"q": "data"}, frequency=frequency,
                      unsubscribe_token_hash=hashlib.sha256(secrets.token_bytes(16)).digest(),
                      next_run_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    return row


@pytest.mark.integration
def test_name_unique_per_project_and_frequency_checked(db_session):
    actor = owner(db_session)
    first, second = project(db_session, owner=actor), project(db_session, "Other", owner=actor)
    _saved(db_session, first.id)
    _saved(db_session, second.id)  # same name, other project: fine
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            _saved(db_session, first.id)
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            _saved(db_session, first.id, name="Hourly", frequency="hourly")


@pytest.mark.integration
def test_project_and_user_deletion_cascade(db_session):
    actor = owner(db_session)
    first = project(db_session, owner=actor)
    row = _saved(db_session, first.id)
    db_session.add(SavedSearchSeen(saved_search_id=row.id, slug="synthetic-slug"))
    db_session.flush()
    db_session.execute(delete(Project).where(Project.id == first.id))
    db_session.flush()
    assert db_session.scalar(select(SavedSearch.id)) is None
    assert db_session.scalar(select(SavedSearchSeen.slug)) is None

    second = project(db_session, "Second", owner=actor)
    _saved(db_session, second.id)
    db_session.execute(delete(User).where(User.id == actor.user_id))
    db_session.flush()
    assert db_session.scalar(select(SavedSearch.id)) is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --locked pytest tests/unit/test_saved_search_contracts.py tests/integration/test_saved_search_schema.py -q`
Expected: FAIL with `ImportError` (no `SavedSearchFilters` / `SavedSearch`).

- [ ] **Step 3: Migration** `backend/migrations/versions/0024_saved_searches.py`

```python
"""Saved-search digests (TOR FR-J05): saved searches and the job slugs already sent per digest."""

from alembic import op


revision = "0024_saved_searches"
down_revision = "0023_application_board"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE saved_searches (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name varchar(80) NOT NULL,
        filters jsonb NOT NULL,
        frequency varchar(8) NOT NULL,
        digest_enabled boolean NOT NULL DEFAULT true,
        unsubscribe_token_hash bytea NOT NULL UNIQUE,
        next_run_at timestamptz NOT NULL,
        last_sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_saved_searches_name UNIQUE (project_id, name),
        CONSTRAINT ck_saved_searches_frequency CHECK (frequency IN ('daily','weekly')),
        CONSTRAINT ck_saved_searches_name CHECK (length(btrim(name)) BETWEEN 1 AND 80))""")
    op.execute("CREATE INDEX ix_saved_searches_due ON saved_searches (next_run_at) WHERE digest_enabled")
    op.execute("""CREATE TABLE saved_search_seen (
        saved_search_id uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
        slug varchar(200) NOT NULL,
        seen_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (saved_search_id, slug))""")
    op.execute("CREATE INDEX ix_saved_search_seen_at ON saved_search_seen (seen_at)")


def downgrade() -> None:
    op.execute("DROP TABLE saved_search_seen")
    op.execute("DROP TABLE saved_searches")
```

- [ ] **Step 4: Models** (append to `db/models.py`; `Boolean`, `LargeBinary`, `Index`, `JSON` and `text` are already imported)

```python
class SavedSearch(Base):
    """FR-J05 saved job-search filters with a scheduled email digest."""
    __tablename__ = "saved_searches"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    filters: Mapped[dict] = mapped_column(JSON, nullable=False)
    frequency: Mapped[str] = mapped_column(String(8), nullable=False)
    digest_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    unsubscribe_token_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, unique=True)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_saved_searches_name"),
        CheckConstraint("frequency IN ('daily','weekly')", name="ck_saved_searches_frequency"),
        CheckConstraint("length(btrim(name)) BETWEEN 1 AND 80", name="ck_saved_searches_name"),
        Index("ix_saved_searches_due", "next_run_at", postgresql_where=text("digest_enabled")),
    )


class SavedSearchSeen(Base):
    """Job slugs already sent in a digest for one saved search; pruned after 90 days."""
    __tablename__ = "saved_search_seen"
    saved_search_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("saved_searches.id", ondelete="CASCADE"), primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("ix_saved_search_seen_at", "seen_at"),)
```

- [ ] **Step 5: Contracts**

Replace the current `MatchRunRequest` class with the two classes below. The field types are copied unchanged from the existing class. `posted_within_days` stays on `MatchRunRequest` only.

```python
class SavedSearchFilters(DTO):
    """Job-search filters shared by Smart Match runs and FR-J05 saved searches; one set of rules."""
    q: Annotated[str, StringConstraints(max_length=200)] = ""
    cities: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=80)]], Field(max_length=10)] = []
    work_mode: Literal["remote", "hybrid", "onsite"] | None = None
    category: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{1,60}$")] | None = None
    seniority: _Choices[Literal["intern", "junior", "middle", "senior", "lead", "staff", "principal", "c_level"]] = []
    employment_type: _Choices[Literal["full_time", "part_time", "contract", "internship", "fellowship"]] = []
    company_type: _Choices[Literal["product", "startup", "agency", "outsource", "outstaff", "inhouse", "government"]] = []
    skills: Annotated[list[Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9][a-z0-9.+#-]{0,40}$")]],
                      AfterValidator(lambda v: sorted(set(v))), Field(max_length=5)] = []
    posting_language: Literal["th"] | None = None
    salary_min: Annotated[int, Field(ge=1, le=1_000_000)] | None = None


class MatchRunRequest(SavedSearchFilters):
    cv_revision_id: UUID
    posted_within_days: Annotated[int, Field(ge=1, le=90)] | None = None
    pool: Annotated[int, Field(ge=1, le=100)] = 100
    offset: Annotated[int, Field(ge=0, le=1000)] = 0
```

Before `class ToolDescriptor`, add:

```python
DigestFrequency = Literal["daily", "weekly"]
_SavedSearchName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SavedSearchCreate(DTO):
    name: _SavedSearchName
    filters: SavedSearchFilters = SavedSearchFilters()
    frequency: DigestFrequency = "daily"


class SavedSearchUpdate(DTO):
    name: _SavedSearchName | None = None
    frequency: DigestFrequency | None = None
    digest_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_intent(self):
        if self.name is None and self.frequency is None and self.digest_enabled is None:
            raise ValueError("one_field_required")
        return self


class SavedSearchView(DTO):
    id: UUID
    name: str
    filters: SavedSearchFilters
    frequency: DigestFrequency
    digest_enabled: bool
    next_run_at: datetime
    last_sent_at: datetime | None = None
    created_at: datetime


class DigestStatusView(DTO):
    email_verified: bool
    notifications_enabled: bool


class SavedSearchListView(DTO):
    items: tuple[SavedSearchView, ...] = ()
    status: DigestStatusView


class DigestPreviewView(DTO):
    status: Literal["sent"]
```

Then apply the two small edits listed under **Files**: add `"saved_search"` to `OWNER_ONLY_RESOURCES`, and add the three error codes to the REST status map.

- [ ] **Step 6: Run the tests**

Run: `uv run --locked pytest tests/unit/test_saved_search_contracts.py tests/integration/test_saved_search_schema.py tests/integration/test_schema.py tests/integration/test_match_jobs_run.py tests/integration/test_smart_match_api.py -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/migrations/versions/0024_saved_searches.py backend/src/job_search_platform backend/tests
rtk git commit -m "feat(digests): saved-search schema, models and contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Saved-search service — schedule, CRUD, unsubscribe

Model: Sonnet.

**Files:**
- Create: `backend/src/job_search_platform/services/saved_searches.py`
- Modify: `backend/src/job_search_platform/services/rate_limits.py`. Add `"digest_preview": (5, 3600)` and `"digest_unsubscribe_ip": (30, 3600)` to `LIMITS`.
- Test: `backend/tests/integration/test_saved_searches_service.py`

**Interfaces:**
- Consumes (from Task 1): the models, the DTOs, and `authorize(db, actor, project_id, action, "saved_search")`.
- Produces:
  - `next_slot(now: datetime, frequency: str) -> datetime` (UTC).
  - `class SavedSearches(sessions, mailer, *, public_origin: str, search=None)`. These methods are sync, and REST calls them via `asyncio.to_thread`:
    - `list(actor, project_id) -> SavedSearchListView`
    - `create(actor, project_id, body: SavedSearchCreate, *, now=None) -> SavedSearchView`
    - `update(actor, project_id, saved_search_id, body: SavedSearchUpdate, *, now=None) -> SavedSearchView`
    - `delete(actor, project_id, saved_search_id) -> None`
    - `unsubscribe(token: str, ip: str) -> None`. It raises `invalid_token` for an unknown token.
  - Helpers that Task 3 uses: `_new_token() -> tuple[str, bytes]`, `_view(row) -> SavedSearchView`, and `self.search` (defaults to `job_sources.search_jobs`).

- [ ] **Step 1: Write the failing tests**

```python
"""FR-J05 service: schedule, CRUD, caps, gates status, unsubscribe. Synthetic data only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project, user
from job_search_platform.db.models import ProjectPreference, SavedSearch
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.contracts import SavedSearchCreate, SavedSearchUpdate
from job_search_platform.services.errors import ServiceError

UTC = timezone.utc
ORIGIN = "http://127.0.0.1:8765"


def _bkk(y, m, d, h, mi=0):
    return datetime(y, m, d, h - 7, mi, tzinfo=UTC) if h >= 7 else datetime(y, m, d - 1, h + 17, mi, tzinfo=UTC)


def test_next_slot_daily_and_weekly():
    # 2026-10-14 is a Wednesday.
    assert ss.next_slot(_bkk(2026, 10, 14, 7, 59), "daily") == _bkk(2026, 10, 14, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 8), "daily") == _bkk(2026, 10, 15, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 10), "weekly") == _bkk(2026, 10, 19, 8)
    assert ss.next_slot(_bkk(2026, 10, 19, 7, 59), "weekly") == _bkk(2026, 10, 19, 8)
    assert ss.next_slot(_bkk(2026, 10, 19, 8), "weekly") == _bkk(2026, 10, 26, 8)
    assert ss.next_slot(_bkk(2026, 10, 14, 10), "daily").tzinfo is not None


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        record = project(db, owner=actor)
    return sessions, ss.SavedSearches(sessions, MemoryMailer(), public_origin=ORIGIN), actor, record.id


def _code(call) -> str:
    with pytest.raises(ServiceError) as caught:
        call()
    return caught.value.code


@pytest.mark.integration
def test_crud_and_status(ctx):
    sessions, service, actor, pid = ctx
    now = _bkk(2026, 10, 14, 10)
    created = service.create(actor, pid, SavedSearchCreate(name="Data BKK", filters={"q": "data", "cities": ["Bangkok"]}), now=now)
    assert created.frequency == "daily" and created.digest_enabled and created.next_run_at == _bkk(2026, 10, 15, 8)
    listed = service.list(actor, pid)
    assert [i.name for i in listed.items] == ["Data BKK"]
    assert listed.status.email_verified is True and listed.status.notifications_enabled is True
    weekly = service.update(actor, pid, created.id, SavedSearchUpdate(frequency="weekly"), now=now)
    assert weekly.next_run_at == _bkk(2026, 10, 19, 8)
    renamed = service.update(actor, pid, created.id, SavedSearchUpdate(name="งานข้อมูล"), now=now)
    assert renamed.name == "งานข้อมูล"
    service.delete(actor, pid, created.id)
    assert service.list(actor, pid).items == ()


@pytest.mark.integration
def test_limit_and_duplicate_name(ctx):
    _, service, actor, pid = ctx
    for i in range(10):
        service.create(actor, pid, SavedSearchCreate(name=f"Search {i}"))
    assert _code(lambda: service.create(actor, pid, SavedSearchCreate(name="Eleventh"))) == "saved_search_limit"
    service.delete(actor, pid, service.list(actor, pid).items[0].id)
    assert _code(lambda: service.create(actor, pid, SavedSearchCreate(name="Search 5"))) == "saved_search_name_taken"
    first = service.list(actor, pid).items[0]
    assert _code(lambda: service.update(actor, pid, first.id, SavedSearchUpdate(name="Search 6"))) == "saved_search_name_taken"


@pytest.mark.integration
def test_reenable_recomputes_next_run(ctx):
    sessions, service, actor, pid = ctx
    created = service.create(actor, pid, SavedSearchCreate(name="Paused"), now=_bkk(2026, 9, 1, 10))
    service.update(actor, pid, created.id, SavedSearchUpdate(digest_enabled=False), now=_bkk(2026, 9, 1, 10))
    back = service.update(actor, pid, created.id, SavedSearchUpdate(digest_enabled=True), now=_bkk(2026, 10, 14, 10))
    assert back.next_run_at == _bkk(2026, 10, 15, 8)


@pytest.mark.integration
def test_status_reflects_gates_and_other_user_is_not_found(ctx):
    sessions, service, actor, pid = ctx
    with sessions.begin() as db:
        db.add(ProjectPreference(project_id=pid, values={"notifications_enabled": False}))
        stranger = user(db)
        unverified = user(db, verified=False)
        unverified_project = project(db, "Unverified", owner=unverified).id
    assert service.list(actor, pid).status.notifications_enabled is False
    assert service.list(unverified, unverified_project).status.email_verified is False
    created = service.create(actor, pid, SavedSearchCreate(name="Mine"))
    assert _code(lambda: service.list(stranger, pid)) == "not_found"
    assert _code(lambda: service.delete(stranger, pid, created.id)) == "not_found"
    assert _code(lambda: service.delete(actor, pid, uuid4())) == "not_found"


@pytest.mark.integration
def test_unsubscribe_by_token(ctx):
    sessions, service, actor, pid = ctx
    created = service.create(actor, pid, SavedSearchCreate(name="Tokened"))
    token, digest = ss._new_token()
    with sessions.begin() as db:
        db.get(SavedSearch, created.id).unsubscribe_token_hash = digest
    assert _code(lambda: service.unsubscribe("x" * 43, "203.0.113.1")) == "invalid_token"
    service.unsubscribe(token, "203.0.113.1")
    assert service.list(actor, pid).items[0].digest_enabled is False
    for _ in range(30):  # the 30 allowed hits per hour
        try:
            service.unsubscribe("y" * 43, "203.0.113.9")
        except ServiceError:
            pass
    assert _code(lambda: service.unsubscribe("y" * 43, "203.0.113.9")) == "rate_limited"
```

`helpers.user(db, verified=False)` and `project(db, name, owner=...)` already exist. Check their exact signatures in `backend/tests/helpers.py` and adapt the call only, not the asserted behavior.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --locked pytest tests/integration/test_saved_searches_service.py -q`
Expected: FAIL with `ModuleNotFoundError: job_search_platform.services.saved_searches`.

- [ ] **Step 3: Implement** `services/saved_searches.py` (first part; Task 3 appends delivery)

```python
"""FR-J05 saved searches: per-project job-search filters with a scheduled email digest.

Owner REST routes call the sync methods through asyncio.to_thread; the supervisor's housekeeping step
calls housekeeping(). Agents never reach this module (owner-only resource "saved_search").
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import Project, ProjectPreference, SavedSearch, User
from job_search_platform.services import job_sources, rate_limits
from job_search_platform.services.authorization import authorize
from job_search_platform.services.contracts import (
    Actor, DigestStatusView, SavedSearchCreate, SavedSearchListView, SavedSearchUpdate, SavedSearchView,
)
from job_search_platform.services.errors import ServiceError

logger = logging.getLogger("jsp.digests")

BANGKOK = ZoneInfo("Asia/Bangkok")
SEND_HOUR = 8
MAX_PER_PROJECT = 10


def next_slot(now: datetime, frequency: str) -> datetime:
    """The next 08:00 Asia/Bangkok strictly after ``now`` (weekly: Monday), returned in UTC."""
    local = now.astimezone(BANGKOK)
    slot = local.replace(hour=SEND_HOUR, minute=0, second=0, microsecond=0)
    step = timedelta(days=7 if frequency == "weekly" else 1)
    if frequency == "weekly":
        slot += timedelta(days=(0 - slot.weekday()) % 7)
    while slot <= local:
        slot += step
    return slot.astimezone(timezone.utc)


def _new_token() -> tuple[str, bytes]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).digest()


def _view(row: SavedSearch) -> SavedSearchView:
    return SavedSearchView(id=row.id, name=row.name, filters=row.filters, frequency=row.frequency,
                           digest_enabled=row.digest_enabled, next_run_at=row.next_run_at,
                           last_sent_at=row.last_sent_at, created_at=row.created_at)


class SavedSearches:
    def __init__(self, sessions, mailer, *, public_origin: str, search=None):
        self.sessions = sessions
        self.mailer = mailer
        self.public_origin = public_origin.rstrip("/")
        self.search = search or job_sources.search_jobs

    @staticmethod
    def _row(db, project_id: UUID, saved_search_id: UUID) -> SavedSearch:
        row = db.scalar(select(SavedSearch).where(SavedSearch.project_id == project_id,
                                                  SavedSearch.id == saved_search_id).with_for_update())
        if row is None:
            raise ServiceError("not_found")
        return row

    @staticmethod
    def _gates(db, project_id: UUID) -> tuple[User | None, bool]:
        """The project owner and whether project notifications are on (default on)."""
        found = db.execute(select(User, ProjectPreference.values).join(Project, Project.user_id == User.id)
                           .outerjoin(ProjectPreference, ProjectPreference.project_id == Project.id)
                           .where(Project.id == project_id)).first()
        if found is None:
            return None, False
        account, values = found
        return account, (values or {}).get("notifications_enabled", True) is not False

    def list(self, actor: Actor, project_id: UUID) -> SavedSearchListView:
        with self.sessions() as db:
            authorize(db, actor, project_id, "read", "saved_search")
            rows = db.scalars(select(SavedSearch).where(SavedSearch.project_id == project_id)
                              .order_by(SavedSearch.created_at, SavedSearch.id)).all()
            account, notifications = self._gates(db, project_id)
            status = DigestStatusView(email_verified=bool(account and account.email_verified_at),
                                      notifications_enabled=notifications)
            return SavedSearchListView(items=tuple(_view(r) for r in rows), status=status)

    def create(self, actor: Actor, project_id: UUID, body: SavedSearchCreate, *, now: datetime | None = None) -> SavedSearchView:
        now = now or datetime.now(timezone.utc)
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                db.execute(select(Project.id).where(Project.id == project_id).with_for_update())  # serialise the cap
                count = db.scalar(select(func.count()).select_from(SavedSearch).where(SavedSearch.project_id == project_id))
                if count >= MAX_PER_PROJECT:
                    raise ServiceError("saved_search_limit")
                _, digest = _new_token()
                row = SavedSearch(project_id=project_id, name=body.name, filters=body.filters.model_dump(mode="json"),
                                  frequency=body.frequency, unsubscribe_token_hash=digest,
                                  next_run_at=next_slot(now, body.frequency), created_at=now)
                db.add(row)
                db.flush()
                return _view(row)
        except IntegrityError:
            raise ServiceError("saved_search_name_taken") from None

    def update(self, actor: Actor, project_id: UUID, saved_search_id: UUID, body: SavedSearchUpdate,
               *, now: datetime | None = None) -> SavedSearchView:
        now = now or datetime.now(timezone.utc)
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                row = self._row(db, project_id, saved_search_id)
                reschedule = False
                if body.name is not None:
                    row.name = body.name
                if body.frequency is not None and body.frequency != row.frequency:
                    row.frequency, reschedule = body.frequency, True
                if body.digest_enabled is not None and body.digest_enabled != row.digest_enabled:
                    row.digest_enabled = body.digest_enabled
                    reschedule = reschedule or body.digest_enabled  # never fire at once for a stale slot
                if reschedule:
                    row.next_run_at = next_slot(now, row.frequency)
                db.flush()
                return _view(row)
        except IntegrityError:
            raise ServiceError("saved_search_name_taken") from None

    def delete(self, actor: Actor, project_id: UUID, saved_search_id: UUID) -> None:
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "saved_search")
            db.delete(self._row(db, project_id, saved_search_id))

    def unsubscribe(self, token: str, ip: str) -> None:
        with self.sessions.begin() as db:
            rate_limits.hit(db, "digest_unsubscribe_ip", ip)
        with self.sessions.begin() as db:
            row = db.scalar(select(SavedSearch).where(
                SavedSearch.unsubscribe_token_hash == hashlib.sha256(token.encode()).digest()).with_for_update())
            if row is None:
                raise ServiceError("invalid_token")
            row.digest_enabled = False
```

The rate-limit hit is committed in its own transaction, so a failed lookup still counts against the IP.

- [ ] **Step 4: Run the tests**

Run: `uv run --locked pytest tests/integration/test_saved_searches_service.py -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/saved_searches.py backend/src/job_search_platform/services/rate_limits.py backend/tests/integration/test_saved_searches_service.py
rtk git commit -m "feat(digests): saved-search service with schedule, caps and unsubscribe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Digest delivery, preview, prune and supervisor wiring

Model: Sonnet.

**Files:**
- Modify: `backend/src/job_search_platform/services/saved_searches.py`. Append the delivery code.
- Modify: `backend/src/job_search_platform/workers/supervisor.py`. Add the `digests` kwarg and a guarded call in `_purge_step`.
- Modify: `backend/src/job_search_platform/api/dependencies.py`. Add `saved_searches: Any = None` to `Services`.
- Modify: `backend/src/job_search_platform/main.py`, in `build_services`. Construct `SavedSearches`, pass `digests=saved_searches.housekeeping` to `WorkerSupervisor`, and add `saved_searches=` to `Services(...)`.
- Test: `backend/tests/integration/test_saved_search_digests.py`

**Interfaces:**
- Consumes (from Task 2): `SavedSearches`, `next_slot`, `_new_token`, `_gates`, `_row`, `self.search`, `self.mailer`.
- Produces:
  - `render_digest(locale, name, items, app_link, unsubscribe_link) -> tuple[str, str]`
  - `SavedSearches.collect(db, row, *, exclude_seen=True) -> list[dict]`
  - `async SavedSearches.run_due(now=None) -> int` (mails sent)
  - `SavedSearches.preview(actor, project_id, saved_search_id) -> None`
  - `SavedSearches.prune_seen(now=None) -> int`
  - `async SavedSearches.housekeeping() -> int`
  - `WorkerSupervisor(..., digests: Callable[[], Awaitable[int]] | None = None)`

- [ ] **Step 1: Write the failing tests**

```python
"""FR-J05 delivery: run_due, gates, failures, concurrency, preview, prune, supervisor. Synthetic data only."""
from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.db.models import ProjectPreference, SavedSearch, SavedSearchSeen, User
from job_search_platform.integrations.mailer import MemoryMailer
from job_search_platform.services import saved_searches as ss
from job_search_platform.services.contracts import SavedSearchCreate
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.supervisor import WorkerSupervisor

UTC = timezone.utc
ORIGIN = "http://127.0.0.1:8765"
NOW = datetime(2026, 10, 15, 1, 0, tzinfo=UTC)  # 08:00 Bangkok


def _item(slug, title="Synthetic Data Engineer", **extra):
    return {"slug": slug, "title": title, "company": "Example Co", "cities": ["Bangkok"], "age_days": 2,
            "stale": False, "source_url": f"https://jobs.example.test/{slug}", **extra}


class _Source:
    def __init__(self, items=(), fail=False, delay=0.0):
        self.items, self.fail, self.delay, self.calls = list(items), fail, delay, []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        time.sleep(self.delay)
        if self.fail:
            raise ServiceError("job_source_unavailable", retryable=True)
        return {"items": list(self.items), "total": len(self.items), "limit": 20, "offset": 0}


@pytest.fixture
def ctx(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor = owner(db)
        pid = project(db, owner=actor).id
    mailer, source = MemoryMailer(), _Source([_item("a"), _item("b")])
    service = ss.SavedSearches(sessions, mailer, public_origin=ORIGIN, search=source)
    created = service.create(actor, pid, SavedSearchCreate(name="Data", filters={"q": "data", "skills": ["sql"]}),
                             now=NOW - timedelta(days=1))
    return sessions, service, mailer, source, actor, pid, created.id


def _due(sessions, sid, when=NOW - timedelta(minutes=1)):
    with sessions.begin() as db:
        db.execute(update(SavedSearch).where(SavedSearch.id == sid).values(next_run_at=when))


def _seen(sessions, sid):
    with sessions() as db:
        return set(db.scalars(select(SavedSearchSeen.slug).where(SavedSearchSeen.saved_search_id == sid)))


@pytest.mark.integration
def test_sends_unseen_once_then_advances(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 1
    (mail,) = mailer.sent
    assert mail.subject == "งานใหม่ 2 ตำแหน่ง: Data"
    assert "https://jobs.example.test/a" in mail.text and f"{ORIGIN}/digest/unsubscribe?token=" in mail.text
    assert f"{ORIGIN}/app/projects/{pid}/search?" in mail.text and "skills=sql" in mail.text
    assert source.calls[0]["posted_within_days"] == 7 and source.calls[0]["limit"] == 20
    assert _seen(sessions, sid) == {"a", "b"}
    with sessions() as db:
        row = db.get(SavedSearch, sid)
        assert row.last_sent_at == NOW and row.next_run_at == ss.next_slot(NOW, "daily")
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert len(mailer.sent) == 1
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == ss.next_slot(NOW, "daily")


@pytest.mark.integration
def test_duplicate_slugs_in_one_page_are_sent_once(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.items = [_item("a"), _item("a"), _item("c")]
    _due(sessions, sid)
    asyncio.run(service.run_due(NOW))
    assert mailer.sent[0].subject.startswith("งานใหม่ 2 ")
    assert _seen(sessions, sid) == {"a", "c"}


@pytest.mark.integration
@pytest.mark.parametrize("gate", ["unverified", "disabled", "notifications_off"])
def test_gates_block_send_and_advance(ctx, gate):
    sessions, service, mailer, source, actor, pid, sid = ctx
    with sessions.begin() as db:
        if gate == "unverified":
            db.execute(update(User).where(User.id == actor.user_id).values(email_verified_at=None))
        elif gate == "disabled":
            db.execute(update(User).where(User.id == actor.user_id).values(disabled_at=NOW))
        else:
            db.add(ProjectPreference(project_id=pid, values={"notifications_enabled": False}))
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert mailer.sent == [] and source.calls == [] and _seen(sessions, sid) == set()
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == ss.next_slot(NOW, "daily")


@pytest.mark.integration
def test_disabled_digest_is_not_selected(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    _due(sessions, sid)
    with sessions.begin() as db:
        db.get(SavedSearch, sid).digest_enabled = False
    assert asyncio.run(service.run_due(NOW)) == 0 and source.calls == []


@pytest.mark.integration
def test_source_failure_records_nothing_and_does_not_spin(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.fail = True
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    assert len(source.calls) == 1 and mailer.sent == [] and _seen(sessions, sid) == set()
    with sessions() as db:
        assert db.get(SavedSearch, sid).next_run_at == NOW - timedelta(minutes=1)


@pytest.mark.integration
def test_mail_failure_records_nothing(ctx):
    sessions, service, mailer, source, *_, sid = ctx

    def broken(mail):
        raise OSError("smtp down")
    mailer.send = broken
    with sessions() as db:
        old_hash = db.get(SavedSearch, sid).unsubscribe_token_hash
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0
    with sessions() as db:
        row = db.get(SavedSearch, sid)
        assert row.last_sent_at is None and row.next_run_at == NOW - timedelta(minutes=1)
        assert row.unsubscribe_token_hash == old_hash
    assert _seen(sessions, sid) == set()


@pytest.mark.integration
def test_no_mailer_records_nothing(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    service.mailer = None
    _due(sessions, sid)
    assert asyncio.run(service.run_due(NOW)) == 0 and _seen(sessions, sid) == set()


@pytest.mark.integration
def test_concurrent_run_due_sends_once(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    source.delay = 0.5
    _due(sessions, sid)
    results = []
    threads = [threading.Thread(target=lambda: results.append(asyncio.run(service.run_due(NOW)))) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == [0, 1] and len(mailer.sent) == 1


@pytest.mark.integration
def test_new_token_unsubscribes_and_old_one_expires(ctx):
    sessions, service, mailer, source, *_, sid = ctx
    _due(sessions, sid)
    asyncio.run(service.run_due(NOW))
    first = mailer.sent[0].text.split("token=")[1].split()[0]
    service.preview(ctx[4], ctx[5], sid)
    second = mailer.sent[1].text.split("token=")[1].split()[0]
    with pytest.raises(ServiceError) as caught:
        service.unsubscribe(first, "198.51.100.1")
    assert caught.value.code == "invalid_token"
    service.unsubscribe(second, "198.51.100.1")
    with sessions() as db:
        assert db.get(SavedSearch, sid).digest_enabled is False


@pytest.mark.integration
def test_preview_sends_without_recording_and_is_rate_limited(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    service.preview(actor, pid, sid)
    assert len(mailer.sent) == 1 and _seen(sessions, sid) == set()
    source.items = []
    service.preview(actor, pid, sid)
    assert mailer.sent[1].subject == "ยังไม่มีงานใหม่: Data"
    for _ in range(3):
        service.preview(actor, pid, sid)
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "rate_limited"


@pytest.mark.integration
def test_preview_gates(ctx):
    sessions, service, mailer, source, actor, pid, sid = ctx
    service.mailer = None
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "mail_unavailable"
    service.mailer = mailer
    with sessions.begin() as db:
        db.execute(update(User).where(User.id == actor.user_id).values(email_verified_at=None))
    with pytest.raises(ServiceError) as caught:
        service.preview(actor, pid, sid)
    assert caught.value.code == "email_unverified"


@pytest.mark.integration
def test_prune_seen(ctx):
    sessions, service, *_, sid = ctx
    with sessions.begin() as db:
        db.add_all([SavedSearchSeen(saved_search_id=sid, slug="old", seen_at=NOW - timedelta(days=91)),
                    SavedSearchSeen(saved_search_id=sid, slug="new", seen_at=NOW - timedelta(days=1))])
    assert service.prune_seen(NOW) == 1
    assert _seen(sessions, sid) == {"new"}


def test_render_digest_thai():
    subject, text = ss.render_digest("th", "งานข้อมูล กรุงเทพ", [
        _item("a", title="วิศวกรข้อมูลอาวุโส", stale=True, age_days=0), _item("b", company=None, cities=[])],
        "http://app/search?q=x", "http://app/digest/unsubscribe?token=t")
    assert subject == "งานใหม่ 2 ตำแหน่ง: งานข้อมูล กรุงเทพ"
    assert "1. วิศวกรข้อมูลอาวุโส" in text and "อาจเป็นประกาศเก่า" in text and "วันนี้" in text
    assert text.rstrip().endswith("http://app/digest/unsubscribe?token=t")


@pytest.mark.integration
def test_supervisor_runs_digests_even_when_purge_fails(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    calls = []

    async def bad_purge():
        raise RuntimeError("boom")

    async def digests():
        calls.append(1)
        return 0
    supervisor = WorkerSupervisor(sessions, None, None, None, purge=bad_purge, digests=digests)
    asyncio.run(supervisor._purge_step())
    assert calls == [1]
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --locked pytest tests/integration/test_saved_search_digests.py -q`
Expected: FAIL (`run_due`, `render_digest`, `preview`, the `digests` kwarg and the others do not exist yet).

- [ ] **Step 3: Implement delivery** (append to `services/saved_searches.py`; add `import asyncio`, `from urllib.parse import urlencode`, `from sqlalchemy import delete, true`, `from sqlalchemy.dialects.postgresql import insert as pg_insert`, `from job_search_platform.db.models import SavedSearchSeen` and `from job_search_platform.integrations.mailer import Mail` to the imports)

```python
DIGEST_DAYS = 7
DIGEST_LIMIT = 20
SEEN_RETENTION = timedelta(days=90)
DUE_BATCH = 20

DIGEST_MESSAGES = {
    "en": {"subject": "{n} new jobs: {name}", "empty_subject": "No new jobs right now: {name}",
           "intro": "New jobs for your saved search “{name}”:", "empty": "There are no new jobs for “{name}” right now.",
           "stale": "possibly stale", "age": "{d} days ago", "today": "today",
           "open": "See all results in the app:", "stop": "Stop this digest:"},
    "th": {"subject": "งานใหม่ {n} ตำแหน่ง: {name}", "empty_subject": "ยังไม่มีงานใหม่: {name}",
           "intro": "งานใหม่สำหรับการค้นหาที่บันทึกไว้ “{name}”:", "empty": "ตอนนี้ยังไม่มีงานใหม่สำหรับ “{name}”",
           "stale": "อาจเป็นประกาศเก่า", "age": "{d} วันก่อน", "today": "วันนี้",
           "open": "ดูผลทั้งหมดในแอป:", "stop": "หยุดรับสรุปนี้:"},
}


def render_digest(locale: str, name: str, items: list[dict], app_link: str, unsubscribe_link: str) -> tuple[str, str]:
    m = DIGEST_MESSAGES.get(locale, DIGEST_MESSAGES["en"])
    lines: list[str] = []
    for number, item in enumerate(items, 1):
        age = item.get("age_days")
        detail = " · ".join(part for part in (
            item.get("company"), ", ".join(item.get("cities") or []) or None,
            (m["today"] if age == 0 else m["age"].format(d=age)) if isinstance(age, int) else None,
            m["stale"] if item.get("stale") else None) if part)
        lines.append(f"{number}. {item['title']}")
        if detail:
            lines.append(f"   {detail}")
        if item.get("source_url"):
            lines.append(f"   {item['source_url']}")
    head = m["intro"].format(name=name) if items else m["empty"].format(name=name)
    subject = m["subject"].format(n=len(items), name=name) if items else m["empty_subject"].format(name=name)
    return subject, "\n".join([head, "", *lines, "", m["open"], app_link, "", m["stop"], unsubscribe_link])


def _query(filters: dict) -> str:
    """Search-page URL query for stored filters (lists comma-joined, empty values dropped)."""
    pairs = []
    for key, value in filters.items():
        text = ",".join(value) if isinstance(value, list) else ("" if value is None else str(value))
        if text:
            pairs.append((key, text))
    return urlencode(pairs)


class _SendFailed(Exception):
    pass
```

Then add these methods to the `SavedSearches` class:

```python
    def collect(self, db, row: SavedSearch, *, exclude_seen: bool = True) -> list[dict]:
        page = self.search(**row.filters, posted_within_days=DIGEST_DAYS, limit=DIGEST_LIMIT, offset=0)
        seen = set(db.scalars(select(SavedSearchSeen.slug).where(SavedSearchSeen.saved_search_id == row.id))) \
            if exclude_seen else set()
        items, slugs = [], set()
        for item in page["items"]:
            slug = item.get("slug")
            if not slug or slug in seen or slug in slugs:
                continue
            slugs.add(slug)
            items.append(item)
        return items[:DIGEST_LIMIT]

    def _mail(self, account: User, row: SavedSearch, items: list[dict]) -> None:
        """Rotate the unsubscribe token and send; raises _SendFailed when no mail can go out."""
        if self.mailer is None:
            logger.warning("mail_disabled", extra={"kind": "digest"})
            raise _SendFailed
        token, digest = _new_token()
        row.unsubscribe_token_hash = digest
        app_link = f"{self.public_origin}/app/projects/{row.project_id}/search?{_query(row.filters)}"
        subject, text = render_digest(account.locale, row.name, items, app_link,
                                      f"{self.public_origin}/digest/unsubscribe?token={token}")
        try:
            self.mailer.send(Mail(account.email, subject, text))
        except Exception:  # noqa: BLE001 - delivery failure must not record the digest as sent
            logger.warning("digest_send_failed", extra={"saved_search_id": str(row.id)})
            raise _SendFailed from None

    def _run_one(self, now: datetime, done: set) -> tuple[UUID, int] | None:
        row_id = None
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(SavedSearch).where(
                    SavedSearch.digest_enabled, SavedSearch.next_run_at <= now,
                    SavedSearch.id.not_in(done) if done else true(),
                ).order_by(SavedSearch.next_run_at).limit(1).with_for_update(skip_locked=True))
                if row is None:
                    return None
                row_id = row.id
                account, notifications = self._gates(db, row.project_id)
                if account is None or account.email_verified_at is None or account.disabled_at is not None or not notifications:
                    row.next_run_at = next_slot(now, row.frequency)
                    return row_id, 0
                try:
                    items = self.collect(db, row)
                except ServiceError:
                    logger.warning("digest_source_failed", extra={"saved_search_id": str(row_id)})
                    return row_id, 0  # next_run_at unchanged: the next housekeeping tick retries
                if items:
                    self._mail(account, row, items)
                    db.execute(pg_insert(SavedSearchSeen).values(
                        [{"saved_search_id": row_id, "slug": item["slug"], "seen_at": now} for item in items]
                    ).on_conflict_do_nothing())
                    row.last_sent_at = now
                row.next_run_at = next_slot(now, row.frequency)
                return row_id, 1 if items else 0
        except _SendFailed:
            return row_id, 0  # rolled back: no seen rows, no token change, same next_run_at

    async def run_due(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        done: set = set()
        sent = 0
        for _ in range(DUE_BATCH):
            result = await asyncio.to_thread(self._run_one, now, done)
            if result is None:
                break
            done.add(result[0])
            sent += result[1]
        return sent

    def preview(self, actor: Actor, project_id: UUID, saved_search_id: UUID) -> None:
        try:
            with self.sessions.begin() as db:
                authorize(db, actor, project_id, "write", "saved_search")
                row = self._row(db, project_id, saved_search_id)
                account, _ = self._gates(db, project_id)
                if account is None or account.email_verified_at is None:
                    raise ServiceError("email_unverified")
                rate_limits.hit(db, "digest_preview", str(actor.user_id))
                self._mail(account, row, self.collect(db, row, exclude_seen=False))
        except _SendFailed:
            raise ServiceError("mail_unavailable", retryable=True) from None

    def prune_seen(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        with self.sessions.begin() as db:
            return db.execute(delete(SavedSearchSeen).where(SavedSearchSeen.seen_at < now - SEEN_RETENTION)).rowcount

    async def housekeeping(self) -> int:
        sent = await self.run_due()
        await asyncio.to_thread(self.prune_seen)
        return sent
```

Notes:
- A failed preview rolls back its rate-limit hit, so only successful previews count. With the `MemoryMailer` this is the behaviour the test pins: the 6th successful preview is refused.
- In `_mail`, the token rotation happens before the send. If the send fails, the enclosing transaction rolls the rotation back.

- [ ] **Step 4: Supervisor hook and wiring**

In `workers/supervisor.py`:
- Add the kwarg `digests: Callable[[], Awaitable[int]] | None = None` after `purge_interval`.
- Store it as `self._digests = digests`.
- At the end of `_purge_step`, after the existing `try/except`, add:

```python
        if self._digests is not None:
            try:
                await self._digests()
            except Exception as exc:  # noqa: BLE001 - digests must never stop dispatch
                logger.warning("digests_failed", extra={"error": type(exc).__name__})
```

In `api/dependencies.py` `Services`, add `saved_searches: Any = None` after `mailer`.

In `main.py` `build_services`:
- After `accounts = Accounts(...)`, add `saved_searches = SavedSearches(sessions, mailer, public_origin=owner_sessions.public_origin)` and import `SavedSearches` from `job_search_platform.services.saved_searches`.
- Pass `digests=saved_searches.housekeeping` to `WorkerSupervisor(...)`.
- Add `saved_searches=saved_searches` to the `Services(...)` call.

- [ ] **Step 5: Run the tests**

Run: `uv run --locked pytest tests/integration/test_saved_search_digests.py tests/integration/test_saved_searches_service.py tests/integration/test_account_deletion.py tests/integration/test_application_startup.py -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS, except the one known `test_application_startup` baseline.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform backend/tests/integration/test_saved_search_digests.py
rtk git commit -m "feat(digests): scheduled digest delivery, preview, prune and supervisor hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: REST routes, public unsubscribe and API contract

Model: Sonnet.

**Files:**
- Modify: `backend/src/job_search_platform/api/rest.py`. Add five owner routes; place them after the job-search routes.
- Modify: `backend/src/job_search_platform/api/accounts.py`. Add `POST /digest/unsubscribe` next to `/auth/verify-email`.
- Modify: `docs/contracts/application-api.yaml`
- Modify: `backend/tests/integration/test_rest_api.py`. In the `api_context` fixture, add `saved_searches=SavedSearches(sessions, MemoryMailer(), public_origin=<the fixture's origin>)` to the `Services(...)` it builds.
- Modify: `backend/tests/integration/test_cross_user_isolation.py`. In `world`, create a saved search for Alice and add `"saved_search_id"` to `ids`.
- Test: `backend/tests/integration/test_saved_searches_api.py`

**Interfaces:**
- Consumes (from Tasks 2 and 3): `services.saved_searches.list/create/update/delete/preview/unsubscribe`.
- Produces (all under `/api/v1`):
  - `GET /projects/{project_id}/saved-searches` returns `SavedSearchListView`.
  - `POST /projects/{project_id}/saved-searches` returns 201 `SavedSearchView`.
  - `PATCH /projects/{project_id}/saved-searches/{saved_search_id}` returns `SavedSearchView`.
  - `DELETE /projects/{project_id}/saved-searches/{saved_search_id}` returns 204.
  - `POST /projects/{project_id}/saved-searches/{saved_search_id}/preview` returns 202 `DigestPreviewView`.
  - `POST /digest/unsubscribe` takes `{token}` and returns 204. It is public.

- [ ] **Step 1: Write the failing tests**

```python
"""FR-J05 REST: owner routes, preview, public unsubscribe, grants denied. Synthetic data only."""
from __future__ import annotations

import pytest

from helpers import grant
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

API = "/api/v1/projects"


def _project(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic digests"}, headers=_write_headers(csrf)).json()["id"]
    services = ctx.client.app.state.services
    services.saved_searches.search = lambda **kw: {"items": [{"slug": "a", "title": "Synthetic job", "company": None,
                                                              "cities": [], "age_days": 1, "stale": False,
                                                              "source_url": None}], "total": 1, "limit": 20, "offset": 0}
    return csrf, pid, services


@pytest.mark.integration
def test_owner_crud_preview_and_unsubscribe(api_context):
    client = api_context.client
    csrf, pid, services = _project(api_context)
    base = f"{API}/{pid}/saved-searches"
    created = client.post(base, headers=_write_headers(csrf),
                          json={"name": "Data BKK", "filters": {"q": "data", "cities": ["Bangkok"]}, "frequency": "weekly"})
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    listed = client.get(base).json()
    assert [i["name"] for i in listed["items"]] == ["Data BKK"]
    assert listed["status"] == {"email_verified": True, "notifications_enabled": True}
    patched = client.patch(f"{base}/{sid}", headers=_write_headers(csrf), json={"digest_enabled": False})
    assert patched.status_code == 200 and patched.json()["digest_enabled"] is False
    preview = client.post(f"{base}/{sid}/preview", headers=_write_headers(csrf))
    assert preview.status_code == 202 and preview.json() == {"status": "sent"}
    mail = services.saved_searches.mailer.sent[-1]
    token = mail.text.split("token=")[1].split()[0]
    client.patch(f"{base}/{sid}", headers=_write_headers(csrf), json={"digest_enabled": True})
    client.cookies.clear()
    assert client.post("/api/v1/digest/unsubscribe", json={"token": token}).status_code == 204
    assert client.post("/api/v1/digest/unsubscribe", json={"token": token + "x"}).status_code == 400
    _owner(api_context)
    assert client.get(base).json()["items"][0]["digest_enabled"] is False
    assert client.delete(f"{base}/{sid}", headers=_write_headers(csrf)).status_code == 204
    assert client.get(base).json()["items"] == []


@pytest.mark.integration
def test_validation_and_conflicts(api_context):
    client = api_context.client
    csrf, pid, _ = _project(api_context)
    base = f"{API}/{pid}/saved-searches"
    for body in ({"name": ""}, {"name": "x" * 81}, {"name": "ok", "frequency": "hourly"},
                 {"name": "ok", "filters": {"posted_within_days": 7}}, {"name": "ok", "filters": {"skills": ["Bad Skill"]}}):
        assert client.post(base, headers=_write_headers(csrf), json=body).status_code == 422, body
    assert client.post(base, headers=_write_headers(csrf), json={"name": "Dup"}).status_code == 201
    taken = client.post(base, headers=_write_headers(csrf), json={"name": "Dup"})
    assert taken.status_code == 409 and taken.json()["code"] == "saved_search_name_taken"
    for i in range(9):
        client.post(base, headers=_write_headers(csrf), json={"name": f"S{i}"})
    limit = client.post(base, headers=_write_headers(csrf), json={"name": "Eleventh"})
    assert limit.status_code == 409 and limit.json()["code"] == "saved_search_limit"


@pytest.mark.integration
def test_grant_cannot_reach_saved_searches(api_context):
    client = api_context.client
    csrf, pid, _ = _project(api_context)
    with api_context.sessions.begin() as db:
        _, token = grant(db, pid, capabilities=("results:read", "jobs:search"))
    headers = {"Authorization": f"Bearer {token}"}
    client.cookies.clear()
    assert client.get(f"{API}/{pid}/saved-searches", headers=headers).status_code in {401, 403}
    assert client.post(f"{API}/{pid}/saved-searches", headers=headers, json={"name": "x"}).status_code in {401, 403}
```

Check the `helpers.grant` signature and return value: the brief assumes it accepts the project id and returns `(actor, token)`. If it needs a `UUID` or returns something else, adapt the call and the token extraction, not the assertions.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --locked pytest tests/integration/test_saved_searches_api.py -q`
Expected: FAIL (404/405 on `/saved-searches`).

- [ ] **Step 3: Implement the routes**

In `api/rest.py`, import `SavedSearchCreate, SavedSearchUpdate, SavedSearchView, SavedSearchListView, DigestPreviewView` from contracts, then add:

```python
@router.get("/projects/{project_id}/saved-searches", response_model=SavedSearchListView)
async def list_saved_searches(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    return await asyncio.to_thread(services.saved_searches.list, actor, project_id)


@router.post("/projects/{project_id}/saved-searches", status_code=201, response_model=SavedSearchView)
async def create_saved_search(project_id: UUID, body: SavedSearchCreate, actor=Depends(write_actor),
                              services: Services = Depends(get_services)):
    _owner_only(actor)
    return await asyncio.to_thread(services.saved_searches.create, actor, project_id, body)


@router.patch("/projects/{project_id}/saved-searches/{saved_search_id}", response_model=SavedSearchView)
async def update_saved_search(project_id: UUID, saved_search_id: UUID, body: SavedSearchUpdate,
                              actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    return await asyncio.to_thread(services.saved_searches.update, actor, project_id, saved_search_id, body)


@router.delete("/projects/{project_id}/saved-searches/{saved_search_id}", status_code=204)
async def delete_saved_search(project_id: UUID, saved_search_id: UUID, actor=Depends(write_actor),
                              services: Services = Depends(get_services)):
    _owner_only(actor)
    await asyncio.to_thread(services.saved_searches.delete, actor, project_id, saved_search_id)
    return Response(status_code=204)


@router.post("/projects/{project_id}/saved-searches/{saved_search_id}/preview", status_code=202,
             response_model=DigestPreviewView)
async def preview_saved_search(project_id: UUID, saved_search_id: UUID, actor=Depends(write_actor),
                               services: Services = Depends(get_services)):
    _owner_only(actor)
    await asyncio.to_thread(services.saved_searches.preview, actor, project_id, saved_search_id)
    return {"status": "sent"}
```

Check that `Response` and `asyncio` are imported in `rest.py`; reuse the existing imports.

In `api/accounts.py`, after `verify_email`:

```python
@router.post("/digest/unsubscribe", status_code=204)
async def digest_unsubscribe(body: TokenRequest, request: Request, services: Services = Depends(get_services)):
    await asyncio.to_thread(services.saved_searches.unsubscribe, body.token, _ip(request))
    return Response(status_code=204)
```

- [ ] **Step 4: Contract and isolation sweep**

- `docs/contracts/application-api.yaml`:
  - Add the paths `/projects/{project_id}/saved-searches` (get, post), `/projects/{project_id}/saved-searches/{saved_search_id}` (patch, delete) and `/projects/{project_id}/saved-searches/{saved_search_id}/preview` (post). Use `security: [{ownerSession: []}]` and the style of the neighboring owner routes, with 403/404/409/422 responses where they apply.
  - Add `/digest/unsubscribe` (post, no security, `security: []`), in the same style as `/auth/verify-email`.
  - Add the schemas `SavedSearchFilters`, `SavedSearchCreate`, `SavedSearchUpdate`, `SavedSearchView`, `DigestStatusView`, `SavedSearchListView` and `DigestPreviewView` with the Task 1 fields and limits. Mirror the runtime schema names exactly as `/openapi.json` reports them.
  - `MatchRunRequest` keeps the same properties. Pydantic flattens inheritance, so its schema should not change. Confirm with the contract test.
- `test_cross_user_isolation.py` `world`: after the hidden-job post, add:

```python
    saved = api_context.client.post(f"{BASE}/projects/{project_id}/saved-searches", headers=_write_headers(csrf_alice),
                                    json={"name": "Alice search", "filters": {"q": "python"}})
    assert saved.status_code == 201, saved.text
```

  and add `"saved_search_id": saved.json()["id"]` to `ids`. If the sweep cannot build a valid body for the PATCH route, add an `_OVERRIDES` entry `("PATCH", "/projects/{project_id}/saved-searches/{saved_search_id}"): lambda ids: {"digest_enabled": False}`.

  The `world` fixture replaces `services.accounts`. Make sure `services.saved_searches` exists there too. It comes from `api_context`, which you update in this task.

- [ ] **Step 5: Run the tests**

Run: `uv run --locked pytest tests/integration/test_saved_searches_api.py tests/integration/test_cross_user_isolation.py "tests/integration/test_rest_api.py::test_runtime_openapi_matches_application_contract_paths_methods_and_schemas" tests/integration/test_smart_match_api.py -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend docs/contracts/application-api.yaml
rtk git commit -m "feat(digests): saved-search REST routes, public unsubscribe and contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Saved-searches panel, save dialog and unsubscribe page

Model: Sonnet.

**Files:**
- Create: `frontend/src/features/search/SavedSearches.tsx`
- Create: `frontend/src/features/digest/UnsubscribePage.tsx`
- Modify:
  - `frontend/src/features/search/SearchPage.tsx`. Render the panel after the search/match mode group.
  - `frontend/src/app/router.tsx`. Add the public route `/digest/unsubscribe` next to `/verify-email`.
  - `frontend/src/lib/api.ts`. Add `unsubscribeDigest`.
  - `frontend/src/lib/api-types.ts`. Add the types.
- Test: `tests/e2e/saved-searches.spec.ts`. Add `/digest/unsubscribe` to the `routes` in `tests/e2e/accessibility.spec.ts`.

**Interfaces:**
- Consumes (from Task 4): the REST routes, plus `POST /api/v1/digest/unsubscribe`.
- Produces:
  - `filtersFromParams(params: URLSearchParams): SavedSearchFilters`
  - `paramsFromFilters(f: SavedSearchFilters): Record<string, string>`
  - `SavedSearchesPanel`
  - `DigestUnsubscribePage`

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/saved-searches.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

type Saved = { id: string; name: string; filters: Record<string, unknown>; frequency: 'daily' | 'weekly'; digest_enabled: boolean; next_run_at: string; last_sent_at: string | null; created_at: string };

async function searchWithSaved(page: Page, status = { email_verified: true, notifications_enabled: true }) {
  const items: Saved[] = [];
  const posts: unknown[] = [];
  let previews = 0;
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('/facets') ? { total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 0, thai_postings: 0 } : { items: [], total: 0, limit: 20, offset: 0 }) }));
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split('/saved-searches/')[1]?.split('/')[0];
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, status }) });
    if (request.method() === 'POST' && url.pathname.endsWith('/preview')) { previews += 1; return route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"sent"}' }); }
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); posts.push(body);
      const row: Saved = { id: `00000000-0000-4000-8000-00000000000${items.length}`, name: body.name, filters: body.filters, frequency: body.frequency, digest_enabled: true, next_run_at: '2026-10-15T01:00:00Z', last_sent_at: null, created_at: '2026-10-14T00:00:00Z' };
      items.push(row); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) });
    }
    const row = items.find(item => item.id === id)!;
    if (request.method() === 'PATCH') { Object.assign(row, request.postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) }); }
    items.splice(items.indexOf(row), 1); return route.fulfill({ status: 204, body: '' });
  });
  return { posts, previews: () => previews };
}

test('save, apply, change frequency, toggle email, preview and delete a saved search', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const state = await searchWithSaved(page);
  await page.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote&skills=sql,python`);
  await page.getByRole('button', { name: 'Save this search' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Name').fill('Remote data');
  await page.getByLabel('Weekly').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(state.posts[0]).toEqual({ name: 'Remote data', frequency: 'weekly', filters: { q: 'data', cities: [], work_mode: 'remote', skills: ['sql', 'python'] } });

  await page.goto(`/app/projects/${projectId}/search`);
  await page.getByRole('button', { name: 'Remote data' }).click();
  await expect(page).toHaveURL(/q=data/);
  await expect(page).toHaveURL(/work_mode=remote/);
  await expect(page).toHaveURL(/skills=sql%2Cpython|skills=sql,python/);

  await page.getByLabel('Digest frequency for Remote data').selectOption('daily');
  const email = page.getByRole('button', { name: 'Email digest for Remote data' });
  await expect(email).toHaveAttribute('aria-pressed', 'true');
  await email.click();
  await expect(email).toHaveAttribute('aria-pressed', 'false');
  await email.click();
  await page.getByRole('button', { name: 'Send a preview of Remote data' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preview sent' })).toBeVisible();
  expect(state.previews()).toBe(1);

  await page.getByRole('button', { name: 'Delete Remote data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByRole('button', { name: 'Remote data' })).toHaveCount(0);
});

test('gate banners explain why no digest is sent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await searchWithSaved(page, { email_verified: false, notifications_enabled: true });
  await page.goto(`/app/projects/${projectId}/search`);
  await expect(page.getByText('Verify your email to receive digests')).toBeVisible();
});

test('unsubscribe page: success and expired link', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route('**/api/v1/digest/unsubscribe', async route => {
    const ok = route.request().postDataJSON().token === 'good-token-0000000000000000';
    await route.fulfill(ok ? { status: 204, body: '' } : { status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_token', message_key: 'errors.invalid_token', retryable: false }) });
  });
  await page.goto('/digest/unsubscribe?token=good-token-0000000000000000');
  await page.getByRole('button', { name: 'Stop this digest' }).click();
  await expect(page.getByText('You will no longer get this digest.')).toBeVisible();
  await page.goto('/digest/unsubscribe?token=bad');
  await page.getByRole('button', { name: 'Stop this digest' }).click();
  await expect(page.getByText('This link has expired.')).toBeVisible();
});

test('search with panel and the unsubscribe page fit 320px in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await searchWithSaved(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/search?q=${encodeURIComponent('วิศวกรข้อมูลอาวุโสสำหรับทีมแพลตฟอร์มวิเคราะห์ข้อมูล')}`);
  await page.getByRole('button', { name: 'บันทึกการค้นหานี้' }).click();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'การค้นหาที่บันทึกไว้' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/digest/unsubscribe?token=x');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

If the synthetic fixture mocks the job-search routes differently, keep these route handlers. Playwright runs the most recently registered handler first.

- [ ] **Step 2: Run to verify it fails**

Run (from `tests/`): `rtk npx playwright test e2e/saved-searches.spec.ts`
Expected: FAIL (no "Save this search" button and no `/digest/unsubscribe` route).

- [ ] **Step 3: Types and API**

Add to `lib/api-types.ts`:

```ts
export type DigestFrequency = 'daily' | 'weekly';
export type SavedSearchFilters = { q?: string; cities?: string[]; work_mode?: 'remote' | 'hybrid' | 'onsite' | null; category?: string | null; seniority?: string[]; employment_type?: string[]; company_type?: string[]; skills?: string[]; posting_language?: 'th' | null; salary_min?: number | null };
export type SavedSearchView = { id: string; name: string; filters: SavedSearchFilters; frequency: DigestFrequency; digest_enabled: boolean; next_run_at: string; last_sent_at: string | null; created_at: string };
export type SavedSearchList = { items: SavedSearchView[]; status: { email_verified: boolean; notifications_enabled: boolean } };
```

Add to `lib/api.ts`, next to `verifyEmail`:

```ts
export const unsubscribeDigest = (token: string) => authRequest<void>('/digest/unsubscribe', { token });
```

- [ ] **Step 4: Panel** `frontend/src/features/search/SavedSearches.tsx`

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Mail, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, type DigestFrequency, type SavedSearchFilters, type SavedSearchList, type SavedSearchView } from '../../lib/api-types';
import { selectClass } from '../settings/Field';
import { sendJson, useResource } from '../projects/useResource';
import { splitList } from './AdvancedFilters';

const LIST_KEYS = ['seniority', 'employment_type', 'company_type', 'skills'] as const;

const copy = {
  th: {
    title: 'การค้นหาที่บันทึกไว้', save: 'บันทึกการค้นหานี้', hint: 'ตั้งตัวกรองแล้วกด "บันทึกการค้นหานี้" เพื่อรับสรุปงานใหม่ทางอีเมล',
    saveTitle: 'บันทึกการค้นหา', saveHelp: 'เราจะส่งสรุปงานใหม่ที่ตรงตัวกรองนี้ไปที่อีเมลของคุณ เวลา 08:00 น.',
    name: 'ชื่อ', frequency: 'ความถี่', daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์ (วันจันทร์)', cancel: 'ยกเลิก', confirmSave: 'บันทึก',
    saved: 'บันทึกการค้นหาแล้ว', previewSent: 'ส่งอีเมลตัวอย่างแล้ว', untitled: 'การค้นหาของฉัน',
    next: (d: string) => `สรุปครั้งถัดไป: ${d}`, off: 'ปิดอีเมลสรุปอยู่',
    frequencyFor: (n: string) => `ความถี่ของสรุป ${n}`, emailFor: (n: string) => `อีเมลสรุปของ ${n}`,
    previewFor: (n: string) => `ส่งตัวอย่างของ ${n}`, deleteFor: (n: string) => `ลบ ${n}`,
    deleteTitle: (n: string) => `ลบ “${n}”?`, deleteBody: 'การค้นหานี้และอีเมลสรุปจะถูกลบ', deleteConfirm: 'ลบการค้นหา',
    unverified: 'ยืนยันอีเมลก่อนจึงจะได้รับสรุปงาน', notificationsOff: 'โปรเจกต์นี้ปิดการแจ้งเตือนอยู่ เปิดได้ที่การตั้งค่าโปรเจกต์',
    errors: { saved_search_limit: 'บันทึกได้สูงสุด 10 การค้นหาต่อโปรเจกต์', saved_search_name_taken: 'ชื่อนี้ถูกใช้แล้ว', rate_limited: 'ส่งตัวอย่างบ่อยเกินไป ลองใหม่ภายหลัง', mail_unavailable: 'ส่งอีเมลไม่ได้ในตอนนี้', email_unverified: 'ยืนยันอีเมลก่อนจึงจะส่งตัวอย่างได้' } as Record<string, string>,
    error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง',
  },
  en: {
    title: 'Saved searches', save: 'Save this search', hint: 'Set filters, then press "Save this search" to get new jobs by email.',
    saveTitle: 'Save search', saveHelp: 'We email you new jobs that match these filters at 08:00 (Bangkok time).',
    name: 'Name', frequency: 'Frequency', daily: 'Daily', weekly: 'Weekly', cancel: 'Cancel', confirmSave: 'Save',
    saved: 'Search saved', previewSent: 'Preview sent', untitled: 'My search',
    next: (d: string) => `Next digest: ${d}`, off: 'Email digest is off',
    frequencyFor: (n: string) => `Digest frequency for ${n}`, emailFor: (n: string) => `Email digest for ${n}`,
    previewFor: (n: string) => `Send a preview of ${n}`, deleteFor: (n: string) => `Delete ${n}`,
    deleteTitle: (n: string) => `Delete “${n}”?`, deleteBody: 'This search and its email digest will be removed.', deleteConfirm: 'Delete search',
    unverified: 'Verify your email to receive digests', notificationsOff: 'Notifications are off for this project. Turn them on in project settings.',
    errors: { saved_search_limit: 'You can save up to 10 searches per project.', saved_search_name_taken: 'That name is already used.', rate_limited: 'Too many previews. Try again later.', mail_unavailable: 'Email cannot be sent right now.', email_unverified: 'Verify your email to send a preview.' } as Record<string, string>,
    error: 'Something went wrong. Try again.',
  },
};

export function filtersFromParams(params: URLSearchParams): SavedSearchFilters {
  const f: SavedSearchFilters = { q: params.get('q') ?? '', cities: splitList(params.get('cities') ?? '') };
  const mode = params.get('work_mode');
  if (mode === 'remote' || mode === 'hybrid' || mode === 'onsite') f.work_mode = mode;
  const category = params.get('category');
  if (category) f.category = category;
  for (const key of LIST_KEYS) { const values = splitList(params.get(key) ?? ''); if (values.length) f[key] = values; }
  if (params.get('posting_language') === 'th') f.posting_language = 'th';
  const salary = Number(params.get('salary_min'));
  if (Number.isInteger(salary) && salary > 0) f.salary_min = salary;
  return f;
}

export function paramsFromFilters(f: SavedSearchFilters): Record<string, string> {
  const out: Record<string, string> = {
    q: f.q ?? '', cities: (f.cities ?? []).join(','), work_mode: f.work_mode ?? '', category: f.category ?? '',
    posting_language: f.posting_language ?? '', salary_min: f.salary_min ? String(f.salary_min) : '', posted_within_days: '',
  };
  for (const key of LIST_KEYS) out[key] = (f[key] ?? []).join(',');
  return out;
}

export function SavedSearchesPanel({ projectId, params, filtered, onApply }: {
  projectId: string; params: URLSearchParams; filtered: boolean; onApply: (changes: Record<string, string>) => void;
}) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/projects/${projectId}/saved-searches`;
  const list = useResource<SavedSearchList>(base);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<DigestFrequency>('daily');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<SavedSearchView | null>(null);
  const items = list.data?.items ?? [];
  const status = list.data?.status;
  const when = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  async function run(action: () => Promise<unknown>, ok?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setMessage(null);
    try { await action(); if (ok) setMessage({ ok: true, text: ok }); list.reload(); return true; }
    catch (error) { setMessage({ ok: false, text: (error instanceof ApiError && c.errors[error.code]) || c.error }); return false; }
    finally { setBusy(false); }
  }
  function openSave() {
    setName((params.get('q') || params.get('category') || params.get('cities') || c.untitled).slice(0, 80));
    setFrequency('daily'); setMessage(null); setSaveOpen(true);
  }
  const notice = message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-success' : 'text-destructive'}`}>{message.text}</p>;

  return <section aria-labelledby="saved-searches-title" className="grid min-w-0 gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="saved-searches-title" className="text-base font-semibold">{c.title}</h2>
      <Button variant="outline" disabled={!filtered} onClick={openSave}><Bookmark className="size-4" aria-hidden="true" />{c.save}</Button>
    </div>
    {!filtered && items.length === 0 && <p className="text-sm text-muted-foreground">{c.hint}</p>}
    {status && !status.email_verified && <p role="status" className="text-sm text-warning">{c.unverified}</p>}
    {status && status.email_verified && !status.notifications_enabled && <p role="status" className="text-sm text-warning">{c.notificationsOff}</p>}
    {!saveOpen && notice}
    {items.length > 0 && <ul className="grid gap-2">{items.map(item => <li key={item.id} className="grid min-w-0 gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <button type="button" className="min-h-10 max-w-full break-words text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onApply(paramsFromFilters(item.filters))}>{item.name}</button>
        <p className="text-xs text-muted-foreground">{item.digest_enabled ? c.next(when.format(new Date(item.next_run_at))) : c.off}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={c.frequencyFor(item.name)} className={`${selectClass} w-auto`} value={item.frequency} disabled={busy}
          onChange={event => void run(() => sendJson(`${base}/${item.id}`, 'PATCH', { frequency: event.target.value }))}>
          <option value="daily">{c.daily}</option><option value="weekly">{c.weekly}</option>
        </select>
        <Button variant="outline" size="icon" aria-pressed={item.digest_enabled} aria-label={c.emailFor(item.name)} disabled={busy}
          onClick={() => void run(() => sendJson(`${base}/${item.id}`, 'PATCH', { digest_enabled: !item.digest_enabled }))}><Mail className="size-4" aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-label={c.previewFor(item.name)} disabled={busy}
          onClick={() => void run(() => sendJson(`${base}/${item.id}/preview`, 'POST', {}), c.previewSent)}><Send className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-label={c.deleteFor(item.name)} onClick={() => setDeleting(item)}><Trash2 className="size-4" aria-hidden="true" /></Button>
      </div>
    </li>)}</ul>}
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
      <DialogContent>
        <DialogTitle>{c.saveTitle}</DialogTitle>
        <DialogDescription>{c.saveHelp}</DialogDescription>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault();
          if (!name.trim()) return;
          void run(() => sendJson(base, 'POST', { name: name.trim(), filters: filtersFromParams(params), frequency }), c.saved).then(ok => { if (ok) setSaveOpen(false); });
        }}>
          <div className="grid gap-2"><Label htmlFor="saved-search-name">{c.name}</Label><Input id="saved-search-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} required /></div>
          <fieldset className="grid gap-1"><legend className="mb-1 text-sm font-medium">{c.frequency}</legend>
            {(['daily', 'weekly'] as const).map(value => <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" name="saved-search-frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />{value === 'daily' ? c.daily : c.weekly}
            </label>)}
          </fieldset>
          {saveOpen && message && !message.ok && notice}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">{c.cancel}</Button></DialogClose>
            <Button type="submit" disabled={busy || !name.trim()}>{c.confirmSave}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {deleting && <ConfirmDeleteDialog title={c.deleteTitle(deleting.name)} description={c.deleteBody} confirmLabel={c.deleteConfirm}
      onConfirm={() => apiRequest(`${base}/${deleting.id}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setDeleting(null); list.reload(); }} onClose={() => setDeleting(null)} />}
  </section>;
}
```

The e2e test selects "Weekly" with `getByLabel('Weekly')`, so the English radio label must be exactly `Weekly`. The Thai label carries the "(วันจันทร์)" hint. The e2e test also expects `filters` to omit keys with no value; `filtersFromParams` produces that shape.

- [ ] **Step 5: Wire into SearchPage, the unsubscribe page and the route**

In `SearchPage.tsx`:
- Import `SavedSearchesPanel` from `'./SavedSearches'`.
- Render it right after the closing `</div>` of the `role="group"` mode switch:

```tsx
    <SavedSearchesPanel projectId={projectId} params={params} filtered={filtered} onApply={changes => { setQInput(changes.q ?? ''); setMany(changes); }} />
```

`frontend/src/features/digest/UnsubscribePage.tsx`:

```tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { unsubscribeDigest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

const copy = {
  th: { title: 'หยุดรับอีเมลสรุปงาน', intro: 'กดยืนยันเพื่อหยุดรับอีเมลสรุปของการค้นหานี้', confirm: 'หยุดรับสรุปนี้',
        done: 'คุณจะไม่ได้รับสรุปนี้อีก เปิดใหม่ได้ในแอป', expired: 'ลิงก์นี้หมดอายุแล้ว จัดการอีเมลสรุปได้ในแอป', error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', login: 'เข้าสู่ระบบ' },
  en: { title: 'Stop email digest', intro: 'Confirm to stop the email digest for this saved search.', confirm: 'Stop this digest',
        done: 'You will no longer get this digest. You can turn it back on in the app.', expired: 'This link has expired. Manage digests in the app.', error: 'Something went wrong. Try again.', login: 'Log in' },
};

export function DigestUnsubscribePage() {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'expired' | 'error'>('idle');
  async function confirm() {
    if (!token) { setState('expired'); return; }
    setState('busy');
    try { await unsubscribeDigest(token); setState('done'); }
    catch (error) { setState(error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 422) ? 'expired' : 'error'); }
  }
  return <>
    <Header />
    <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-md px-4 py-12 sm:py-16">
      <Card>
        <CardHeader><h1 className="text-xl font-semibold leading-snug">{c.title}</h1></CardHeader>
        <CardContent className="grid gap-4">
          {state === 'done' ? <p role="status">{c.done}</p> : state === 'expired' ? <>
            <p role="alert">{c.expired}</p>
            <Button asChild variant="outline"><Link to="/login">{c.login}</Link></Button>
          </> : <>
            <p className="text-sm text-muted-foreground">{c.intro}</p>
            {state === 'error' && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
            <Button onClick={() => void confirm()} disabled={state === 'busy'}>{c.confirm}</Button>
          </>}
        </CardContent>
      </Card>
    </main>
  </>;
}
```

The e2e test looks for the text "You will no longer get this digest." and "This link has expired." with `getByText`, which uses substring matching on full text. Make sure they match. If `getByText` needs an exact node, use `{ exact: false }` in the test.

In `app/router.tsx`:
- Import `DigestUnsubscribePage`.
- Add `<Route path="/digest/unsubscribe" element={<DigestUnsubscribePage />} />` next to `/verify-email`.

In `tests/e2e/accessibility.spec.ts`, add `'/digest/unsubscribe?token=x'` to `routes`.

- [ ] **Step 6: Run everything**

Run: `rtk npm run build --prefix frontend && cd tests && rtk npx playwright test`
Expected: build OK; all pass except the one known skip (`actual-backend`). If an existing spec breaks only because of the new panel (for example, a strict locator now matches two "Save" buttons), make its locator exact. Do not loosen anything else.

- [ ] **Step 7: Commit**

```bash
rtk git add frontend tests
rtk git commit -m "feat(digests): saved-searches panel, save dialog and public unsubscribe page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (controller)

From the worktree:
1. `cd backend && uv run --locked pytest -q -m "not integration"`
2. `cd backend && uv run --locked pytest -q -m integration`. Only the two known baselines may fail.
3. `rtk npm run build --prefix frontend && cd tests && rtk npx playwright test`
4. Manual check with Mailpit:
   - Start the app on the test DB with `SMTP_HOST=127.0.0.1 SMTP_PORT=51025 SMTP_STARTTLS=false`.
   - Save a search, press "Send a preview now", and see the email at http://127.0.0.1:58025.
5. Before pushing:
   - `git branch --show-current` prints `feat/saved-search-digests`.
   - After the push, `git rev-parse origin/feat/saved-search-digests` equals the tested HEAD.
   - The PR commit count equals `git rev-list --count origin/develop..HEAD`.
