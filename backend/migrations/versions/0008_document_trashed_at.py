"""Soft-delete drafted documents: nullable trashed_at (documents has no immutability trigger)."""

from alembic import op
import sqlalchemy as sa


revision = "0008_document_trashed_at"
down_revision = "0007_job_removed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "trashed_at")
