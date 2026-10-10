"""TOR AI gaps: submit autopilot daily limit and who decided an approval."""

from alembic import op
import sqlalchemy as sa


revision = "0020_tor_ai_gaps"
down_revision = "0019_grant_label"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_preferences", sa.Column("submit_autopilot_daily_limit", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_pref_autopilot_limit", "project_preferences",
                               "submit_autopilot_daily_limit IS NULL OR submit_autopilot_daily_limit BETWEEN 1 AND 20")
    op.add_column("approvals", sa.Column("decided_by", sa.String(16), nullable=True))
    op.create_check_constraint("ck_approval_decided_by", "approvals", "decided_by IS NULL OR decided_by IN ('owner','autopilot')")
    op.execute("UPDATE approvals SET decided_by = 'owner' WHERE decision IS NOT NULL")


def downgrade() -> None:
    op.drop_constraint("ck_approval_decided_by", "approvals", type_="check")
    op.drop_column("approvals", "decided_by")
    op.drop_constraint("ck_pref_autopilot_limit", "project_preferences", type_="check")
    op.drop_column("project_preferences", "submit_autopilot_daily_limit")
