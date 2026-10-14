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
        prev_unsubscribe_token_hash bytea,
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
