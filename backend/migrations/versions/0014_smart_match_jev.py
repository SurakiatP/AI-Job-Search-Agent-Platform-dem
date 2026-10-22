"""Smart match with Jev: parsed CV text per revision, cached Jev scores, hidden jobs/companies,
and the owner-only match_jobs run (no session or job; provider = the global OpenRouter row).
Downgrade fails while match_jobs runs exist; delete them first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_smart_match_jev"
down_revision = "0013_cv_skill_profile"
branch_labels = None
depends_on = None

_OPS = "'evaluate_job','draft_documents','export_document','profile_cv'"
_CONTEXT = ("(session_id IS NOT NULL AND job_revision_id IS NOT NULL "
            "AND provider_configuration_id IS NOT NULL)")


def upgrade() -> None:
    op.create_table(
        "cv_revision_texts",
        sa.Column("cv_revision_id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 200000", name="ck_cv_revision_text_length"),
    )
    op.create_table(
        "job_match_scores",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cv_revision_id", sa.Uuid(), nullable=False),
        sa.Column("job_slug", sa.String(200), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("fit_percent", sa.Integer(), nullable=False),
        sa.Column("uncertain", sa.Boolean(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("cv_revision_id", "job_slug", "content_hash", "model", name="uq_job_match_scores_key"),
        sa.CheckConstraint("fit_percent BETWEEN 0 AND 100", name="ck_job_match_fit_range"),
    )
    op.create_index("ix_job_match_scores_lookup", "job_match_scores", ["cv_revision_id", "job_slug"])
    op.create_table(
        "job_search_hidden",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("value", sa.String(300), nullable=False),
        sa.Column("label", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "kind", "value", name="uq_job_search_hidden_key"),
        sa.UniqueConstraint("project_id", "id", name="uq_job_search_hidden_project_id"),
        sa.CheckConstraint("kind IN ('job','company')", name="ck_job_search_hidden_kind"),
    )
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS},'match_jobs')")
    op.create_check_constraint("ck_runs_context_required", "runs",
                               f"operation IN ('profile_cv','match_jobs') OR {_CONTEXT}")


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE operation = 'match_jobs' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: match_jobs runs exist")
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS})")
    op.create_check_constraint("ck_runs_context_required", "runs", f"operation = 'profile_cv' OR {_CONTEXT}")
    op.drop_table("job_search_hidden")
    op.drop_index("ix_job_match_scores_lookup", table_name="job_match_scores")
    op.drop_table("job_match_scores")
    op.drop_table("cv_revision_texts")
