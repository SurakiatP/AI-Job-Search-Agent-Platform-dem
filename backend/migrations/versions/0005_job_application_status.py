"""Persist owner-recorded status for each immutable job revision."""

from alembic import op
import sqlalchemy as sa


revision = "0005_job_application_status"
down_revision = "0004_document_preview"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_application_statuses",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("job_revision_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('saved','applied')", name="ck_job_application_status_value"),
        sa.ForeignKeyConstraint(
            ["project_id", "job_revision_id"],
            ["job_revisions.project_id", "job_revisions.id"],
            name="fk_job_application_status_job_revision",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("project_id", "job_revision_id", name="pk_job_application_statuses"),
    )


def downgrade() -> None:
    op.drop_table("job_application_statuses")
