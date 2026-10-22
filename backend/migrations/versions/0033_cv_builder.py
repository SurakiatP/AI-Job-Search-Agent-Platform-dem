"""CV builder: resume drafts, structured resume data on CV and document revisions, more experience kinds."""

from alembic import op

revision = "0033_cv_builder"
down_revision = "0032_avatar"
branch_labels = None
depends_on = None

OLD_KINDS = "'experience','education','skill','certification','project','other'"
NEW_KINDS = OLD_KINDS + ",'award','publication','volunteer','interest','language'"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE resume_drafts (
            id uuid PRIMARY KEY,
            project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            cv_id uuid UNIQUE,
            document_id uuid UNIQUE,
            resume_data jsonb NOT NULL,
            template_id varchar(20) NOT NULL,
            accent varchar(20) NOT NULL,
            document_language varchar(2) NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            FOREIGN KEY (project_id, cv_id) REFERENCES cvs (project_id, id) ON DELETE CASCADE,
            FOREIGN KEY (project_id, document_id) REFERENCES documents (project_id, id) ON DELETE CASCADE,
            CONSTRAINT ck_resume_drafts_owner CHECK ((cv_id IS NULL) <> (document_id IS NULL)),
            CONSTRAINT ck_resume_drafts_template CHECK (template_id IN ('onyx','kakuna','ditgar')),
            CONSTRAINT ck_resume_drafts_language CHECK (document_language IN ('th','en'))
        )""")
    for table in ("cv_revisions", "document_revisions"):
        # resume_style: {"template_id", "accent"}; JSON so the ORM never names it on older schemas.
        op.execute(f"ALTER TABLE {table} ADD COLUMN resume_data jsonb, ADD COLUMN resume_style jsonb")
    # Owner facts the builder manages carry the CV they came from, so publishing can replace only its own rows.
    op.execute("ALTER TABLE experience_items ADD COLUMN builder_cv_id uuid REFERENCES cvs(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE experience_items DROP CONSTRAINT ck_experience_items_kind")
    op.execute(f"ALTER TABLE experience_items ADD CONSTRAINT ck_experience_items_kind CHECK (kind IN ({NEW_KINDS}))")
    op.execute("ALTER TABLE files DROP CONSTRAINT ck_files_kind")
    op.execute("ALTER TABLE files ADD CONSTRAINT ck_files_kind CHECK "
               "(kind IN ('cv_original','job_source','generated_document','chat_attachment','resume_render'))")


def downgrade() -> None:
    op.execute("ALTER TABLE files DROP CONSTRAINT ck_files_kind")
    op.execute("ALTER TABLE files ADD CONSTRAINT ck_files_kind CHECK "
               "(kind IN ('cv_original','job_source','generated_document','chat_attachment'))")
    op.execute("ALTER TABLE experience_items DROP CONSTRAINT ck_experience_items_kind")
    op.execute(f"ALTER TABLE experience_items ADD CONSTRAINT ck_experience_items_kind CHECK (kind IN ({OLD_KINDS}))")
    op.execute("ALTER TABLE experience_items DROP COLUMN builder_cv_id")
    for table in ("cv_revisions", "document_revisions"):
        op.execute(f"ALTER TABLE {table} DROP COLUMN resume_data, DROP COLUMN resume_style")
    op.execute("DROP TABLE resume_drafts")
