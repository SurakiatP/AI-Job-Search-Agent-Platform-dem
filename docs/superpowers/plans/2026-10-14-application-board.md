# Application Board (TOR FR-T01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project an application board: eight stages, one recruiter contact per application, and an append-only event ledger. The owner uses it through REST and the web UI; agents use it through two direct skills.

**Architecture:**
- Extend `job_application_statuses` (current stage and contact) and add one append-only table, `application_events`.
- `services/applications.py` holds all board logic: reads, writes, the duplicate-application rule, and the two skill handlers.
- REST routes, approvals and runs call it. The skill registry exposes it to MCP, A2A and REST agent tools.
- The frontend replaces "Saved jobs" with a board page and adds an application panel to the job detail page.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.1, Alembic (raw SQL migrations), PostgreSQL 17, React 19 + Vite + Tailwind 4, Radix dropdown menu (already installed), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-application-board-design.md`

## Global Constraints

- TOR §1: no duplicate application submissions per (user, job); no channel that sends email out of the platform.
- TOR FR-T03: the user sends real email themselves. The UI only offers a `mailto:` link.
- TOR FR-P07: REST, MCP and A2A share one core. Agent tools are direct skills in `services/skills.py`.
- Stages, in this order: `saved, applied, responded, interview, offer, hired, rejected, withdrawn`.
- Agent stage targets: `responded, interview, offer, hired, rejected, withdrawn`. Agents can never set `saved` or `applied`.
- Event kinds: `stage_changed, note, contact_updated, email_logged, applied_via_approval`.
- New capability string: `applications:write`.
- Text limits: note 1–2000 chars; email subject 1–300; contact name and role ≤ 200; contact email ≤ 320.
- Stage labels (th / en):
  - saved บันทึกไว้ / Saved
  - applied สมัครแล้ว / Applied
  - responded ได้รับการตอบกลับ / Responded
  - interview สัมภาษณ์ / Interview
  - offer ได้รับข้อเสนอ / Offer
  - hired ได้งาน / Hired
  - rejected ไม่ผ่าน / Rejected
  - withdrawn ถอนตัว / Withdrawn
- No new dependencies (backend or frontend).
- Frontend follows the last tracked `DESIGN.md` (`git show eb9bace^:DESIGN.md`):
  - indigo accent only, plus semantic colors for status badges
  - shadcn primitives in `frontend/src/components/ui`
  - 40 px minimum targets for new controls
  - nothing overflows at 320 px
  - all copy in Thai and English
- Worktree: `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/board`, branch `feat/application-board`.
  - The worktree has no `node_modules`. Run `rtk npm ci --prefix frontend && rtk npm ci --prefix tests` once before frontend work.
  - Prefix shell commands with `rtk`.
- Backend test commands, run from `backend/`:
  - one test: `uv run --locked pytest <path>::<name> -q`
  - non-integration suite: `uv run --locked pytest -q -m "not integration"`
  - integration tests need the local Postgres and MinIO on 55432 and 59000; they are running.
- Frontend:
  - build: `rtk npm run build --prefix frontend`
  - Playwright (from `tests/`): `rtk npx playwright test <spec>`
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two writers move the same card at once** (two tabs, or an owner and an agent). Each move appends exactly one ordered event and nothing is lost. The status row is locked `FOR UPDATE` before any append. Pinned by `test_status_row_is_locked_during_a_write` (Task 2).
2. **A soft-removed job** (`removed_at` set) disappears from the board. Its detail, stage, contact and event routes return 404. Pinned in Task 2 (`test_removed_or_foreign_job_is_not_found`).
3. **Real-world contact input:** plus-addressed emails (`a+jobs@example.co.th`), Thai names, and clearing the contact back to empty. All are accepted, and an empty contact gives `has_contact: false`. The `mailto:` href stays valid. Pinned in Task 3 (`test_contact_accepts_plus_address_thai_name_and_clearing`) and Task 7 (e2e href check).
4. **Long Thai titles, companies and notes at 320 px** never cause horizontal overflow on the board or the job page. Pinned in Task 6 and Task 7 e2e (`scrollWidth <= innerWidth`).
5. **Applied, then moved back to `saved` or `rejected`:** `apply_submit` is still refused with `already_applied`, and follow-up drafting is still allowed. Pinned in Task 4.

## Plan rulings against the spec

These are recorded here so the reviewers can check them:

1. **Owner routes reuse resource kind `job`, and the skills use their skill ids.** There is no new `application` resource kind. The existing `authorize()` already gives exactly the spec's rules: owner-only for `job`, and the skill's capability for grants (`results:read` for list, `applications:write` for update).
2. **`application_recorded` counts any past stage in applied-onward,** not only `to = "applied"`. An owner who jumps from saved straight to interview, then back to saved, still cannot resubmit. This is stricter than the spec's wording and matches TOR §1.
3. **The overview "applied" count uses the current stage** (`APPLIED_ONWARD`), not `application_recorded`. It is a dashboard number, so a card moved back to saved drops out of it.
4. **Board cards drop the per-card remove menu.** Removal stays on the job page. Each card has one menu, "Move to…".

---

## File structure

| File | Responsibility |
|---|---|
| `backend/migrations/versions/0023_application_board.py` (new) | Widen stages, contact columns, `application_events`, append-only trigger, backfill |
| `backend/src/job_search_platform/db/models.py` | `JobApplicationStatus` contact columns + `ApplicationEvent` |
| `backend/src/job_search_platform/services/contracts.py` | Stage literals, board DTOs, capability |
| `backend/src/job_search_platform/services/applications.py` (new) | All board logic + skill handlers |
| `backend/src/job_search_platform/api/rest.py` | Owner routes; PATCH status delegates to the service |
| `backend/src/job_search_platform/services/runs.py`, `services/approvals.py` | Duplicate guard via `application_recorded`; approval writes `applied_via_approval` |
| `backend/src/job_search_platform/services/skills.py` | `applications_list`, `applications_update` |
| `docs/contracts/application-api.yaml` | New paths and schemas |
| `frontend/src/lib/applicationStages.ts` (new) | Stage order + labels (one source for UI) |
| `frontend/src/features/applications/ApplicationBoard.tsx` (new) | Board columns and the "Move to…" menu |
| `frontend/src/features/applications/ApplicationPanel.tsx` (new) | Job page: stage, contact, mailto, log, note, timeline |
| `frontend/src/features/jobs/JobsPage.tsx` | Board page shell (add-job form + board); detail page uses the panel |
| `tests/e2e/application-board.spec.ts` (new) | Board and panel browser tests |

---

### Task 1: Schema — stages, contact columns, append-only ledger

Model: Haiku, effort max. The plan contains the full code.

**Files:**
- Create: `backend/migrations/versions/0023_application_board.py`
- Modify: `backend/src/job_search_platform/db/models.py` (class `JobApplicationStatus`, add `ApplicationEvent` after it)
- Test: `backend/tests/integration/test_application_board_schema.py`

**Interfaces:**
- Produces:
  - ORM `ApplicationEvent(id, project_id, job_revision_id, kind, actor_scope, payload: dict, created_at)`.
  - `JobApplicationStatus.contact_name/contact_email/contact_role: str | None`.
  - DB error text `append_only_application_event` on UPDATE, or on a DELETE that is not a cascade.

- [ ] **Step 1: Write the failing tests**

```python
"""FR-T01 schema: eight stages, contact columns, append-only application_events. Synthetic data only."""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError

from helpers import owner, project, revisions
from job_search_platform.db.models import ApplicationEvent, JobApplicationStatus, Project, User

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


def _event(db, project_id, job_id, kind="note"):
    event = ApplicationEvent(project_id=project_id, job_revision_id=job_id, kind=kind,
                             actor_scope="user:synthetic", payload={"text": "Synthetic note"})
    db.add(event)
    db.flush()
    return event


@pytest.mark.integration
def test_eight_stages_and_contact_columns(db_session):
    record = project(db_session, owner=owner(db_session))
    _, job = revisions(db_session, record.id)
    db_session.add(JobApplicationStatus(project_id=record.id, job_revision_id=job.id, status="interview",
                                        contact_name="ผู้สรรหา ตัวอย่าง", contact_email="a+jobs@example.co.th",
                                        contact_role="HR"))
    db_session.flush()
    for stage in ("saved", "applied", "responded", "offer", "hired", "rejected", "withdrawn"):
        db_session.execute(update(JobApplicationStatus).values(status=stage))
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            db_session.execute(update(JobApplicationStatus).values(status="ghosted"))


@pytest.mark.integration
def test_events_reject_update_direct_delete_and_unknown_kind(db_session):
    record = project(db_session, owner=owner(db_session))
    _, job = revisions(db_session, record.id)
    event = _event(db_session, record.id, job.id)
    with pytest.raises(DBAPIError, match="append_only_application_event"):
        with db_session.begin_nested():
            db_session.execute(update(ApplicationEvent).where(ApplicationEvent.id == event.id)
                               .values(payload={"text": "edited"}))
    with pytest.raises(DBAPIError, match="append_only_application_event"):
        with db_session.begin_nested():
            db_session.execute(delete(ApplicationEvent).where(ApplicationEvent.id == event.id))
    with pytest.raises(DBAPIError):
        with db_session.begin_nested():
            _event(db_session, record.id, job.id, kind="email_sent")


@pytest.mark.integration
def test_project_and_user_deletion_cascade_events(db_session):
    actor = owner(db_session)
    first = project(db_session, owner=actor)
    _, first_job = revisions(db_session, first.id)
    _event(db_session, first.id, first_job.id)
    db_session.execute(delete(Project).where(Project.id == first.id))
    db_session.flush()
    assert db_session.scalar(select(ApplicationEvent.id).where(ApplicationEvent.project_id == first.id)) is None

    second = project(db_session, owner=actor)
    _, second_job = revisions(db_session, second.id)
    _event(db_session, second.id, second_job.id)
    db_session.execute(delete(User).where(User.id == actor.user_id))
    db_session.flush()
    assert db_session.scalar(select(ApplicationEvent.id).where(ApplicationEvent.project_id == second.id)) is None


@pytest.mark.integration
def test_backfill_gives_existing_applied_rows_one_migration_event(postgres_engine):
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))

    def migrate(target):
        with postgres_engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, target)

    migrate("0022_users")
    project_id, applied_job, saved_job = uuid4(), uuid4(), uuid4()
    with postgres_engine.begin() as c:
        c.execute(text("INSERT INTO projects (id, name) VALUES (:id, 'Synthetic')"), {"id": project_id})
        for job_id, number in ((applied_job, 1), (saved_job, 2)):
            c.execute(text("INSERT INTO job_revisions (id, project_id, revision, title, description) "
                           "VALUES (:id, :p, :n, 'Synthetic', 'Synthetic')"),
                      {"id": job_id, "p": project_id, "n": number})
        c.execute(text("INSERT INTO job_application_statuses (project_id, job_revision_id, status) "
                       "VALUES (:p, :a, 'applied'), (:p, :s, 'saved')"),
                  {"p": project_id, "a": applied_job, "s": saved_job})
    migrate("head")
    with postgres_engine.connect() as c:
        rows = c.execute(text("SELECT job_revision_id, kind, actor_scope, payload FROM application_events")).all()
    assert [tuple(row) for row in rows] == [
        (applied_job, "stage_changed", "migration", {"from": "saved", "to": "applied"})]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/integration/test_application_board_schema.py -q`
Expected: FAIL with `ImportError: cannot import name 'ApplicationEvent'`.

- [ ] **Step 3: Write the migration**

`backend/migrations/versions/0023_application_board.py`:

```python
"""Application board (TOR FR-T01): eight stages, recruiter contact, append-only application events."""

from alembic import op


revision = "0023_application_board"
down_revision = "0022_users"
branch_labels = None
depends_on = None

STAGES = "'saved','applied','responded','interview','offer','hired','rejected','withdrawn'"
KINDS = "'stage_changed','note','contact_updated','email_logged','applied_via_approval'"


def upgrade() -> None:
    op.execute("ALTER TABLE job_application_statuses DROP CONSTRAINT ck_job_application_status_value")
    op.execute("ALTER TABLE job_application_statuses ADD CONSTRAINT ck_job_application_status_value "
               f"CHECK (status IN ({STAGES}))")
    op.execute("ALTER TABLE job_application_statuses ADD COLUMN contact_name varchar(200), "
               "ADD COLUMN contact_email varchar(320), ADD COLUMN contact_role varchar(200)")
    op.execute(f"""CREATE TABLE application_events (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL,
        job_revision_id uuid NOT NULL,
        kind varchar(32) NOT NULL,
        actor_scope varchar(80) NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_application_events_job FOREIGN KEY (project_id, job_revision_id)
            REFERENCES job_revisions (project_id, id) ON DELETE CASCADE,
        CONSTRAINT ck_application_events_kind CHECK (kind IN ({KINDS})))""")
    op.execute("CREATE INDEX ix_application_events_job ON application_events (project_id, job_revision_id, created_at)")
    op.execute("""CREATE FUNCTION reject_application_event_mutation() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND NOT EXISTS (
                SELECT 1 FROM job_revisions WHERE project_id = OLD.project_id AND id = OLD.job_revision_id) THEN
                RETURN OLD;  -- FK cascade from a deleted job revision, project or account
            END IF;
            RAISE EXCEPTION 'append_only_application_event' USING ERRCODE = 'check_violation';
        END; $$ LANGUAGE plpgsql""")
    op.execute("CREATE TRIGGER application_events_append_only BEFORE UPDATE OR DELETE ON application_events "
               "FOR EACH ROW EXECUTE FUNCTION reject_application_event_mutation()")
    op.execute("""INSERT INTO application_events (id, project_id, job_revision_id, kind, actor_scope, payload, created_at)
        SELECT gen_random_uuid(), project_id, job_revision_id, 'stage_changed', 'migration',
               '{"from": "saved", "to": "applied"}'::jsonb, updated_at
        FROM job_application_statuses WHERE status = 'applied'""")


def downgrade() -> None:
    op.execute("DROP TABLE application_events")
    op.execute("DROP FUNCTION reject_application_event_mutation()")
    op.execute("ALTER TABLE job_application_statuses DROP COLUMN contact_name, DROP COLUMN contact_email, "
               "DROP COLUMN contact_role")
    op.execute("UPDATE job_application_statuses SET status = 'applied' "
               "WHERE status IN ('responded','interview','offer','hired')")
    op.execute("UPDATE job_application_statuses SET status = 'saved' WHERE status IN ('rejected','withdrawn')")
    op.execute("ALTER TABLE job_application_statuses DROP CONSTRAINT ck_job_application_status_value")
    op.execute("ALTER TABLE job_application_statuses ADD CONSTRAINT ck_job_application_status_value "
               "CHECK (status IN ('saved','applied'))")
```

- [ ] **Step 4: Update the models**

In `db/models.py`, replace the body of `JobApplicationStatus` and add `ApplicationEvent` directly after it:

```python
APPLICATION_STAGES = ("saved", "applied", "responded", "interview", "offer", "hired", "rejected", "withdrawn")
APPLICATION_EVENT_KINDS = ("stage_changed", "note", "contact_updated", "email_logged", "applied_via_approval")


def _in(values: tuple[str, ...]) -> str:
    return ",".join(f"'{value}'" for value in values)


class JobApplicationStatus(Base):
    """Mutable owner status and recruiter contact, kept separate from immutable job and run revisions."""
    __tablename__ = "job_application_statuses"
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    job_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_role: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"], ondelete="CASCADE"),
        CheckConstraint(f"status IN ({_in(APPLICATION_STAGES)})", name="ck_job_application_status_value"),
    )


class ApplicationEvent(Base):
    """Append-only FR-T01 ledger. A trigger rejects UPDATE and any DELETE that is not an FK cascade."""
    __tablename__ = "application_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    job_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"],
                             ondelete="CASCADE", name="fk_application_events_job"),
        CheckConstraint(f"kind IN ({_in(APPLICATION_EVENT_KINDS)})", name="ck_application_events_kind"),
        Index("ix_application_events_job", "project_id", "job_revision_id", "created_at"),
    )
```

- [ ] **Step 5: Run the new tests and the migration round-trip**

Run: `uv run --locked pytest tests/integration/test_application_board_schema.py tests/integration/test_schema.py tests/integration/test_job_application_status.py -q`
Expected: all PASS.

If `test_project_and_user_deletion_cascade_events` fails with `append_only_application_event`, the cascade's trigger still sees the parent row. Change the trigger to `BEFORE UPDATE` only, matching the `runs_snapshot_immutable` precedent in `0001_project_schema.py`. Delete the direct-DELETE assertion from the second test and record the change in the report. Do not weaken anything else.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/migrations/versions/0023_application_board.py backend/src/job_search_platform/db/models.py backend/tests/integration/test_application_board_schema.py
rtk git commit -m "feat(board): application stages, contact columns and append-only event ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core service and contracts

Model: Sonnet.

**Files:**
- Create: `backend/src/job_search_platform/services/applications.py`
- Modify: `backend/src/job_search_platform/services/contracts.py`
  - `Capability` (line 12)
  - `JobRevisionView.application_status`
  - `JobApplicationStatusUpdate`
  - `JobApplicationStatusView`
  - new DTOs placed before `class ToolDescriptor`
- Test: `backend/tests/integration/test_applications_service.py`

**Interfaces:**
- Consumes (Task 1): `ApplicationEvent`, `JobApplicationStatus` with contact columns.
- Produces (all sync functions take an open SQLAlchemy `Session`; the caller has already authorized the project):
  - `applications.STAGES: tuple[str, ...]`, `APPLIED_ONWARD: frozenset[str]`, `AGENT_TARGETS: frozenset[str]`
  - `application_recorded(db, project_id: UUID, job_id: UUID) -> bool`
  - `board(db, project_id) -> list[ApplicationCardView]`
  - `detail(db, project_id, job_id) -> ApplicationDetailView`
  - `set_stage(db, actor: Actor, project_id, job_id, stage: str) -> JobApplicationStatus`
  - `set_contact(db, actor, project_id, job_id, contact: ApplicationContact) -> None`
  - `add_event(db, actor, project_id, job_id, entry: ApplicationNote | ApplicationEmailLog) -> ApplicationEvent`
  - `event_view(event: ApplicationEvent) -> ApplicationEventView`
  - `record_applied_via_approval(db, project_id, job_id, scope: str, approval_id: UUID, pack_run_id: UUID) -> None`
  - async `applications_list(services, actor, request, project_id=None) -> dict` and `applications_update(...)`. These are written here and registered as skills in Task 5.
- DTOs: `ApplicationStage`, `AgentApplicationStage`, `ApplicationContact`, `ApplicationNote`, `ApplicationEmailLog`, `ApplicationEntry`, `ApplicationEventView`, `ApplicationCardView`, `ApplicationDetailView`, `ApplicationsListInput`, `ApplicationsListResult`, `ApplicationsUpdateInput`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/integration/test_applications_service.py`:

```python
"""FR-T01 core service: stages, ledger, contact, agent rules, duplicate rule, locking. Synthetic data only."""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from psycopg.errors import LockNotAvailable
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from helpers import grant, owner, project, revisions
from job_search_platform.db.models import JobApplicationStatus, JobRevision
from job_search_platform.services import applications
from job_search_platform.services.contracts import ApplicationContact, ApplicationEmailLog, ApplicationNote
from job_search_platform.services.errors import ServiceError


def _setup(db):
    actor = owner(db)
    record = project(db, owner=actor)
    _, job = revisions(db, record.id)
    return actor, record, job


def _code(call) -> str:
    with pytest.raises(ServiceError) as caught:
        call()
    return caught.value.code


@pytest.mark.integration
def test_stage_moves_append_one_event_each_and_same_stage_is_noop(db_session):
    actor, record, job = _setup(db_session)
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, actor, record.id, job.id, "interview")
    detail = applications.detail(db_session, record.id, job.id)
    assert detail.stage == "interview"
    assert [(e.kind, e.actor, e.payload) for e in detail.events] == [
        ("stage_changed", "user", {"from": "applied", "to": "interview"}),
        ("stage_changed", "user", {"from": "saved", "to": "applied"}),
    ]


@pytest.mark.integration
def test_board_lists_every_live_job_in_order_with_default_saved(db_session):
    actor, record, job = _setup(db_session)
    other = JobRevision(project_id=record.id, revision=2, title="Synthetic Analyst", description="Synthetic")
    removed = JobRevision(project_id=record.id, revision=3, title="Removed", description="Synthetic",
                          removed_at=datetime.now(timezone.utc))
    db_session.add_all([other, removed])
    db_session.flush()
    applications.set_contact(db_session, actor, record.id, job.id,
                             ApplicationContact(name="Synthetic Recruiter", email="r@example.test"))
    cards = applications.board(db_session, record.id)
    assert [(c.title, c.stage, c.has_contact) for c in cards] == [
        ("Synthetic Engineer", "saved", True), ("Synthetic Analyst", "saved", False)]
    assert cards[0].last_activity_at >= cards[0].created_at
    assert cards[1].last_activity_at == cards[1].created_at


@pytest.mark.integration
def test_contact_and_entries_are_logged_once(db_session):
    actor, record, job = _setup(db_session)
    contact = ApplicationContact(name="Synthetic Recruiter", email="r@example.test", role="HR")
    applications.set_contact(db_session, actor, record.id, job.id, contact)
    applications.set_contact(db_session, actor, record.id, job.id, contact)
    applications.add_event(db_session, actor, record.id, job.id, ApplicationEmailLog(
        kind="email_logged", direction="received", subject="Interview invite", occurred_on=date(2026, 10, 14)))
    applications.add_event(db_session, actor, record.id, job.id, ApplicationNote(kind="note", text="Prepare portfolio"))
    detail = applications.detail(db_session, record.id, job.id)
    assert detail.contact == contact
    assert [e.kind for e in detail.events] == ["note", "email_logged", "contact_updated"]
    assert detail.events[1].payload == {"direction": "received", "subject": "Interview invite",
                                        "occurred_on": "2026-10-14", "note": None}


@pytest.mark.integration
def test_agent_rules(db_session):
    actor, record, job = _setup(db_session)
    agent, _ = grant(db_session, record.id, capabilities=("applications:write",))
    assert _code(lambda: applications.set_stage(db_session, agent, record.id, job.id, "interview")) == "application_not_applied"
    for stage in ("saved", "applied"):
        assert _code(lambda: applications.set_stage(db_session, agent, record.id, job.id, stage)) == "forbidden"
    applications.set_stage(db_session, actor, record.id, job.id, "applied")
    applications.set_stage(db_session, agent, record.id, job.id, "interview")
    assert _code(lambda: applications.set_contact(
        db_session, agent, record.id, job.id, ApplicationContact(name="X"))) == "forbidden"
    assert _code(lambda: applications.add_event(db_session, agent, record.id, job.id, ApplicationEmailLog(
        kind="email_logged", direction="sent", subject="Hi", occurred_on=date(2026, 10, 14)))) == "forbidden"
    applications.add_event(db_session, agent, record.id, job.id, ApplicationNote(kind="note", text="Recruiter replied"))
    events = applications.detail(db_session, record.id, job.id).events
    assert [(e.kind, e.actor) for e in events[:2]] == [("note", "agent"), ("stage_changed", "agent")]


@pytest.mark.integration
def test_application_recorded_survives_moving_back(db_session):
    actor, record, job = _setup(db_session)
    assert applications.application_recorded(db_session, record.id, job.id) is False
    applications.set_stage(db_session, actor, record.id, job.id, "interview")
    applications.set_stage(db_session, actor, record.id, job.id, "saved")
    assert applications.application_recorded(db_session, record.id, job.id) is True
    applications.set_stage(db_session, actor, record.id, job.id, "rejected")
    assert applications.application_recorded(db_session, record.id, job.id) is True


@pytest.mark.integration
def test_removed_or_foreign_job_is_not_found(db_session):
    actor, record, job = _setup(db_session)
    other = project(db_session, "Synthetic other", owner=actor)
    _, foreign = revisions(db_session, other.id)
    removed = JobRevision(project_id=record.id, revision=2, title="Removed", description="Synthetic",
                          removed_at=datetime.now(timezone.utc))
    db_session.add(removed)
    db_session.flush()
    for job_id in (foreign.id, removed.id):
        assert _code(lambda: applications.detail(db_session, record.id, job_id)) == "not_found"
        assert _code(lambda: applications.set_stage(db_session, actor, record.id, job_id, "applied")) == "not_found"
        assert _code(lambda: applications.set_contact(
            db_session, actor, record.id, job_id, ApplicationContact())) == "not_found"
        assert _code(lambda: applications.add_event(
            db_session, actor, record.id, job_id, ApplicationNote(kind="note", text="x"))) == "not_found"


@pytest.mark.integration
def test_status_row_is_locked_during_a_write(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions.begin() as db:
        actor, record, job = _setup(db)
    with sessions.begin() as first:
        applications.set_stage(first, actor, record.id, job.id, "applied")
        with sessions() as second:
            second.execute(text("SET lock_timeout = '200ms'"))
            with pytest.raises(OperationalError) as caught:
                second.execute(select(JobApplicationStatus).where(
                    JobApplicationStatus.project_id == record.id).with_for_update())
            assert isinstance(caught.value.orig, LockNotAvailable)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/integration/test_applications_service.py -q`
Expected: FAIL with `ImportError` (no `applications` module or DTOs).

- [ ] **Step 3: Add the DTOs to `services/contracts.py`**

- Line 12: append `"applications:write"` to the `Capability` Literal.
- Change the three `Literal["saved", "applied"]` annotations (in `JobRevisionView`, `JobApplicationStatusUpdate` and `JobApplicationStatusView`) to `ApplicationStage`.
- Add, before `class ToolDescriptor` (`date`, `datetime`, `Any`, `Field`, `model_validator` and `StringConstraints` imports may need adding; check the module's imports):

```python
ApplicationStage = Literal["saved", "applied", "responded", "interview", "offer", "hired", "rejected", "withdrawn"]
AgentApplicationStage = Literal["responded", "interview", "offer", "hired", "rejected", "withdrawn"]
_Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
_Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ApplicationContact(DTO):
    """One recruiter per application; every field may be cleared with null."""
    name: _Short | None = None
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=320,
                                            pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")] | None = None
    role: _Short | None = None


class ApplicationNote(DTO):
    kind: Literal["note"]
    text: _Note


class ApplicationEmailLog(DTO):
    """The owner's record of correspondence they sent or received themselves; nothing is sent."""
    kind: Literal["email_logged"]
    direction: Literal["sent", "received"]
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    occurred_on: date
    note: _Note | None = None


ApplicationEntry = Annotated[ApplicationNote | ApplicationEmailLog, Field(discriminator="kind")]


class ApplicationEventView(DTO):
    id: UUID
    kind: Literal["stage_changed", "note", "contact_updated", "email_logged", "applied_via_approval"]
    actor: Literal["user", "agent", "system"]
    payload: dict[str, Any]
    created_at: datetime


class ApplicationCardView(DTO):
    job_revision_id: UUID
    title: str
    company: str | None = None
    created_at: datetime
    stage: ApplicationStage
    has_contact: bool
    last_activity_at: datetime


class ApplicationDetailView(DTO):
    job_revision_id: UUID
    title: str
    company: str | None = None
    stage: ApplicationStage
    contact: ApplicationContact
    events: tuple[ApplicationEventView, ...] = ()


class ApplicationsListInput(DTO):
    """Direct applications_list input: no job_id reads the whole board, a job_id reads one application."""
    job_id: UUID | None = None


class ApplicationsListResult(DTO):
    applications: tuple[ApplicationCardView, ...] = ()
    application: ApplicationDetailView | None = None


class ApplicationsUpdateInput(DTO):
    """Direct applications_update input: an agent stage move and/or a note on one application."""
    job_id: UUID
    stage: AgentApplicationStage | None = None
    note: _Note | None = None

    @model_validator(mode="after")
    def validate_intent(self):
        if self.stage is None and self.note is None:
            raise ValueError("stage_or_note_required")
        return self
```

- [ ] **Step 4: Write `services/applications.py`**

```python
"""FR-T01 application board: stage, recruiter contact and the append-only event ledger.

Owner REST routes, approvals, runs and the applications_list / applications_update direct skills all go
through this module. Sync functions take an open Session whose project the caller already authorized.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from job_search_platform.db.models import ApplicationEvent, JobApplicationStatus, JobRevision
from job_search_platform.services.agent_jobs import _project
from job_search_platform.services.contracts import (
    Actor, ApplicationCardView, ApplicationContact, ApplicationDetailView, ApplicationEmailLog,
    ApplicationEventView, ApplicationNote, ApplicationsListInput, ApplicationsListResult, ApplicationsUpdateInput,
)
from job_search_platform.services.errors import ServiceError

STAGES = ("saved", "applied", "responded", "interview", "offer", "hired", "rejected", "withdrawn")
APPLIED_ONWARD = frozenset({"applied", "responded", "interview", "offer", "hired"})
AGENT_TARGETS = frozenset({"responded", "interview", "offer", "hired", "rejected", "withdrawn"})
DETAIL_EVENTS = 200


def _scope(actor: Actor) -> str:
    from job_search_platform.services.runs import actor_scope  # runs imports this module
    return actor_scope(actor)


def _authorize(db, actor, project_id, action, skill_id):
    from job_search_platform.services.authorization import authorize  # authorization imports the registry that imports us
    authorize(db, actor, project_id, action, skill_id)


def _live_job(db: Session, project_id: UUID, job_id: UUID) -> JobRevision:
    job = db.scalar(select(JobRevision).where(JobRevision.project_id == project_id, JobRevision.id == job_id,
                                              JobRevision.removed_at.is_(None)))
    if job is None:
        raise ServiceError("not_found")
    return job


def _lock_status(db: Session, project_id: UUID, job_id: UUID) -> JobApplicationStatus:
    """Create the row if missing, then lock it so concurrent writers serialize and ledger order is stable."""
    db.execute(pg_insert(JobApplicationStatus).values(project_id=project_id, job_revision_id=job_id, status="saved")
               .on_conflict_do_nothing(index_elements=["project_id", "job_revision_id"]))
    return db.scalar(select(JobApplicationStatus).where(
        JobApplicationStatus.project_id == project_id, JobApplicationStatus.job_revision_id == job_id,
    ).with_for_update().execution_options(populate_existing=True))


def _append(db: Session, project_id: UUID, job_id: UUID, scope: str, kind: str, payload: dict) -> ApplicationEvent:
    event = ApplicationEvent(project_id=project_id, job_revision_id=job_id, kind=kind, actor_scope=scope,
                             payload=payload, created_at=datetime.now(timezone.utc))
    db.add(event)
    db.flush()
    return event


def application_recorded(db: Session, project_id: UUID, job_id: UUID) -> bool:
    """True once this job reached applied or later, even if moved back: TOR forbids a second submission."""
    current = db.scalar(select(JobApplicationStatus.status).where(
        JobApplicationStatus.project_id == project_id, JobApplicationStatus.job_revision_id == job_id))
    if current in APPLIED_ONWARD:
        return True
    return bool(db.scalar(select(exists().where(
        ApplicationEvent.project_id == project_id, ApplicationEvent.job_revision_id == job_id,
        or_(ApplicationEvent.kind == "applied_via_approval",
            (ApplicationEvent.kind == "stage_changed")
            & ApplicationEvent.payload["to"].as_string().in_(APPLIED_ONWARD))))))


def event_view(event: ApplicationEvent) -> ApplicationEventView:
    scope = event.actor_scope
    actor = "user" if scope.startswith("user:") else "agent" if scope.startswith("grant:") else "system"
    return ApplicationEventView(id=event.id, kind=event.kind, actor=actor, payload=event.payload,
                                created_at=event.created_at)


def board(db: Session, project_id: UUID) -> list[ApplicationCardView]:
    last = (select(ApplicationEvent.job_revision_id, func.max(ApplicationEvent.created_at).label("at"))
            .where(ApplicationEvent.project_id == project_id)
            .group_by(ApplicationEvent.job_revision_id).subquery())
    rows = db.execute(
        select(JobRevision, JobApplicationStatus, last.c.at)
        .outerjoin(JobApplicationStatus, (JobApplicationStatus.project_id == JobRevision.project_id)
                   & (JobApplicationStatus.job_revision_id == JobRevision.id))
        .outerjoin(last, last.c.job_revision_id == JobRevision.id)
        .where(JobRevision.project_id == project_id, JobRevision.removed_at.is_(None))
        .order_by(JobRevision.created_at, JobRevision.revision)
    ).all()
    return [ApplicationCardView(
        job_revision_id=job.id, title=job.title, company=job.company, created_at=job.created_at,
        stage=status.status if status else "saved",
        has_contact=bool(status and (status.contact_name or status.contact_email)),
        last_activity_at=at or job.created_at,
    ) for job, status, at in rows]


def detail(db: Session, project_id: UUID, job_id: UUID) -> ApplicationDetailView:
    job = _live_job(db, project_id, job_id)
    status = db.scalar(select(JobApplicationStatus).where(
        JobApplicationStatus.project_id == project_id, JobApplicationStatus.job_revision_id == job_id))
    events = db.scalars(select(ApplicationEvent).where(
        ApplicationEvent.project_id == project_id, ApplicationEvent.job_revision_id == job_id,
    ).order_by(ApplicationEvent.created_at.desc(), ApplicationEvent.id.desc()).limit(DETAIL_EVENTS)).all()
    contact = ApplicationContact(name=status.contact_name, email=status.contact_email,
                                 role=status.contact_role) if status else ApplicationContact()
    return ApplicationDetailView(job_revision_id=job.id, title=job.title, company=job.company,
                                 stage=status.status if status else "saved", contact=contact,
                                 events=tuple(event_view(event) for event in events))


def set_stage(db: Session, actor: Actor, project_id: UUID, job_id: UUID, stage: str) -> JobApplicationStatus:
    if stage not in STAGES:
        raise ServiceError("forbidden")
    _live_job(db, project_id, job_id)
    row = _lock_status(db, project_id, job_id)
    if actor.kind == "grant":
        if stage not in AGENT_TARGETS:
            raise ServiceError("forbidden")  # applied needs the owner's approval; saved is the owner's call
        if not application_recorded(db, project_id, job_id):
            raise ServiceError("application_not_applied")
    if row.status != stage:
        _append(db, project_id, job_id, _scope(actor), "stage_changed", {"from": row.status, "to": stage})
        row.status = stage
    return row


def set_contact(db: Session, actor: Actor, project_id: UUID, job_id: UUID, contact: ApplicationContact) -> None:
    if actor.kind != "user":
        raise ServiceError("forbidden")
    _live_job(db, project_id, job_id)
    row = _lock_status(db, project_id, job_id)
    values = (contact.name, contact.email, contact.role)
    if (row.contact_name, row.contact_email, row.contact_role) != values:
        row.contact_name, row.contact_email, row.contact_role = values
        _append(db, project_id, job_id, _scope(actor), "contact_updated", contact.model_dump(mode="json"))


def add_event(db: Session, actor: Actor, project_id: UUID, job_id: UUID,
              entry: ApplicationNote | ApplicationEmailLog) -> ApplicationEvent:
    if entry.kind != "note" and actor.kind != "user":
        raise ServiceError("forbidden")
    _live_job(db, project_id, job_id)
    _lock_status(db, project_id, job_id)  # one writer at a time keeps the ledger ordered
    return _append(db, project_id, job_id, _scope(actor), entry.kind, entry.model_dump(mode="json", exclude={"kind"}))


def record_applied_via_approval(db: Session, project_id: UUID, job_id: UUID, scope: str,
                                approval_id: UUID, pack_run_id: UUID) -> None:
    row = _lock_status(db, project_id, job_id)
    _append(db, project_id, job_id, scope, "applied_via_approval",
            {"from": row.status, "approval_id": str(approval_id), "pack_run_id": str(pack_run_id)})
    row.status = "applied"


async def applications_list(services, actor: Actor, request: ApplicationsListInput,
                            project_id: UUID | None = None) -> dict:
    project = _project(actor, project_id)

    def run() -> ApplicationsListResult:
        with services.sessions() as db:
            _authorize(db, actor, project, "read", "applications_list")
            if request.job_id is None:
                return ApplicationsListResult(applications=tuple(board(db, project)))
            return ApplicationsListResult(application=detail(db, project, request.job_id))

    return (await asyncio.to_thread(run)).model_dump(mode="json")


async def applications_update(services, actor: Actor, request: ApplicationsUpdateInput,
                              project_id: UUID | None = None) -> dict:
    project = _project(actor, project_id)

    def run() -> ApplicationDetailView:
        with services.sessions.begin() as db:
            _authorize(db, actor, project, "write", "applications_update")
            if request.stage is not None:
                set_stage(db, actor, project, request.job_id, request.stage)
            if request.note is not None:
                add_event(db, actor, project, request.job_id, ApplicationNote(kind="note", text=request.note))
            return detail(db, project, request.job_id)

    return (await asyncio.to_thread(run)).model_dump(mode="json")
```

If `ApplicationEvent.payload["to"].as_string()` does not render `->>` on the generic `JSON` column, use `ApplicationEvent.payload.op("->>")("to")`.

- [ ] **Step 5: Run the tests**

Run: `uv run --locked pytest tests/integration/test_applications_service.py tests/integration/test_job_application_status.py -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS.

Before `applications:write` existed, some unit tests enumerated `Capability`. If one fails only because the list grew, update its expected list to include `"applications:write"` at the end.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/services/applications.py backend/src/job_search_platform/services/contracts.py backend/tests/integration/test_applications_service.py
rtk git commit -m "feat(board): application service, stage rules and board contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Owner REST routes and API contract

Model: Sonnet.

**Files:**
- Modify: `backend/src/job_search_platform/api/rest.py`
  - the PATCH `update_job_application_status` route at about line 673
  - add the four routes directly after it
- Modify: `docs/contracts/application-api.yaml` (paths and `components.schemas`)
- Test: `backend/tests/integration/test_application_board_api.py`

**Interfaces:**
- Consumes (Task 2): `applications.board/detail/set_stage/set_contact/add_event/event_view` and the DTOs.
- Produces (all under `/api/v1`, owner-session only):
  - `GET /projects/{project_id}/applications` returns `list[ApplicationCardView]`
  - `GET /projects/{project_id}/jobs/{job_id}/application` returns `ApplicationDetailView`
  - `PUT /projects/{project_id}/jobs/{job_id}/application/contact` takes an `ApplicationContact` body and returns `ApplicationDetailView`
  - `POST /projects/{project_id}/jobs/{job_id}/application/events` takes an `ApplicationEntry` body and returns `ApplicationEventView` with 201
  - `PATCH .../application-status` now accepts all eight stages and appends ledger events

- [ ] **Step 1: Write the failing tests**

`backend/tests/integration/test_application_board_api.py`:

```python
"""FR-T01 owner REST routes. Synthetic data only."""
from __future__ import annotations

import pytest

from helpers import login_cookie, user
from test_rest_api import _owner, _write_headers, api_context  # noqa: F401

API = "/api/v1/projects"


def _board(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic board"}, headers=_write_headers(csrf)).json()["id"]
    job = ctx.client.post(f"{API}/{pid}/jobs", json={"title": "วิศวกรข้อมูล อาวุโส", "description": "Synthetic"},
                          headers=_write_headers(csrf)).json()["id"]
    return csrf, pid, job


@pytest.mark.integration
def test_owner_board_flow(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    assert client.get(f"{API}/{pid}/applications").json()[0]["stage"] == "saved"
    moved = client.patch(f"{base}/application-status", json={"application_status": "interview"},
                         headers=_write_headers(csrf))
    assert moved.status_code == 200 and moved.json()["application_status"] == "interview"
    contact = client.put(f"{base}/application/contact",
                         json={"name": "Synthetic Recruiter", "email": "recruiter@example.test", "role": "HR"},
                         headers=_write_headers(csrf))
    assert contact.status_code == 200 and contact.json()["contact"]["email"] == "recruiter@example.test"
    logged = client.post(f"{base}/application/events", headers=_write_headers(csrf), json={
        "kind": "email_logged", "direction": "received", "subject": "Interview invite", "occurred_on": "2026-10-14"})
    assert logged.status_code == 201 and logged.json()["actor"] == "user"
    assert client.post(f"{base}/application/events", headers=_write_headers(csrf),
                       json={"kind": "note", "text": "Prepare portfolio"}).status_code == 201
    detail = client.get(f"{base}/application").json()
    assert [e["kind"] for e in detail["events"]] == ["note", "email_logged", "contact_updated", "stage_changed"]
    card = client.get(f"{API}/{pid}/applications").json()[0]
    assert card["stage"] == "interview" and card["has_contact"] is True
    assert client.get(f"{API}/{pid}/jobs").json()[0]["application_status"] == "interview"
    assert client.get(f"{base}/application-status").json()["application_status"] == "interview"


@pytest.mark.integration
def test_contact_accepts_plus_address_thai_name_and_clearing(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    path = f"{API}/{pid}/jobs/{job}/application/contact"
    saved = client.put(path, json={"name": "สมหญิง ใจดี", "email": "a+jobs@example.co.th", "role": None},
                       headers=_write_headers(csrf))
    assert saved.status_code == 200 and saved.json()["contact"]["name"] == "สมหญิง ใจดี"
    cleared = client.put(path, json={"name": None, "email": None, "role": None}, headers=_write_headers(csrf))
    assert cleared.json()["contact"] == {"name": None, "email": None, "role": None}
    assert client.get(f"{API}/{pid}/applications").json()[0]["has_contact"] is False


@pytest.mark.integration
def test_validation_errors(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    bad = [
        ("put", f"{base}/application/contact", {"email": "not-an-email"}),
        ("post", f"{base}/application/events", {"kind": "note", "text": "   "}),
        ("post", f"{base}/application/events", {"kind": "note", "text": "x" * 2001}),
        ("post", f"{base}/application/events", {"kind": "stage_changed", "text": "x"}),
        ("post", f"{base}/application/events", {"kind": "email_logged", "direction": "sideways",
                                                "subject": "x", "occurred_on": "2026-10-14"}),
        ("patch", f"{base}/application-status", {"application_status": "ghosted"}),
    ]
    for method, path, body in bad:
        response = client.request(method.upper(), path, json=body, headers=_write_headers(csrf))
        assert response.status_code == 422, (path, body, response.text)


@pytest.mark.integration
def test_other_user_cannot_reach_owner_routes(api_context):
    client = api_context.client
    csrf, pid, job = _board(api_context)
    base = f"{API}/{pid}/jobs/{job}"
    services = client.app.state.services
    with api_context.sessions.begin() as db:
        stranger = user(db).user_id
    cookie, stranger_csrf = login_cookie(services, stranger)
    client.cookies.set("jsp_owner_session", cookie)
    assert client.get(f"{API}/{pid}/applications").status_code == 404
    assert client.get(f"{base}/application").status_code == 404
    assert client.put(f"{base}/application/contact", json={"name": "x"},
                      headers=_write_headers(stranger_csrf)).status_code == 404
    assert client.post(f"{base}/application/events", json={"kind": "note", "text": "x"},
                       headers=_write_headers(stranger_csrf)).status_code == 404
```

Grant-token REST tests are in Task 5, through the skill routes. Owner routes depend on `owner_actor` and `write_actor`, which never accept bearer tokens; `test_job_application_status.py` already asserts that.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/integration/test_application_board_api.py -q`
Expected: FAIL (404 or 405 on `/applications`).

- [ ] **Step 3: Implement the routes in `api/rest.py`**

- Import `applications` from `job_search_platform.services`.
- Import the DTOs `ApplicationCardView`, `ApplicationContact`, `ApplicationDetailView`, `ApplicationEntry`, `ApplicationEventView` from contracts.
- Replace the body of `update_job_application_status` with:

```python
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        row = applications.set_stage(db, actor, project_id, job_id, body.application_status)
        return {"job_revision_id": job_id, "application_status": row.status}
```

Then add these routes directly after it:

```python
@router.get("/projects/{project_id}/applications", response_model=list[ApplicationCardView])
async def list_applications(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
        return applications.board(db, project_id)


@router.get("/projects/{project_id}/jobs/{job_id}/application", response_model=ApplicationDetailView)
async def get_application(project_id: UUID, job_id: UUID, actor=Depends(owner_actor),
                          services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "job")
        return applications.detail(db, project_id, job_id)


@router.put("/projects/{project_id}/jobs/{job_id}/application/contact", response_model=ApplicationDetailView)
async def set_application_contact(project_id: UUID, job_id: UUID, body: ApplicationContact,
                                  actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        applications.set_contact(db, actor, project_id, job_id, body)
        return applications.detail(db, project_id, job_id)


@router.post("/projects/{project_id}/jobs/{job_id}/application/events", status_code=201,
             response_model=ApplicationEventView)
async def add_application_event(project_id: UUID, job_id: UUID, body: ApplicationEntry,
                                actor=Depends(write_actor), services: Services = Depends(get_services)):
    _owner_only(actor)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "job")
        return applications.event_view(applications.add_event(db, actor, project_id, job_id, body))
```

If `pg_insert` or `func` become unused in `rest.py`, leave them unless the linter fails.

- [ ] **Step 4: Update `docs/contracts/application-api.yaml`**

`test_runtime_openapi_matches_application_contract_paths_methods_and_schemas` compares the path and method set and the schema-name set. Make these changes:

1. Under `paths:`, next to the existing `/projects/{project_id}/jobs/{job_id}/application-status` entry, add the following entries (same style as that entry):

```yaml
  /projects/{project_id}/applications:
    parameters: [{$ref: '#/components/parameters/project_id'}]
    get:
      tags: [jobs]
      description: Owner-only application board (TOR FR-T01). Every live job with its stage, contact flag and last activity.
      security: [{ownerSession: []}]
      responses:
        '200': {description: Board cards, content: {application/json: {schema: {type: array, items: {$ref: '#/components/schemas/ApplicationCardView'}}}}}
  /projects/{project_id}/jobs/{job_id}/application:
    parameters:
      - {$ref: '#/components/parameters/project_id'}
      - {name: job_id, in: path, required: true, schema: {type: string, format: uuid}}
    get:
      tags: [jobs]
      description: Owner-only application detail with recruiter contact and the newest 200 ledger events.
      security: [{ownerSession: []}]
      responses:
        '200': {description: Application detail, content: {application/json: {schema: {$ref: '#/components/schemas/ApplicationDetailView'}}}}
        '404': {$ref: '#/components/responses/NotFound'}
  /projects/{project_id}/jobs/{job_id}/application/contact:
    parameters:
      - {$ref: '#/components/parameters/project_id'}
      - {name: job_id, in: path, required: true, schema: {type: string, format: uuid}}
    put:
      tags: [jobs]
      description: Owner-only recruiter contact. Null clears a field. Appends a contact_updated event when it changes.
      security: [{ownerSession: []}]
      requestBody:
        required: true
        content: {application/json: {schema: {$ref: '#/components/schemas/ApplicationContact'}}}
      responses:
        '200': {description: Application detail, content: {application/json: {schema: {$ref: '#/components/schemas/ApplicationDetailView'}}}}
        '403': {$ref: '#/components/responses/Forbidden'}
        '404': {$ref: '#/components/responses/NotFound'}
  /projects/{project_id}/jobs/{job_id}/application/events:
    parameters:
      - {$ref: '#/components/parameters/project_id'}
      - {name: job_id, in: path, required: true, schema: {type: string, format: uuid}}
    post:
      tags: [jobs]
      description: >-
        Owner-only ledger entry: a note, or a record of email the owner sent or received themselves.
        Nothing is sent by the platform.
      security: [{ownerSession: []}]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              oneOf: [{$ref: '#/components/schemas/ApplicationNote'}, {$ref: '#/components/schemas/ApplicationEmailLog'}]
              discriminator: {propertyName: kind}
      responses:
        '201': {description: Appended event, content: {application/json: {schema: {$ref: '#/components/schemas/ApplicationEventView'}}}}
        '403': {$ref: '#/components/responses/Forbidden'}
        '404': {$ref: '#/components/responses/NotFound'}
```

2. Change the `patch` description of `application-status` to: `Owner-only stage update (eight stages). Appends a stage_changed ledger event and does not submit an application.`
3. Widen `JobApplicationStatusView.application_status`, `JobApplicationStatusUpdate.application_status` and `JobRevisionView.application_status` to `enum: [saved, applied, responded, interview, offer, hired, rejected, withdrawn]`.
4. Under `components.schemas`, add these schemas: `ApplicationContact`, `ApplicationNote`, `ApplicationEmailLog`, `ApplicationEventView`, `ApplicationCardView`, `ApplicationDetailView`. Write each one with the same fields, types and limits as the Task 2 DTO, with `additionalProperties: false` and a `required` list for the fields that have no default.
5. Run the contract test. If the runtime reports schema names that differ from the six above (for example `ApplicationContact-Input` and `ApplicationContact-Output`), mirror the runtime names exactly.

- [ ] **Step 5: Run the tests**

Run: `uv run --locked pytest tests/integration/test_application_board_api.py tests/integration/test_job_application_status.py "tests/integration/test_rest_api.py::test_runtime_openapi_matches_application_contract_paths_methods_and_schemas" -q`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/api/rest.py docs/contracts/application-api.yaml backend/tests/integration/test_application_board_api.py
rtk git commit -m "feat(board): owner REST routes for board, detail, contact and ledger entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Duplicate-application guard and approval ledger event

Model: Sonnet.

**Files:**
- Modify: `backend/src/job_search_platform/services/runs.py` (`_application_checks`, about line 505)
- Modify: `backend/src/job_search_platform/services/approvals.py`
  - the `submit_application` check, about line 444
  - `_finish_submission`, about line 280
- Test: `backend/tests/integration/test_agent_applications.py` (append two tests)

**Interfaces:**
- Consumes (Task 2): `applications.application_recorded(db, project_id, job_id) -> bool` and `applications.record_applied_via_approval(db, project_id, job_id, scope, approval_id, pack_run_id)`.
- Produces: `apply_submit` stays refused with `already_applied` once an application is recorded at any later stage. Follow-up is allowed at any recorded stage. Approval writes `applied_via_approval`.

- [ ] **Step 1: Write the failing tests** (append to `test_agent_applications.py`)

```python
@pytest.mark.integration
def test_moving_back_never_reopens_submission_and_ledger_records_the_approval(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, pack_id = _ready_pack(ctx)
    submit_id = _post(ctx, csrf, pid, session, "apply_submit", "s1").json()["id"]
    _execute_next(ctx, runtime)
    (approval,) = _approvals(ctx, pid)
    assert _decide(ctx, csrf, pid, approval["id"], "approve").status_code == 200
    job = session["job_revision_id"]
    events = ctx.client.get(f"{PREFIX}/{pid}/jobs/{job}/application").json()["events"]
    assert [(e["kind"], e["payload"]) for e in events] == [
        ("applied_via_approval", {"from": "saved", "approval_id": approval["id"], "pack_run_id": pack_id})]
    for stage in ("saved", "rejected"):
        ctx.client.patch(f"{PREFIX}/{pid}/jobs/{job}/application-status",
                         headers=_write_headers(csrf), json={"application_status": stage})
        assert _status(ctx, pid, session) == stage
        again = _post(ctx, csrf, pid, session, "apply_submit", f"again-{stage}")
        assert again.status_code == 409 and again.json()["code"] == "already_applied"
    assert _post(ctx, csrf, pid, session, "draft_follow_up", "f-after-reject").status_code == 202
    assert _run(ctx, submit_id).status == "completed"


@pytest.mark.integration
def test_follow_up_is_allowed_at_any_recorded_stage(api_context):
    ctx = api_context
    csrf, pid, session, facts, runtime, _ = _ready_pack(ctx)
    path = f"{PREFIX}/{pid}/jobs/{session['job_revision_id']}/application-status"
    assert ctx.client.patch(path, headers=_write_headers(csrf), json={"application_status": "interview"}).status_code == 200
    assert _post(ctx, csrf, pid, session, "draft_follow_up", "f-interview").status_code == 202
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/integration/test_agent_applications.py -k "moving_back or any_recorded_stage" -q`
Expected:
- The first test fails: there is no `applied_via_approval` event yet, and after moving back to `saved` the submit is accepted.
- The second test fails: follow-up is refused at `interview`.

- [ ] **Step 3: Implement**

In `services/runs.py`:
- Add `from job_search_platform.services.applications import application_recorded`.
- In `_application_checks`, replace the `applied = (db.scalar(...) == "applied")` expression with:

```python
        applied = application_recorded(db, project_id, job.id)
```

In `services/approvals.py`:
- Add `from job_search_platform.services.applications import application_recorded, record_applied_via_approval`.
- In the `submit_application` branch, replace the `if db.scalar(select(JobApplicationStatus.status)...) == "applied":` check with:

```python
            if application_recorded(db, project_id, pack.job_revision_id):
                raise ServiceError("already_applied")
```

- In `_finish_submission`, replace the five lines from `row = db.get(JobApplicationStatus, ...)` through `row.status = "applied"` with:

```python
        record_applied_via_approval(db, run.project_id, job_id, run.actor_scope, approval.id, approval.target_run_id)
```

Remove `JobApplicationStatus` from the approvals import list if it is no longer used. Do the same in runs.

- [ ] **Step 4: Run the tests**

Run: `uv run --locked pytest tests/integration/test_agent_applications.py tests/integration/test_submit_autopilot.py tests/integration/test_approvals.py tests/integration/test_durable_runs.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/runs.py backend/src/job_search_platform/services/approvals.py backend/tests/integration/test_agent_applications.py
rtk git commit -m "fix(board): a recorded application blocks resubmission at any stage; approval writes the ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Agent skills applications_list and applications_update

Model: Sonnet.

**Files:**
- Modify: `backend/src/job_search_platform/services/skills.py`. Append two `Skill` entries at the end of `SKILLS`, and import `applications` plus the DTOs.
- Modify: `backend/src/job_search_platform/services/contracts.py`. In `ToolDescriptor.name`, add `"applications_list", "applications_update"` after `"jobs_fit"`.
- Modify: `docs/contracts/application-api.yaml`. Add two paths and three schemas.
- Modify these skill-list assertions:
  - `backend/tests/unit/test_skills.py`
  - `backend/tests/integration/test_a2a.py`
  - any other test the suite shows enumerating skills
- Test: `backend/tests/integration/test_application_skills.py`

**Interfaces:**
- Consumes (Task 2): the `applications.applications_list` and `applications.applications_update` handlers, and the DTOs `ApplicationsListInput`, `ApplicationsListResult`, `ApplicationsUpdateInput`, `ApplicationDetailView`.
- Produces:
  - MCP tools `applications_list` and `applications_update`.
  - A2A skills with the same ids.
  - REST `POST /api/v1/projects/{project_id}/agent/applications/list` and `.../agent/applications/update`. Both are generated by the existing loop in `api/rest.py`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/integration/test_application_skills.py`:

```python
"""applications_list / applications_update direct skills across REST and MCP. Synthetic data only."""
from __future__ import annotations

import asyncio
from uuid import UUID

import pytest
from mcp.shared.exceptions import MCPError

from test_agent_tools_direct import _as_grant, _grant, api_context  # noqa: F401
from test_a2a import _start_a2a, _stop_a2a
from test_mcp import _session
from test_rest_api import _owner, _write_headers

API = "/api/v1/projects"


def _setup(ctx):
    csrf = _owner(ctx)
    pid = ctx.client.post(API, json={"name": "Synthetic agent board"}, headers=_write_headers(csrf)).json()["id"]
    job = ctx.client.post(f"{API}/{pid}/jobs", json={"title": "Synthetic Engineer", "description": "Synthetic"},
                          headers=_write_headers(csrf)).json()["id"]
    return csrf, UUID(pid), job


@pytest.mark.integration
def test_rest_agent_board_rules(api_context):
    client = api_context.client
    csrf, pid, job = _setup(api_context)
    reader = _grant(api_context, pid, csrf, ["results:read"])
    writer = _grant(api_context, pid, csrf, ["applications:write"])
    list_url, update_url = f"{API}/{pid}/agent/applications/list", f"{API}/{pid}/agent/applications/update"

    listed = _as_grant(client, "POST", list_url, reader, json={})
    assert listed.status_code == 200 and listed.json()["applications"][0]["stage"] == "saved"
    one = _as_grant(client, "POST", list_url, reader, json={"job_id": job}).json()["application"]
    assert one["job_revision_id"] == job and one["events"] == []
    assert _as_grant(client, "POST", list_url, writer, json={}).status_code == 403
    assert _as_grant(client, "POST", update_url, reader, json={"job_id": job, "note": "x"}).status_code == 403

    early = _as_grant(client, "POST", update_url, writer, json={"job_id": job, "stage": "interview"})
    assert early.status_code == 409 and early.json()["code"] == "application_not_applied"
    for body in ({"job_id": job, "stage": "applied"}, {"job_id": job, "stage": "saved"}, {"job_id": job}):
        assert _as_grant(client, "POST", update_url, writer, json=body).status_code == 422

    client.patch(f"{API}/{pid}/jobs/{job}/application-status", headers=_write_headers(csrf),
                 json={"application_status": "applied"})
    moved = _as_grant(client, "POST", update_url, writer,
                      json={"job_id": job, "stage": "interview", "note": "Recruiter booked a call"})
    assert moved.status_code == 200 and moved.json()["stage"] == "interview"
    assert [(e["kind"], e["actor"]) for e in moved.json()["events"][:2]] == [("note", "agent"), ("stage_changed", "agent")]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_board_tools(api_context, unused_tcp_port):
    csrf, pid, job = await asyncio.to_thread(_setup, api_context)
    full = await asyncio.to_thread(_grant, api_context, pid, csrf, ["results:read", "applications:write"])
    reader = await asyncio.to_thread(_grant, api_context, pid, csrf, ["results:read"])
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        async with _session(f"{base_url}/mcp/", full) as session:
            await session.initialize()
            board = await session.call_tool("applications_list", {"request": {}})
            assert not board.is_error and board.structured_content["applications"][0]["stage"] == "saved"
            noted = await session.call_tool("applications_update", {"request": {"job_id": job, "note": "Synthetic"}})
            assert not noted.is_error and noted.structured_content["events"][0]["kind"] == "note"
        async with _session(f"{base_url}/mcp/", reader) as session:
            await session.initialize()
            with pytest.raises(MCPError, match="forbidden"):
                await session.call_tool("applications_update", {"request": {"job_id": job, "note": "x"}})
    finally:
        await _stop_a2a(server, server_task)
```

Check the `_stop_a2a` signature in `test_a2a.py` and match how `test_agent_tools_direct.py::test_mcp_and_a2a_direct_calls` calls it in its `finally:` block.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --locked pytest tests/integration/test_application_skills.py -q`
Expected: FAIL (404 on `/agent/applications/list`).

- [ ] **Step 3: Register the skills** (append to `SKILLS` in `services/skills.py`)

```python
    Skill(
        id="applications_list",
        name="Application board",
        description=(
            "Read this Project's application board: every saved job with its stage (saved, applied, responded, "
            "interview, offer, hired, rejected, withdrawn), or one application's recruiter contact and event "
            "ledger when job_id is given. Read-only; creates no Task."
        ),
        capability="results:read",
        tags=("applications", "tracking"),
        examples=("Which of my applications are at the interview stage?",),
        input_model=ApplicationsListInput,
        kind="direct",
        handler=applications.applications_list,
        output_model=ApplicationsListResult,
    ),
    Skill(
        id="applications_update",
        name="Update application",
        description=(
            "Move an application that was already applied for to responded, interview, offer, hired, rejected or "
            "withdrawn, and/or add a note to its ledger. Cannot mark a job applied (that needs the owner's "
            "approval) or edit the recruiter contact. Creates no Task."
        ),
        capability="applications:write",
        tags=("applications", "tracking"),
        examples=("Move my Example Co application to interview",),
        input_model=ApplicationsUpdateInput,
        kind="direct",
        handler=applications.applications_update,
        output_model=ApplicationDetailView,
    ),
```

If importing `applications` from `skills.py` creates an import cycle, follow the existing `agent_jobs` pattern. The module-level imports in `applications.py` are models, contracts, errors and `agent_jobs`; `authorization` and `runs` are imported lazily inside functions. Keep it that way.

- [ ] **Step 4: Update the contract and the skill-list assertions**

- `docs/contracts/application-api.yaml`:
  - Add `/projects/{project_id}/agent/applications/list` and `/projects/{project_id}/agent/applications/update` (`post`, `security: [{ownerSession: []}, {projectGrant: []}]`), in the style of `/projects/{project_id}/agent/jobs/fit`. Use the descriptions "Direct agent call (skill applications_list, capability results:read; owner session also allowed)…" and "(skill applications_update, capability applications:write)…".
  - Add the schemas `ApplicationsListInput`, `ApplicationsListResult` and `ApplicationsUpdateInput`.
- `backend/tests/unit/test_skills.py`, `test_tool_descriptor_name_is_one_flat_enum`. The expected enum becomes `["evaluate_job", "draft_documents", "tailor_cv", "apply_prepare", "apply_submit", "draft_follow_up", "jobs_search", "jobs_fit", "applications_list", "applications_update", "get_run", "cancel_run", "list_results"]`.
- `backend/tests/integration/test_a2a.py`:
  - Public card list (about line 183): append `"applications_list", "applications_update"`.
  - Read grant (about line 585): replace `assert cards["read"].get("skills", []) == []` with `assert [skill["id"] for skill in cards["read"]["skills"]] == ["applications_list"]`.
  - Full grant (about line 586): expected `["evaluate_job", "draft_documents", "jobs_fit", "draft_follow_up", "applications_list"]`.
- Then run the full non-integration suite and `tests/integration/test_mcp.py tests/integration/test_a2a.py tests/integration/test_surface_parity.py tests/integration/test_agent_tools_direct.py tests/integration/test_protocol_run_intake.py`. Any other assertion that enumerates skills or tools gets the two new ids, in registry order, only where the asserted grant holds the capability. Change nothing else.

- [ ] **Step 5: Run the tests**

Run: `uv run --locked pytest tests/integration/test_application_skills.py tests/integration/test_mcp.py tests/integration/test_a2a.py tests/integration/test_surface_parity.py tests/integration/test_agent_tools_direct.py "tests/integration/test_rest_api.py::test_runtime_openapi_matches_application_contract_paths_methods_and_schemas" -q && uv run --locked pytest -q -m "not integration"`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/services/skills.py backend/src/job_search_platform/services/contracts.py docs/contracts/application-api.yaml backend/tests
rtk git commit -m "feat(board): applications_list and applications_update agent skills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Board page, navigation and capability UI

Model: Sonnet.

**Files:**
- Create: `frontend/src/lib/applicationStages.ts`
- Create: `frontend/src/features/applications/ApplicationBoard.tsx`
- Modify:
  - `frontend/src/lib/api-types.ts`
  - `frontend/src/components/StatusBadge.tsx`
  - `frontend/src/features/jobs/JobsPage.tsx` (the `JobsPage` component only)
  - `frontend/src/app/router.tsx`
  - `frontend/src/components/ProjectSidebar.tsx`
  - `frontend/src/features/overview/OverviewPage.tsx`
  - `frontend/src/features/chat/ApplyCard.tsx`
  - `frontend/src/features/settings/ProjectSharing.tsx`
  - `frontend/src/features/console/AgentsTab.tsx`
  - `frontend/src/features/console/copy.ts`
  - `frontend/src/locales/common.th.json`, `common.en.json`, `settings.th.json`, `settings.en.json`
- Test:
  - `tests/fixtures/application.ts`
  - `tests/e2e/application-board.spec.ts` (new)
  - existing e2e specs that reference "Saved jobs" or the `/jobs` list

**Interfaces:**
- Consumes (Task 3): `GET /projects/{id}/applications` and `PATCH .../application-status`.
- Produces:
  - `ApplicationStage`, `ApplicationCardView`, `ApplicationDetailView`, `ApplicationEventView` and `ApplicationContact` TS types.
  - `STAGES`, `ACTIVE_STAGES`, `CLOSED_STAGES`, `APPLIED_ONWARD` and `stageLabel` from `lib/applicationStages.ts`. Task 7 uses these.
  - Route `/app/projects/:projectId/applications`.

- [ ] **Step 1: Write the failing e2e test**

Add to the data map in `tests/fixtures/application.ts`, next to the existing `/jobs` entries:

```ts
      [`/projects/${secondProjectId}/applications`]: [],
      [`/projects/${projectId}/applications`]: options.missingJob ? [] : [{ job_revision_id: jobId, title: job.title, company: job.company, created_at: job.created_at, stage: 'saved', has_contact: false, last_activity_at: job.created_at }],
      [`/projects/${projectId}/jobs/${jobId}/application`]: { job_revision_id: jobId, title: job.title, company: job.company, stage: 'saved', contact: { name: null, email: null, role: null }, events: [] },
```

Create `tests/e2e/application-board.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from '../fixtures/application';

const longTitle = 'ตำแหน่งวิศวกรข้อมูลอาวุโสสำหรับทีมแพลตฟอร์มวิเคราะห์ข้อมูลขนาดใหญ่ระดับภูมิภาคเอเชียตะวันออกเฉียงใต้';

async function boardWithState(page: import('@playwright/test').Page) {
  let stage = 'saved';
  let failNext = true;
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/applications`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ job_revision_id: jobId, title: longTitle, company: 'บริษัท ตัวอย่าง จำกัด (มหาชน)', created_at: '2026-10-01T00:00:00Z', stage, has_contact: true, last_activity_at: '2026-10-02T00:00:00Z' }]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    if (failNext) { failNext = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return; }
    stage = route.request().postDataJSON().application_status;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: jobId, application_status: stage }) });
  });
}

test('board shows stage columns and moves a card by keyboard, surviving an error and a reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await boardWithState(page);
  await page.goto(`/app/projects/${projectId}/jobs`);
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/applications$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
  for (const name of ['Saved', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })).toBeVisible();
  }
  const saved = page.getByRole('region', { name: /^Saved/ });
  await expect(saved.getByRole('link', { name: longTitle })).toBeVisible();

  const menu = page.getByRole('button', { name: `Move to: ${longTitle}` });
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Applied' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Applied' }).click();
  await expect(page.getByRole('region', { name: /^Applied/ }).getByRole('link', { name: longTitle })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: /^Applied/ }).getByRole('link', { name: longTitle })).toBeVisible();

  await page.getByRole('button', { name: `Move to: ${longTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Rejected' }).click();
  const closed = page.getByText(/^Closed \(1\)$/);
  await expect(closed).toBeVisible();
  await closed.click();
  await expect(page.getByRole('link', { name: longTitle })).toBeVisible();
});

test('board fits 320px in Thai with long titles', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await boardWithState(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/applications`);
  await expect(page.getByRole('heading', { level: 1, name: 'ใบสมัคร' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^บันทึกไว้/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `tests/`): `rtk npx playwright test e2e/application-board.spec.ts`
Expected: FAIL, because `/applications` does not exist and there is no `Applications` heading.

- [ ] **Step 3: Types, stages and badge**

In `frontend/src/lib/api-types.ts`:
- Widen both `application_status` types (lines 82 and 84) to `ApplicationStage`.
- Add:

```ts
export type ApplicationStage = 'saved' | 'applied' | 'responded' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';
export type ApplicationContact = { name: string | null; email: string | null; role: string | null };
export type ApplicationEventView = { id: string; kind: 'stage_changed' | 'note' | 'contact_updated' | 'email_logged' | 'applied_via_approval'; actor: 'user' | 'agent' | 'system'; payload: Record<string, unknown>; created_at: string };
export type ApplicationCardView = { job_revision_id: string; title: string; company: string | null; created_at: string; stage: ApplicationStage; has_contact: boolean; last_activity_at: string };
export type ApplicationDetailView = { job_revision_id: string; title: string; company: string | null; stage: ApplicationStage; contact: ApplicationContact; events: ApplicationEventView[] };
```

Create `frontend/src/lib/applicationStages.ts`:

```ts
import type { ApplicationStage } from './api-types';

export const ACTIVE_STAGES: ApplicationStage[] = ['saved', 'applied', 'responded', 'interview', 'offer', 'hired'];
export const CLOSED_STAGES: ApplicationStage[] = ['rejected', 'withdrawn'];
export const STAGES: ApplicationStage[] = [...ACTIVE_STAGES, ...CLOSED_STAGES];
export const APPLIED_ONWARD = new Set<ApplicationStage>(['applied', 'responded', 'interview', 'offer', 'hired']);

export const stageLabel: Record<ApplicationStage, { th: string; en: string }> = {
  saved: { th: 'บันทึกไว้', en: 'Saved' },
  applied: { th: 'สมัครแล้ว', en: 'Applied' },
  responded: { th: 'ได้รับการตอบกลับ', en: 'Responded' },
  interview: { th: 'สัมภาษณ์', en: 'Interview' },
  offer: { th: 'ได้รับข้อเสนอ', en: 'Offer' },
  hired: { th: 'ได้งาน', en: 'Hired' },
  rejected: { th: 'ไม่ผ่าน', en: 'Rejected' },
  withdrawn: { th: 'ถอนตัว', en: 'Withdrawn' },
};
```

In `components/StatusBadge.tsx`:
- Change `type Status = RunStatus | ApplicationStage`.
- Build the application entries from `stageLabel`. Delete the inline `saved` and `applied` entries and spread `...applicationConfig` into `config`:

```ts
const stageVariant: Record<ApplicationStage, Variant> = {
  saved: 'secondary', applied: 'success', responded: 'default', interview: 'default',
  offer: 'success', hired: 'success', rejected: 'danger', withdrawn: 'secondary',
};
const applicationConfig = Object.fromEntries(
  (Object.keys(stageLabel) as ApplicationStage[]).map(stage => [stage, { variant: stageVariant[stage], ...stageLabel[stage] }]),
) as Record<ApplicationStage, { variant: Variant; th: string; en: string }>;
```

- [ ] **Step 4: Board component**

Create `frontend/src/features/applications/ApplicationBoard.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ItemMenu } from '@/components/ItemMenu';
import type { ApplicationCardView, ApplicationStage } from '../../lib/api-types';
import { ACTIVE_STAGES, CLOSED_STAGES, STAGES, stageLabel } from '../../lib/applicationStages';
import { sendJson } from '../projects/useResource';

const copy = {
  th: { move: 'ย้ายไป', closed: 'ปิดแล้ว', contact: 'มีข้อมูลผู้ติดต่อ', saved: (d: number) => (d === 0 ? 'บันทึกวันนี้' : `บันทึกเมื่อ ${d} วันก่อน`), error: 'ย้ายใบสมัครไม่สำเร็จ ลองอีกครั้ง', empty: 'ว่าง' },
  en: { move: 'Move to', closed: 'Closed', contact: 'Has a recruiter contact', saved: (d: number) => (d === 0 ? 'Saved today' : `Saved ${d} days ago`), error: 'Could not move the application. Try again.', empty: 'Empty' },
};

export function ApplicationBoard({ projectId, cards, onChanged }: { projectId: string; cards: ApplicationCardView[]; onChanged: () => void }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/app/projects/${projectId}`;
  const [error, setError] = useState(false);

  async function move(card: ApplicationCardView, stage: ApplicationStage) {
    setError(false);
    try {
      await sendJson(`/projects/${projectId}/jobs/${card.job_revision_id}/application-status`, 'PATCH', { application_status: stage });
      onChanged();
    } catch { setError(true); }
  }

  const item = (card: ApplicationCardView) => {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(card.created_at)) / 86_400_000));
    return <Card key={card.job_revision_id}><CardContent className="grid gap-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-medium leading-snug"><Link className="hover:underline" to={`${base}/jobs/${card.job_revision_id}`}>{card.title}</Link></h3>
          {card.company && <p className="break-words text-sm text-muted-foreground">{card.company}</p>}
        </div>
        <ItemMenu label={`${c.move}: ${card.title}`} actions={STAGES.filter(stage => stage !== card.stage).map(stage => ({
          label: stageLabel[stage][locale], icon: <ArrowRight className="size-4" aria-hidden="true" />, onSelect: () => void move(card, stage),
        }))} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{c.saved(days)}{card.has_contact && <Mail className="size-3.5" role="img" aria-label={c.contact} />}</p>
    </CardContent></Card>;
  };

  const closed = cards.filter(card => CLOSED_STAGES.includes(card.stage));
  return <div className="grid min-w-0 gap-4">
    {error && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
    <div className="grid min-w-0 gap-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:overflow-x-auto md:pb-2">
      {ACTIVE_STAGES.map(stage => {
        const inStage = cards.filter(card => card.stage === stage);
        return <section key={stage} aria-labelledby={`stage-${stage}`} className="grid min-w-0 content-start gap-3 rounded-lg bg-muted/40 p-3">
          <h2 id={`stage-${stage}`} className="flex items-center justify-between gap-2 text-sm font-semibold">{stageLabel[stage][locale]}<span className="font-normal text-muted-foreground">{inStage.length}</span></h2>
          {inStage.length ? inStage.map(item) : <p className="text-xs text-muted-foreground">{c.empty}</p>}
        </section>;
      })}
    </div>
    <details className="rounded-lg border p-3">
      <summary className="min-h-10 cursor-pointer content-center text-sm font-semibold">{c.closed} ({closed.length})</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{closed.map(item)}</div>
    </details>
  </div>;
}
```

- [ ] **Step 5: Page shell, route, sidebar and links**

In `features/jobs/JobsPage.tsx`, inside `JobsPage`:
- Replace `useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`)` with `useResource<ApplicationCardView[]>(`/projects/${projectId}/applications`)`.
- Remove the `runs` resource and `evaluations`, which are only used by the old grid.
- Keep the header and the add-job form unchanged.
- Replace the old `<div className="grid gap-4 md:grid-cols-2">…</div>` card grid with `{jobs.length > 0 && <ApplicationBoard projectId={projectId} cards={jobs} onChanged={result.reload} />}`.
- Change the empty state to add a search link: `<Link className="text-sm text-primary hover:underline" to={`${base}/search`}>{c.findJobs}</Link>`, with copy `findJobs: 'ค้นหางาน'` / `'Find jobs'`.
- Remove imports that are now unused (`FitScore`, `latestEvaluations` if only the grid used them, `JobRemoveMenu` stays because the detail page uses it).

In `app/router.tsx`:
- Replace `<Route path="jobs" element={<JobsPage />} />` with `<Route path="applications" element={<JobsPage />} /><Route path="jobs" element={<Navigate to="../applications" replace />} />`.
- Import `Navigate` from `react-router` if it is not already imported.
- Keep `jobs/:jobId`.

In `components/ProjectSidebar.tsx`, change the entry `['jobs', Bookmark, t('nav.savedJobs')]` to `['applications', Kanban, t('nav.savedJobs')]`. Import `Kanban` from `lucide-react` and drop `Bookmark` if it is unused.

Point every in-app link to the job list (`${base}/jobs` not followed by `/`) at `${base}/applications`:
- `OverviewPage.tsx`: lines 84, 98, 100 and 108.
- `JobsPage.tsx`, `JobDetailPage`: the `PageBack` and the `navigate` after removal.
- Find any others with `grep -rn '/jobs`' frontend/src | grep -v 'jobs/\${'`.

API fetches of `/projects/${projectId}/jobs` stay unchanged.

In `OverviewPage.tsx`, the applied count becomes `jobList.filter(j => APPLIED_ONWARD.has(j.application_status ?? 'saved')).length`.

In `ApplyCard.tsx` line 40, replace `=== 'applied'` with `APPLIED_ONWARD.has(... ?? 'saved')`.

Locales:
- `common.th.json`: `nav.savedJobs` and `pages.jobsTitle` become `"ใบสมัคร"`.
- `common.en.json`: both become `"Applications"`.
- `settings.th.json` / `settings.en.json`: add `"applicationsWrite"` next to `applicationsApply`:
  - th: `"ย้ายสถานะใบสมัครและเขียนโน้ตบนบอร์ด (ไม่สามารถทำเครื่องหมายว่าสมัครแล้ว)"`
  - en: `"Move applications between stages and add notes on the board (never marks a job applied)"`

Capability lists: add `'applications:write'` in every place that lists the other capabilities:
- `ProjectSharing.tsx`: the type, and `capabilityKey` → `'capability.applicationsWrite'`.
- `AgentsTab.tsx`: the type and `CAPS`.
- `console/copy.ts` `caps`:
  - th: `'ย้ายสถานะใบสมัครและเขียนโน้ต (ทำเครื่องหมายว่าสมัครแล้วไม่ได้)'`
  - en: `'Move applications between stages and add notes (cannot mark applied)'`

- [ ] **Step 6: Update the existing e2e specs and run everything**

Run (from `tests/`): `rtk npx playwright test`. In each spec that fails only because of the rename, make these changes:
- `'Saved jobs'` becomes `'Applications'`.
- `'งานที่บันทึก'` and `'งานที่บันทึกไว้'` become `'ใบสมัคร'`.
- A URL expectation for the job list (`/jobs$`) becomes `/applications`.
- In `accessibility.spec.ts` `routes`, `/app/projects/${projectId}/jobs` becomes `/app/projects/${projectId}/applications`.
- `job-status.spec.ts` tests the removed two-state toggle on the old grid. Delete it; `application-board.spec.ts` covers error, reload and history.

Do not loosen any other assertion. `actual-backend.spec.ts` is skipped and stale; leave it unchanged.

Run: `rtk npm run build --prefix frontend && cd tests && rtk npx playwright test`
Expected: build OK; all pass except the one known skip.

- [ ] **Step 7: Commit**

```bash
rtk git add frontend tests
rtk git commit -m "feat(board): application board page replaces saved jobs; applications:write capability

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Application panel on the job page

Model: Sonnet.

**Files:**
- Create: `frontend/src/features/applications/ApplicationPanel.tsx`
- Modify: `frontend/src/features/jobs/JobsPage.tsx`. Delete `ApplicationStatusControl`. In `JobDetailPage`, replace the status `Card` with `<ApplicationPanel …/>`.
- Modify: `frontend/src/locales/common.th.json`, `common.en.json`. Delete `pages.applicationStatusSaved`, `applicationStatusApplied`, `applicationStatusHelp`, `markApplied` and `markSaved` if `grep` shows no remaining use.
- Test: `tests/e2e/application-board.spec.ts` (append)

**Interfaces:**
- Consumes:
  - Task 3: `GET/PUT/POST .../application`, `/application/contact`, `/application/events`, and `PATCH .../application-status`.
  - Task 6: `STAGES`, `stageLabel` and the `ApplicationDetailView`, `ApplicationEventView` and `ApplicationStage` types.
- Produces: `ApplicationPanel({ projectId, jobId, jobTitle, onStageChanged })`.

- [ ] **Step 1: Write the failing e2e test** (append to `tests/e2e/application-board.spec.ts`)

```ts
test('job page edits stage and contact, offers mailto, logs correspondence and notes, newest first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const detail = { job_revision_id: jobId, title: 'Synthetic data analyst', company: 'Example Co', stage: 'saved', contact: { name: null as string | null, email: null as string | null, role: null as string | null }, events: [] as Record<string, unknown>[] };
  let n = 0;
  const push = (kind: string, payload: Record<string, unknown>) => detail.events.unshift({ id: `00000000-0000-4000-8000-00000000000${n++}`, kind, actor: 'user', payload, created_at: `2026-10-14T00:0${n}:00Z` });
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }));
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const to = route.request().postDataJSON().application_status;
    push('stage_changed', { from: detail.stage, to }); detail.stage = to;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: jobId, application_status: to }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application/contact`, async route => {
    detail.contact = route.request().postDataJSON(); push('contact_updated', detail.contact);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application/events`, async route => {
    const { kind, ...payload } = route.request().postDataJSON(); push(kind, { note: null, ...payload });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(detail.events[0]) });
  });

  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await page.getByLabel('Stage').selectOption('interview');
  await expect(page.getByRole('list', { name: 'Timeline' }).getByRole('listitem').first()).toContainText('Saved → Interview');

  await expect(page.getByRole('link', { name: 'Write email' })).toHaveCount(0);
  await page.getByLabel('Recruiter name').fill('สมหญิง ใจดี');
  await page.getByLabel('Recruiter email').fill('a+jobs@example.co.th');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('link', { name: 'Write email' })).toHaveAttribute('href', 'mailto:a%2Bjobs@example.co.th?subject=Re%3A%20Synthetic%20data%20analyst');

  await page.getByLabel('Direction').selectOption('received');
  await page.getByLabel('Subject').fill('Interview invite');
  await page.getByRole('button', { name: 'Log correspondence' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Prepare portfolio');
  await page.getByRole('button', { name: 'Add note' }).click();
  const items = page.getByRole('list', { name: 'Timeline' }).getByRole('listitem');
  await expect(items.nth(0)).toContainText('Prepare portfolio');
  await expect(items.nth(1)).toContainText('Received email: Interview invite');
  await expect(items.nth(2)).toContainText('Contact updated');
});

test('job page fits 320px in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByLabel('ขั้นตอน')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `tests/`): `rtk npx playwright test e2e/application-board.spec.ts -g "job page"`
Expected: FAIL, because there is no `Stage` select.

- [ ] **Step 3: Write `ApplicationPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApplicationDetailView, ApplicationEventView, ApplicationStage } from '../../lib/api-types';
import { STAGES, stageLabel } from '../../lib/applicationStages';
import { selectClass } from '../settings/Field';
import { sendJson, useResource } from '../projects/useResource';

const copy = {
  th: {
    title: 'ใบสมัคร', stage: 'ขั้นตอน', contact: 'ผู้ติดต่อ (recruiter)', name: 'ชื่อผู้ติดต่อ', email: 'อีเมลผู้ติดต่อ', role: 'ตำแหน่งผู้ติดต่อ',
    saveContact: 'บันทึกผู้ติดต่อ', write: 'เขียนอีเมล', writeHelp: 'เปิดโปรแกรมอีเมลของคุณ ระบบไม่ส่งอีเมลเอง',
    log: 'บันทึกการติดต่อ', direction: 'ทิศทาง', sent: 'ส่งออก', received: 'ได้รับ', subject: 'หัวเรื่อง', date: 'วันที่', logNote: 'รายละเอียด (ไม่บังคับ)', logAction: 'บันทึกการติดต่อ',
    note: 'โน้ต', addNote: 'เพิ่มโน้ต', timeline: 'ไทม์ไลน์', empty: 'ยังไม่มีความเคลื่อนไหว', error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
    actor: { user: 'คุณ', agent: 'เอเจนต์', system: 'ระบบ' },
    contactUpdated: 'อัปเดตผู้ติดต่อ', sentEmail: 'ส่งอีเมล', receivedEmail: 'ได้รับอีเมล', viaApproval: 'สมัครผ่านการอนุมัติ',
  },
  en: {
    title: 'Application', stage: 'Stage', contact: 'Recruiter contact', name: 'Recruiter name', email: 'Recruiter email', role: 'Recruiter role',
    saveContact: 'Save contact', write: 'Write email', writeHelp: 'Opens your own mail app. The platform never sends email.',
    log: 'Log correspondence', direction: 'Direction', sent: 'Sent', received: 'Received', subject: 'Subject', date: 'Date', logNote: 'Details (optional)', logAction: 'Log correspondence',
    note: 'Note', addNote: 'Add note', timeline: 'Timeline', empty: 'No activity yet', error: 'Could not save. Try again.',
    actor: { user: 'You', agent: 'Agent', system: 'System' },
    contactUpdated: 'Contact updated', sentEmail: 'Sent email', receivedEmail: 'Received email', viaApproval: 'Applied through approval',
  },
};

const today = () => new Date().toISOString().slice(0, 10);

export function mailtoHref(email: string, jobTitle: string): string {
  const [local, domain] = email.split('@');
  return `mailto:${encodeURIComponent(local)}@${domain}?subject=${encodeURIComponent(`Re: ${jobTitle}`)}`;
}

export function ApplicationPanel({ projectId, jobId, jobTitle, onStageChanged }: { projectId: string; jobId: string; jobTitle: string; onStageChanged: () => void }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const path = `/projects/${projectId}/jobs/${jobId}`;
  const result = useResource<ApplicationDetailView>(`${path}/application`);
  const [contact, setContact] = useState({ name: '', email: '', role: '' });
  const [log, setLog] = useState({ direction: 'sent', subject: '', occurred_on: today(), note: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const data = result.data;

  useEffect(() => {
    if (data) setContact({ name: data.contact.name ?? '', email: data.contact.email ?? '', role: data.contact.role ?? '' });
  }, [data]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(false);
    try { await action(); after?.(); result.reload(); } catch { setError(true); } finally { setBusy(false); }
  }
  const blank = (value: string) => value.trim() || null;
  const describe = (event: ApplicationEventView): string => {
    const p = event.payload as Record<string, string | null>;
    switch (event.kind) {
      case 'stage_changed': return `${stageLabel[p.from as ApplicationStage][locale]} → ${stageLabel[p.to as ApplicationStage][locale]}`;
      case 'note': return p.text ?? '';
      case 'contact_updated': return [c.contactUpdated, p.name, p.email].filter(Boolean).join(' · ');
      case 'email_logged': return `${p.direction === 'sent' ? c.sentEmail : c.receivedEmail}: ${p.subject} (${p.occurred_on})${p.note ? ` — ${p.note}` : ''}`;
      case 'applied_via_approval': return c.viaApproval;
    }
  };
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (!data) return null;
  return <Card>
    <CardHeader><CardTitle>{c.title}</CardTitle></CardHeader>
    <CardContent className="grid min-w-0 gap-6">
      {error && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
      <div className="grid gap-2">
        <Label htmlFor="application-stage">{c.stage}</Label>
        <select id="application-stage" className={selectClass} value={data.stage} disabled={busy}
          onChange={event => void run(() => sendJson(`${path}/application-status`, 'PATCH', { application_status: event.target.value }), onStageChanged)}>
          {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
        </select>
      </div>

      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(() => sendJson(`${path}/application/contact`, 'PUT', { name: blank(contact.name), email: blank(contact.email), role: blank(contact.role) })); }}>
        <h3 className="text-sm font-semibold">{c.contact}</h3>
        <div className="grid gap-2"><Label htmlFor="contact-name">{c.name}</Label><Input id="contact-name" maxLength={200} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="contact-email">{c.email}</Label><Input id="contact-email" type="email" maxLength={320} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="contact-role">{c.role}</Label><Input id="contact-role" maxLength={200} value={contact.role} onChange={e => setContact({ ...contact, role: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={busy}>{c.saveContact}</Button>
          {data.contact.email && <Button asChild variant="ghost"><a href={mailtoHref(data.contact.email, jobTitle)}><Mail className="size-4" aria-hidden="true" />{c.write}</a></Button>}
        </div>
        {data.contact.email && <p className="text-xs text-muted-foreground">{c.writeHelp}</p>}
      </form>

      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (!log.subject.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'email_logged', direction: log.direction, subject: log.subject.trim(), occurred_on: log.occurred_on, note: blank(log.note) }), () => setLog({ ...log, subject: '', note: '' })); }}>
        <h3 className="text-sm font-semibold">{c.log}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="log-direction">{c.direction}</Label><select id="log-direction" className={selectClass} value={log.direction} onChange={e => setLog({ ...log, direction: e.target.value })}><option value="sent">{c.sent}</option><option value="received">{c.received}</option></select></div>
          <div className="grid gap-2"><Label htmlFor="log-date">{c.date}</Label><Input id="log-date" type="date" required value={log.occurred_on} onChange={e => setLog({ ...log, occurred_on: e.target.value })} /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="log-subject">{c.subject}</Label><Input id="log-subject" required maxLength={300} value={log.subject} onChange={e => setLog({ ...log, subject: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="log-note">{c.logNote}</Label><Textarea id="log-note" rows={2} maxLength={2000} value={log.note} onChange={e => setLog({ ...log, note: e.target.value })} /></div>
        <div><Button type="submit" variant="outline" disabled={busy || !log.subject.trim()}>{c.logAction}</Button></div>
      </form>

      <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (!note.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'note', text: note.trim() }), () => setNote('')); }}>
        <Label htmlFor="application-note">{c.note}</Label>
        <Textarea id="application-note" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
        <div><Button type="submit" variant="outline" disabled={busy || !note.trim()}>{c.addNote}</Button></div>
      </form>

      <div className="grid gap-2">
        <h3 id="application-timeline" className="text-sm font-semibold">{c.timeline}</h3>
        {data.events.length === 0 ? <p className="text-sm text-muted-foreground">{c.empty}</p> :
          <ol aria-labelledby="application-timeline" className="grid gap-3 border-s ps-4">{data.events.map(event => <li key={event.id} className="grid gap-0.5">
            <p className="break-words text-sm">{describe(event)}</p>
            <p className="text-xs text-muted-foreground">{c.actor[event.actor]} · {when.format(new Date(event.created_at))}</p>
          </li>)}</ol>}
      </div>
    </CardContent>
  </Card>;
}
```

The spec's mailto expectation (`a%2Bjobs`) matches `encodeURIComponent` on the local part. The test labels "Note" (`exact: true`) and "Timeline" (the `<ol>` named by `aria-labelledby`) match this markup.

- [ ] **Step 4: Wire it into `JobDetailPage`**

In `JobsPage.tsx`:
- Delete the `ApplicationStatusControl` function and the imports only it used (`useEffect` if unused, `JobApplicationStatusView`).
- In `JobDetailPage`, replace the `<Card>…{c.status}…<ApplicationStatusControl …/></Card>` block with:

```tsx
        <ApplicationPanel projectId={projectId} jobId={job.id} jobTitle={job.title} onStageChanged={result.reload} />
```

- Import `ApplicationPanel` from `'../applications/ApplicationPanel'`.
- Remove `status` from both `copy` objects if it is now unused.
- Delete the five now-unused `pages.*` locale keys listed in **Files** (check with `grep -rn "applicationStatus\|markApplied\|markSaved" frontend/src` first).

- [ ] **Step 5: Run everything**

Run: `rtk npm run build --prefix frontend && cd tests && rtk npx playwright test`
Expected: build OK; all pass except the one known skip. Fix any existing spec that clicked "Mark as applied" by switching it to `getByLabel('Stage').selectOption('applied')` (th: `ขั้นตอน`). Do not loosen other assertions.

- [ ] **Step 6: Commit**

```bash
rtk git add frontend tests
rtk git commit -m "feat(board): job page application panel with contact, mailto, correspondence log, notes and timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (controller)

From the worktree:
1. `cd backend && uv run --locked pytest -q -m "not integration"`
2. `cd backend && uv run --locked pytest -q -m integration`. The known baseline failures are `test_actual_built_frontend_with_production_rest_upload_and_session_restore` and `test_storage_infrastructure::test_real_postgres_minio_checksum_and_restart_proof`.
3. `rtk npm run build --prefix frontend && cd tests && rtk npx playwright test`
4. Before pushing: `git branch --show-current` prints `feat/application-board`, and after the push, `git rev-parse origin/feat/application-board` equals the tested HEAD (Hub LEARNINGS 2026-10-14).
