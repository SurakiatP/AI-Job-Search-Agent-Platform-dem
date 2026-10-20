"""End-of-set practice report (CR-IVP-01 PR 2)."""

from alembic import op
import sqlalchemy as sa


revision = "0037_interview_report"
down_revision = "0036_interview_practice"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("interview_sets", sa.Column("report", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("interview_sets", "report")
