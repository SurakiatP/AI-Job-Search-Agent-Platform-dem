"""Durable runs: runs.resume_count and the needs_input status.
The one-active-run index lists running and waiting_approval only, so needs_input is already outside it.
Downgrade fails while any run is in needs_input; finish or cancel those first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_durable_runs"
down_revision = "0017_agent_tools"
branch_labels = None
depends_on = None

_STATUSES = "'queued','running','waiting_approval','completed','failed','cancelled','interrupted'"


def _status_check(statuses: str) -> None:
    op.drop_constraint("ck_runs_status", "runs", type_="check")
    op.create_check_constraint("ck_runs_status", "runs", f"status IN ({statuses})")


def upgrade() -> None:
    op.add_column("runs", sa.Column("resume_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_runs_resume_count", "runs", "resume_count >= 0")
    _status_check(_STATUSES.replace("'waiting_approval',", "'waiting_approval','needs_input',"))


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE status = 'needs_input' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: needs_input runs exist")
    _status_check(_STATUSES)
    op.drop_constraint("ck_runs_resume_count", "runs", type_="check")
    op.drop_column("runs", "resume_count")
