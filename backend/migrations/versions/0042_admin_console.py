"""Admin console: users.is_admin, append-only audit log, per-call LLM cost, model prices, per-task model settings, benchmarks, health probes."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0042_admin_console"
down_revision = "0041_notifications"
branch_labels = None
depends_on = None

_NOW = sa.text("now()")


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("admin_prefs", postgresql.JSONB()))

    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_user_id", sa.Uuid()),  # no FK: the log must outlive the account and cannot be updated
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(64)),
        sa.Column("detail", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
    )
    op.execute("CREATE INDEX ix_admin_audit_created ON admin_audit_log (created_at DESC, id DESC)")
    op.execute("""CREATE FUNCTION reject_admin_audit_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'append_only_admin_audit' USING ERRCODE = 'check_violation';
        END; $$ LANGUAGE plpgsql""")
    op.execute("CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit_log "
               "FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation()")

    op.create_table(
        "llm_calls",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("runs.id", ondelete="SET NULL")),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cached_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("api_calls", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("price_in", sa.Numeric(14, 6)),
        sa.Column("price_out", sa.Numeric(14, 6)),
        sa.Column("price_cache", sa.Numeric(14, 6)),
        sa.Column("price_source", sa.String(16)),
        sa.Column("cost_usd", sa.Numeric(14, 8)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
        sa.CheckConstraint("price_source IS NULL OR price_source IN ('openrouter','litellm','manual')",
                           name="ck_llm_calls_price_source"),
    )
    op.create_index("ix_llm_calls_created_at", "llm_calls", ["created_at"])
    op.create_index("ix_llm_calls_run_id", "llm_calls", ["run_id"])

    op.create_table(
        "model_prices",
        sa.Column("model", sa.String(200), primary_key=True),
        sa.Column("price_in", sa.Numeric(14, 6), nullable=False),
        sa.Column("price_out", sa.Numeric(14, 6), nullable=False),
        sa.Column("price_cache", sa.Numeric(14, 6)),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("is_free", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("official_available", postgresql.JSONB()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
        sa.CheckConstraint("source IN ('openrouter','litellm','manual')", name="ck_model_prices_source"),
    )

    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("effort", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("cases", postgresql.JSONB()),
        sa.Column("summary", postgresql.JSONB()),
        sa.Column("verdict", sa.String(8)),
        sa.Column("created_by", sa.Uuid()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('queued','running','done','failed')", name="ck_benchmark_runs_status"),
        sa.CheckConstraint("verdict IS NULL OR verdict IN ('green','red','na')", name="ck_benchmark_runs_verdict"),
    )
    op.create_index("ix_benchmark_runs_operation", "benchmark_runs", ["operation", "started_at"])

    op.create_table(
        "task_model_settings",
        sa.Column("operation", sa.String(32), primary_key=True),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("effort", sa.String(16), nullable=False),
        sa.Column("benchmark_id", sa.Uuid(), sa.ForeignKey("benchmark_runs.id", ondelete="SET NULL")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
        sa.Column("updated_by", sa.Uuid()),
    )

    op.create_table(
        "health_probes",
        sa.Column("checked_at", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("components", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    for table in ("health_probes", "task_model_settings", "benchmark_runs", "model_prices", "llm_calls"):
        op.drop_table(table)
    op.execute("DROP TABLE admin_audit_log")
    op.execute("DROP FUNCTION reject_admin_audit_mutation()")
    op.drop_column("users", "admin_prefs")
    op.drop_column("users", "is_admin")
