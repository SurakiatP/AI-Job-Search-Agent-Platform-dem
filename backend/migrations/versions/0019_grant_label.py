"""Grant label: an optional owner-chosen name shown as the run requester."""

from alembic import op
import sqlalchemy as sa


revision = "0019_grant_label"
down_revision = "0018_durable_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("grants", sa.Column("label", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("grants", "label")
