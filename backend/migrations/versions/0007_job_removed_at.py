"""Soft-remove saved jobs: nullable removed_at, the only mutable job revision column."""

from alembic import op
import sqlalchemy as sa


revision = "0007_job_removed_at"
down_revision = "0006_provider_base_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("job_revisions", sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))
    # Keep every content column immutable; only removed_at may change.
    op.execute("""CREATE FUNCTION reject_job_revision_content_mutation() RETURNS trigger AS $$
        BEGIN
            IF ROW(OLD.id, OLD.project_id, OLD.revision, OLD.title, OLD.description, OLD.company,
                   OLD.source_url, OLD.content_file_id, OLD.created_at)
               IS DISTINCT FROM
               ROW(NEW.id, NEW.project_id, NEW.revision, NEW.title, NEW.description, NEW.company,
                   NEW.source_url, NEW.content_file_id, NEW.created_at) THEN
                RAISE EXCEPTION 'immutable_revision' USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql""")
    op.execute("DROP TRIGGER job_revisions_immutable ON job_revisions")
    op.execute("CREATE TRIGGER job_revisions_immutable BEFORE UPDATE ON job_revisions "
               "FOR EACH ROW EXECUTE FUNCTION reject_job_revision_content_mutation()")


def downgrade() -> None:
    op.execute("DROP TRIGGER job_revisions_immutable ON job_revisions")
    op.execute("CREATE TRIGGER job_revisions_immutable BEFORE UPDATE ON job_revisions "
               "FOR EACH ROW EXECUTE FUNCTION reject_revision_mutation()")
    op.execute("DROP FUNCTION reject_job_revision_content_mutation()")
    op.drop_column("job_revisions", "removed_at")
