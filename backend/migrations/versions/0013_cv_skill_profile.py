"""CV skill profile (names only) and the owner-only, non-LLM profile_cv run operation.

profile_cv runs have no session, job or provider, so those run columns become nullable;
ck_runs_context_required keeps them mandatory for every other operation.
The cv_revisions immutability trigger now permits changing only skill_profile.
Downgrade fails while profile_cv runs exist; delete them first.
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_cv_skill_profile"
down_revision = "0012_global_provider_config"
branch_labels = None
depends_on = None

_OPS = "'evaluate_job','draft_documents','export_document'"


def upgrade() -> None:
    op.add_column("cv_revisions", sa.Column("skill_profile", sa.JSON(), nullable=True))
    # The revision stays immutable except for its derived skill_profile (names only).
    op.execute("""CREATE FUNCTION reject_cv_revision_content_mutation() RETURNS trigger AS $$
        BEGIN
            IF ROW(OLD.id, OLD.project_id, OLD.cv_id, OLD.revision, OLD.file_id, OLD.created_at)
               IS DISTINCT FROM ROW(NEW.id, NEW.project_id, NEW.cv_id, NEW.revision, NEW.file_id, NEW.created_at) THEN
                RAISE EXCEPTION 'immutable_revision' USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql""")
    op.execute("DROP TRIGGER cv_revisions_immutable ON cv_revisions")
    op.execute("CREATE TRIGGER cv_revisions_immutable BEFORE UPDATE ON cv_revisions "
               "FOR EACH ROW EXECUTE FUNCTION reject_cv_revision_content_mutation()")
    for column in ("session_id", "job_revision_id", "provider_configuration_id"):
        op.alter_column("runs", column, nullable=True)
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS},'profile_cv')")
    op.create_check_constraint(
        "ck_runs_context_required", "runs",
        "operation = 'profile_cv' OR (session_id IS NOT NULL AND job_revision_id IS NOT NULL "
        "AND provider_configuration_id IS NOT NULL)")


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM runs WHERE operation = 'profile_cv' LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: profile_cv runs exist")
    op.drop_constraint("ck_runs_context_required", "runs", type_="check")
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({_OPS})")
    for column in ("session_id", "job_revision_id", "provider_configuration_id"):
        op.alter_column("runs", column, nullable=False)
    op.execute("DROP TRIGGER cv_revisions_immutable ON cv_revisions")
    op.execute("CREATE TRIGGER cv_revisions_immutable BEFORE UPDATE ON cv_revisions "
               "FOR EACH ROW EXECUTE FUNCTION reject_revision_mutation()")
    op.execute("DROP FUNCTION reject_cv_revision_content_mutation()")
    op.drop_column("cv_revisions", "skill_profile")
