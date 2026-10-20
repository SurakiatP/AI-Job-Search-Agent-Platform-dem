"""CV trash tombstone (CR-CVT-01) and private CV photos."""

from alembic import op
import sqlalchemy as sa


revision = "0035_cv_trash_and_photo"
down_revision = "0034_session_purged_at"
branch_labels = None
depends_on = None

_OLD = "'cv_original','job_source','generated_document','chat_attachment','resume_render'"


def _kinds(kinds: str) -> None:
    op.execute("ALTER TABLE files DROP CONSTRAINT ck_files_kind")
    op.execute(f"ALTER TABLE files ADD CONSTRAINT ck_files_kind CHECK (kind IN ({kinds}))")


def _immutable(file_check: str) -> None:
    # Revisions stay immutable; CR-CVT-01 only lets permanent delete clear the file (file_id -> NULL).
    op.execute(f"""CREATE OR REPLACE FUNCTION reject_cv_revision_content_mutation() RETURNS trigger AS $$
        BEGIN
            IF ROW(OLD.id, OLD.project_id, OLD.cv_id, OLD.revision, OLD.created_at)
               IS DISTINCT FROM ROW(NEW.id, NEW.project_id, NEW.cv_id, NEW.revision, NEW.created_at)
               OR ({file_check}) THEN
                RAISE EXCEPTION 'immutable_revision' USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql""")


def _templates(ids: str) -> None:
    op.execute("ALTER TABLE resume_drafts DROP CONSTRAINT ck_resume_drafts_template")
    op.execute(f"ALTER TABLE resume_drafts ADD CONSTRAINT ck_resume_drafts_template CHECK (template_id IN ({ids}))")


def upgrade() -> None:
    op.add_column("cvs", sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True))
    _kinds(_OLD + ",'resume_photo'")
    _templates("'onyx','kakuna','ditgar','lotus','teak','saffron'")
    _immutable("NEW.file_id IS NOT NULL AND NEW.file_id IS DISTINCT FROM OLD.file_id")


def downgrade() -> None:
    op.execute("UPDATE resume_drafts SET template_id = 'onyx' WHERE template_id IN ('lotus','teak','saffron')")
    _templates("'onyx','kakuna','ditgar'")
    op.execute("DELETE FROM files WHERE kind = 'resume_photo'")
    _immutable("NEW.file_id IS DISTINCT FROM OLD.file_id")
    _kinds(_OLD)
    op.drop_column("cvs", "purged_at")
