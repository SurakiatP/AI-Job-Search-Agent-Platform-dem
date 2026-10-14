"""Application board (TOR FR-T01): eight stages, recruiter contact, append-only application events."""

from alembic import op


revision = "0023_application_board"
down_revision = "0022_users"
branch_labels = None
depends_on = None

STAGES = "'saved','applied','responded','interview','offer','hired','rejected','withdrawn'"
KINDS = "'stage_changed','note','contact_updated','email_logged','applied_via_approval'"


def upgrade() -> None:
    op.execute("ALTER TABLE job_application_statuses DROP CONSTRAINT ck_job_application_status_value")
    op.execute("ALTER TABLE job_application_statuses ADD CONSTRAINT ck_job_application_status_value "
               f"CHECK (status IN ({STAGES}))")
    op.execute("ALTER TABLE job_application_statuses ADD COLUMN contact_name varchar(200), "
               "ADD COLUMN contact_email varchar(320), ADD COLUMN contact_role varchar(200)")
    op.execute(f"""CREATE TABLE application_events (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL,
        job_revision_id uuid NOT NULL,
        kind varchar(32) NOT NULL,
        actor_scope varchar(80) NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_application_events_job FOREIGN KEY (project_id, job_revision_id)
            REFERENCES job_revisions (project_id, id) ON DELETE CASCADE,
        CONSTRAINT ck_application_events_kind CHECK (kind IN ({KINDS})))""")
    op.execute("CREATE INDEX ix_application_events_job ON application_events (project_id, job_revision_id, created_at)")
    op.execute("""CREATE FUNCTION reject_application_event_mutation() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND NOT EXISTS (
                SELECT 1 FROM job_revisions WHERE project_id = OLD.project_id AND id = OLD.job_revision_id) THEN
                RETURN OLD;  -- FK cascade from a deleted job revision, project or account
            END IF;
            RAISE EXCEPTION 'append_only_application_event' USING ERRCODE = 'check_violation';
        END; $$ LANGUAGE plpgsql""")
    op.execute("CREATE TRIGGER application_events_append_only BEFORE UPDATE OR DELETE ON application_events "
               "FOR EACH ROW EXECUTE FUNCTION reject_application_event_mutation()")
    op.execute("""INSERT INTO application_events (id, project_id, job_revision_id, kind, actor_scope, payload, created_at)
        SELECT gen_random_uuid(), project_id, job_revision_id, 'stage_changed', 'migration',
               '{"from": "saved", "to": "applied"}'::jsonb, updated_at
        FROM job_application_statuses WHERE status = 'applied'""")


def downgrade() -> None:
    op.execute("DROP TABLE application_events")
    op.execute("DROP FUNCTION reject_application_event_mutation()")
    op.execute("ALTER TABLE job_application_statuses DROP COLUMN contact_name, DROP COLUMN contact_email, "
               "DROP COLUMN contact_role")
    op.execute("UPDATE job_application_statuses SET status = 'applied' "
               "WHERE status IN ('responded','interview','offer','hired')")
    op.execute("UPDATE job_application_statuses SET status = 'saved' WHERE status IN ('rejected','withdrawn')")
    op.execute("ALTER TABLE job_application_statuses DROP CONSTRAINT ck_job_application_status_value")
    op.execute("ALTER TABLE job_application_statuses ADD CONSTRAINT ck_job_application_status_value "
               "CHECK (status IN ('saved','applied'))")
