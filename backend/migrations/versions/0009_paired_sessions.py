"""Named CVs, per-CV revision numbers and CV/job pairs on sessions.

Downgrade restores per-project revision numbers; it fails if two CVs of one
project already share a revision number (data created after the upgrade).
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_paired_sessions"
down_revision = "0008_document_trashed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cvs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "id", name="uq_cvs_project_id"),
    )
    op.create_index("uq_cvs_one_primary_per_project", "cvs", ["project_id"], unique=True,
                    postgresql_where=sa.text("is_primary AND removed_at IS NULL"))
    op.add_column("cv_revisions", sa.Column("cv_id", sa.Uuid(), nullable=True))
    op.execute("INSERT INTO cvs (id, project_id, name, is_primary, created_at) "
               "SELECT gen_random_uuid(), project_id, 'CV หลัก', true, min(created_at) "
               "FROM cv_revisions GROUP BY project_id")
    # Revisions are immutable; allow only this backfill.
    op.execute("ALTER TABLE cv_revisions DISABLE TRIGGER cv_revisions_immutable")
    op.execute("UPDATE cv_revisions r SET cv_id = c.id FROM cvs c WHERE c.project_id = r.project_id")
    op.execute("ALTER TABLE cv_revisions ENABLE TRIGGER cv_revisions_immutable")
    op.alter_column("cv_revisions", "cv_id", nullable=False)
    op.create_foreign_key("fk_cv_revisions_cv", "cv_revisions", "cvs", ["project_id", "cv_id"], ["project_id", "id"])
    op.drop_constraint("uq_cv_revisions_number", "cv_revisions", type_="unique")
    op.create_unique_constraint("uq_cv_revisions_number", "cv_revisions", ["cv_id", "revision"])

    op.add_column("sessions", sa.Column("cv_revision_id", sa.Uuid(), nullable=True))
    op.add_column("sessions", sa.Column("job_revision_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_sessions_cv_revision", "sessions", "cv_revisions",
                          ["project_id", "cv_revision_id"], ["project_id", "id"])
    op.create_foreign_key("fk_sessions_job_revision", "sessions", "job_revisions",
                          ["project_id", "job_revision_id"], ["project_id", "id"])
    op.create_unique_constraint("uq_sessions_pair", "sessions", ["project_id", "cv_revision_id", "job_revision_id"])
    op.create_check_constraint("ck_sessions_pair_complete", "sessions",
                               "(cv_revision_id IS NULL) = (job_revision_id IS NULL)")


def downgrade() -> None:
    op.drop_constraint("ck_sessions_pair_complete", "sessions", type_="check")
    op.drop_constraint("uq_sessions_pair", "sessions", type_="unique")
    op.drop_constraint("fk_sessions_job_revision", "sessions", type_="foreignkey")
    op.drop_constraint("fk_sessions_cv_revision", "sessions", type_="foreignkey")
    op.drop_column("sessions", "job_revision_id")
    op.drop_column("sessions", "cv_revision_id")
    op.drop_constraint("uq_cv_revisions_number", "cv_revisions", type_="unique")
    op.create_unique_constraint("uq_cv_revisions_number", "cv_revisions", ["project_id", "revision"])
    op.drop_constraint("fk_cv_revisions_cv", "cv_revisions", type_="foreignkey")
    op.drop_column("cv_revisions", "cv_id")
    op.drop_index("uq_cvs_one_primary_per_project", table_name="cvs")
    op.drop_table("cvs")
