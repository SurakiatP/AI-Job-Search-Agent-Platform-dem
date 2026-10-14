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
