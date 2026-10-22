"""Persist generated evaluation reports separately from private agent output."""

from alembic import op
import sqlalchemy as sa

revision = "0003_evaluation_result"
down_revision = "0002_runtime_accounting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("evaluation_result", sa.JSON(), nullable=True))
    op.add_column("run_artifacts", sa.Column("lease_owner", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("run_artifacts", "lease_owner")
    op.drop_column("runs", "evaluation_result")
