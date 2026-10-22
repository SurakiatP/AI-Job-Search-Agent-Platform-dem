"""Allow the owner-only, non-LLM export_document run operation (manual document edits).

Downgrade fails while export_document runs exist; delete them first.
"""

from alembic import op


revision = "0010_export_document_operation"
down_revision = "0009_paired_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint(
        "ck_runs_operation", "runs", "operation IN ('evaluate_job','draft_documents','export_document')")


def downgrade() -> None:
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", "operation IN ('evaluate_job','draft_documents')")
