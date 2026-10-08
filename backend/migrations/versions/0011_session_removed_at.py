"""Hide sessions with run history: nullable removed_at; pair uniqueness only among visible sessions.

Downgrade fails if a visible and a hidden session share a pair; delete the hidden one first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_session_removed_at"
down_revision = "0010_export_document_operation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint("uq_sessions_pair", "sessions", type_="unique")
    op.create_index("uq_sessions_pair", "sessions", ["project_id", "cv_revision_id", "job_revision_id"],
                    unique=True, postgresql_where=sa.text("removed_at IS NULL"))


def downgrade() -> None:
    op.drop_index("uq_sessions_pair", table_name="sessions")
    op.create_unique_constraint("uq_sessions_pair", "sessions", ["project_id", "cv_revision_id", "job_revision_id"])
    op.drop_column("sessions", "removed_at")
