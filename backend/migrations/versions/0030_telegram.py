"""FR-J05 Telegram digest channel: one chat link per account and a per-search switch."""

from alembic import op

revision = "0030_telegram"
down_revision = "0029_job_crawl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE telegram_links (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        chat_id bigint UNIQUE,
        code_hash bytea UNIQUE,
        code_expires_at timestamptz,
        linked_at timestamptz)""")
    op.execute("ALTER TABLE saved_searches ADD COLUMN telegram_enabled boolean NOT NULL DEFAULT false")
    op.execute("DROP INDEX ix_saved_searches_due")
    op.execute("CREATE INDEX ix_saved_searches_due ON saved_searches (next_run_at) "
               "WHERE (digest_enabled OR push_enabled OR telegram_enabled)")


def downgrade() -> None:
    op.execute("DROP INDEX ix_saved_searches_due")
    op.execute("CREATE INDEX ix_saved_searches_due ON saved_searches (next_run_at) WHERE (digest_enabled OR push_enabled)")
    op.execute("ALTER TABLE saved_searches DROP COLUMN telegram_enabled")
    op.execute("DROP TABLE telegram_links")
