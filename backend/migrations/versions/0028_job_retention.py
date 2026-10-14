"""WP5 retention (owner 2026-10-14): delete instead of close, tombstones stop re-ingesting aged-out postings,
index-delete queue for the search index (part 2)."""

from alembic import op

revision = "0028_job_retention"
down_revision = "0027_job_store"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM job_postings WHERE closed_at IS NOT NULL")
    op.execute("DROP INDEX ix_job_postings_open")
    op.execute("ALTER TABLE job_postings DROP COLUMN closed_at")
    op.execute("CREATE INDEX ix_job_postings_canonical ON job_postings (canonical_id)")
    op.execute("ALTER TABLE ingest_runs RENAME COLUMN closed TO deleted")
    op.execute("""CREATE TABLE job_posting_tombstones (
        source varchar(20) NOT NULL,
        external_id varchar(200) NOT NULL,
        deleted_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        PRIMARY KEY (source, external_id))""")
    op.execute("""CREATE TABLE job_index_deletes (
        posting_id uuid PRIMARY KEY,
        deleted_at timestamptz NOT NULL)""")


def downgrade() -> None:
    op.execute("DROP TABLE job_index_deletes")
    op.execute("DROP TABLE job_posting_tombstones")
    op.execute("ALTER TABLE ingest_runs RENAME COLUMN deleted TO closed")
    op.execute("DROP INDEX ix_job_postings_canonical")
    op.execute("ALTER TABLE job_postings ADD COLUMN closed_at timestamptz")
    op.execute("CREATE INDEX ix_job_postings_open ON job_postings (closed_at, canonical_id)")
