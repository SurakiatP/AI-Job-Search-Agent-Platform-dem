"""Durable execution accounting, output provenance and approval application."""

from alembic import op
import sqlalchemy as sa

revision = "0002_runtime_accounting"
down_revision = "0001_project_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("active_started_at", sa.DateTime(timezone=True)))
    op.add_column("runs", sa.Column("active_seconds", sa.Float(), nullable=False, server_default="0"))
    op.add_column("runs", sa.Column("tool_calls", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_runs_active_seconds", "runs", "active_seconds >= 0")
    op.create_check_constraint("ck_runs_tool_calls", "runs", "tool_calls BETWEEN 0 AND 30")
    op.add_column("approvals", sa.Column("decision", sa.String(8)))
    op.add_column("approvals", sa.Column("applied_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_approval_decision", "approvals", "decision IS NULL OR decision IN ('approve','reject')")
    op.create_table(
        "run_artifacts",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), primary_key=True),
        sa.Column("file_id", sa.Uuid(), primary_key=True),
        sa.Column("document_revision_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id", "file_id"], ["files.project_id", "files.id"]),
        sa.ForeignKeyConstraint(["project_id", "document_revision_id"], ["document_revisions.project_id", "document_revisions.id"]),
    )


def downgrade() -> None:
    op.drop_table("run_artifacts")
    op.drop_constraint("ck_approval_decision", "approvals", type_="check")
    op.drop_column("approvals", "applied_at")
    op.drop_column("approvals", "decision")
    op.drop_constraint("ck_runs_tool_calls", "runs", type_="check")
    op.drop_constraint("ck_runs_active_seconds", "runs", type_="check")
    op.drop_column("runs", "tool_calls")
    op.drop_column("runs", "active_seconds")
    op.drop_column("runs", "active_started_at")
