"""Multi-user accounts: users, tokens, rate-limit events; sessions and projects belong to a user."""

from alembic import op


revision = "0022_users"
down_revision = "0021_gateway_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE users (
        id uuid PRIMARY KEY,
        email varchar(254) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        locale varchar(2) NOT NULL DEFAULT 'th',
        email_verified_at timestamptz,
        disabled_at timestamptz,
        deletion_requested_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_users_email CHECK (email = lower(email) AND email LIKE '%_@_%'),
        CONSTRAINT ck_users_locale CHECK (locale IN ('th','en')))""")
    op.execute("""CREATE TABLE user_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose varchar(20) NOT NULL,
        token_hash bytea NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        CONSTRAINT ck_user_tokens_purpose CHECK (purpose IN ('verify_email','reset_password')))""")
    op.execute("CREATE INDEX ix_user_tokens_user_id ON user_tokens (user_id)")
    op.execute("""CREATE TABLE rate_limit_events (
        id bigserial PRIMARY KEY,
        bucket varchar(40) NOT NULL,
        key_hash bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())""")
    op.execute("CREATE INDEX ix_rate_limit_events_lookup ON rate_limit_events (bucket, key_hash, created_at)")
    op.execute("ALTER TABLE projects ADD COLUMN user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE")
    op.execute("CREATE INDEX ix_projects_user_id ON projects (user_id)")
    # Old loopback sessions have no user; everyone logs in again.
    op.execute("DELETE FROM owner_sessions")
    op.execute("ALTER TABLE owner_sessions ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE")
    op.execute("CREATE INDEX ix_owner_sessions_user_id ON owner_sessions (user_id)")
    op.execute("ALTER TABLE owner_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now()")
    op.execute("DROP TABLE owner_launch_nonces")
    # Existing grants are backfilled with the migration time.
    op.execute("ALTER TABLE grants ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()")


def downgrade() -> None:
    op.execute("CREATE TABLE owner_launch_nonces (\n\tid UUID NOT NULL, \n\tnonce_hash BYTEA NOT NULL, \n\torigin VARCHAR(512) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tconsumed_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (nonce_hash)\n)")
    op.execute("ALTER TABLE grants DROP COLUMN created_at")
    op.execute("DELETE FROM owner_sessions")
    op.execute("ALTER TABLE owner_sessions DROP COLUMN last_seen_at")
    op.execute("ALTER TABLE owner_sessions DROP COLUMN user_id")
    op.execute("ALTER TABLE projects DROP COLUMN user_id")
    op.execute("DROP TABLE rate_limit_events")
    op.execute("DROP TABLE user_tokens")
    op.execute("DROP TABLE users")
