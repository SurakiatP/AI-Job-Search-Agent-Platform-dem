# Smart match with Jev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank job-board postings against a project CV with TypeSafe Jev (via OpenRouter): AI fit bands, must-have/nice-to-have skills, CV-derived categories when no query is typed, posting highlights, and per-project hide job/company.

**Architecture:** A new owner-only, non-LLM-provider run `match_jobs` parses the CV once (text kept in `cv_revision_texts`), asks Jev one typed request per job and commits each score to `job_match_scores`. The existing `GET …/job-search/match` merges cached scores, hidden filters and highlights into its keyword-ranked pool; the page starts the run and re-fetches while it runs. Pure logic lives in `services/smart_match.py`; HTTP to Jev in `integrations/jev.py`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 17, pytest; React + Vite + Tailwind v4 (TypeScript).

**Spec:** `docs/superpowers/specs/2026-10-08-smart-match-jev-design.md`

## Global Constraints

- Branch `feat/smart-match-jev`. Never push. Never commit `.integration-hub/`, `.gitignore`, `.python-version`, `.env`.
- Shell commands are prefixed with `rtk` (`rtk git …`, `rtk npm …`); Python/pytest via `uv run --env-file .env --locked --project backend …` from the repo root.
- Never import or execute anything inside the pinned Hermes checkout.
- Never print, log, store or snapshot the provider key; `JevClient` repr must not contain it.
- Jev endpoint `https://openrouter.ai/api/alpha/decisions`, model pinned `typesafe/jev-1.13` (constant `JEV_MODEL`).
- Jev is used only when the global provider row (`provider_configurations.project_id IS NULL`, highest revision) has `provider == "openrouter"` and its `secret_reference` does not start with `restored-unconfigured:`.
- Fixed weights: role 0.5, skills 0.3, seniority 0.2; penalty factor `(1 − 0.5·hard_blocker)`; must-have skill weight 2, nice-to-have 1.
- Bands `BANDS = (70, 55, 40, 25)` → 5 เหมาะมาก, 4 เหมาะ, 3 พอได้, 2 น้อย, 1 ไม่เหมาะ.
- At most 12 skills per job; posting text cut to 6 000 characters; at most 101 Jev calls per run; 8 concurrent calls.
- CV text is never returned by any API, never written to run events, errors or logs.
- UI: Thai and English copy, no raw UUIDs, never the visible upstream job-board site name.
- `docs/contracts/application-api.yaml` stays in sync (contract test in `backend/tests/integration/test_rest_api.py` must pass).
- Run progress comes from `GET …/match` (`ai.scored`), not from new run event types (event types are a closed set in `services/runs.py` `EVENT_TYPES`). This replaces the spec line "run events record counts".

## Review Focus

1. A posting containing HTML/script or regex metacharacters in a highlighted term must render as text, never as markup, and must not break the highlighter (Task 5 test).
2. A job whose company is missing (`company: null`) must never be hidden by an empty-company hide rule, and "Acme  Co" / "acme co" hide the same company (Task 2 test).
3. Jev answers with probability keys as strings (`"0"`) or ints (`0`), or a run where every Jev call fails (bad key/no credit), must give a clean `failed` run with `errors.jev_failed`, not a crash or a half-written row (Task 2 and Task 3 tests).
4. Switching the global provider away from OpenRouter after scores exist must still show the ATS list (status `unavailable`) and POST must refuse with 409, without deleting stored scores (Task 4 test).
5. Repeated clicks/reloads while a run is active must not queue a second run for the same CV revision and parameters (Task 4 test).

---

## Wave plan

| Wave | Tasks (parallel inside a wave) | Files owned |
|------|------|------|
| 1 | Task 1 (schema) · Task 2 (pure logic + Jev client) | T1: `db/models.py`, `migrations/versions/0014_smart_match_jev.py`, `tests/integration/test_smart_match_migration.py` · T2: `services/skill_coverage.py`, `services/smart_match.py`, `integrations/jev.py`, `tests/unit/test_smart_match.py`, `tests/unit/test_jev_client.py` |
| 2 | Task 3 (run + worker) | `services/contracts.py`, `services/runs.py`, `workers/executor.py`, `main.py`, `tests/integration/test_match_jobs_run.py` |
| 3 | Task 4 (REST + contract) | `api/rest.py`, `docs/contracts/application-api.yaml`, `tests/integration/test_smart_match_api.py` |
| 4 | Task 5 (UI) | `frontend/src/features/search/SearchPage.tsx`, `frontend/src/features/search/highlight.ts`, `frontend/src/features/search/highlight.test.ts` (only if a test runner exists), `frontend/src/lib/api-types.ts`, `frontend/src/features/console/copy.ts` |
| 5 | Task 6 (root: browser verification) | none |

All backend paths below are relative to `backend/src/job_search_platform/` unless they start with `backend/`, `docs/` or `frontend/`.

---

### Task 1: Schema — migration 0014 and models

**Files:**
- Modify: `db/models.py` (add three models; update `Run` check constraints at `db/models.py:294`)
- Create: `backend/migrations/versions/0014_smart_match_jev.py`
- Test: `backend/tests/integration/test_smart_match_migration.py`

**Interfaces:**
- Produces: models `CVRevisionText(cv_revision_id, project_id, text, created_at)`, `JobMatchScore(id, project_id, cv_revision_id, job_slug, content_hash, model, fit_percent, uncertain, details, created_at)` with unique constraint name `uq_job_match_scores_key`, `JobSearchHidden(id, project_id, kind, value, label, created_at)` with unique constraint `uq_job_search_hidden_key`; run operation `match_jobs` allowed.

- [ ] **Step 1: Write the failing migration test** (`backend/tests/integration/test_smart_match_migration.py`)

```python
"""Migration 0014: Jev smart-match tables, match_jobs operation, downgrade guard."""
from __future__ import annotations

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from test_rest_api import ROOT_FOR_MIGRATIONS


def _migrate(engine, fn, target):
    config = Config()
    config.set_main_option("script_location", str(ROOT_FOR_MIGRATIONS))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        fn(config, target)


def test_migration_0014_up_down(postgres_engine):
    _migrate(postgres_engine, command.upgrade, "head")
    with postgres_engine.begin() as c:
        tables = {r[0] for r in c.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_name IN "
            "('cv_revision_texts','job_match_scores','job_search_hidden')"))}
        assert tables == {"cv_revision_texts", "job_match_scores", "job_search_hidden"}
        check = c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
        assert "match_jobs" in check
        context = c.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_context_required'")).scalar()
        assert "match_jobs" in context
    _migrate(postgres_engine, command.downgrade, "0013_cv_skill_profile")
    with postgres_engine.begin() as c:
        assert c.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name='job_match_scores'")).first() is None
        assert "match_jobs" not in c.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_runs_operation'")).scalar()
    _migrate(postgres_engine, command.upgrade, "head")
```

- [ ] **Step 2: Run it to see it fail**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/integration/test_smart_match_migration.py -q`
Expected: FAIL (tables missing).

- [ ] **Step 3: Write the migration** (`backend/migrations/versions/0014_smart_match_jev.py`)

```python
"""Smart match with Jev: parsed CV text per revision, cached Jev scores, hidden jobs/companies,
and the owner-only match_jobs run (no session or job; provider = the global OpenRouter row).
Downgrade fails while match_jobs runs exist; delete them first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_smart_match_jev"
down_revision = "0013_cv_skill_profile"
branch_labels = None
depends_on = None

_OPS = "'evaluate_job','draft_documents','export_document','profile_cv'"
_CONTEXT = ("(session_id IS NOT NULL AND job_revision_id IS NOT NULL "
            "AND provider_configuration_id IS NOT NULL)")


def upgrade() -> None:
    op.create_table(
        "cv_revision_texts",
        sa.Column("cv_revision_id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 200000", name="ck_cv_revision_text_length"),
    )
    op.create_table(
        "job_match_scores",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cv_revision_id", sa.Uuid(), nullable=False),
        sa.Column("job_slug", sa.String(200), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("fit_percent", sa.Integer(), nullable=False),
        sa.Column("uncertain", sa.Boolean(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("cv_revision_id", "job_slug", "content_hash", "model", name="uq_job_match_scores_key"),
        sa.CheckConstraint("fit_percent BETWEEN 0 AND 100", name="ck_job_match_fit_range"),
    )
    op.create_index("ix_job_match_scores_lookup", "job_match_scores", ["cv_revision_id", "job_slug"])
    op.create_table(
        "job_search_hidden",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("value", sa.String(300), nullable=False),
        sa.Column("label", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "kind", "value", name="uq_job_search_hidden_key"),
        sa.UniqueConstraint("project_id", "id", name="uq_job_search_hidden_project_id"),
        sa.CheckConstraint("kind IN ('job','company')", name="ck_job_search_hidden_kind"),
    )
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS},'match_jobs')")
    op.create_check_constraint("ck_runs_context_required", "runs",
                               f"operation IN ('profile_cv','match_jobs') OR {_CONTEXT}")


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE operation = 'match_jobs' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: match_jobs runs exist")
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS})")
    op.create_check_constraint("ck_runs_context_required", "runs", f"operation = 'profile_cv' OR {_CONTEXT}")
    op.drop_table("job_search_hidden")
    op.drop_index("ix_job_match_scores_lookup", table_name="job_match_scores")
    op.drop_table("job_match_scores")
    op.drop_table("cv_revision_texts")
```

- [ ] **Step 4: Add the models** (append to `db/models.py` after `CVRevision`; update the `Run` constraints to the same SQL as the migration, including `ck_runs_context_required` if it is declared on the model)

```python
class CVRevisionText(Base):
    """Parsed CV text, written once per revision by a sandbox parse; never returned by any API."""
    __tablename__ = "cv_revision_texts"
    cv_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
                      CheckConstraint("char_length(text) BETWEEN 1 AND 200000", name="ck_cv_revision_text_length"))


class JobMatchScore(Base):
    """One Jev score of a job-board posting (slug + content hash) against a CV revision."""
    __tablename__ = "job_match_scores"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    cv_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    job_slug: Mapped[str] = mapped_column(String(200), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    fit_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    uncertain: Mapped[bool] = mapped_column(Boolean, nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
                      UniqueConstraint("cv_revision_id", "job_slug", "content_hash", "model", name="uq_job_match_scores_key"),
                      CheckConstraint("fit_percent BETWEEN 0 AND 100", name="ck_job_match_fit_range"),
                      Index("ix_job_match_scores_lookup", "cv_revision_id", "job_slug"))


class JobSearchHidden(Base):
    """A job (slug) or company (normalized name) the owner hid from Smart match in this project."""
    __tablename__ = "job_search_hidden"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    value: Mapped[str] = mapped_column(String(300), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("project_id", "kind", "value", name="uq_job_search_hidden_key"),
                      UniqueConstraint("project_id", "id", name="uq_job_search_hidden_project_id"),
                      CheckConstraint("kind IN ('job','company')", name="ck_job_search_hidden_kind"))
```

`Run`'s `ck_runs_operation` becomes `"operation IN ('evaluate_job','draft_documents','export_document','profile_cv','match_jobs')"`.

- [ ] **Step 5: Run the test and the 0013 migration test**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/integration/test_smart_match_migration.py backend/tests/integration/test_skill_match.py -q`
Expected: PASS. (The 0013 test downgrades to 0012 from head; 0014's downgrade runs first and must succeed on an empty runs table.)

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/db/models.py backend/migrations/versions/0014_smart_match_jev.py backend/tests/integration/test_smart_match_migration.py
rtk git commit -m "feat(db): migration 0014 for Jev smart match (CV text, match scores, hidden jobs, match_jobs run)"
```

---

### Task 2: Pure logic and the Jev client

**Files:**
- Modify: `services/skill_coverage.py` (add `skill_mentions`, refactor `_first_position` onto `_first_span`)
- Create: `services/smart_match.py`, `integrations/jev.py`
- Test: `backend/tests/unit/test_smart_match.py`, `backend/tests/unit/test_jev_client.py`

**Interfaces:**
- Produces (`services/skill_coverage.py`): `skill_mentions(text: str) -> list[tuple[int, str, str]]` — (position, canonical name, surface as written), text order.
- Produces (`integrations/jev.py`): `JEV_URL`, `JEV_MODEL = "typesafe/jev-1.13"`, `class JevClient(api_key: str, *, opener=None, sleep=time.sleep, attempts=4)` with `decide(state: dict, questions: dict) -> dict` returning the `answers` mapping; raises `ServiceError("jev_failed", retryable=bool)`.
- Produces (`services/smart_match.py`): `MAX_SKILLS = 12`, `JOB_CHARS = 6000`, `BANDS`, `job_text(job) -> str`, `job_skills(job) -> list[str]`, `job_state(cv_text, job) -> dict`, `job_questions(skills) -> dict`, `combine(answers, skills) -> dict`, `band(fit) -> int`, `category_question(options) -> dict`, `pick_categories(answer) -> list[str]`, `highlight_terms(text, matched, missing) -> dict`, `content_hash(job) -> str`, `company_key(name) -> str`, `is_hidden(job, hidden: set[tuple[str, str]]) -> bool`, `build_pool(*, q, cities, work_mode, posted_within_days, category, pool, offset, cv_categories, fetch=None) -> dict` returning `{"items": [...], "total": int}`.

- [ ] **Step 1: Write failing unit tests** (`backend/tests/unit/test_smart_match.py`)

```python
from job_search_platform.services import job_sources, smart_match
from job_search_platform.services.skill_coverage import skill_mentions


def _job(slug="a", title="Dev", company="Acme", text="", skills=(), age=1):
    return {"slug": slug, "title": title, "company": company, "description_markdown": text,
            "skills": list(skills), "age_days": age}


def _answers(role=3.0, role_conf=0.9, seniority=(0, 0, 1, 0), blocker=0.0, have=(), must=()):
    out = {"role_fit": {"score": role, "confidence": role_conf},
           "seniority_fit": {"probabilities": {str(i): p for i, p in enumerate(seniority)}},
           "hard_blocker": {"noul": blocker}}
    for i, (h, m) in enumerate(zip(have, must)):
        out[f"skill_{i}"], out[f"must_{i}"] = {"noul": h}, {"noul": m}
    return out


def test_skill_mentions_keep_alias_surface_and_order():
    found = skill_mentions("We use ReactJS with Docker และ Python")
    names = [name for _, name, _ in found]
    assert names.index("React") < names.index("Docker") < names.index("Python")
    assert dict((n, s) for _, n, s in found)["React"] == "ReactJS"


def test_job_skills_posting_order_dedups_tags_and_caps():
    job = _job(text="Docker then Python", skills=["python", "Kubernetes", "Weird Tool"])
    assert smart_match.job_skills(job)[:4] == ["Docker", "Python", "Kubernetes", "Weird Tool"]
    many = _job(text=" ".join(["Python", "SQL", "Docker", "React", "Java", "Go lang", "Kubernetes", "AWS",
                                "Azure", "GCP", "TypeScript", "Node.js", "Vue", "Angular"]))
    assert len(smart_match.job_skills(many)) == smart_match.MAX_SKILLS


def test_combine_weights_must_have_double_and_penalty():
    full = smart_match.combine(_answers(have=(1.0, 0.0), must=(1.0, 0.0)), ["Python", "Go"])
    # role 1.0, skills (2*1 + 1*0)/3, seniority 1.0 -> 0.5 + 0.3*2/3 + 0.2 = 0.9
    assert full["fit_percent"] == 90 and full["band"] == 5
    assert full["skills_evidenced"] == ["Python"] and full["nice_missing"] == ["Go"] and full["must_missing"] == []
    blocked = smart_match.combine(_answers(blocker=1.0, have=(1.0, 0.0), must=(1.0, 0.0)), ["Python", "Go"])
    assert blocked["fit_percent"] == 45 and blocked["hard_blocker"] is True


def test_combine_no_skills_uses_role_and_int_probability_keys_and_uncertain():
    answers = _answers(role=1.5, role_conf=0.3)
    answers["seniority_fit"]["probabilities"] = {0: 0.0, 1: 1.0, 2: 0.0, 3: 0.0}
    out = smart_match.combine(answers, [])
    # role 0.5, skills = role 0.5, seniority 0.5 -> 50
    assert out["fit_percent"] == 50 and out["uncertain"] is True and out["seniority"] == "below"


def test_band_edges():
    assert [smart_match.band(v) for v in (24, 25, 39, 40, 54, 55, 69, 70, 100)] == [1, 2, 2, 3, 3, 4, 4, 5, 5]


def test_pick_categories_threshold_cap_and_fallback():
    assert smart_match.pick_categories({"probabilities": {"a": 0.5, "b": 0.3, "c": 0.26}}) == ["a", "b"]
    assert smart_match.pick_categories({"probabilities": {"a": 0.2, "b": 0.1}}) == ["a"]


def test_highlight_terms_surfaces_and_unknown_names():
    out = smart_match.highlight_terms("Need ReactJS, ภาษาไทย", ["React"], ["Weird Tool"])
    assert out == {"matched": {"React": "ReactJS"}, "missing": {"Weird Tool": "Weird Tool"}}


def test_hidden_company_normalized_and_null_company_never_hidden():
    hidden = {("company", smart_match.company_key("Acme  Co")), ("job", "x")}
    assert smart_match.is_hidden(_job(slug="y", company="acme co"), hidden)
    assert smart_match.is_hidden(_job(slug="x", company=None), hidden)
    assert not smart_match.is_hidden(_job(slug="z", company=None), {("company", "")})


def test_content_hash_changes_with_description():
    assert smart_match.content_hash(_job(text="a")) != smart_match.content_hash(_job(text="b"))


def test_build_pool_splits_categories_dedups_and_sorts_newest(monkeypatch):
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        rows = {"it": [_job("s1", age=3), _job("s2", age=1)], "data": [_job("s2", age=1), _job("s3", age=0)]}
        return {"items": rows[kwargs["category"]], "total": 10}

    monkeypatch.setattr(job_sources, "search_jobs", fake)
    page = smart_match.build_pool(q="", cities=[], work_mode=None, posted_within_days=None, category=None,
                                  pool=100, offset=100, cv_categories=["it", "data"])
    assert [j["slug"] for j in page["items"]] == ["s3", "s2", "s1"] and page["total"] == 20
    assert {c["limit"] for c in calls} == {50} and {c["offset"] for c in calls} == {50}
    smart_match.build_pool(q="react", cities=[], work_mode=None, posted_within_days=None, category=None,
                           pool=100, offset=0, cv_categories=["it"])
    assert calls[-1]["q"] == "react" and calls[-1]["category"] is None and calls[-1]["limit"] == 100
```

`backend/tests/unit/test_jev_client.py`:

```python
import io
import json
import urllib.error

import pytest

from job_search_platform.integrations.jev import JEV_MODEL, JEV_URL, JevClient
from job_search_platform.services.errors import ServiceError


class Opener:
    def __init__(self, *responses):
        self.responses, self.requests = list(responses), []

    def open(self, request, timeout):
        self.requests.append(request)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return io.BytesIO(json.dumps(item).encode())


def _http(code, retry_after=None):
    headers = {"retry-after": retry_after} if retry_after else {}
    return urllib.error.HTTPError(JEV_URL, code, "x", headers, io.BytesIO(b"{}"))


def test_decide_posts_pinned_model_and_returns_answers():
    opener = Opener({"answers": {"q": {"type": "noul", "noul": 0.9}}})
    client = JevClient("sk-secret", opener=opener, sleep=lambda s: None)
    assert client.decide({"cv": "x"}, {"q": {"type": "noul"}}) == {"q": {"type": "noul", "noul": 0.9}}
    sent = json.loads(opener.requests[0].data)
    assert opener.requests[0].full_url == JEV_URL and sent["model"] == JEV_MODEL
    assert "sk-secret" not in repr(client)


def test_retries_429_then_succeeds_and_honours_retry_after():
    waits = []
    client = JevClient("k", opener=Opener(_http(429, "3"), {"answers": {}}), sleep=waits.append)
    assert client.decide({}, {}) == {}
    assert waits == [3.0]


def test_non_retryable_and_exhausted_errors_raise_jev_failed_without_key():
    for opener in (Opener(_http(401)), Opener(*[_http(503)] * 4), Opener({"oops": 1})):
        with pytest.raises(ServiceError) as caught:
            JevClient("sk-secret", opener=opener, sleep=lambda s: None).decide({}, {})
        assert caught.value.code == "jev_failed" and "sk-secret" not in str(caught.value)
```

- [ ] **Step 2: Run them to see them fail**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/unit/test_smart_match.py backend/tests/unit/test_jev_client.py -q`
Expected: FAIL (ImportError).

- [ ] **Step 3: Add `skill_mentions`** (in `services/skill_coverage.py`, replacing `_first_position` with a span-based helper; `extract_skills`/`match_skills` keep calling `_first_position`)

```python
def _first_span(entry: tuple[str, re.Pattern[str] | None, tuple[str, ...]], text: str) -> tuple[int, int] | None:
    _, pattern, thai = entry
    found = []
    if pattern is not None and (match := pattern.search(text)):
        found.append((match.start(), match.end()))
    found.extend((pos, pos + len(alias)) for alias in thai if (pos := text.find(alias)) >= 0)
    return min(found) if found else None


def _first_position(entry: tuple[str, re.Pattern[str] | None, tuple[str, ...]], text: str) -> int | None:
    span = _first_span(entry, text)
    return None if span is None else span[0]


def skill_mentions(text: str) -> list[tuple[int, str, str]]:
    """(position, canonical name, surface as written) for each dictionary skill in the text, in text order."""
    low = text.lower()
    source = text if len(low) == len(text) else low  # surfaces come from the original casing when lengths agree
    return sorted((span[0], entry[0], source[span[0]:span[1]]) for entry in _ENTRIES if (span := _first_span(entry, low)))
```

- [ ] **Step 4: Write `integrations/jev.py`**

```python
"""TypeSafe Jev typed decisions over OpenRouter. Answers only; the key never leaves this object."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

from job_search_platform.services.errors import ServiceError

JEV_URL = "https://openrouter.ai/api/alpha/decisions"
JEV_MODEL = "typesafe/jev-1.13"
TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 2_000_000
RETRY_STATUSES = {429, 500, 502, 503, 504}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


class JevClient:
    def __init__(self, api_key: str, *, opener=None, sleep=time.sleep, attempts: int = 4) -> None:
        self._key, self._opener, self._sleep, self._attempts = api_key, opener or _OPENER, sleep, attempts

    def __repr__(self) -> str:
        return "JevClient(<redacted>)"

    def decide(self, state: dict, questions: dict) -> dict:
        body = json.dumps({"model": JEV_MODEL, "state": state, "questions": questions}).encode()
        for attempt in range(self._attempts):
            last = attempt == self._attempts - 1
            request = urllib.request.Request(JEV_URL, data=body, method="POST", headers={
                "Authorization": f"Bearer {self._key}", "Content-Type": "application/json"})
            try:
                with self._opener.open(request, timeout=TIMEOUT_SECONDS) as response:
                    data = json.loads(response.read(MAX_RESPONSE_BYTES))
            except urllib.error.HTTPError as error:
                retry = error.code in RETRY_STATUSES
                if not retry or last:
                    raise ServiceError("jev_failed", retryable=retry) from None
                wait = (error.headers or {}).get("retry-after")
                self._sleep(min(float(wait), 30.0) if wait and wait.isdigit() else float(2 ** attempt))
                continue
            except (urllib.error.URLError, TimeoutError, ValueError):
                if last:
                    raise ServiceError("jev_failed", retryable=True) from None
                self._sleep(float(2 ** attempt))
                continue
            answers = data.get("answers") if isinstance(data, dict) else None
            if not isinstance(answers, dict):
                raise ServiceError("jev_failed")
            return answers
        raise ServiceError("jev_failed")
```

(If `ServiceError` does not accept `retryable=`, check `services/errors.py` and pass it the way existing code does, e.g. `job_sources.py`.)

- [ ] **Step 5: Write `services/smart_match.py`**

```python
"""Smart match with Jev: per-job questions, score combination, highlights, hiding and the shared pool.

Pure functions except build_pool (job-board HTTP through job_sources, cached there).
"""
from __future__ import annotations

import hashlib

from job_search_platform.services import job_sources
from job_search_platform.services.skill_coverage import extract_skills, skill_mentions

MAX_SKILLS = 12
JOB_CHARS = 6000
BANDS = (70, 55, 40, 25)
SENIORITY = ("far_below", "below", "meets", "above")
SENIORITY_VALUE = (0.0, 0.5, 1.0, 0.8)
CATEGORY_MIN_PROBABILITY = 0.25
MAX_CATEGORIES = 2


def job_text(job: dict) -> str:
    return f"{job['title']}\n{job['description_markdown']}\n" + ", ".join(job["skills"])


def job_skills(job: dict) -> list[str]:
    """Dictionary skills in posting order, then upstream tags not already named; at most MAX_SKILLS."""
    names = [name for _, name, _ in skill_mentions(f"{job['title']}\n{job['description_markdown']}")]
    for tag in job["skills"]:
        canonical = (extract_skills(tag) or [tag.strip()])[0]
        if canonical and canonical.casefold() not in {n.casefold() for n in names}:
            names.append(canonical)
    return names[:MAX_SKILLS]


def job_state(cv_text: str, job: dict) -> dict:
    posting = f"{job['title']} — {job.get('company') or ''}\n{job['description_markdown']}"
    return {"cv": cv_text, "job_posting": posting[:JOB_CHARS]}


def job_questions(skills: list[str]) -> dict:
    questions = {
        "role_fit": {"type": "score", "instructions": "How closely the candidate's past roles match the work this job posting describes.",
                     "criteria": ["The candidate has worked in an unrelated field or role family.",
                                  "The candidate has adjacent experience: same broad field but a different specialty.",
                                  "The candidate has done similar work, but not the core of this role.",
                                  "The candidate has repeatedly done the core work this job describes."]},
        "seniority_fit": {"type": "score", "instructions": "How the candidate's years and level of experience compare with what the job asks for.",
                          "criteria": ["The candidate is far below the experience the job requires.",
                                       "The candidate is somewhat below the required experience.",
                                       "The candidate meets the required experience.",
                                       "The candidate is well above the level this job asks for."]},
        "hard_blocker": {"type": "noul", "instructions": "Does the job state a mandatory requirement (licence, degree field, language, citizenship, specific certification) that the CV clearly does not satisfy?",
                         "criteria": {"true": "A stated must-have requirement is clearly missing from the CV.",
                                      "false": "No stated must-have requirement is clearly missing from the CV."}},
    }
    for i, skill in enumerate(skills[:MAX_SKILLS]):
        questions[f"skill_{i}"] = {"type": "noul", "instructions": f"Does the CV show evidence that the candidate has used {skill}?",
                                   "criteria": {"true": f"The CV names {skill} or clearly describes work done with it.",
                                                "false": f"The CV does not mention {skill} or work done with it."}}
        questions[f"must_{i}"] = {"type": "noul", "instructions": f"Does the job posting state {skill} as a required qualification rather than a preferred one?",
                                  "criteria": {"true": f"The posting lists {skill} as required or must-have.",
                                               "false": f"The posting lists {skill} as preferred, a plus, or only mentions it."}}
    return questions


def band(fit: int) -> int:
    return 5 - next((i for i, edge in enumerate(BANDS) if fit >= edge), 4)


def _probability(probabilities: dict, index: int) -> float:
    return float(probabilities.get(str(index), probabilities.get(index, 0.0)))


def combine(answers: dict, skills: list[str]) -> dict:
    role = answers["role_fit"]["score"] / 3
    seniority_p = [_probability(answers["seniority_fit"]["probabilities"], i) for i in range(4)]
    seniority = sum(w * p for w, p in zip(SENIORITY_VALUE, seniority_p))
    evidenced, must_missing, nice_missing, weighted, weights = [], [], [], 0.0, 0.0
    for i, skill in enumerate(skills[:MAX_SKILLS]):
        have = answers[f"skill_{i}"]["noul"]
        must = answers[f"must_{i}"]["noul"] >= 0.5
        weight = 2.0 if must else 1.0
        weighted, weights = weighted + weight * have, weights + weight
        (evidenced if have >= 0.5 else must_missing if must else nice_missing).append(skill)
    skill_part = weighted / weights if weights else role
    blocker = answers["hard_blocker"]["noul"]
    fit = max(0, min(100, round(100 * (0.5 * role + 0.3 * skill_part + 0.2 * seniority) * (1 - 0.5 * blocker))))
    return {"fit_percent": fit, "band": band(fit), "uncertain": answers["role_fit"]["confidence"] < 0.5,
            "seniority": SENIORITY[max(range(4), key=seniority_p.__getitem__)], "hard_blocker": blocker >= 0.5,
            "skills_evidenced": evidenced, "must_missing": must_missing, "nice_missing": nice_missing}


def category_question(options: list[str]) -> dict:
    return {"category": {"type": "choice",
                         "instructions": "Which job category best fits the work this candidate has done and is qualified to do next?",
                         "criteria": {c: f"Jobs in the '{c.replace('-', ' ').replace('_', ' ')}' category." for c in options}}}


def pick_categories(answer: dict) -> list[str]:
    ranked = sorted(answer["probabilities"].items(), key=lambda kv: -float(kv[1]))
    chosen = [c for c, p in ranked if float(p) >= CATEGORY_MIN_PROBABILITY][:MAX_CATEGORIES]
    return chosen or [ranked[0][0]]


def highlight_terms(text: str, matched: list[str], missing: list[str]) -> dict:
    surfaces = {name: surface for _, name, surface in skill_mentions(text)}
    return {"matched": {n: surfaces.get(n, n) for n in matched}, "missing": {n: surfaces.get(n, n) for n in missing}}


def content_hash(job: dict) -> str:
    return hashlib.sha256(f"{job['title']}\n{job['description_markdown']}".encode()).hexdigest()


def company_key(name: str | None) -> str:
    return " ".join((name or "").split()).casefold()


def is_hidden(job: dict, hidden: set[tuple[str, str]]) -> bool:
    if ("job", job["slug"]) in hidden:
        return True
    key = company_key(job.get("company"))
    return bool(key) and ("company", key) in hidden


def build_pool(*, q: str, cities, work_mode, posted_within_days, category, pool: int, offset: int,
               cv_categories: list[str] | None, fetch=None) -> dict:
    """One job pool for GET and the worker: the typed query, or CV-derived categories when none is typed."""
    common = {"cities": cities, "work_mode": work_mode, "posted_within_days": posted_within_days, "fetch": fetch}
    if (q or "").strip() or category or not cv_categories:
        page = job_sources.search_jobs(q=q, category=category, limit=pool, offset=offset, **common)
        return {"items": page["items"], "total": page["total"]}
    share, items, seen, total = max(1, pool // len(cv_categories)), [], set(), 0
    for name in cv_categories:
        page = job_sources.search_jobs(q=None, category=name, limit=share, offset=offset // len(cv_categories), **common)
        total += page["total"]
        for item in page["items"]:
            if item["slug"] not in seen:
                seen.add(item["slug"])
                items.append(item)
    items.sort(key=lambda item: item["age_days"] if item["age_days"] is not None else 10**6)
    return {"items": items, "total": total}
```

- [ ] **Step 6: Run unit tests plus existing skill tests**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/unit -q`
Expected: PASS (including `test_skill_coverage.py` and `test_job_sources.py`). Adjust a test literal only if the dictionary lacks an alias it assumes (e.g. pick another alias the dictionary has); never weaken the assertion's intent.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/src/job_search_platform/services/skill_coverage.py backend/src/job_search_platform/services/smart_match.py backend/src/job_search_platform/integrations/jev.py backend/tests/unit/test_smart_match.py backend/tests/unit/test_jev_client.py
rtk git commit -m "feat: Jev client and smart-match scoring, categories, highlights and pool builder"
```

---

### Task 3: `match_jobs` run and worker

**Files:**
- Modify: `services/contracts.py` (`MatchRunRequest`, `ViewOperation` adds `"match_jobs"`), `services/runs.py` (`submit_match`, owner-only visibility at the `run.operation in {"export_document", "profile_cv"}` check near line 660), `workers/executor.py`, `main.py` (only if the executor constructor call needs nothing new — it should not; `jev_factory` has a default)
- Test: `backend/tests/integration/test_match_jobs_run.py`

**Interfaces:**
- Consumes: Task 1 models; Task 2 `smart_match.*`, `JevClient`, `JEV_MODEL`.
- Produces: `MatchRunRequest(cv_revision_id: UUID, q: str = "", cities: list[str] = [], work_mode: Literal["remote","hybrid","onsite"] | None = None, posted_within_days: int | None (1–90) = None, category: str | None (pattern ^[a-z0-9_-]{1,60}$) = None, pool: int (1–100) = 100, offset: int (0–1000) = 0)`; `RunService.submit_match(actor, project_id, request: MatchRunRequest) -> RunView`; `RunExecutor(..., jev_factory=JevClient)`; executor stores CV text on every sandbox parse (`_store_profile`); error codes `jev_unavailable`, `jev_failed`, `cv_text_empty` with message keys `errors.<code>`.

- [ ] **Step 1: Write the failing integration test** (`backend/tests/integration/test_match_jobs_run.py`). Reuse helpers from `test_worker_lifecycle.py` (`project`, `owner`, `primary_cv`, and its `FakeRuntime` shape from `test_profile_cv_run_stores_skill_names_only_without_provider` at `test_worker_lifecycle.py:589`); import them the way other integration tests import shared helpers. Use a global provider row with `provider="openrouter"` (create `ProviderConfiguration(project_id=None, provider="openrouter", model="m", secret_reference="keychain:<uuid>", revision=<next>)`) and a fake settings object whose `trusted_provider()` returns `SimpleNamespace(provider="openrouter", api_key="sk-test", model="m", base_url="")`.

```python
@pytest.mark.asyncio
async def test_match_run_parses_once_scores_pool_and_reuses_cache(db_session, tmp_path, monkeypatch):
    # Arrange: project, owner, published CV file (text/plain body "Synthetic CV: Python, Docker. secret-marker-xyz"),
    # CVRevision, global openrouter ProviderConfiguration.
    # Job board fake: job_sources._cache.clear(); monkeypatch job_sources.fetch_json -> JOBS page with 3 jobs
    # (slugs "j1","j2","j3"; companies "Acme","Hidden Co","Beta"); facets -> {"data": {"total": 3, "facets": {"category": {"it": 3}}}}
    # Hide company "Hidden Co" with a JobSearchHidden row (value=smart_match.company_key("Hidden Co")).
    # Fake Jev: class FakeJev: calls = []; decide(state, questions) records (state keys, sorted question ids)
    #   returns {"category": {"probabilities": {"it": 0.9}}} when "category" in questions, else answers with
    #   role_fit score 3 conf 0.9, seniority probs {"2": 1.0}, hard_blocker 0, skill_i noul 1.0, must_i noul 1.0.
    # Act 1: view = await RunService(sessions).submit_match(actor, pid, MatchRunRequest(cv_revision_id=rev.id));
    #   claim; RunExecutor(sessions, queue, FakeRuntime(), FakeSettings(), object(), SyntheticObjectStore(),
    #   workspace_root=tmp_path, jev_factory=lambda key: fake); await executor.execute(claimed, lease_owner)
    # Assert 1: run completed; FakeRuntime.parse_input called once; CVRevisionText row exists with the CV text;
    #   skill_profile has "categories" == ["it"] and "categories_model" == JEV_MODEL;
    #   JobMatchScore rows for j1 and j3 only (Hidden Co never sent: no decide call whose job_posting contains "Hidden Co");
    #   each row model == JEV_MODEL, fit_percent == 100 - (0 penalty) per combine, content_hash == smart_match.content_hash(job).
    #   "secret-marker-xyz" appears in no run_events.public_data and no run error field.
    # Act 2: submit and execute a second identical run.
    # Assert 2: parse_input not called again (text reused), no new decide calls except none (all cached), run completed.
```

Write the test fully with those arrangements and asserts (no comments left as the only body). Add three more tests in the same file:

```python
@pytest.mark.asyncio
async def test_match_run_fails_cleanly_when_every_jev_call_fails(...):
    # FakeJev.decide raises ServiceError("jev_failed"); with a typed query (q="dev") so no category call.
    # Assert run status "failed", error message key "errors.jev_failed", zero JobMatchScore rows.

@pytest.mark.asyncio
async def test_match_run_partial_failure_keeps_scored_jobs(...):
    # FakeJev fails only for the posting containing "j2" -> run "completed", rows for the other jobs only.

def test_submit_match_dedups_active_run_and_requires_openrouter(db_session):
    # Two submit_match calls with equal requests -> same run id; different q -> new run id.
    # Global provider "gemini" -> ServiceError code "jev_unavailable". Grant actor -> "forbidden".
    # A match_jobs run is hidden from non-owner run reads (same rule as profile_cv).
```

- [ ] **Step 2: Run to see it fail**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/integration/test_match_jobs_run.py -q`
Expected: FAIL (`submit_match` missing).

- [ ] **Step 3: Contracts** (`services/contracts.py`)

```python
ViewOperation = Literal["evaluate_job", "draft_documents", "export_document", "profile_cv", "match_jobs"]


class MatchRunRequest(DTO):
    cv_revision_id: UUID
    q: Annotated[str, StringConstraints(max_length=200)] = ""
    cities: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=80)]], Field(max_length=10)] = []
    work_mode: Literal["remote", "hybrid", "onsite"] | None = None
    posted_within_days: Annotated[int, Field(ge=1, le=90)] | None = None
    category: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{1,60}$")] | None = None
    pool: Annotated[int, Field(ge=1, le=100)] = 100
    offset: Annotated[int, Field(ge=0, le=1000)] = 0
```

(Import `Field` from pydantic if not already imported.)

- [ ] **Step 4: `RunService.submit_match`** (`services/runs.py`, next to `submit_profile`; mirror its locking, queue-full check and `append_event(db, run, "run_queued", {"status": "queued"}, now=now)`)

```python
    async def submit_match(self, actor: Actor, project_id: UUID, request: MatchRunRequest) -> RunView:
        """Owner-only: queue a Jev scoring run for one CV revision and one job-search pool."""
        return await asyncio.to_thread(self._submit_match_sync, actor, project_id, request)

    def _submit_match_sync(self, actor: Actor, project_id: UUID, request: MatchRunRequest) -> RunView:
        if actor.kind != "owner":
            raise ServiceError("forbidden")
        now = datetime.now(timezone.utc)
        snapshot = request.model_dump(mode="json")
        with self.sessions.begin() as db:
            authorize(db, actor, project_id, "write", "cv")
            if db.scalar(select(Project.id).where(Project.id == project_id).with_for_update()) is None:
                raise ServiceError("not_found")
            revision = db.scalar(select(CVRevision).join(CV, (CV.project_id == CVRevision.project_id) & (CV.id == CVRevision.cv_id))
                                 .where(CVRevision.project_id == project_id, CVRevision.id == request.cv_revision_id,
                                        CV.removed_at.is_(None)))
            if revision is None:
                raise ServiceError("not_found")
            config = db.scalar(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))
                               .order_by(ProviderConfiguration.revision.desc()).limit(1))
            if config is None or config.provider != "openrouter" or config.secret_reference.startswith("restored-unconfigured:"):
                raise ServiceError("jev_unavailable")
            for active in db.scalars(select(Run).where(
                    Run.project_id == project_id, Run.operation == "match_jobs", Run.cv_revision_id == revision.id,
                    Run.status.in_(("queued", "running")))):
                if active.input_snapshot == snapshot:
                    return self._authorized_view(db, actor, active)
            queued = db.scalar(select(func.count()).select_from(Run).where(
                Run.project_id == project_id, Run.status == "queued")) or 0
            if queued >= MAX_QUEUED_PER_PROJECT:
                raise ServiceError("queue_full", retryable=True)
            key = uuid4().hex
            run = Run(project_id=project_id, actor_scope="owner", idempotency_key=key,
                      request_digest=hashlib.sha256(json.dumps({"match_jobs": snapshot, "key": key}, sort_keys=True).encode()).hexdigest(),
                      operation="match_jobs", cv_revision_id=revision.id, provider_configuration_id=config.id,
                      input_snapshot=snapshot, config_snapshot={"model": JEV_MODEL},
                      output_language="en", status="queued", created_at=now)
            db.add(run)
            db.flush()
            append_event(db, run, "run_queued", {"status": "queued"}, now=now)
            return self._authorized_view(db, actor, run)
```

Add `"match_jobs"` to the owner-only operation set near `services/runs.py:660`.

- [ ] **Step 5: Executor** (`workers/executor.py`)

1. Constructor: add keyword `jev_factory=JevClient` and store `self.jev_factory = jev_factory`. Constants: `MAX_JEV_CALLS = 101`, `JEV_CONCURRENCY = 8`, `MAX_CV_TEXT = 200_000`.
2. Dispatch in `_execute_claimed` next to `profile_cv`: `if run.operation == "match_jobs": await self._execute_match(run, lease_owner, sandbox); return`.
3. `_safe_message` gains `"jev_unavailable": "errors.jev_unavailable"`, `"jev_failed": "errors.jev_failed"`, `"cv_text_empty": "errors.cv_text_empty"`.
4. Extract the sandbox parse out of `_execute_profile` into `_parse_cv_text` and use it in both runs; `_execute_profile` keeps its exact behaviour and error handling:

```python
    async def _parse_cv_text(self, run: Run, lease_owner: str, sandbox: RunSandbox) -> str:
        """Parse the run's CV inside the sandbox (no LLM); the native project is stopped again before returning."""
        cv_path = await self._materialize(run, sandbox)

        async def reserve_tool(_call_id: str, _tool_name: str) -> bool:
            try:
                await asyncio.to_thread(self.queue.reserve_tool_call, run.id, lease_owner)
                return True
            except ServiceError:
                return False

        started = False
        try:
            project = await self.runtime.start_project(run.project_id, sandbox.workspace)
            started = True
            self.runtime.projects[run.project_id].tool_gate = reserve_tool
            self._record_process(run.id, lease_owner, project)
            parsed = await self.runtime.parse_input(run.project_id, cv_path)
        finally:
            await self._stop(run.project_id, started)
        return parsed.text

    async def _execute_profile(self, run: Run, lease_owner: str, sandbox: RunSandbox) -> None:
        """Parse the CV in the sandbox and keep its skill names (and text for Smart match); no LLM, no provider, no job."""
        try:
            text = await self._parse_cv_text(run, lease_owner, sandbox)
            await asyncio.to_thread(self._store_profile, run.cv_revision_id, text)
            await asyncio.to_thread(self.queue.finish, run.id, lease_owner, "completed")
        except ServiceError as exc:
            status = "cancelled" if exc.code == "cancellation_requested" else "failed"
            await self._finish_after_stop(run, lease_owner, status, None if status == "cancelled" else _safe_message(exc.code))
        except Exception:
            await self._finish_after_stop(run, lease_owner, "failed", "errors.execution_failed")
```

5. `_store_profile` also writes the text once:

```python
    def _store_profile(self, cv_revision_id: uuid.UUID, cv_text: str) -> None:
        with self.sessions.begin() as db:
            revision = db.scalar(select(CVRevision).where(CVRevision.id == cv_revision_id).with_for_update())
            if revision is None:
                return
            if (revision.skill_profile or {}).get("method") != SKILL_METHOD:
                revision.skill_profile = {"skills": extract_skills(cv_text), "method": SKILL_METHOD}
            text = cv_text[:MAX_CV_TEXT]
            if text.strip() and db.get(CVRevisionText, cv_revision_id) is None:
                db.add(CVRevisionText(cv_revision_id=cv_revision_id, project_id=revision.project_id, text=text))
```

6. The match run and its DB helpers:

```python
    async def _execute_match(self, run: Run, lease_owner: str, sandbox: RunSandbox) -> None:
        """Score the run's job pool with Jev; each finished score is committed at once, so cancel keeps them."""
        try:
            provider = await self.settings.trusted_provider()
            if provider is None or provider.provider != "openrouter":
                raise ServiceError("jev_unavailable")
            text = await asyncio.to_thread(self._stored_cv_text, run.cv_revision_id)
            if text is None:
                text = await self._parse_cv_text(run, lease_owner, sandbox)
                await asyncio.to_thread(self._store_profile, run.cv_revision_id, text)
            if not text.strip():
                raise ServiceError("cv_text_empty")
            client = self.jev_factory(provider.api_key)
            snap = run.input_snapshot
            auto = not (snap.get("q") or "").strip() and not snap.get("category")
            categories = await asyncio.to_thread(self._match_categories, run.cv_revision_id, client, text) if auto else None
            hidden = await asyncio.to_thread(self._hidden_keys, run.project_id)
            page = await asyncio.to_thread(functools.partial(
                smart_match.build_pool, q=snap.get("q") or "", cities=snap.get("cities") or [],
                work_mode=snap.get("work_mode"), posted_within_days=snap.get("posted_within_days"),
                category=snap.get("category"), pool=snap["pool"], offset=snap.get("offset", 0), cv_categories=categories))
            jobs = [job for job in page["items"] if not smart_match.is_hidden(job, hidden)]
            todo = (await asyncio.to_thread(self._unscored, run.cv_revision_id, jobs))[: MAX_JEV_CALLS - 1]
            limit = asyncio.Semaphore(JEV_CONCURRENCY)

            async def score(job: dict) -> bool:
                async with limit:
                    skills = smart_match.job_skills(job)
                    try:
                        answers = await asyncio.to_thread(client.decide, smart_match.job_state(text, job), smart_match.job_questions(skills))
                        result = smart_match.combine(answers, skills)
                    except (ServiceError, KeyError, TypeError, ValueError):
                        return False
                    await asyncio.to_thread(self._store_score, run, job, result)
                    return True

            results = await asyncio.gather(*(score(job) for job in todo))
            if todo and not any(results):
                raise ServiceError("jev_failed")
            await asyncio.to_thread(self.queue.finish, run.id, lease_owner, "completed")
        except ServiceError as exc:
            status = "cancelled" if exc.code == "cancellation_requested" else "failed"
            await self._finish_after_stop(run, lease_owner, status, None if status == "cancelled" else _safe_message(exc.code))
        except Exception:
            await self._finish_after_stop(run, lease_owner, "failed", "errors.execution_failed")

    def _stored_cv_text(self, cv_revision_id: uuid.UUID) -> str | None:
        with self.sessions() as db:
            row = db.get(CVRevisionText, cv_revision_id)
            return None if row is None else row.text

    def _hidden_keys(self, project_id: uuid.UUID) -> set[tuple[str, str]]:
        with self.sessions() as db:
            return {(kind, value) for kind, value in db.execute(
                select(JobSearchHidden.kind, JobSearchHidden.value).where(JobSearchHidden.project_id == project_id))}

    def _unscored(self, cv_revision_id: uuid.UUID, jobs: list[dict]) -> list[dict]:
        with self.sessions() as db:
            done = set(db.execute(select(JobMatchScore.job_slug, JobMatchScore.content_hash).where(
                JobMatchScore.cv_revision_id == cv_revision_id, JobMatchScore.model == JEV_MODEL,
                JobMatchScore.job_slug.in_([job["slug"] for job in jobs]))).all())
        return [job for job in jobs if (job["slug"], smart_match.content_hash(job)) not in done]

    def _store_score(self, run: Run, job: dict, result: dict) -> None:
        details = {k: v for k, v in result.items() if k not in ("fit_percent", "uncertain")}
        statement = pg_insert(JobMatchScore).values(
            id=uuid.uuid4(), project_id=run.project_id, cv_revision_id=run.cv_revision_id, job_slug=job["slug"][:200],
            content_hash=smart_match.content_hash(job), model=JEV_MODEL, fit_percent=result["fit_percent"],
            uncertain=result["uncertain"], details=details,
        ).on_conflict_do_nothing(constraint="uq_job_match_scores_key")
        with self.sessions.begin() as db:
            db.execute(statement)

    def _match_categories(self, cv_revision_id: uuid.UUID, client, text: str) -> list[str] | None:
        with self.sessions() as db:
            profile = (db.get(CVRevision, cv_revision_id).skill_profile or {})
        if profile.get("categories_model") == JEV_MODEL and profile.get("categories"):
            return list(profile["categories"])
        options = [facet["value"] for facet in job_sources.job_facets()["categories"]]
        if not options:
            return None
        chosen = smart_match.pick_categories(client.decide({"cv": text}, smart_match.category_question(options))["category"])
        with self.sessions.begin() as db:
            revision = db.scalar(select(CVRevision).where(CVRevision.id == cv_revision_id).with_for_update())
            revision.skill_profile = {**(revision.skill_profile or {}), "categories": chosen, "categories_model": JEV_MODEL}
        return chosen
```

Imports to add: `functools`, `from sqlalchemy.dialects.postgresql import insert as pg_insert`, `from job_search_platform.db.models import CVRevisionText, JobMatchScore, JobSearchHidden`, `from job_search_platform.integrations.jev import JEV_MODEL, JevClient`, `from job_search_platform.services import job_sources, smart_match`. The claim watchdog (`_monitor_claim`) already heartbeats, enforces the active-time limit and cancels the task on a cancel request, so no extra checks are needed between calls.

- [ ] **Step 6: Run the new tests and the worker/profile suites**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/integration/test_match_jobs_run.py backend/tests/integration/test_worker_lifecycle.py backend/tests/integration/test_skill_match.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add backend/src/job_search_platform/services/contracts.py backend/src/job_search_platform/services/runs.py backend/src/job_search_platform/workers/executor.py backend/tests/integration/test_match_jobs_run.py
rtk git commit -m "feat: owner-only match_jobs run scores the job pool with Jev and caches per CV revision"
```

---

### Task 4: REST API and contract

**Files:**
- Modify: `api/rest.py` (match GET at `api/rest.py:457-501`, new routes, error status map at `api/rest.py:59-67`, `list_runs` filter at `api/rest.py:759`), `docs/contracts/application-api.yaml`
- Test: `backend/tests/integration/test_smart_match_api.py`

**Interfaces:**
- Consumes: Task 1 models, Task 2 `smart_match`, Task 3 `MatchRunRequest`, `RunService.submit_match`.
- Produces (HTTP): `GET /projects/{p}/job-search/match` items gain `ai_match` and `highlight`; response gains `ai {status, categories, scored}` and `hidden_count`. `POST /projects/{p}/job-search/match/runs` → 202 RunView. `GET|POST /projects/{p}/job-search/hidden`, `DELETE /projects/{p}/job-search/hidden/{hidden_id}`.

- [ ] **Step 1: Write failing API tests** (`backend/tests/integration/test_smart_match_api.py`; reuse `api_context`, `_owner`, `_write_headers`, `_project`, `_upload`, `_raw`/`source` pattern from `test_skill_match.py`)

Cover, each as its own test with real assertions:
1. `unavailable`: no OpenRouter provider → GET returns `ai.status == "unavailable"`, keyword order unchanged, every `ai_match is None`, `highlight.matched` uses the keyword lists; POST runs → 409 `jev_unavailable`.
2. With a global OpenRouter row (insert `ProviderConfiguration(project_id=None, provider="openrouter", …)` directly): q="dev", no scores → `ai.status == "missing"`, `scored == 0`; insert `JobMatchScore` rows for two of five slugs with the right `content_hash` and `model=JEV_MODEL` → `partial`, those two items first sorted by `fit_percent` desc, `ai_match` has `band`, `must_missing`, `nice_missing`; a row with a stale `content_hash` is ignored; all five scored → `ready`.
3. Auto mode: q="" and no category and no stored categories → `items == []`, `ai.status == "missing"`, `ai.categories is None`, upstream not called; with `skill_profile.categories=["it"]` and `categories_model=JEV_MODEL` → upstream called with `category=it`, `ai.categories == ["it"]`.
4. Hidden: POST hidden `{kind:"company", value:"Acme  Co", label:"Acme Co"}` → 201 and value stored as `company_key`; second identical POST → 201 with the same id; GET match excludes Acme jobs and `hidden_count` counts them; DELETE → 204 and the jobs return; DELETE with another project's id → 404; `kind:"other"` → 422; grant token → 401/403.
5. POST runs twice with the same body → same run id (202 both); `GET /runs` list does not include `match_jobs` runs; provider switched to gemini after scores exist → GET `unavailable`, scores still in the table.
6. Highlight escape-neutral: a posting containing `<script>` and `React (JS)` returns `highlight` surfaces as plain strings from the posting (no server-side markup).

- [ ] **Step 2: Run to see them fail**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests/integration/test_smart_match_api.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement** in `api/rest.py`

Error map additions: `"jev_unavailable": 409`.

`list_runs`: `query = query.where(Run.operation.not_in(("profile_cv", "match_jobs")))`.

Helper:

```python
def _jev_available(db) -> bool:
    row = db.scalar(select(ProviderConfiguration).where(ProviderConfiguration.project_id.is_(None))
                    .order_by(ProviderConfiguration.revision.desc()).limit(1))
    return row is not None and row.provider == "openrouter" and not row.secret_reference.startswith("restored-unconfigured:")
```

Replace the body of `match_job_sources` after the existing profile check (keep the `cv_profile_missing` 409 and the 404 rules):

```python
        cv_skills = list(profile["skills"])
        ai_on = _jev_available(db)
        stored = profile.get("categories") if profile.get("categories_model") == JEV_MODEL else None
        hidden = {(kind, value) for kind, value in db.execute(
            select(JobSearchHidden.kind, JobSearchHidden.value).where(JobSearchHidden.project_id == project_id))}
    city_list = job_sources.parse_cities(cities)
    if city_list is None:
        raise RequestValidationError([{"loc": ("query", "cities"), "msg": "invalid", "type": "value_error"}])
    auto = not q.strip() and not category

    def run() -> dict:
        if ai_on and auto and not stored:
            return {"items": [], "total": 0, "offset": offset, "pool": pool, "hidden_count": 0,
                    "ai": {"status": "missing", "categories": None, "scored": 0}}
        page = smart_match.build_pool(q=q, cities=city_list, work_mode=work_mode, posted_within_days=posted_within_days,
                                      category=category, pool=pool, offset=offset, cv_categories=stored if ai_on else None)
        items = [item for item in page["items"] if not smart_match.is_hidden(item, hidden)]
        with services.sessions() as db:
            rows = {(r.job_slug, r.content_hash): r for r in db.scalars(select(JobMatchScore).where(
                JobMatchScore.cv_revision_id == cv_revision_id, JobMatchScore.model == JEV_MODEL,
                JobMatchScore.job_slug.in_([item["slug"] for item in items])))} if ai_on else {}
        for item in items:
            text = smart_match.job_text(item)
            found = match_skills(cv_skills, text)
            item["match"] = None if found is None else {
                "score_percent": round(found["ratio"] * 100), "matched": found["matched"],
                "missing": found["missing"], "required_count": len(found["required"])}
            row = rows.get((item["slug"], smart_match.content_hash(item)))
            item["ai_match"] = None if row is None else {"fit_percent": row.fit_percent, "uncertain": row.uncertain, **row.details}
            matched = item["ai_match"]["skills_evidenced"] if row else (found or {}).get("matched", [])
            missing = (row.details["must_missing"] + row.details["nice_missing"]) if row else (found or {}).get("missing", [])
            item["highlight"] = smart_match.highlight_terms(text, matched, missing)
        items.sort(key=lambda i: (i["match"] is None, -(i["match"] or {}).get("score_percent", 0),
                                  i["age_days"] if i["age_days"] is not None else 10**6))
        items.sort(key=lambda i: (i["ai_match"] is None, -(i["ai_match"] or {}).get("fit_percent", 0)))  # stable: keyword order inside ties
        scored = sum(1 for i in items if i["ai_match"])
        status = "unavailable" if not ai_on else "ready" if items and scored == len(items) else "partial" if scored else "missing"
        return {"items": items, "total": page["total"], "offset": offset, "pool": pool,
                "hidden_count": len(page["items"]) - len(items),
                "ai": {"status": status, "categories": stored if ai_on and auto else None, "scored": scored}}
```

(An empty pool with AI on and nothing to score reports `ready` only when `items` is non-empty; an empty list reports `missing` so the page does not spin forever — the page treats `missing` with zero items and a finished run as "no jobs".)

New routes (follow the neighbouring route style; owner-only through `write_actor`/`owner_actor` exactly as `profile_cv` and `match_job_sources` do):

```python
@router.post("/projects/{project_id}/job-search/match/runs", status_code=202, response_model=RunView)
async def start_match_run(project_id: UUID, body: MatchRunRequest, actor=Depends(write_actor), services: Services = Depends(get_services)):
    """Queue (or return the active) owner-only Jev scoring run for this CV revision and pool."""
    return await services.runs.submit_match(actor, project_id, body)


# services/contracts.py (DTOs live there; import it in rest.py)
class HiddenCreate(DTO):
    kind: Literal["job", "company"]
    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


@router.get("/projects/{project_id}/job-search/hidden")
async def list_hidden(project_id: UUID, actor=Depends(owner_actor), services: Services = Depends(get_services)):
    with services.sessions() as db:
        authorize(db, actor, project_id, "read", "cv")
        rows = db.scalars(select(JobSearchHidden).where(JobSearchHidden.project_id == project_id)
                          .order_by(JobSearchHidden.created_at.desc())).all()
        return {"items": [{"id": str(r.id), "kind": r.kind, "label": r.label, "created_at": r.created_at.isoformat()} for r in rows]}


@router.post("/projects/{project_id}/job-search/hidden", status_code=201)
async def hide_job_search_item(project_id: UUID, body: HiddenCreate, actor=Depends(write_actor), services: Services = Depends(get_services)):
    value = body.value if body.kind == "job" else smart_match.company_key(body.value)
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        if db.get(Project, project_id) is None:
            raise ServiceError("not_found")
        db.execute(pg_insert(JobSearchHidden).values(id=uuid4(), project_id=project_id, kind=body.kind, value=value,
                                                     label=body.label).on_conflict_do_nothing(constraint="uq_job_search_hidden_key"))
        row = db.scalar(select(JobSearchHidden).where(JobSearchHidden.project_id == project_id,
                                                      JobSearchHidden.kind == body.kind, JobSearchHidden.value == value))
        return {"id": str(row.id), "kind": row.kind, "label": row.label, "created_at": row.created_at.isoformat()}


@router.delete("/projects/{project_id}/job-search/hidden/{hidden_id}", status_code=204)
async def unhide_job_search_item(project_id: UUID, hidden_id: UUID, actor=Depends(write_actor), services: Services = Depends(get_services)):
    with services.sessions.begin() as db:
        authorize(db, actor, project_id, "write", "cv")
        row = db.scalar(select(JobSearchHidden).where(JobSearchHidden.project_id == project_id, JobSearchHidden.id == hidden_id))
        if row is None:
            raise ServiceError("not_found")
        db.delete(row)
    return Response(status_code=204)
```

`write_actor` must reject grant tokens for these routes the same way `profile_cv` does (the test in step 1 checks 401/403); if `write_actor` admits grants, use `owner_actor` plus the CSRF check the other owner-only writes use.

- [ ] **Step 4: Update `docs/contracts/application-api.yaml`**: extend the `/job-search/match` description (new item fields `ai_match`, `highlight`; response fields `ai`, `hidden_count`; 404/409/502 unchanged), add `/projects/{project_id}/job-search/match/runs` (post: 202 RunView, 404, 409 `jev_unavailable`, 422) and `/projects/{project_id}/job-search/hidden` (get, post) and `/projects/{project_id}/job-search/hidden/{hidden_id}` (delete), all `security: [{ownerSession: []}]`, in the same style as the neighbouring entries.

- [ ] **Step 5: Run API tests, contract test and the whole backend suite**

Run: `uv run --env-file .env --locked --project backend pytest backend/tests -q --deselect backend/tests/integration/test_application_startup.py`
Expected: PASS (previous baseline 275 passed, plus the new tests).

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/api/rest.py backend/src/job_search_platform/services/contracts.py docs/contracts/application-api.yaml backend/tests/integration/test_smart_match_api.py
rtk git commit -m "feat(api): Smart match returns Jev scores, bands, highlights and hidden filters; start-run and hide endpoints"
```

---

### Task 5: Smart match UI

**Files:**
- Create: `frontend/src/features/search/highlight.ts`
- Modify: `frontend/src/features/search/SearchPage.tsx`, `frontend/src/lib/api-types.ts` (`RunOperation` adds `'match_jobs'`), `frontend/src/features/console/copy.ts` (`ops.match_jobs: 'จัดอันดับงานด้วย AI'` / `'Rank jobs with AI'`)

**Interfaces:**
- Consumes: Task 4 HTTP shapes.
- Produces: `highlightSegments(text: string, terms: { matched: Record<string, string>; missing: Record<string, string> }): Array<{ text: string; kind: 'plain' | 'matched' | 'missing' }>`.

Read `DESIGN.md` first and follow its shared UI rules.

- [ ] **Step 1: Types in `SearchPage.tsx`**

```ts
type AiMatch = {
  fit_percent: number; band: 1 | 2 | 3 | 4 | 5; uncertain: boolean; seniority: 'far_below' | 'below' | 'meets' | 'above';
  hard_blocker: boolean; skills_evidenced: string[]; must_missing: string[]; nice_missing: string[];
};
type Highlight = { matched: Record<string, string>; missing: Record<string, string> };
type AiState = { status: 'ready' | 'partial' | 'missing' | 'unavailable'; categories: string[] | null; scored: number };
// JobSearchItem gains: ai_match?: AiMatch | null; highlight?: Highlight;
// Page gains: ai?: AiState; hidden_count?: number;
```

- [ ] **Step 2: `highlight.ts`** — splits plain text into segments; never builds HTML strings.

```ts
export type Segment = { text: string; kind: 'plain' | 'matched' | 'missing' };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function highlightSegments(text: string, terms: { matched: Record<string, string>; missing: Record<string, string> }): Segment[] {
  const kinds = new Map<string, Segment['kind']>();
  for (const surface of Object.values(terms.missing)) if (surface.trim()) kinds.set(surface.toLowerCase(), 'missing');
  for (const surface of Object.values(terms.matched)) if (surface.trim()) kinds.set(surface.toLowerCase(), 'matched');
  if (!kinds.size) return [{ text, kind: 'plain' }];
  const alternatives = [...kinds.keys()].sort((a, b) => b.length - a.length).map(term =>
    /^[\x00-\x7f]+$/.test(term) ? `(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])` : escapeRegExp(term));
  const pattern = new RegExp(alternatives.join('|'), 'gi');
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), kind: 'plain' });
    out.push({ text: match[0], kind: kinds.get(match[0].toLowerCase()) ?? 'plain' });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}
```

If the frontend has a unit test runner (check `frontend/package.json`), add `highlight.test.ts` asserting: `<script>` text stays a plain segment string; `C++` and `React (JS)` surfaces do not throw and are marked; Thai surfaces are marked; overlapping terms prefer the longest. If there is no runner, skip the file (do not add a dependency) and the reviewer checks these cases in the browser.

- [ ] **Step 3: Rendering the description with highlights.** `JobDetail` currently renders `<Markdown>` for `description_markdown`. When `job.highlight` has any entry, render the description as plain text paragraphs (split on blank lines) mapping segments to `<mark>` elements: matched `bg-success/15 text-success rounded px-0.5`, missing `bg-destructive/12 text-destructive rounded px-0.5` (tokens from `styles.css`, both themes), with an `aria-label`-free inline `<span className="sr-only">` suffix ("(มีใน CV)" / "(ขาด)"). Otherwise keep `<Markdown>`. React escapes all text; no `dangerouslySetInnerHTML`.

- [ ] **Step 4: Badges and chips.**
  - `BandBadge({ ai })`: variant by band (5 `success`, 4 `success`, 3 `warning`, 2 `secondary`, 1 `outline`), text `${bandLabel[ai.band]} · ${ai.fit_percent}%`; Thai labels `{5:'เหมาะมาก',4:'เหมาะ',3:'พอได้',2:'น้อย',1:'ไม่เหมาะ'}`, English `{5:'Great fit',4:'Good fit',3:'Fair',2:'Weak',1:'Poor fit'}`.
  - Card row in smart mode: `BandBadge` when `ai_match`, then the existing keyword badge relabelled `ATS ${score_percent}%` (`variant="outline"`); `uncertain` → `Badge variant="outline"` "ไม่แน่ใจ"/"Unsure"; `hard_blocker` → warning badge with `AlertTriangle` "ขาดคุณสมบัติบังคับ"/"Missing a must-have".
  - Detail pane (`MatchSummary`): with `ai_match` show seniority line (`far_below`→ต่ำกว่ามาก/Well below, `below`→ต่ำกว่าเล็กน้อย/Slightly below, `meets`→ตรง/Meets, `above`→สูงกว่า/Above) and three chip groups "มีหลักฐานใน CV" (success), "ขาด (บังคับ)" (destructive outline), "ขาด (มีก็ดี)" (outline); without it keep today's keyword chips.
  - Client sort `byMatch` becomes: items with `ai_match` first by `fit_percent` desc, then the existing keyword order.

- [ ] **Step 5: Run start, progress and auto categories** (inside the existing load effect, smart mode only, after a page loads):
  - If `page.ai?.status` is `missing` or `partial`: `POST /projects/${projectId}/job-search/match/runs` with `{cv_revision_id: revisionId, q, cities: city ? [city] : [], work_mode: mode || null, posted_within_days: posted ? Number(posted) : null, category: category || null, pool: POOL_SIZE, offset: 0}`, then every 2 s re-fetch `buildPath(0)` (replace items, keep the selected slug) and `GET /runs/{id}` until the run is `completed`/`failed`/`cancelled`/`interrupted` or 90 attempts; abort on filter change (reuse the effect's `AbortController` and `sleep`). Show a status line "กำลังจัดอันดับด้วย AI… {scored}/{items.length}" / "Ranking with AI… n/N" with `Loader2` spin, `role="status"`.
  - If the first page has `items.length === 0`, `ai.status === 'missing'` and no query/category: show "กำลังหางานที่เหมาะกับ CV…"/"Finding jobs that fit this CV…" instead of the empty state while the run is active.
  - On a failed run: keep the ATS list, show an inline alert "จัดอันดับด้วย AI ไม่สำเร็จ"/"AI ranking failed" with a retry button that re-runs the effect.
  - `ai.categories` (auto mode): a line "หมวดที่ AI เลือกจาก CV:"/"Categories picked from the CV:" followed by one button-chip per category (label via `catLabel`). Clicking a chip sets it as the explicit `category` filter, which ends auto mode; the existing filter UI clears it. Typing a query also ends auto mode because `q` is no longer empty.
  - `ai.status === 'unavailable'`: muted line "เปิดการจัดอันดับด้วย AI โดยตั้งผู้ให้บริการเป็น OpenRouter" with a `Link` to `/app/settings` (check the actual settings route in the router and use it).
  - Under the mode switch in smart mode (not unavailable): `text-xs text-muted-foreground` notice "ระบบส่งเนื้อหา CV ไปยัง OpenRouter/TypeSafe เพื่อจัดอันดับ" / "Your CV text is sent to OpenRouter/TypeSafe for ranking".

- [ ] **Step 6: Hide job / company.** The card is a `<button>`; place a sibling `…` menu (reuse the project's existing dropdown-menu component used by the sidebar "…" menus) at the card's top-right, outside the button, only in smart mode: "ซ่อนงานนี้"/"Hide this job" posts `{kind:'job', value: job.slug, label: job.title}`; "ซ่อนบริษัทนี้"/"Hide this company" (only when `job.company`) posts `{kind:'company', value: job.company, label: job.company}`. Remove matching items locally at once, show an Undo bar for 8 s (same pattern and copy style as hidden sessions in `components/ProjectTree.tsx`) whose Undo calls `DELETE …/hidden/{id}` and re-fetches. Under the list, when `hidden_count > 0` or hidden items exist: link "ที่ซ่อนไว้ ({n})"/"Hidden ({n})" opening a dialog (existing `Dialog` component) listing `GET …/hidden` items (label + kind word "งาน"/"บริษัท") each with "เลิกซ่อน"/"Unhide".

- [ ] **Step 7: Build**

Run: `rtk npm run build --prefix frontend`
Expected: PASS (tsc + vite).

- [ ] **Step 8: Commit**

```bash
rtk git add frontend/src/features/search/SearchPage.tsx frontend/src/features/search/highlight.ts frontend/src/lib/api-types.ts frontend/src/features/console/copy.ts
rtk git commit -m "feat(ui): Smart match shows AI fit bands, must-have gaps, posting highlights, auto categories and hide job/company"
```

(Add `highlight.test.ts` to the commit if created.)

---

### Task 6: Root verification (not delegated)

- [ ] Restart the app gracefully (TERM the process on :8000, start `scripts/run_local.py --build-frontend --open-browser --enable-sharing --share-host 127.0.0.1 --share-port 8001` with `uv run --env-file .env`); migration 0014 applies at startup.
- [ ] Browser, project "ai engineer", Smart match, AI CV, empty query: "Finding jobs…" → category chips → progress n/N → bands sorted; open a card: highlights green/red, three chip groups; hide a company → Undo → back; "Hidden (n)" dialog unhide; light and dark themes; 375 px width has no horizontal scroll.
- [ ] Type "frontend" → new pool scored; second load of the same search is instant (cached).
- [ ] Final independent review (Opus 5.5 high) of the whole branch diff against spec and this plan; PASS required before reporting.
