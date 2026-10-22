"""Run result payload (tailoring proposals, later apply.prepare) and the tailor_cv operation.
Downgrade fails while tailor_cv runs exist; delete them first.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0016_run_result_payload"
down_revision = "0015_experience_bank"
branch_labels = None
depends_on = None

_OPS = "'evaluate_job','draft_documents','export_document','profile_cv','match_jobs','extract_experience'"


def upgrade() -> None:
    op.add_column("runs", sa.Column("result_payload", postgresql.JSONB()))
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS},'tailor_cv')")


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE operation = 'tailor_cv' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: tailor_cv runs exist")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS})")
    op.drop_column("runs", "result_payload")
