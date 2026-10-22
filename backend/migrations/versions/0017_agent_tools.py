"""Agent tools: apply_prepare, apply_submit and draft_follow_up operations, submit_application approvals.
documents.document_type has no check constraint, so follow_up needs no schema change.
Downgrade fails while rows use the new values; delete them first.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0017_agent_tools"
down_revision = "0016_run_result_payload"
branch_labels = None
depends_on = None

_OPS = ("'evaluate_job','draft_documents','export_document','profile_cv','match_jobs',"
        "'extract_experience','tailor_cv'")
_NEW_OPS = "'apply_prepare','apply_submit','draft_follow_up'"
_OLD_ACTIONS = "'promote_cv','delete_document_revision','delete_file'"
_OLD_SHAPE = (
    "(action = 'promote_cv' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NOT NULL AND target_file_id IS NULL) "
    "OR (action = 'delete_document_revision' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL) "
    "OR (action = 'delete_file' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NOT NULL)"
)
_NEW_SHAPE = (
    "(action = 'promote_cv' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NOT NULL AND target_file_id IS NULL AND target_run_id IS NULL) "
    "OR (action = 'delete_document_revision' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL AND target_run_id IS NULL) "
    "OR (action = 'delete_file' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NOT NULL AND target_run_id IS NULL) "
    "OR (action = 'submit_application' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL AND target_run_id IS NOT NULL)"
)


def _swap(table: str, name: str, expression: str) -> None:
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, expression)


_ACTIVE = "status IN ('running', 'waiting_approval')"


def _active_index(extra: str = "") -> None:
    op.execute("DROP INDEX uq_runs_one_active_per_project")
    op.execute(f"CREATE UNIQUE INDEX uq_runs_one_active_per_project ON runs (project_id) WHERE {_ACTIVE}{extra}")


def upgrade() -> None:
    # apply_submit may wait days for the owner and holds no sandbox: it is exempt from one-active-run-per-project.
    _active_index(" AND operation <> 'apply_submit'")
    op.add_column("approvals", sa.Column("target_run_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key("fk_approvals_target_run", "approvals", "runs", ["project_id", "target_run_id"],
                          ["project_id", "id"], ondelete="CASCADE")
    _swap("runs", "ck_runs_operation", f"operation IN ({_OPS},{_NEW_OPS})")
    _swap("approvals", "ck_approval_action", f"action IN ({_OLD_ACTIONS},'submit_application')")
    _swap("approvals", "ck_approval_target_shape", _NEW_SHAPE)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.execute(sa.text(
            "SELECT 1 FROM runs WHERE operation IN ('apply_prepare','apply_submit','draft_follow_up') LIMIT 1")).first() \
            or bind.execute(sa.text("SELECT 1 FROM approvals WHERE action = 'submit_application' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: agent tool runs or approvals exist")
    _swap("approvals", "ck_approval_target_shape", _OLD_SHAPE)
    _swap("approvals", "ck_approval_action", f"action IN ({_OLD_ACTIONS})")
    _swap("runs", "ck_runs_operation", f"operation IN ({_OPS})")
    _active_index()
    op.drop_constraint("fk_approvals_target_run", "approvals", type_="foreignkey")
    op.drop_column("approvals", "target_run_id")
