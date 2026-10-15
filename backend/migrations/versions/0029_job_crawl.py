"""WP5 part 3 crawler (spec 2026-10-15, ADR-016): JobTopGun and JobBKK sources, validThrough, crawl progress."""

from alembic import op

revision = "0029_job_crawl"
down_revision = "0028_job_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE job_postings DROP CONSTRAINT ck_job_postings_source")
    op.execute("ALTER TABLE job_postings ADD CONSTRAINT ck_job_postings_source CHECK (source IN "
               "('freehire','greenhouse','lever','smartrecruiters','jobtopgun','jobbkk'))")
    op.execute("ALTER TABLE job_postings ADD COLUMN valid_through timestamptz")
    op.execute("""CREATE TABLE crawl_state (
        source varchar(20) PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL)""")


def downgrade() -> None:
    op.execute("DROP TABLE crawl_state")
    op.execute("DELETE FROM job_postings WHERE source IN ('jobtopgun','jobbkk')")  # run `reindex` after a downgrade
    op.execute("DELETE FROM job_posting_tombstones WHERE source IN ('jobtopgun','jobbkk')")
    op.execute("ALTER TABLE job_postings DROP COLUMN valid_through")
    op.execute("ALTER TABLE job_postings DROP CONSTRAINT ck_job_postings_source")
    op.execute("ALTER TABLE job_postings ADD CONSTRAINT ck_job_postings_source CHECK (source IN "
               "('freehire','greenhouse','lever','smartrecruiters'))")
