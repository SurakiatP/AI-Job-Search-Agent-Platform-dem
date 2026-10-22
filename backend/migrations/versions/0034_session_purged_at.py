"""Permanently deleted evaluation kept only as the source of runs that produced kept documents."""

from alembic import op
import sqlalchemy as sa


revision = "0034_session_purged_at"
down_revision = "0033_cv_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "purged_at")
