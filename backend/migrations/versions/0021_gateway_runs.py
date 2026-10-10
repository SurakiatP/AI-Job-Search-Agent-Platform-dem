"""Gateway runs: LLM operations no longer need a provider configuration."""

from alembic import op


revision = "0021_gateway_runs"
down_revision = "0020_tor_ai_gaps"
branch_labels = None
depends_on = None

OLD = ("operation IN ('profile_cv','match_jobs') OR (operation = 'extract_experience' AND provider_configuration_id IS NOT NULL)"
       " OR (session_id IS NOT NULL AND job_revision_id IS NOT NULL AND provider_configuration_id IS NOT NULL)")
NEW = "operation IN ('profile_cv','match_jobs','extract_experience') OR (session_id IS NOT NULL AND job_revision_id IS NOT NULL)"


def upgrade() -> None:
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.create_check_constraint("ck_runs_context_required", "runs", NEW)


def downgrade() -> None:
    # Gateway runs have no provider row; the old constraint would reject them.
    blocked = op.get_bind().exec_driver_sql(
        "SELECT count(*) FROM runs WHERE provider_configuration_id IS NULL"
        " AND operation NOT IN ('profile_cv','match_jobs')").scalar()
    if blocked:
        raise RuntimeError("gateway runs without a provider configuration exist; cannot downgrade")
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.create_check_constraint("ck_runs_context_required", "runs", OLD)
