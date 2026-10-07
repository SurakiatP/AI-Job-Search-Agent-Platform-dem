"""Add optional provider base URL override (custom and local endpoints)."""

from alembic import op
import sqlalchemy as sa


revision = "0006_provider_base_url"
down_revision = "0005_job_application_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The immutability trigger only rejects UPDATE of existing rows; adding a nullable column is DDL.
    op.add_column("provider_configurations", sa.Column("base_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("provider_configurations", "base_url")
