"""Experience bank: one row per candidate fact (project-scoped, soft-removed, hash-deduplicated across removals)
and the owner-only extract_experience run (provider required; no session or job).
Downgrade fails while extract_experience runs exist; delete them first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_experience_bank"
down_revision = "0014_smart_match_jev"
branch_labels = None
depends_on = None

_OPS = "'evaluate_job','draft_documents','export_document','profile_cv','match_jobs'"
_CONTEXT = ("(session_id IS NOT NULL AND job_revision_id IS NOT NULL "
            "AND provider_configuration_id IS NOT NULL)")


def upgrade() -> None:
    op.create_table(
        "experience_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("role", sa.String(200)),
        sa.Column("organization", sa.String(200)),
        sa.Column("period", sa.String(60)),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("source_cv_revision_id", sa.Uuid()),
        sa.Column("text_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["project_id", "source_cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "text_hash", name="uq_experience_items_hash"),
        sa.UniqueConstraint("project_id", "id", name="uq_experience_items_project_id"),
        sa.CheckConstraint("kind IN ('experience','education','skill','certification','project','other')", name="ck_experience_items_kind"),
        sa.CheckConstraint("char_length(text) BETWEEN 1 AND 1000", name="ck_experience_items_text_length"),
        sa.CheckConstraint("source IN ('cv','owner')", name="ck_experience_items_source"),
        sa.CheckConstraint("(source = 'owner') = (source_cv_revision_id IS NULL)", name="ck_experience_items_source_revision"),
        sa.CheckConstraint("length(text_hash) = 64", name="ck_experience_items_hash_length"),
    )
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS},'extract_experience')")
    op.create_check_constraint("ck_runs_context_required", "runs",
                               "operation IN ('profile_cv','match_jobs') "
                               "OR (operation = 'extract_experience' AND provider_configuration_id IS NOT NULL) "
                               f"OR {_CONTEXT}")


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE operation = 'extract_experience' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: extract_experience runs exist")
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS})")
    op.create_check_constraint("ck_runs_context_required", "runs", f"operation IN ('profile_cv','match_jobs') OR {_CONTEXT}")
    op.drop_table("experience_items")
