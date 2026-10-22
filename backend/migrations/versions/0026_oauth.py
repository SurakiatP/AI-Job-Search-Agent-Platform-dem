"""OAuth 2.1 for MCP (TOR FR-P03): clients, pending authorizations/codes, tokens; grants link to a client."""

from alembic import op

revision = "0026_oauth"
down_revision = "0025_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE oauth_clients (
        client_id varchar(2048) PRIMARY KEY,
        kind varchar(8) NOT NULL,
        client_info jsonb NOT NULL,
        fetched_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_oauth_clients_kind CHECK (kind IN ('dcr','cimd')))""")
    op.execute("ALTER TABLE grants ALTER COLUMN token_hash DROP NOT NULL")
    op.execute("ALTER TABLE grants ADD COLUMN oauth_client_id varchar(2048) REFERENCES oauth_clients(client_id) ON DELETE SET NULL")
    op.execute("""CREATE TABLE oauth_authorizations (
        id uuid PRIMARY KEY,
        request_hash bytea NOT NULL UNIQUE,
        client_id varchar(2048) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
        redirect_uri varchar(2048) NOT NULL,
        redirect_uri_explicit boolean NOT NULL,
        state varchar(512),
        code_challenge varchar(128) NOT NULL,
        resource varchar(2048) NOT NULL,
        scopes jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        code_hash bytea UNIQUE,
        code_expires_at timestamptz,
        grant_id uuid REFERENCES grants(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now())""")
    op.execute("""CREATE TABLE oauth_tokens (
        id uuid PRIMARY KEY,
        token_hash bytea NOT NULL UNIQUE,
        kind varchar(8) NOT NULL,
        pair_id uuid NOT NULL,
        grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
        client_id varchar(2048) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
        resource varchar(2048) NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_oauth_tokens_kind CHECK (kind IN ('access','refresh')))""")
    op.execute("CREATE INDEX ix_oauth_tokens_grant ON oauth_tokens (grant_id)")
    op.execute("CREATE INDEX ix_oauth_tokens_pair ON oauth_tokens (pair_id)")


def downgrade() -> None:
    op.execute("DROP TABLE oauth_tokens")
    op.execute("DROP TABLE oauth_authorizations")
    op.execute("DELETE FROM grants WHERE token_hash IS NULL")
    op.execute("ALTER TABLE grants DROP COLUMN oauth_client_id")
    op.execute("ALTER TABLE grants ALTER COLUMN token_hash SET NOT NULL")
    op.execute("DROP TABLE oauth_clients")
