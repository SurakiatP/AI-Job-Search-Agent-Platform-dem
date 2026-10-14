# Thai job sources, job store and hourly ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill a Postgres job store hourly from freehire, Greenhouse, Lever and SmartRecruiters. Enrich each posting with a Thai dictionary, collapse cross-source duplicates, and mark closed postings (TOR WP5).

**Architecture:**
- Source fetchers in `integrations/job_boards.py` turn upstream JSON into one posting shape.
- Pure enrichment (`services/job_text.py`, `services/job_dictionary.py`) fills the filter fields.
- `services/job_store.py` upserts, closes, dedups and purges.
- `scripts/ingest_jobs.py` is the run-once CLI that launchd starts every hour.
- No backend-process loop and no new dependency.

**Tech Stack:** Python 3.12, stdlib `urllib`/`html.parser`, SQLAlchemy 2.1, Alembic (raw SQL migrations), PostgreSQL 17, pytest.

**Spec:** `docs/superpowers/specs/2026-10-14-thai-job-sources-design.md`

## Global Constraints

- Branch `feat/thai-job-sources` from fetched `origin/develop`. Prefix shell commands with `rtk`.
- No new dependency. Use stdlib HTTP/HTML only.
- Only the hosts `freehire.me`, `boards-api.greenhouse.io`, `api.lever.co` and `api.smartrecruiters.com`, as a fixed allowlist in code.
- Board token regex is `^[A-Za-z0-9_.-]{1,100}$`. URL-quote the token.
- HTTP: no redirects, `ProxyHandler({})`, 8 s timeout, 2 MiB body cap (8 MiB for Greenhouse `content=true`), User-Agent `job-search-platform/0.1 (+https://github.com/SurakiatP/AI-Job-Search-Agent-Platform-dem)`, 0.5 s pause per host, 20-minute run deadline.
- A posting closes after 2 consecutive successful fetches of its board without it. A failed or skipped board never counts.
- Dedup window is 30 days. Description purge happens 90 days after `closed_at`.
- `description_markdown` is capped at 50,000 characters. `skills` is capped at 8. `slug` is capped at 200 characters.
- Slugs: freehire uses `public_slug`. Other sources use `gh-{board}-{id}`, `lv-{board}-{id}` and `sr-{board}-{id}`.
- Category values come from freehire's vocabulary (listed in Task 2). Seniority and employment_type values come from `job_sources.CHOICES`.
- Test data is synthetic. Nothing in tests touches the network.
- Migration is `0027_job_store`, down_revision `0026_oauth`.

## Review Focus

1. **A board that returns HTTP 200 with an empty list** (an upstream glitch, or a company that removed its board) closes everything after 2 runs. That is expected, but a single parse failure must count as failed, not empty. Task 3 `test_malformed_body_is_failure_not_empty`.
2. **The same posting reappearing after closing** must reopen with the same slug and keep its `first_seen_at`. Task 5 `test_reappearing_posting_reopens`.
3. **The canonical posting closing while a duplicate stays open** must promote the duplicate, without the cluster vanishing from search. Task 6 `test_canonical_close_promotes_open_member`.
4. **Thai-only titles and locations** ("โปรแกรมเมอร์", "กทม.") must enrich the same as the English ones. Task 2 table tests.
5. **A crash mid-run** must leave earlier boards committed, and the advisory lock must release. Task 7 `test_board_failure_isolated` and `test_second_run_refused_while_locked`.

---

### Task 1: Migration and models for `job_postings` and `ingest_runs`

**Files:**
- Create: `backend/migrations/versions/0027_job_store.py`
- Modify: `backend/src/job_search_platform/db/models.py` (append two classes at the end)
- Test: `backend/tests/integration/test_job_store_schema.py`

**Interfaces:**
- Produces: ORM classes `JobPosting` and `IngestRun` with exactly the columns below. Later tasks import them from `job_search_platform.db.models`.

- [ ] **Step 1: Write the failing test**

```python
"""WP5 job store schema. Synthetic data only."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import IngestRun, JobPosting


def _posting(**extra):
    now = datetime.now(timezone.utc)
    values = dict(id=uuid.uuid4(), source="greenhouse", board="acme", external_id="1", slug="gh-acme-1",
                  title="Synthetic Engineer", source_url="https://example.test/1", first_seen_at=now,
                  last_seen_at=now, content_hash="h", updated_at=now)
    values.update(extra)
    return JobPosting(**values)


@pytest.mark.integration
def test_posting_round_trip_and_defaults(db_session):
    db_session.add(_posting())
    db_session.flush()
    row = db_session.query(JobPosting).one()
    assert row.cities == [] and row.skills == [] and row.missed_runs == 0
    assert row.closed_at is None and row.canonical_id is None and row.index_dirty is True


@pytest.mark.integration
def test_source_external_id_unique(db_session):
    db_session.add(_posting())
    db_session.flush()
    db_session.add(_posting(slug="other"))
    with pytest.raises(IntegrityError):
        db_session.flush()


@pytest.mark.integration
def test_source_is_checked(db_session):
    db_session.add(_posting(source="jobsdb"))
    with pytest.raises(IntegrityError):
        db_session.flush()


@pytest.mark.integration
def test_ingest_run_row(db_session):
    db_session.add(IngestRun(id=uuid.uuid4(), started_at=datetime.now(timezone.utc), status="running"))
    db_session.flush()
    assert db_session.query(IngestRun).one().per_board == {}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_store_schema.py -q`
Expected: FAIL with `ImportError: cannot import name 'IngestRun'`.

- [ ] **Step 3: Write the migration**

```python
"""WP5 job store: ingested postings from Thai job sources and one row per hourly ingest run."""

from alembic import op

revision = "0027_job_store"
down_revision = "0026_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE job_postings (
        id uuid PRIMARY KEY,
        source varchar(20) NOT NULL,
        board varchar(100),
        external_id varchar(200) NOT NULL,
        slug varchar(200) NOT NULL UNIQUE,
        title varchar(300) NOT NULL,
        company varchar(300),
        location varchar(300),
        cities jsonb NOT NULL DEFAULT '[]',
        province varchar(8),
        work_mode varchar(10),
        seniority varchar(12),
        employment_type varchar(12),
        company_type varchar(12),
        category varchar(60),
        skills jsonb NOT NULL DEFAULT '[]',
        salary_min integer,
        salary_max integer,
        salary_currency varchar(3),
        salary_period varchar(5),
        salary_thb_month_min integer,
        posting_language varchar(2),
        description_markdown text,
        source_url varchar(2048) NOT NULL,
        url_key varchar(2048),
        match_key varchar(700),
        canonical_id uuid REFERENCES job_postings(id) ON DELETE SET NULL,
        posted_at timestamptz,
        first_seen_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        missed_runs integer NOT NULL DEFAULT 0,
        closed_at timestamptz,
        reality_stale boolean NOT NULL DEFAULT false,
        content_hash varchar(64) NOT NULL,
        index_dirty boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL,
        CONSTRAINT uq_job_postings_source_external UNIQUE (source, external_id),
        CONSTRAINT ck_job_postings_source CHECK (source IN ('freehire','greenhouse','lever','smartrecruiters')),
        CONSTRAINT ck_job_postings_missed CHECK (missed_runs >= 0))""")
    op.execute("CREATE INDEX ix_job_postings_url_key ON job_postings (url_key)")
    op.execute("CREATE INDEX ix_job_postings_match_key ON job_postings (match_key)")
    op.execute("CREATE INDEX ix_job_postings_open ON job_postings (closed_at, canonical_id)")
    op.execute("CREATE INDEX ix_job_postings_board ON job_postings (source, board)")
    op.execute("CREATE INDEX ix_job_postings_dirty ON job_postings (index_dirty) WHERE index_dirty")
    op.execute("""CREATE TABLE ingest_runs (
        id uuid PRIMARY KEY,
        started_at timestamptz NOT NULL,
        finished_at timestamptz,
        status varchar(8) NOT NULL,
        per_board jsonb NOT NULL DEFAULT '{}',
        fetched integer NOT NULL DEFAULT 0,
        created integer NOT NULL DEFAULT 0,
        updated integer NOT NULL DEFAULT 0,
        closed integer NOT NULL DEFAULT 0,
        merged integer NOT NULL DEFAULT 0,
        CONSTRAINT ck_ingest_runs_status CHECK (status IN ('running','ok','partial','failed')))""")


def downgrade() -> None:
    op.execute("DROP TABLE ingest_runs")
    op.execute("DROP TABLE job_postings")
```

- [ ] **Step 4: Add the models** at the end of `db/models.py`. They use the same imports as the existing classes; add `Boolean` and `Integer` to the import line only if they are missing.

```python
JOB_POSTING_SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters")


class JobPosting(Base):
    """WP5 job store: one ingested posting per (source, external_id); Postgres is the system of record."""
    __tablename__ = "job_postings"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    board: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    company: Mapped[str | None] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(300))
    cities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    province: Mapped[str | None] = mapped_column(String(8))
    work_mode: Mapped[str | None] = mapped_column(String(10))
    seniority: Mapped[str | None] = mapped_column(String(12))
    employment_type: Mapped[str | None] = mapped_column(String(12))
    company_type: Mapped[str | None] = mapped_column(String(12))
    category: Mapped[str | None] = mapped_column(String(60))
    skills: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    salary_period: Mapped[str | None] = mapped_column(String(5))
    salary_thb_month_min: Mapped[int | None] = mapped_column(Integer)
    posting_language: Mapped[str | None] = mapped_column(String(2))
    description_markdown: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    url_key: Mapped[str | None] = mapped_column(String(2048))
    match_key: Mapped[str | None] = mapped_column(String(700))
    canonical_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("job_postings.id", ondelete="SET NULL"))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    missed_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reality_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    index_dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_job_postings_source_external"),
        CheckConstraint(f"source IN ({_in(JOB_POSTING_SOURCES)})", name="ck_job_postings_source"),
        CheckConstraint("missed_runs >= 0", name="ck_job_postings_missed"),
        Index("ix_job_postings_url_key", "url_key"),
        Index("ix_job_postings_match_key", "match_key"),
        Index("ix_job_postings_open", "closed_at", "canonical_id"),
        Index("ix_job_postings_board", "source", "board"),
    )


class IngestRun(Base):
    """One hourly ingest run; per_board maps 'source:board' to {state, fetched, error}."""
    __tablename__ = "ingest_runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    per_board: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    fetched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    closed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    merged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __table_args__ = (CheckConstraint("status IN ('running','ok','partial','failed')", name="ck_ingest_runs_status"),)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_store_schema.py tests/integration/test_smart_match_migration.py -q`
Expected: PASS. The second file proves the migration chain still upgrades.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/migrations/versions/0027_job_store.py backend/src/job_search_platform/db/models.py backend/tests/integration/test_job_store_schema.py
rtk git commit -m "feat(jobs): job_postings and ingest_runs store (WP5)"
```

---

### Task 2: Thai dictionary (roles, locations) and enrichment

**Files:**
- Create: `backend/src/job_search_platform/data/roles.txt`
- Create: `backend/src/job_search_platform/data/locations.txt`
- Create: `backend/src/job_search_platform/services/job_dictionary.py`
- Modify: `backend/src/job_search_platform/services/skill_coverage.py`. Append Thai aliases to existing entries only. No new canonical names that collide, and existing canonical names stay unchanged.
- Test: `backend/tests/unit/test_job_dictionary.py`

**Interfaces:**
- Produces, in `services/job_dictionary.py`:
  - `parse_dictionary(text: str) -> list[tuple[str, list[str]]]` parses `Canonical = a, b` lines. Blank lines and lines starting with `#` are skipped.
  - `role_of(title: str) -> tuple[str, str] | None` returns (canonical role, category).
  - `province_of(text: str | None) -> tuple[str, str] | None` returns (ISO code such as `TH-10`, English name such as `Bangkok`).
  - `seniority_of(title: str) -> str | None`.
  - `work_mode_of(text: str) -> str | None`.
  - `posting_language_of(text: str) -> str` returns `th` or `en`.
  - `skills_of(text: str) -> list[str]`: lowercase slugs, max 8, ordered by first occurrence.
  - `CATEGORIES: frozenset[str]`.

- [ ] **Step 1: Write the failing tests**

```python
"""WP5 Thai dictionary and dictionary-only enrichment. Synthetic text only."""
from __future__ import annotations

import pytest

from job_search_platform.services import job_dictionary as jd


def test_parser_skips_comments_and_blank_lines():
    assert jd.parse_dictionary("# head\n\nA = x, y\nB =\n") == [("A", ["x", "y"]), ("B", [])]


def test_locations_cover_all_77_provinces_with_unique_aliases():
    codes = {code for code, _ in jd._PROVINCES.values()}
    assert len(codes) == 77
    assert len(jd._PROVINCES) == len(set(jd._PROVINCES))  # alias -> province is a function


@pytest.mark.parametrize("text, code", [
    ("Bangkok, Thailand", "TH-10"), ("กรุงเทพมหานคร", "TH-10"), ("กทม.", "TH-10"),
    ("Khlong Toei, Bangkok", "TH-10"), ("เขตบางรัก", "TH-10"), ("Chon Buri, Thailand", "TH-20"),
    ("ชลบุรี", "TH-20"), ("Chiang Mai", "TH-50"), ("Remote", None), (None, None),
])
def test_province_of(text, code):
    found = jd.province_of(text)
    assert (found[0] if found else None) == code


@pytest.mark.parametrize("title, seniority", [
    ("Senior Backend Engineer", "senior"), ("Sr. Accountant", "senior"), ("วิศวกรอาวุโส", "senior"),
    ("Software Engineering Intern", "intern"), ("นักศึกษาฝึกงาน การตลาด", "intern"),
    ("Junior Designer", "junior"), ("Engineering Lead", "lead"), ("Head of Sales", "c_level"),
    ("Accountant", None),
])
def test_seniority_of(title, seniority):
    assert jd.seniority_of(title) == seniority


@pytest.mark.parametrize("title, category", [
    ("Backend Engineer", "backend"), ("โปรแกรมเมอร์", "software_engineering"),
    ("Senior Accountant", "finance"), ("นักบัญชี", "finance"), ("Sales Executive", "sales"),
    ("พนักงานขาย", "sales"), ("Digital Marketing Specialist", "marketing"), ("HR Business Partner", "hr"),
])
def test_role_category(title, category):
    assert jd.role_of(title)[1] == category


def test_unknown_role_is_none():
    assert jd.role_of("Synthetic Wizard of Things") is None


def test_categories_are_freehire_vocabulary():
    for _, _, category in jd._ROLES:
        assert category in jd.CATEGORIES


@pytest.mark.parametrize("text, mode", [
    ("Remote - Thailand", "remote"), ("ทำงานที่บ้าน", "remote"), ("Hybrid, Bangkok", "hybrid"),
    ("Bangkok office", None),
])
def test_work_mode_of(text, mode):
    assert jd.work_mode_of(text) == mode


def test_posting_language():
    assert jd.posting_language_of("รับสมัครโปรแกรมเมอร์ ด่วน Python") == "th"
    assert jd.posting_language_of("Backend engineer, Python, ภาษาไทย a plus") == "en"


def test_skills_of_are_filter_slugs_in_order_capped():
    text = "Python, React, Docker, Kubernetes, Terraform, Go via golang, Java, Kotlin, Swift, PHP"
    found = jd.skills_of(text)
    assert found[:3] == ["python", "react", "docker"] and len(found) == 8
    assert all(jd.SKILL_SLUG.match(s) for s in found)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_dictionary.py -q`
Expected: FAIL with `ModuleNotFoundError: job_search_platform.services.job_dictionary`.

- [ ] **Step 3: Write `data/locations.txt`.** Header lines name the source: `# Source: Department of Provincial Administration province list, data.go.th (https://data.go.th/dataset/proviincecode), copied 2026-10-14. ISO 3166-2:TH codes.` Then one line per province, `TH-xx|English RTGS name = Thai name, aliases`, for all 77 provinces with their exact ISO codes. Examples:

```text
TH-10|Bangkok = กรุงเทพมหานคร, กรุงเทพฯ, กรุงเทพ, กทม., กทม, bkk, bangkok metropolis, krung thep
TH-11|Samut Prakan = สมุทรปราการ, samut prakarn
TH-12|Nonthaburi = นนทบุรี
TH-13|Pathum Thani = ปทุมธานี
TH-20|Chon Buri = ชลบุรี, chonburi, pattaya, พัทยา, si racha, ศรีราชา
TH-50|Chiang Mai = เชียงใหม่, chiangmai
TH-83|Phuket = ภูเก็ต
```

Then a `# Bangkok districts` section with one line per district (50), mapped to TH-10:

```text
TH-10|Bangkok = khlong toei, คลองเตย, เขตคลองเตย, bang rak, บางรัก, เขตบางรัก, pathum wan, ปทุมวัน, ...
```

(All 50 districts go in one `TH-10` line or several `TH-10` lines; the parser merges lines with the same key.)

- [ ] **Step 4: Write `data/roles.txt`.** One line per role, `Canonical|category = aliases`, about 100 roles. Categories must be in `CATEGORIES` (below). Examples:

```text
Software Engineer|software_engineering = software developer, programmer, developer, โปรแกรมเมอร์, นักพัฒนาซอฟต์แวร์, นักพัฒนาโปรแกรม
Backend Engineer|backend = backend developer, back-end engineer, แบ็กเอนด์
Frontend Engineer|frontend = frontend developer, front-end engineer, ฟรอนต์เอนด์
Full Stack Engineer|fullstack = full stack developer, fullstack developer, full-stack engineer
Mobile Developer|mobile = ios developer, android developer, flutter developer, นักพัฒนาแอปพลิเคชันมือถือ
Data Engineer|data_engineering = data platform engineer, วิศวกรข้อมูล
Data Analyst|data_analytics = business intelligence analyst, bi analyst, นักวิเคราะห์ข้อมูล
Data Scientist|data_science = นักวิทยาศาสตร์ข้อมูล
QA Engineer|qa = software tester, test engineer, qa tester, นักทดสอบระบบ
DevOps Engineer|devops = platform engineer, cloud engineer
Accountant|finance = accounting officer, นักบัญชี, พนักงานบัญชี
Financial Analyst|finance = นักวิเคราะห์การเงิน
Sales Executive|sales = sales representative, account executive, พนักงานขาย, เจ้าหน้าที่ฝ่ายขาย, ฝ่ายขาย
Marketing Specialist|marketing = digital marketing specialist, marketing executive, การตลาด, เจ้าหน้าที่การตลาด, การตลาดออนไลน์
HR Business Partner|hr = hr officer, human resources, ฝ่ายบุคคล, เจ้าหน้าที่ฝ่ายบุคคล
Recruiter|recruiting = talent acquisition, เจ้าหน้าที่สรรหา
Customer Service|support = call center, customer support, เจ้าหน้าที่บริการลูกค้า
Project Manager|project_management = ผู้จัดการโครงการ
Product Manager|product = product owner
UX/UI Designer|design = ui designer, ux designer, product designer, กราฟิกดีไซเนอร์, graphic designer
Operations Manager|operations = ผู้จัดการฝ่ายปฏิบัติการ
Logistics Officer|logistics = supply chain, เจ้าหน้าที่โลจิสติกส์, คลังสินค้า, warehouse
Safety Officer|occupational_safety = จป., จป.วิชาชีพ, ehs officer, เจ้าหน้าที่ความปลอดภัย
Production Engineer|industrial_engineering = process engineer, วิศวกรอุตสาหการ, วิศวกรฝ่ายผลิต
Lawyer|legal = legal counsel, นักกฎหมาย, ทนายความ
Admin Officer|administration = ธุรการ, เจ้าหน้าที่ธุรการ, secretary, เลขานุการ
```

Keep extending to about 100 common Thai roles. Each alias may appear only once in the file.

- [ ] **Step 5: Write `services/job_dictionary.py`**

```python
"""WP5 Thai dictionary (roles, provinces) and dictionary-only enrichment; no model involved (spec D7)."""
from __future__ import annotations

import re
from pathlib import Path

from job_search_platform.services import skill_coverage

DATA = Path(__file__).resolve().parents[1] / "data"
SKILL_SLUG = re.compile(r"^[a-z0-9][a-z0-9.+#-]{0,40}$")  # same as job_sources.SKILL_RE
MAX_SKILLS = 8

# freehire's category vocabulary (GET /jobs/facets?countries=TH, 2026-10-14), shared so one filter covers all sources.
CATEGORIES = frozenset((
    "management", "sales", "marketing", "support", "industrial_engineering", "finance", "project_management",
    "operations", "qa", "software_engineering", "solutions_engineering", "hr", "design", "hospitality", "devops",
    "product", "recruiting", "business_analysis", "occupational_safety", "security", "fullstack", "legal",
    "data_engineering", "architecture", "backend", "data_analytics", "logistics", "customer_success", "mobile",
    "administration", "data_science", "engineering_design", "ai_engineering", "frontend", "creative", "hardware",
    "ml_ai", "technical_writing", "skilled_trades", "personal_services", "network_engineering", "sre", "embedded",
    "retail", "blockchain", "education", "developer_relations", "other",
))


def parse_dictionary(text: str) -> list[tuple[str, list[str]]]:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, rest = line.partition("=")
        out.append((name.strip(), [a.strip() for a in rest.split(",") if a.strip()]))
    return out


def _matcher(aliases: list[str]) -> re.Pattern[str]:
    """ASCII aliases on alphanumeric boundaries; Thai aliases as substrings (Thai has no word spaces)."""
    ascii_ = sorted((a for a in aliases if a.isascii()), key=len, reverse=True)
    thai = sorted((a for a in aliases if not a.isascii()), key=len, reverse=True)
    parts = []
    if ascii_:
        parts.append(rf"(?<![a-z0-9])(?:{'|'.join(map(re.escape, ascii_))})(?![a-z0-9])")
    if thai:
        parts.append("|".join(map(re.escape, thai)))
    return re.compile("|".join(parts))


def _load_provinces() -> dict[str, tuple[str, str]]:
    table: dict[str, tuple[str, str]] = {}
    for key, aliases in parse_dictionary((DATA / "locations.txt").read_text(encoding="utf-8")):
        code, _, name = key.partition("|")
        for alias in (name, *aliases):
            table[alias.lower()] = (code, name)
    return table


def _load_roles() -> list[tuple[str, re.Pattern[str], str]]:
    roles = []
    for key, aliases in parse_dictionary((DATA / "roles.txt").read_text(encoding="utf-8")):
        name, _, category = key.partition("|")
        roles.append((name, _matcher([a.lower() for a in (name, *aliases)]), category))
    return roles


_PROVINCES = _load_provinces()
_PROVINCE_RE = _matcher(list(_PROVINCES))
_ROLES = _load_roles()

_SENIORITY = (  # first match wins: most specific first
    ("intern", _matcher(["intern", "internship", "trainee", "ฝึกงาน", "นักศึกษาฝึกงาน"])),
    ("c_level", _matcher(["head of", "director", "chief", "vp", "vice president", "cto", "ceo", "cfo", "ผู้อำนวยการ"])),
    ("principal", _matcher(["principal"])),
    ("staff", _matcher(["staff engineer", "staff software"])),
    ("lead", _matcher(["lead", "team lead", "tech lead", "หัวหน้า", "หัวหน้าทีม"])),
    ("senior", _matcher(["senior", "sr", "sr.", "อาวุโส"])),
    ("junior", _matcher(["junior", "jr", "jr.", "entry level", "จูเนียร์"])),
)
_WORK_MODE = (
    ("hybrid", _matcher(["hybrid", "ไฮบริด"])),
    ("remote", _matcher(["remote", "work from home", "wfh", "ทำงานที่บ้าน", "ทำงานจากที่บ้าน"])),
)
_THAI = re.compile(r"[฀-๿]")
_LETTER = re.compile(r"[A-Za-z฀-๿]")


def province_of(text: str | None) -> tuple[str, str] | None:
    match = _PROVINCE_RE.search(text.lower()) if text else None
    return _PROVINCES[match.group(0)] if match else None


def role_of(title: str) -> tuple[str, str] | None:
    low = title.lower()
    best = None
    for name, pattern, category in _ROLES:  # longest matched alias wins ("backend engineer" over "engineer")
        match = pattern.search(low)
        if match and (best is None or len(match.group(0)) > best[0]):
            best = (len(match.group(0)), name, category)
    return (best[1], best[2]) if best else None


def seniority_of(title: str) -> str | None:
    low = title.lower()
    return next((value for value, pattern in _SENIORITY if pattern.search(low)), None)


def work_mode_of(text: str) -> str | None:
    low = text.lower()
    return next((value for value, pattern in _WORK_MODE if pattern.search(low)), None)


def posting_language_of(text: str) -> str:
    letters = len(_LETTER.findall(text))
    return "th" if letters and len(_THAI.findall(text)) / letters >= 0.2 else "en"


def skills_of(text: str) -> list[str]:
    out: list[str] = []
    for _, name, _ in skill_coverage.skill_mentions(text):
        slug = re.sub(r"\s+", "-", name.lower())
        if SKILL_SLUG.match(slug) and slug not in out:
            out.append(slug)
        if len(out) == MAX_SKILLS:
            break
    return out
```

If `skill_coverage.skill_mentions` does not return tuples sorted by position, sort them by position (`[0]`) before the loop. Check its docstring first.

- [ ] **Step 6: Extend the skill dictionary.** In `skill_coverage._DICTIONARY`, append Thai aliases to existing lines only. Examples: `Excel` gains `เอ็กเซล`; `SQL` gains `เอสคิวแอล`; an existing accounting or marketing entry, if present, gains `บัญชี` / `การตลาดดิจิทัล`. Do not add lines whose canonical name already exists. Run `rtk uv run --locked pytest tests/unit/test_skill_coverage.py -q` to prove FR-J03 behavior is unchanged.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_dictionary.py tests/unit/test_skill_coverage.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add backend/src/job_search_platform/data backend/src/job_search_platform/services/job_dictionary.py backend/src/job_search_platform/services/skill_coverage.py backend/tests/unit/test_job_dictionary.py
rtk git commit -m "feat(jobs): Thai role and province dictionary with dictionary-only enrichment (WP5)"
```

---

### Task 3: HTML-to-markdown and source fetchers

**Files:**
- Create: `backend/src/job_search_platform/services/job_text.py`
- Create: `backend/src/job_search_platform/integrations/job_boards.py`
- Test: `backend/tests/unit/test_job_text.py`, `backend/tests/unit/test_job_boards.py`

**Interfaces:**
- Produces, in `services/job_text.py`: `html_to_markdown(html: str) -> str`.
- Produces, in `integrations/job_boards.py`:
  - `class BoardError(Exception)`: any fetch or parse failure for one board.
  - `fetch_board(source: str, board: str | None, *, get=None, sleep=time.sleep) -> list[dict]` returns raw Thailand postings for one board (freehire: `board=None`, all pages). `get(url, max_bytes) -> dict` is injectable.
  - `SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters")`.
  - `valid_board(token: str) -> bool`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/unit/test_job_text.py`:

```python
from job_search_platform.services.job_text import html_to_markdown


def test_keeps_structure_drops_unsafe():
    html = ('<h2>Role</h2><p>Build <b>APIs</b> &amp; <i>tools</i>.</p><ul><li>Python</li><li>SQL</li></ul>'
            '<p><a href="https://x.test/apply" onclick="evil()">Apply</a></p>'
            '<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>')
    md = html_to_markdown(html)
    assert md == "## Role\n\nBuild **APIs** & *tools*.\n\n- Python\n- SQL\n\nApply (https://x.test/apply)"


def test_escaped_html_from_greenhouse_is_unescaped_once():
    assert html_to_markdown("&lt;p&gt;Hello&lt;/p&gt;") == "Hello"


def test_javascript_links_drop_url():
    assert html_to_markdown('<a href="javascript:alert(1)">x</a>') == "x"
```

`backend/tests/unit/test_job_boards.py`:

```python
"""Source fetchers with an injected get(); no network. Synthetic payloads."""
from __future__ import annotations

import pytest

from job_search_platform.integrations import job_boards as jb


class Fake:
    def __init__(self, pages):
        self.pages, self.urls = pages, []

    def __call__(self, url, max_bytes):
        self.urls.append((url, max_bytes))
        return self.pages.pop(0)


def test_rejects_bad_board_token_before_any_request():
    fake = Fake([])
    with pytest.raises(jb.BoardError):
        jb.fetch_board("greenhouse", "../admin", get=fake, sleep=lambda s: None)
    assert fake.urls == []


def test_greenhouse_filters_thailand_and_uses_large_cap():
    fake = Fake([{"jobs": [
        {"id": 1, "title": "Engineer", "location": {"name": "Bangkok, Thailand"}, "absolute_url": "https://x/1",
         "content": "&lt;p&gt;Hi&lt;/p&gt;", "updated_at": "2026-10-01T00:00:00Z"},
        {"id": 2, "title": "Engineer", "location": {"name": "Singapore"}, "absolute_url": "https://x/2"}]}])
    rows = jb.fetch_board("greenhouse", "acme", get=fake, sleep=lambda s: None)
    assert [r["id"] for r in rows] == [1]
    assert fake.urls == [("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true", 8 * 1024 * 1024)]


def test_lever_pages_until_short_page():
    first = [{"id": f"a{i}", "text": "T", "country": "TH", "hostedUrl": f"https://l/{i}"} for i in range(100)]
    fake = Fake([first, [{"id": "z", "text": "T", "country": "SG", "hostedUrl": "https://l/z"}]])
    rows = jb.fetch_board("lever", "acme", get=fake, sleep=lambda s: None)
    assert len(rows) == 100 and "skip=100" in fake.urls[1][0]


def test_smartrecruiters_uses_country_filter_and_detail_call():
    fake = Fake([{"content": [{"id": "p1", "name": "Analyst", "location": {"country": "th", "city": "Bangkok"}}],
                  "totalFound": 1},
                 {"jobAd": {"sections": {"jobDescription": {"text": "<p>Do</p>"}}}, "postingUrl": "https://s/p1"}])
    rows = jb.fetch_board("smartrecruiters", "Acme1", get=fake, sleep=lambda s: None)
    assert "country=th" in fake.urls[0][0] and rows[0]["detail"]["postingUrl"] == "https://s/p1"


def test_freehire_pages_with_meta_total():
    fake = Fake([{"data": [{"public_slug": "a"}], "meta": {"total": 2}},
                 {"data": [{"public_slug": "b"}], "meta": {"total": 2}}])
    rows = jb.fetch_board("freehire", None, get=fake, sleep=lambda s: None)
    assert [r["public_slug"] for r in rows] == ["a", "b"]
    assert all(u.startswith("https://freehire.me/api/v1/agent/jobs/search?") for u, _ in fake.urls)


def test_malformed_body_is_failure_not_empty():
    with pytest.raises(jb.BoardError):
        jb.fetch_board("greenhouse", "acme", get=Fake([{"unexpected": True}]), sleep=lambda s: None)


def test_pauses_between_requests_to_same_host():
    pauses = []
    first = [{"id": f"a{i}", "text": "T", "country": "TH", "hostedUrl": "https://l"} for i in range(100)]
    jb.fetch_board("lever", "acme", get=Fake([first, []]), sleep=pauses.append)
    assert pauses == [0.5]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_text.py tests/unit/test_job_boards.py -q`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `services/job_text.py`**

```python
"""Upstream job HTML to plain markdown (stdlib only). Output is untrusted text, like all job content."""
from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser

_DROP = {"script", "style", "iframe", "noscript", "svg", "head"}
_BLOCK = {"p", "div", "section", "article", "br", "tr", "table"}


class _Converter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.href: list[str | None] = []

    def handle_starttag(self, tag, attrs):
        if tag in _DROP:
            self.skip += 1
        elif self.skip:
            return
        elif tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n" + "#" * min(int(tag[1]), 3) + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag == "a":
            href = dict(attrs).get("href") or ""
            self.href.append(href if href.startswith(("https://", "http://")) else None)
        elif tag in _BLOCK or tag in ("ul", "ol"):
            self.out.append("\n\n")

    def handle_endtag(self, tag):
        if tag in _DROP:
            self.skip = max(0, self.skip - 1)
        elif self.skip:
            return
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag == "a" and self.href:
            href = self.href.pop()
            if href:
                self.out.append(f" ({href})")
        elif tag in _BLOCK or tag in ("h1", "h2", "h3", "h4", "ul", "ol"):
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))


def html_to_markdown(source: str) -> str:
    if "&lt;" in source and "<" not in source:  # Greenhouse returns entity-escaped HTML
        source = html_lib.unescape(source)
    parser = _Converter()
    parser.feed(source)
    parser.close()
    text = "".join(parser.out)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n- \n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\n\n(- )", r"\n\1", text)  # list items tight
    return text.strip()
```

The unit tests pin the exact output. Adjust only the whitespace normalization until `test_keeps_structure_drops_unsafe` passes. Do not loosen the test.

- [ ] **Step 4: Write `integrations/job_boards.py`**

```python
"""WP5 source fetchers: freehire (documented API) and public ATS job boards, Thailand postings only.

Fixed host allowlist; board tokens validated and quoted, so config can never redirect a request.
"""
from __future__ import annotations

import json
import re
import time
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters")
USER_AGENT = "job-search-platform/0.1 (+https://github.com/SurakiatP/AI-Job-Search-Agent-Platform-dem)"
TIMEOUT_SECONDS = 8
MAX_BYTES = 2 * 1024 * 1024
GREENHOUSE_MAX_BYTES = 8 * 1024 * 1024
PAUSE_SECONDS = 0.5
PAGE = 100
MAX_PAGES = 100  # freehire: ~59 pages today; upstream offset+limit bound is 10,000
_TOKEN = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_THAI_LOCATION = re.compile(r"thailand|bangkok|ประเทศไทย|กรุงเทพ", re.I)


class BoardError(Exception):
    """One board failed: network, status, size, or an unexpected body. Never treated as 'empty'."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_get(url: str, max_bytes: int = MAX_BYTES) -> dict | list:
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, method="GET")
        with build_opener(_NoRedirect(), ProxyHandler({})).open(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise BoardError(f"status_{response.status}")
            raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise BoardError("too_large")
        return json.loads(raw)
    except BoardError:
        raise
    except Exception as exc:
        raise BoardError(type(exc).__name__) from None


def valid_board(token: str) -> bool:
    return bool(_TOKEN.match(token))


def fetch_board(source: str, board: str | None, *, get=None, sleep=time.sleep) -> list[dict]:
    get = get or http_get
    if source != "freehire" and (board is None or not valid_board(board)):
        raise BoardError("invalid_board")
    calls = 0

    def call(url, max_bytes=MAX_BYTES):
        nonlocal calls
        if calls:
            sleep(PAUSE_SECONDS)
        calls += 1
        return get(url, max_bytes)

    if source == "freehire":
        return _freehire(call)
    if source == "greenhouse":
        return _greenhouse(call, quote(board, safe=""))
    if source == "lever":
        return _lever(call, quote(board, safe=""))
    if source == "smartrecruiters":
        return _smartrecruiters(call, quote(board, safe=""))
    raise BoardError("unknown_source")


def _freehire(call) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        params = [("countries", "TH"), ("description_format", "markdown"), ("limit", PAGE), ("offset", page * PAGE)]
        data = call(f"https://freehire.me/api/v1/agent/jobs/search?{urlencode(params)}")
        items, meta = (data.get("data"), data.get("meta")) if isinstance(data, dict) else (None, None)
        if not isinstance(items, list) or not isinstance(meta, dict) or not isinstance(meta.get("total"), int):
            raise BoardError("bad_body")
        rows += [r for r in items if isinstance(r, dict)]
        if len(rows) >= meta["total"] or len(items) < PAGE:
            return rows
    raise BoardError("too_many_pages")


def _greenhouse(call, board: str) -> list[dict]:
    data = call(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true", GREENHOUSE_MAX_BYTES)
    jobs = data.get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        raise BoardError("bad_body")
    return [j for j in jobs if isinstance(j, dict)
            and _THAI_LOCATION.search(str((j.get("location") or {}).get("name") or ""))]


def _lever(call, board: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        data = call(f"https://api.lever.co/v0/postings/{board}?mode=json&skip={page * PAGE}&limit={PAGE}")
        if not isinstance(data, list):
            raise BoardError("bad_body")
        rows += [p for p in data if isinstance(p, dict) and (
            p.get("country") == "TH" or _THAI_LOCATION.search(str((p.get("categories") or {}).get("location") or "")))]
        if len(data) < PAGE:
            return rows
    raise BoardError("too_many_pages")


def _smartrecruiters(call, board: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        data = call(f"https://api.smartrecruiters.com/v1/companies/{board}/postings?country=th&limit={PAGE}&offset={page * PAGE}")
        content = data.get("content") if isinstance(data, dict) else None
        if not isinstance(content, list) or not isinstance(data.get("totalFound"), int):
            raise BoardError("bad_body")
        rows += [p for p in content if isinstance(p, dict) and isinstance(p.get("id"), str) and valid_board(p["id"])]
        if len(rows) >= data["totalFound"] or len(content) < PAGE:
            break
    for posting in rows:
        detail = call(f"https://api.smartrecruiters.com/v1/companies/{board}/postings/{quote(posting['id'], safe='')}")
        if not isinstance(detail, dict):
            raise BoardError("bad_body")
        posting["detail"] = detail
    return rows
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_text.py tests/unit/test_job_boards.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_text.py backend/src/job_search_platform/integrations/job_boards.py backend/tests/unit/test_job_text.py backend/tests/unit/test_job_boards.py
rtk git commit -m "feat(jobs): HTML-to-markdown and Thailand source fetchers for freehire and three ATS boards (WP5)"
```

---

### Task 4: Map raw postings to the store shape

**Files:**
- Create: `backend/src/job_search_platform/services/job_mapping.py`
- Test: `backend/tests/unit/test_job_mapping.py`

**Interfaces:**
- Consumes:
  - `job_dictionary.*` (Task 2);
  - `job_text.html_to_markdown` (Task 3);
  - `applications._same_job_url(url) -> str | None` (existing, FR-T02).
- Produces: `map_posting(source: str, board: str | None, raw: dict) -> dict | None`. It returns the `JobPosting` column values except `id`, `first_seen_at`, `last_seen_at`, `missed_runs`, `closed_at`, `canonical_id`, `index_dirty` and `updated_at`. It returns None when `external_id`, `title` or `source_url` is missing. `content_hash` is the sha256 hex over the sorted JSON of all other returned values.

- [ ] **Step 1: Write the failing tests**

```python
"""raw upstream posting -> store row; synthetic payloads only."""
from __future__ import annotations

from job_search_platform.services.job_mapping import map_posting


def test_freehire_keeps_slug_and_upstream_enrichment():
    row = map_posting("freehire", None, {
        "public_slug": "eng-acme-abc", "external_id": ":1", "title": "Senior Backend Engineer", "company": "Acme",
        "url": "https://Jobs.Example.test/1/?utm_source=x", "location": "Bangkok, Thailand", "cities": ["Bangkok"],
        "work_mode": "hybrid", "skills": ["python"], "posted_at": "2026-10-01T00:00:00Z",
        "description": "Build APIs", "reality": {"class": "stale"},
        "enrichment": {"category": "backend", "posting_language": "en", "seniority": "senior",
                       "salary_min": 50000, "salary_max": 80000, "salary_currency": "THB", "salary_period": "month"}})
    assert row["slug"] == "eng-acme-abc" and row["external_id"] == "eng-acme-abc"
    assert row["category"] == "backend" and row["reality_stale"] is True and row["province"] == "TH-10"
    assert row["url_key"] == "https://jobs.example.test/1" and row["salary_thb_month_min"] == 50000


def test_greenhouse_enriches_from_dictionary():
    row = map_posting("greenhouse", "acme", {
        "id": 42, "title": "โปรแกรมเมอร์ อาวุโส", "absolute_url": "https://boards.greenhouse.io/acme/jobs/42",
        "location": {"name": "Bangkok, Thailand"}, "content": "&lt;p&gt;Python และ React&lt;/p&gt;",
        "updated_at": "2026-10-02T00:00:00Z", "company_name": "Acme Co., Ltd."})
    assert row["slug"] == "gh-acme-42" and row["company"] == "Acme Co., Ltd."
    assert row["category"] == "software_engineering" and row["seniority"] == "senior"
    assert row["skills"][:2] == ["python", "react"] and row["posting_language"] == "th"
    assert row["description_markdown"] == "Python และ React" and row["cities"] == ["Bangkok"]


def test_unknown_category_is_other():
    row = map_posting("lever", "acme", {"id": "x", "text": "Synthetic Wizard", "hostedUrl": "https://l/x",
                                        "categories": {"location": "Bangkok"}})
    assert row["category"] == "other"


def test_yearly_thb_salary_is_divided_and_foreign_currency_left_null():
    lever = {"id": "y", "text": "Accountant", "hostedUrl": "https://l/y", "categories": {"location": "Bangkok"},
             "salaryRange": {"min": 600000, "max": 900000, "currency": "THB", "interval": "per-year-salary"}}
    assert map_posting("lever", "acme", lever)["salary_thb_month_min"] == 50000
    lever["salaryRange"]["currency"] = "USD"
    assert map_posting("lever", "acme", lever)["salary_thb_month_min"] is None


def test_missing_identity_is_none():
    assert map_posting("greenhouse", "acme", {"title": "x"}) is None


def test_content_hash_ignores_nothing_but_is_stable():
    raw = {"id": 1, "title": "Engineer", "absolute_url": "https://g/1", "location": {"name": "Bangkok"}}
    assert map_posting("greenhouse", "a", raw)["content_hash"] == map_posting("greenhouse", "a", dict(raw))["content_hash"]


def test_description_capped():
    raw = {"id": 1, "title": "Engineer", "absolute_url": "https://g/1", "location": {"name": "Bangkok"},
           "content": "x" * 60000}
    assert len(map_posting("greenhouse", "a", raw)["description_markdown"]) == 50000
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_mapping.py -q`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `services/job_mapping.py`**

```python
"""WP5: one raw upstream posting -> job_postings column values (dictionary enrichment, spec D7)."""
from __future__ import annotations

import hashlib
import json
import re

from job_search_platform.services import job_dictionary as jd
from job_search_platform.services.applications import _same_job_url
from job_search_platform.services.job_sources import CHOICES
from job_search_platform.services.job_text import html_to_markdown

DESCRIPTION_MAX = 50000
SLUG_MAX = 200
_PREFIX = {"greenhouse": "gh", "lever": "lv", "smartrecruiters": "sr"}
_LEGAL = re.compile(r"\b(co\.?,?\s*ltd\.?|company limited|public company limited|pcl|inc\.?|ltd\.?|corp\.?)|"
                    r"บริษัท|จำกัด|\(มหาชน\)|มหาชน", re.I)
_EMPLOYMENT = {"full-time": "full_time", "full_time": "full_time", "permanent": "full_time",
               "part-time": "part_time", "part_time": "part_time", "contract": "contract", "temporary": "contract",
               "internship": "internship", "intern": "internship"}


def _text(value, limit=300):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _int(value):
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 10**9 else None


def company_key(company: str | None) -> str:
    return re.sub(r"[^\w]+", " ", _LEGAL.sub(" ", (company or "").casefold())).strip()


def _thb_month(amount, currency, period):
    if amount is None or (currency or "").upper() != "THB":
        return None
    if period in ("month", "monthly", "per-month-salary"):
        return amount
    if period in ("year", "yearly", "annual", "per-year-salary"):
        return amount // 12
    return None


def _fields(source, board, raw):
    if source == "freehire":
        enrichment = raw.get("enrichment") if isinstance(raw.get("enrichment"), dict) else {}
        slug = _text(raw.get("public_slug"), SLUG_MAX)
        return dict(
            external_id=slug, slug=slug, title=raw.get("title"), company=raw.get("company"),
            location=raw.get("location"), url=raw.get("url"), description=raw.get("description"), html=False,
            posted_at=raw.get("posted_at"), work_mode=raw.get("work_mode"),
            seniority=enrichment.get("seniority") or raw.get("seniority"),
            employment_type=enrichment.get("employment_type") or raw.get("employment_type"),
            company_type=enrichment.get("company_type") or raw.get("company_type"),
            category=enrichment.get("category"), skills=raw.get("skills"),
            posting_language=enrichment.get("posting_language"),
            salary=(enrichment.get("salary_min"), enrichment.get("salary_max"), enrichment.get("salary_currency"),
                    enrichment.get("salary_period")),
            reality_stale=isinstance((raw.get("reality") or {}).get("class"), str) and raw["reality"]["class"] != "fresh",
            cities=raw.get("cities"))
    if source == "greenhouse":
        ext = str(raw.get("id") or "")
        return dict(external_id=ext or None, slug=f"gh-{board}-{ext}"[:SLUG_MAX], title=raw.get("title"),
                    company=raw.get("company_name") or board, location=(raw.get("location") or {}).get("name"),
                    url=raw.get("absolute_url"), description=raw.get("content"), html=True,
                    posted_at=raw.get("first_published") or raw.get("updated_at"))
    if source == "lever":
        categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
        salary = raw.get("salaryRange") if isinstance(raw.get("salaryRange"), dict) else {}
        created = raw.get("createdAt")
        return dict(external_id=_text(raw.get("id"), 200), slug=f"lv-{board}-{raw.get('id')}"[:SLUG_MAX],
                    title=raw.get("text"), company=board, location=categories.get("location"),
                    url=raw.get("hostedUrl"), description=raw.get("descriptionPlain") or raw.get("description"),
                    html=not raw.get("descriptionPlain"),
                    posted_at=(None if not isinstance(created, int) else
                               __import__("datetime").datetime.fromtimestamp(created / 1000, __import__("datetime").timezone.utc).isoformat()),
                    work_mode={"remote": "remote", "hybrid": "hybrid", "on-site": "onsite"}.get(raw.get("workplaceType")),
                    employment_type=categories.get("commitment"),
                    salary=(salary.get("min"), salary.get("max"), salary.get("currency"), salary.get("interval")))
    detail = raw.get("detail") if isinstance(raw.get("detail"), dict) else {}
    location = raw.get("location") if isinstance(raw.get("location"), dict) else {}
    sections = ((detail.get("jobAd") or {}).get("sections") or {})
    description = "\n".join(str((sections.get(k) or {}).get("text") or "")
                            for k in ("companyDescription", "jobDescription", "qualifications", "additionalInformation"))
    return dict(external_id=_text(raw.get("id"), 200), slug=f"sr-{board}-{raw.get('id')}"[:SLUG_MAX],
                title=raw.get("name"), company=(raw.get("company") or {}).get("name") or board,
                location=", ".join(str(v) for v in (location.get("city"), location.get("region"), "Thailand") if v),
                url=detail.get("postingUrl") or raw.get("ref"), description=description, html=True,
                posted_at=raw.get("releasedDate"),
                work_mode="remote" if location.get("remote") else "hybrid" if location.get("hybrid") else None,
                employment_type=(raw.get("typeOfEmployment") or {}).get("label"))


def map_posting(source: str, board: str | None, raw: dict) -> dict | None:
    f = _fields(source, board, raw)
    title, url, external_id = _text(f.get("title")), _text(f.get("url"), 2048), f.get("external_id")
    if not (title and url and external_id):
        return None
    description = f.get("description") if isinstance(f.get("description"), str) else ""
    description = (html_to_markdown(description) if f.get("html") else description)[:DESCRIPTION_MAX]
    location = _text(f.get("location"))
    province = jd.province_of(location)
    role = jd.role_of(title)
    seniority = f.get("seniority") if f.get("seniority") in CHOICES["seniority"] else jd.seniority_of(title)
    employment = f.get("employment_type")
    employment = employment if employment in CHOICES["employment_type"] else _EMPLOYMENT.get(str(employment or "").lower())
    category = f.get("category") if f.get("category") in jd.CATEGORIES else (role[1] if role else "other")
    skills = f.get("skills") if isinstance(f.get("skills"), list) and f["skills"] else jd.skills_of(f"{title}\n{description}")
    cities = f.get("cities") if isinstance(f.get("cities"), list) and f["cities"] else ([province[1]] if province else [])
    smin, smax, currency, period = f.get("salary") or (None, None, None, None)
    smin, smax = _int(smin), _int(smax)
    language = f.get("posting_language") if f.get("posting_language") in ("th", "en") else jd.posting_language_of(f"{title}\n{description}")
    row = dict(
        source=source, board=board, external_id=str(external_id)[:200], slug=f["slug"],
        title=title, company=_text(f.get("company")), location=location,
        cities=[c for c in cities if isinstance(c, str)][:5], province=province[0] if province else None,
        work_mode=f.get("work_mode") if f.get("work_mode") in ("remote", "hybrid", "onsite") else jd.work_mode_of(f"{title} {location or ''}"),
        seniority=seniority, employment_type=employment,
        company_type=f.get("company_type") if f.get("company_type") in CHOICES["company_type"] else None,
        category=category, skills=[s for s in skills if isinstance(s, str) and jd.SKILL_SLUG.match(s)][:jd.MAX_SKILLS],
        salary_min=smin, salary_max=smax, salary_currency=(currency or "").upper()[:3] or None,
        salary_period=str(period)[:5] if period else None, salary_thb_month_min=_thb_month(smin, currency, period),
        posting_language=language, description_markdown=description, source_url=url,
        url_key=_same_job_url(url),
        match_key=f"{company_key(f.get('company'))}|{(role[0] if role else title).casefold()}|{province[0]}" if province and company_key(f.get('company')) else None,
        posted_at=f.get("posted_at") if isinstance(f.get("posted_at"), str) else None,
        reality_stale=bool(f.get("reality_stale")),
    )
    row["content_hash"] = hashlib.sha256(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()
    return row
```

`salary_period` holds at most 5 characters, so store the normalized period: map `per-year-salary`/`yearly`/`annual` to `year` and `per-month-salary`/`monthly` to `month` before saving. Add that mapping inline next to `_thb_month` and adjust the test if needed. The test asserts only `salary_thb_month_min`.

Replace the `__import__("datetime")` calls with a normal `from datetime import datetime, timezone` import at the top of the module. They are written inline above only to keep this snippet short.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_job_mapping.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_mapping.py backend/tests/unit/test_job_mapping.py
rtk git commit -m "feat(jobs): map four sources to the store shape with dictionary enrichment (WP5)"
```

---

### Task 5: Store upsert and close rule

**Files:**
- Create: `backend/src/job_search_platform/services/job_store.py`
- Test: `backend/tests/integration/test_job_store.py`

**Interfaces:**
- Consumes: `JobPosting`, `IngestRun` (Task 1) and `map_posting` (Task 4).
- Produces in `services/job_store.py`:
  - `CLOSE_AFTER_MISSES = 2`
  - `apply_board(db, source: str, board: str | None, rows: list[dict], now: datetime) -> dict` upserts mapped rows. Open rows of that (source, board) not in `rows` get `missed_runs += 1`, and those reaching 2 close. It returns counts `{"fetched", "created", "updated", "closed"}`. Every change sets `index_dirty = True` and `updated_at = now`.

- [ ] **Step 1: Write the failing tests**

```python
"""WP5 store upsert and close rule (spec D6). Synthetic rows only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from job_search_platform.db.models import JobPosting
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _gh(i, title="Engineer"):
    return map_posting("greenhouse", "acme", {"id": i, "title": title, "absolute_url": f"https://g/{i}",
                                               "location": {"name": "Bangkok, Thailand"}})


def _row(db, i):
    return db.scalar(select(JobPosting).where(JobPosting.external_id == str(i)))


@pytest.mark.integration
def test_new_posting_created_then_seen_unchanged(db_session):
    assert job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)["created"] == 1
    row = _row(db_session, 1)
    row.index_dirty = False
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=1))
    assert counts == {"fetched": 1, "created": 0, "updated": 0, "closed": 0}
    assert row.last_seen_at == T0 + timedelta(hours=1) and row.index_dirty is False


@pytest.mark.integration
def test_changed_content_updates_and_marks_dirty(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    _row(db_session, 1).index_dirty = False
    assert job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "Senior Engineer")], T0)["updated"] == 1
    assert _row(db_session, 1).title == "Senior Engineer" and _row(db_session, 1).index_dirty is True


@pytest.mark.integration
def test_closes_after_two_missed_fetches(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1), _gh(2)], T0)
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=1))
    assert _row(db_session, 2).closed_at is None and _row(db_session, 2).missed_runs == 1
    counts = job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=2))
    assert counts["closed"] == 1 and _row(db_session, 2).closed_at == T0 + timedelta(hours=2)


@pytest.mark.integration
def test_reappearing_posting_reopens(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    for h in (1, 2):
        job_store.apply_board(db_session, "greenhouse", "acme", [], T0 + timedelta(hours=h))
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0 + timedelta(hours=3))
    row = _row(db_session, 1)
    assert row.closed_at is None and row.missed_runs == 0 and row.first_seen_at == T0 and row.slug == "gh-acme-1"


@pytest.mark.integration
def test_other_boards_untouched(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1)], T0)
    other = map_posting("greenhouse", "beta", {"id": 9, "title": "X", "absolute_url": "https://g/9",
                                                "location": {"name": "Bangkok"}})
    for h in (1, 2):
        job_store.apply_board(db_session, "greenhouse", "beta", [other], T0 + timedelta(hours=h))
    assert _row(db_session, 1).closed_at is None and _row(db_session, 1).missed_runs == 0
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_store.py -q`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Write `services/job_store.py` (upsert part)**

```python
"""WP5 job store: upsert per board, close rule, dedup clusters, description purge (spec D6, D8, D9)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from job_search_platform.db.models import JobPosting

CLOSE_AFTER_MISSES = 2
DEDUP_WINDOW = timedelta(days=30)
PURGE_AFTER = timedelta(days=90)


def _parse_ts(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


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
```

Note: `slug` changes for a reappearing posting are impossible, because the slug derives from (source, board, id). For freehire, the slug is the external_id itself.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_store.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_store.py backend/tests/integration/test_job_store.py
rtk git commit -m "feat(jobs): store upsert per board and two-miss close rule (WP5)"
```

---

### Task 6: Cross-source dedup and purge

**Files:**
- Modify: `backend/src/job_search_platform/services/job_store.py` (append)
- Test: `backend/tests/integration/test_job_dedup.py`

**Interfaces:**
- Consumes: `apply_board` (Task 5) and `map_posting` (Task 4).
- Produces:
  - `recompute_clusters(db, now) -> int` returns how many postings are non-canonical after the run (the "merged" count). Every posting whose `canonical_id` changed gets `index_dirty = True`.
  - `purge_descriptions(db, now) -> int` returns the rows purged.

- [ ] **Step 1: Write the failing tests** (TOR WP5 cross-source dedup)

```python
"""WP5 cross-source dedup (spec D8) and purge (D9). Synthetic postings only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from job_search_platform.db.models import JobPosting
from job_search_platform.services import job_store
from job_search_platform.services.job_mapping import map_posting

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _fh(slug, url, title="Backend Engineer", company="Acme Co., Ltd.", posted="2026-10-01T00:00:00Z"):
    return map_posting("freehire", None, {"public_slug": slug, "title": title, "company": company, "url": url,
                                           "location": "Bangkok, Thailand", "posted_at": posted})


def _gh(i, url, title="Backend Engineer", company="Acme", location="Bangkok, Thailand", posted="2026-10-02T00:00:00Z"):
    return map_posting("greenhouse", "acme", {"id": i, "title": title, "company_name": company, "absolute_url": url,
                                               "location": {"name": location}, "first_published": posted})


def _lv(i, title, company="ACME PUBLIC COMPANY LIMITED", location="Bangkok", posted_ms=1_790_899_200_000):  # 2026-10-02
    return map_posting("lever", "acme", {"id": i, "text": title, "hostedUrl": f"https://jobs.lever.co/acme/{i}",
                                          "categories": {"location": location}, "createdAt": posted_ms,
                                          "company": company})


def _canon(db, slug):
    row = db.scalar(select(JobPosting).where(JobPosting.slug == slug))
    return row.canonical_id or row.id


def _ingest(db, at, freehire=(), greenhouse=(), lever=()):
    job_store.apply_board(db, "freehire", None, list(freehire), at)
    job_store.apply_board(db, "greenhouse", "acme", list(greenhouse), at)
    job_store.apply_board(db, "lever", "acme", list(lever), at)
    return job_store.recompute_clusters(db, at)


@pytest.mark.integration
def test_same_url_across_sources_merges(db_session):
    merged = _ingest(db_session, T0, freehire=[_fh("fh-1", "https://Boards.Greenhouse.io/acme/jobs/1/?utm_source=x")],
                     greenhouse=[_gh(1, "https://boards.greenhouse.io/acme/jobs/1")])
    assert merged == 1 and _canon(db_session, "fh-1") == _canon(db_session, "gh-acme-1")


@pytest.mark.integration
def test_thai_and_english_title_same_company_province_merge(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", title="Software Engineer")],
            lever=[_lv("a", "โปรแกรมเมอร์")])
    assert _canon(db_session, "gh-acme-1") == _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_31_days_apart_stays_separate(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", posted="2026-08-01T00:00:00Z")],
            lever=[_lv("a", "Backend Engineer", posted_ms=1_788_220_800_000)])  # 2026-09-01, 31 days later
    assert _canon(db_session, "gh-acme-1") != _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_different_province_stays_separate(db_session):
    _ingest(db_session, T0, greenhouse=[_gh(1, "https://g/1", location="Chiang Mai")], lever=[_lv("a", "Backend Engineer")])
    assert _canon(db_session, "gh-acme-1") != _canon(db_session, "lv-acme-a")


@pytest.mark.integration
def test_transitive_across_three_sources(db_session):
    _ingest(db_session, T0, freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")],
            lever=[_lv("a", "Backend Engineer")])
    assert len({_canon(db_session, s) for s in ("fh-1", "gh-acme-1", "lv-acme-a")}) == 1


@pytest.mark.integration
def test_canonical_is_earliest_seen_and_stable(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1")], T0)
    job_store.recompute_clusters(db_session, T0)
    _ingest(db_session, T0 + timedelta(hours=1), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    gh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "gh-acme-1"))
    assert gh.canonical_id is None and _canon(db_session, "fh-1") == gh.id
    _ingest(db_session, T0 + timedelta(hours=2), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    assert gh.canonical_id is None


@pytest.mark.integration
def test_canonical_close_promotes_open_member(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1")], T0)
    _ingest(db_session, T0 + timedelta(hours=1), freehire=[_fh("fh-1", "https://g/1")], greenhouse=[_gh(1, "https://g/1")])
    for h in (2, 3):
        _ingest(db_session, T0 + timedelta(hours=h), freehire=[_fh("fh-1", "https://g/1")])
    fh = db_session.scalar(select(JobPosting).where(JobPosting.slug == "fh-1"))
    assert fh.canonical_id is None and fh.closed_at is None and fh.index_dirty is True


@pytest.mark.integration
def test_purge_clears_description_after_90_days_only(db_session):
    job_store.apply_board(db_session, "greenhouse", "acme", [_gh(1, "https://g/1"), _gh(2, "https://g/2")], T0)
    for row in db_session.scalars(select(JobPosting)):
        row.closed_at = T0 - (timedelta(days=91) if row.external_id == "1" else timedelta(days=89))
    assert job_store.purge_descriptions(db_session, T0) == 1
    rows = {r.external_id: r for r in db_session.scalars(select(JobPosting))}
    assert rows["1"].description_markdown is None and rows["2"].description_markdown is not None
```

The Lever fixture passes `company` inside raw. Task 4's Lever mapping uses `company=board`; change it to `raw.get("company") or board` so the Lever postings above carry the company name. Add this to Task 4's code when implementing this task, in the same commit.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_dedup.py -q`
Expected: FAIL with `AttributeError: module ... has no attribute 'recompute_clusters'`.

- [ ] **Step 3: Implement** (append to `services/job_store.py`)

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_job_dedup.py tests/integration/test_job_store.py tests/unit/test_job_mapping.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_store.py backend/src/job_search_platform/services/job_mapping.py backend/tests/integration/test_job_dedup.py
rtk git commit -m "feat(jobs): cross-source dedup clusters and closed-description purge (WP5)"
```

---

### Task 7: Ingest run orchestration

**Files:**
- Modify: `backend/src/job_search_platform/services/job_store.py` (append)
- Create: `backend/src/job_search_platform/data/job_boards.json` (seed `{"greenhouse": [], "lever": [], "smartrecruiters": []}`; Task 8 `discover` fills it)
- Test: `backend/tests/integration/test_ingest_run.py`

**Interfaces:**
- Consumes: `fetch_board` and `BoardError` (Task 3), `map_posting` (Task 4), `apply_board` (Task 5), `recompute_clusters` and `purge_descriptions` (Task 6).
- Produces:
  - `RUN_DEADLINE = timedelta(minutes=20)`
  - `load_boards(path=None) -> dict[str, list[str]]`
  - `run_ingest(sessions, *, boards: dict[str, list[str]], sources=SOURCES, fetch=fetch_board, clock=..., sleep=time.sleep) -> IngestRun` raises `ServiceError("ingest_running")` if the lock is held.

- [ ] **Step 1: Write the failing tests**

```python
"""WP5 ingest run: per-board isolation, failed boards never close, lock, idempotency. Fake fetchers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from job_search_platform.db.models import IngestRun, JobPosting
from job_search_platform.integrations.job_boards import BoardError
from job_search_platform.services import job_store
from job_search_platform.services.errors import ServiceError

T0 = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _raw(i):
    return {"id": i, "title": "Engineer", "absolute_url": f"https://g/{i}", "location": {"name": "Bangkok"}}


class Fetch:
    def __init__(self, plan):
        self.plan = plan  # {(source, board): list | Exception}

    def __call__(self, source, board, **_):
        result = self.plan.get((source, board), [])
        if isinstance(result, Exception):
            raise result
        return result


def _run(sessions, plan, at, boards=None):
    return job_store.run_ingest(sessions, boards=boards or {"greenhouse": ["a", "b"]}, sources=("greenhouse",),
                                fetch=Fetch(plan), clock=lambda: at, sleep=lambda s: None)


@pytest.mark.integration
def test_board_failure_isolated(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = _run(sessions, {("greenhouse", "a"): BoardError("status_500"), ("greenhouse", "b"): [_raw(1)]}, T0)
    assert run.status == "partial" and run.created == 1
    assert run.per_board["greenhouse:a"]["state"] == "failed" and run.per_board["greenhouse:b"]["state"] == "ok"


@pytest.mark.integration
def test_failed_fetch_never_counts_as_missing(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    _run(sessions, {("greenhouse", "a"): [_raw(1)]}, T0)
    for h in (1, 2):
        _run(sessions, {("greenhouse", "a"): BoardError("timeout")}, T0 + timedelta(hours=h))
    with sessions() as db:
        assert db.scalar(select(JobPosting.closed_at).where(JobPosting.external_id == "1")) is None


@pytest.mark.integration
def test_all_boards_failed_is_failed(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    run = _run(sessions, {("greenhouse", "a"): BoardError("x"), ("greenhouse", "b"): BoardError("x")}, T0)
    assert run.status == "failed"


@pytest.mark.integration
def test_rerun_with_same_input_is_idempotent(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    plan = {("greenhouse", "a"): [_raw(1), _raw(2)]}
    _run(sessions, plan, T0)
    second = _run(sessions, plan, T0 + timedelta(hours=1))
    assert (second.created, second.updated, second.closed) == (0, 0, 0)


@pytest.mark.integration
def test_second_run_refused_while_locked(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    with sessions() as holder:
        holder.execute(text("SELECT pg_advisory_lock(hashtext('ingest'))"))
        with pytest.raises(ServiceError) as caught:
            _run(sessions, {}, T0)
        assert caught.value.code == "ingest_running"
        holder.execute(text("SELECT pg_advisory_unlock(hashtext('ingest'))"))


@pytest.mark.integration
def test_deadline_skips_remaining_boards(migrated_engine):
    sessions = sessionmaker(migrated_engine, expire_on_commit=False)
    ticks = iter([T0, T0, T0 + timedelta(minutes=21), T0 + timedelta(minutes=21), T0 + timedelta(minutes=21)])
    run = job_store.run_ingest(sessions, boards={"greenhouse": ["a", "b"]}, sources=("greenhouse",),
                               fetch=Fetch({("greenhouse", "a"): [_raw(1)]}), clock=lambda: next(ticks, T0 + timedelta(minutes=22)),
                               sleep=lambda s: None)
    assert run.per_board["greenhouse:b"]["state"] == "skipped"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_ingest_run.py -q`
Expected: FAIL with `AttributeError: ... 'run_ingest'`.

- [ ] **Step 3: Implement** (append to `services/job_store.py`; add imports `json`, `logging`, `time`, `pathlib.Path`, `text`, `IngestRun`, `ServiceError`, `job_boards`, `map_posting`)

```python
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
    with sessions() as lock:
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
            with sessions.begin() as db:
                merged = recompute_clusters(db, now)
                purge_descriptions(db, now)
                row = db.get(IngestRun, run.id)
                states = [v["state"] for v in per_board.values()]
                row.status = ("failed" if states and all(s != "ok" for s in states)
                              else "partial" if any(s != "ok" for s in states) else "ok")
                row.per_board, row.finished_at, row.merged = per_board, now, merged
                for name, value in totals.items():
                    setattr(row, name, value)
            _log.info("ingest_run_finished", extra={"status": row.status})
            return row
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(hashtext('ingest'))"))
```

Note: `_log.info(..., extra={"status": ...})` reuses the JSON formatter's whitelisted `status` key. Do not add new extras. `ServiceError` accepts any code; `ingest_running` needs no registry entry because only the CLI sees it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && rtk uv run --locked pytest tests/integration/test_ingest_run.py tests/integration/test_job_dedup.py tests/integration/test_job_store.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/services/job_store.py backend/src/job_search_platform/data/job_boards.json backend/tests/integration/test_ingest_run.py
rtk git commit -m "feat(jobs): hourly ingest run with per-board isolation, deadline and run lock (WP5)"
```

---

### Task 8: CLI `scripts/ingest_jobs.py` (run, discover, status) and launchd template

**Files:**
- Create: `scripts/ingest_jobs.py`
- Create: `infra/launchd/com.job-search-platform.ingest.plist.example`
- Modify: `backend/src/job_search_platform/services/job_store.py` (append `discover_boards`)
- Test: `backend/tests/unit/test_discover_boards.py`

**Interfaces:**
- Consumes: `run_ingest` and `load_boards` (Task 7), `job_boards.fetch_board` (Task 3).
- Produces: `discover_boards(freehire_rows: list[dict], current: dict[str, list[str]]) -> dict[str, list[str]]`. It returns the merged, sorted, unique lists and never removes a board.

- [ ] **Step 1: Write the failing test**

```python
from job_search_platform.services.job_store import discover_boards


def test_discover_parses_ats_urls_and_never_removes():
    rows = [{"url": "https://boards.greenhouse.io/acme/jobs/1"},
            {"url": "https://job-boards.greenhouse.io/beta/jobs/2?gh_src=x"},
            {"url": "https://jobs.lever.co/gamma/abc-123"},
            {"url": "https://jobs.smartrecruiters.com/Delta1/744000"},
            {"url": "https://boards.greenhouse.io/../evil/jobs/3"},
            {"url": "https://example.test/careers/1"}]
    out = discover_boards(rows, {"greenhouse": ["zeta"], "lever": [], "smartrecruiters": []})
    assert out == {"greenhouse": ["acme", "beta", "zeta"], "lever": ["gamma"], "smartrecruiters": ["Delta1"]}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_discover_boards.py -q`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement `discover_boards`** (append to `job_store.py`; add `from urllib.parse import urlsplit`)

```python
_ATS_HOSTS = {"boards.greenhouse.io": "greenhouse", "job-boards.greenhouse.io": "greenhouse",
              "jobs.lever.co": "lever", "jobs.smartrecruiters.com": "smartrecruiters"}


def discover_boards(freehire_rows: list[dict], current: dict[str, list[str]]) -> dict[str, list[str]]:
    """Board tokens from freehire's Thai postings' ATS URLs; additive only (spec D10)."""
    found = {source: set(current.get(source, [])) for source in ("greenhouse", "lever", "smartrecruiters")}
    for row in freehire_rows:
        parts = urlsplit(str(row.get("url") or ""))
        source = _ATS_HOSTS.get(parts.netloc.lower())
        segments = [s for s in parts.path.split("/") if s]
        if source and segments and job_boards.valid_board(segments[0]) and segments[0] not in (".", ".."):
            found[source].add(segments[0])
    return {source: sorted(tokens) for source, tokens in found.items()}
```

- [ ] **Step 4: Write `scripts/ingest_jobs.py`.** Follow `scripts/accounts.py`: `sys.path` insert, `_private_text`, and `URL.create` from `config`.

```python
"""WP5 hourly job ingest (run-once worker, TOR appendix ก.3): run | discover | status."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.engine import URL  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from job_search_platform import config  # noqa: E402
from job_search_platform.db.models import IngestRun  # noqa: E402
from job_search_platform.db.session import make_engine  # noqa: E402
from job_search_platform.integrations import job_boards  # noqa: E402
from job_search_platform.integrations.logging import configure_logging  # noqa: E402
from job_search_platform.main import _private_text  # noqa: E402
from job_search_platform.services import job_store  # noqa: E402
from job_search_platform.services.errors import ServiceError  # noqa: E402


def _sessions():
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    return sessionmaker(make_engine(url), expire_on_commit=False)


def run(args) -> int:
    sources = (args.source,) if args.source else job_boards.SOURCES
    result = job_store.run_ingest(_sessions(), boards=job_store.load_boards(), sources=sources)
    print(json.dumps({"status": result.status, "fetched": result.fetched, "created": result.created,
                      "updated": result.updated, "closed": result.closed, "merged": result.merged}))
    return 1 if result.status == "failed" else 0


def discover(args) -> int:
    rows = job_boards.fetch_board("freehire", None)
    merged = job_store.discover_boards(rows, job_store.load_boards())
    job_store.BOARDS_FILE.write_text(json.dumps(merged, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({source: len(tokens) for source, tokens in merged.items()}))
    return 0


def status(args) -> int:
    with _sessions()() as db:
        for row in db.scalars(select(IngestRun).order_by(IngestRun.started_at.desc()).limit(5)):
            print(json.dumps({"started_at": row.started_at.isoformat(), "status": row.status, "fetched": row.fetched,
                              "created": row.created, "closed": row.closed, "merged": row.merged}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("run")
    one.add_argument("--source", choices=job_boards.SOURCES)
    one.set_defaults(func=run)
    sub.add_parser("discover").set_defaults(func=discover)
    sub.add_parser("status").set_defaults(func=status)
    args = parser.parse_args()
    configure_logging()
    try:
        return args.func(args)
    except ServiceError as exc:
        print(f"error: {exc.code}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
```

Check the real names before writing: `make_engine` (db/session.py), the logging setup function in `integrations/logging.py` (use whatever `main.py` calls), and `_private_text` (main.py). Use them exactly as they are.

- [ ] **Step 5: Write `infra/launchd/com.job-search-platform.ingest.plist.example`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- WP5 hourly ingest. Copy to ~/Library/LaunchAgents/, replace REPO_DIR and PRIVATE_DIR, then:
     launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.job-search-platform.ingest.plist -->
<plist version="1.0">
<dict>
  <key>Label</key><string>com.job-search-platform.ingest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string><string>uv</string><string>run</string><string>--locked</string>
    <string>--project</string><string>REPO_DIR/backend</string>
    <string>python</string><string>REPO_DIR/scripts/ingest_jobs.py</string><string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>CORE02_PRIVATE_DIR</key><string>PRIVATE_DIR</string></dict>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/jsp-ingest.log</string>
  <key>StandardErrorPath</key><string>/tmp/jsp-ingest.log</string>
</dict>
</plist>
```

- [ ] **Step 6: Run the tests to verify they pass, then check the CLI help**

Run: `cd backend && rtk uv run --locked pytest tests/unit/test_discover_boards.py -q && cd .. && rtk uv run --locked --project backend python scripts/ingest_jobs.py --help`
Expected: PASS, and help lists `run`, `discover` and `status`.

- [ ] **Step 7: Commit**

```bash
rtk git add scripts/ingest_jobs.py infra/launchd backend/src/job_search_platform/services/job_store.py backend/tests/unit/test_discover_boards.py
rtk git commit -m "feat(jobs): ingest CLI (run, discover, status) and launchd hourly template (WP5)"
```

---

### Task 9: Seed boards, live smoke, docs

**Files:**
- Modify: `backend/src/job_search_platform/data/job_boards.json` (filled by `discover`)
- Modify: `backend/AGENTS.md`, `infra/AGENTS.md`, `docs/engineering/local-operation.md`, `docs/adr/ADR-015-python-stack-deviation.md`, `docs/demo/tor-roadmap.md`

- [ ] **Step 1: Seed boards (live, one request series to freehire)**

Run: `rtk uv run --locked --project backend python scripts/ingest_jobs.py discover`
Expected: JSON counts per ATS, each greater than 0. Commit the resulting `job_boards.json`.

- [ ] **Step 2: Live smoke against the dev database** (Postgres on the compose stack)

Run: `rtk uv run --locked --project backend python scripts/ingest_jobs.py run` and then `... status`.
Expected:
- status `ok` or `partial`;
- freehire fetched about 5,800;
- each ATS fetched at least 1;
- `merged` greater than 0;
- run time under 20 minutes.

Record the counts and the time in the Hub WORKING_LOG. Run it a second time and confirm `created` is 0 or near 0 and nothing closes unexpectedly.

- [ ] **Step 3: Docs**
  - `backend/AGENTS.md`, Layout section: add `services/job_store.py`, `services/job_mapping.py`, `services/job_dictionary.py`, `services/job_text.py`, `integrations/job_boards.py` and `data/` (dictionaries, board list). Commands section: `uv run --locked --project backend python scripts/ingest_jobs.py run|discover|status`.
  - `infra/AGENTS.md`: `infra/launchd/` template.
  - `docs/engineering/local-operation.md`: a section "Hourly job ingest". Cover the manual run, installing the launchd template (copy, replace `REPO_DIR`/`PRIVATE_DIR`, `launchctl bootstrap`), the log path and `status`.
  - ADR-015, "Freehire dependency" consequence: freehire is now one ingested source among four, and search no longer depends on it at query time once part 2 lands.
  - `docs/demo/tor-roadmap.md`, "คำถามถึงลูกค้า": add the two client questions from the spec, in Thai, matching that file's language.

- [ ] **Step 4: Full backend suite**

Run: `cd backend && rtk uv run --locked pytest -q -p no:cacheprovider`
Expected: all pass, except the 2 known baselines that need `CORE02_PRIVATE_DIR` (`test_application_startup` built-frontend restore and `test_storage_infrastructure` restart proof).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/data/job_boards.json backend/AGENTS.md infra/AGENTS.md docs/engineering/local-operation.md docs/adr/ADR-015-python-stack-deviation.md docs/demo/tor-roadmap.md
rtk git commit -m "docs(jobs): seed ATS boards, ingest operation guide, client questions (WP5)"
```
