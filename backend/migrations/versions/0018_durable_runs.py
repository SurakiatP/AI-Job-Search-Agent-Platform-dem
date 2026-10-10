"""Durable runs: runs.resume_count and the needs_input status.
The one-active-run index lists running and waiting_approval only, so needs_input is already outside it.
Data step: runs that already rest as completed (an interactive tailor with unapplied proposals, a parked apply pack)
move to needs_input so their owner step still works. Apply keeps no link back to its tailor run, so an interactive
tailor counts as applied when an export_document run exists for the same job created at or after it.
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
    op.execute(sa.text("""
        UPDATE runs SET status = 'needs_input', finished_at = NULL
        WHERE status = 'completed' AND (
            (operation = 'apply_prepare' AND result_payload ->> 'state' = 'parked')
            OR (operation = 'tailor_cv' AND result_payload ->> 'mode' = 'interactive' AND NOT EXISTS (
                SELECT 1 FROM runs e WHERE e.project_id = runs.project_id AND e.operation = 'export_document'
                AND e.job_revision_id = runs.job_revision_id AND e.created_at >= runs.created_at)))
    """))


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE status = 'needs_input' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: needs_input runs exist")
    _status_check(_STATUSES)
    op.drop_constraint("ck_runs_resume_count", "runs", type_="check")
    op.drop_column("runs", "resume_count")
