"""Webhooks and A2A push (TOR FR-P06, FR-P04): endpoints, per-task push configs, delivery outbox."""

from alembic import op


revision = "0025_webhooks"
down_revision = "0024_saved_searches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE webhook_endpoints (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        url varchar(2048) NOT NULL,
        events jsonb NOT NULL,
        secret varchar(64) NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now())""")
    op.execute("CREATE INDEX ix_webhook_endpoints_project ON webhook_endpoints (project_id)")
    op.execute("""CREATE TABLE a2a_push_configs (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL,
        run_id uuid NOT NULL,
        grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
        config_id varchar(128) NOT NULL,
        url varchar(2048) NOT NULL,
        token varchar(256) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_a2a_push_configs_run FOREIGN KEY (project_id, run_id) REFERENCES runs (project_id, id) ON DELETE CASCADE,
        CONSTRAINT uq_a2a_push_configs_config UNIQUE (run_id, config_id))""")
    op.execute("""CREATE TABLE webhook_deliveries (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        endpoint_id uuid REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
        push_config_id uuid REFERENCES a2a_push_configs(id) ON DELETE CASCADE,
        event_type varchar(40) NOT NULL,
        payload jsonb NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_status_code integer,
        last_error varchar(200),
        created_at timestamptz NOT NULL DEFAULT now(),
        delivered_at timestamptz,
        CONSTRAINT ck_webhook_deliveries_target CHECK ((endpoint_id IS NULL) <> (push_config_id IS NULL)),
        CONSTRAINT ck_webhook_deliveries_status CHECK (status IN ('pending','delivered','dead')))""")
    op.execute("CREATE INDEX ix_webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'pending'")
    op.execute("CREATE INDEX ix_webhook_deliveries_project ON webhook_deliveries (project_id, created_at)")
    op.execute("ALTER TABLE saved_searches ADD COLUMN push_enabled boolean NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE saved_searches DROP COLUMN push_enabled")
    op.execute("DROP TABLE webhook_deliveries")
    op.execute("DROP TABLE a2a_push_configs")
    op.execute("DROP TABLE webhook_endpoints")
