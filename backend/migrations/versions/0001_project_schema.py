"""Frozen initial project-scoped schema. Future changes require new revisions.

Revision ID: 0001_project_schema
Revises:
"""
from alembic import op

revision = "0001_project_schema"
down_revision = None
branch_labels = None
depends_on = None

_TABLES = [
    'CREATE TABLE owner_launch_nonces (\n\tid UUID NOT NULL, \n\tnonce_hash BYTEA NOT NULL, \n\torigin VARCHAR(512) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tconsumed_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (nonce_hash)\n)',
    'CREATE TABLE owner_sessions (\n\tid UUID NOT NULL, \n\tsession_hash BYTEA NOT NULL, \n\tcsrf_hash BYTEA NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\trevoked_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (session_hash)\n)',
    'CREATE TABLE projects (\n\tid UUID NOT NULL, \n\tname VARCHAR(200) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id)\n)',
    'CREATE TABLE documents (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tdocument_type VARCHAR(40) NOT NULL, \n\ttitle VARCHAR(300) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_documents_project_id UNIQUE (project_id, id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    "CREATE TABLE files (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tkind VARCHAR(40) NOT NULL, \n\tpublication_state VARCHAR(20) NOT NULL, \n\tstorage_key VARCHAR(512) NOT NULL, \n\tchecksum_sha256 VARCHAR(64) NOT NULL, \n\tsize_bytes INTEGER NOT NULL, \n\tmime_type VARCHAR(200) NOT NULL, \n\tdisplay_name VARCHAR(255) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_files_project_id UNIQUE (project_id, id), \n\tCONSTRAINT ck_files_kind CHECK (kind IN ('cv_original','job_source','generated_document','chat_attachment')), \n\tCONSTRAINT ck_files_publication_state CHECK (publication_state IN ('pending','published','unavailable','deleting')), \n\tCONSTRAINT ck_files_nonnegative_size CHECK (size_bytes >= 0), \n\tCONSTRAINT ck_files_checksum_length CHECK (length(checksum_sha256) = 64), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tUNIQUE (storage_key)\n)",
    'CREATE TABLE grants (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\ttoken_hash BYTEA NOT NULL, \n\tcapabilities JSON NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\trevoked_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_grants_project_id UNIQUE (project_id, id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n\tUNIQUE (token_hash)\n)',
    'CREATE TABLE project_preferences (\n\tproject_id UUID NOT NULL, \n\tvalues JSON NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (project_id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    'CREATE TABLE provider_configurations (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tprovider VARCHAR(80) NOT NULL, \n\tmodel VARCHAR(160) NOT NULL, \n\tsecret_reference VARCHAR(512) NOT NULL, \n\trevision INTEGER NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_provider_config_project_id UNIQUE (project_id, id), \n\tCONSTRAINT uq_provider_config_revision UNIQUE (project_id, revision), \n\tCONSTRAINT ck_provider_config_revision_positive CHECK (revision > 0), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    'CREATE TABLE sessions (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_sessions_project_id UNIQUE (project_id, id), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    "CREATE TABLE tool_connector_configurations (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tadapter_key VARCHAR(40) NOT NULL, \n\trevision INTEGER NOT NULL, \n\tenabled BOOLEAN NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_tool_connector_project_id UNIQUE (project_id, id), \n\tCONSTRAINT uq_tool_connector_revision UNIQUE (project_id, adapter_key, revision), \n\tCONSTRAINT ck_tool_connector_allowlist CHECK (adapter_key IN ('career_ops')), \n\tCONSTRAINT ck_tool_connector_revision_positive CHECK (revision > 0), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)",
    'CREATE TABLE cv_revisions (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\trevision INTEGER NOT NULL, \n\tfile_id UUID, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, file_id) REFERENCES files (project_id, id), \n\tCONSTRAINT uq_cv_revisions_project_id UNIQUE (project_id, id), \n\tCONSTRAINT uq_cv_revisions_number UNIQUE (project_id, revision), \n\tCONSTRAINT ck_cv_revision_positive CHECK (revision > 0), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    'CREATE TABLE job_revisions (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\trevision INTEGER NOT NULL, \n\ttitle VARCHAR(300) NOT NULL, \n\tdescription TEXT NOT NULL, \n\tcompany VARCHAR(300), \n\tsource_url TEXT, \n\tcontent_file_id UUID, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, content_file_id) REFERENCES files (project_id, id), \n\tCONSTRAINT uq_job_revisions_project_id UNIQUE (project_id, id), \n\tCONSTRAINT uq_job_revisions_number UNIQUE (project_id, revision), \n\tCONSTRAINT ck_job_revision_positive CHECK (revision > 0), \n\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n)',
    "CREATE TABLE messages (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tsession_id UUID NOT NULL, \n\trole VARCHAR(16) NOT NULL, \n\tcontent TEXT NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, session_id) REFERENCES sessions (project_id, id) ON DELETE CASCADE, \n\tCONSTRAINT ck_messages_role CHECK (role IN ('user','assistant','system')), \n\tCONSTRAINT uq_messages_project_id UNIQUE (project_id, id)\n)",
    'CREATE TABLE document_revisions (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tdocument_id UUID NOT NULL, \n\trevision INTEGER NOT NULL, \n\tfile_id UUID, \n\tsource_cv_revision_id UUID, \n\tsource_job_revision_id UUID, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, document_id) REFERENCES documents (project_id, id) ON DELETE CASCADE, \n\tFOREIGN KEY(project_id, source_cv_revision_id) REFERENCES cv_revisions (project_id, id), \n\tFOREIGN KEY(project_id, source_job_revision_id) REFERENCES job_revisions (project_id, id), \n\tFOREIGN KEY(project_id, file_id) REFERENCES files (project_id, id), \n\tCONSTRAINT uq_document_revisions_project_id UNIQUE (project_id, id), \n\tCONSTRAINT uq_document_revision_number UNIQUE (document_id, revision), \n\tCONSTRAINT ck_document_revision_positive CHECK (revision > 0)\n)',
    'CREATE TABLE job_submissions (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tactor_scope VARCHAR(80) NOT NULL, \n\tidempotency_key VARCHAR(128) NOT NULL, \n\tpayload_digest VARCHAR(64) NOT NULL, \n\trevision_id UUID, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, revision_id) REFERENCES job_revisions (project_id, id), \n\tCONSTRAINT uq_job_submission_idempotency UNIQUE (project_id, actor_scope, idempotency_key), \n\tCONSTRAINT ck_job_submission_key_length CHECK (length(idempotency_key) BETWEEN 1 AND 128), \n\tCONSTRAINT ck_job_submission_digest_length CHECK (length(payload_digest) = 64)\n)',
    "CREATE TABLE runs (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\tactor_scope VARCHAR(80) NOT NULL, \n\tidempotency_key VARCHAR(128) NOT NULL, \n\trequest_digest VARCHAR(64) NOT NULL, \n\tsession_id UUID NOT NULL, \n\toperation VARCHAR(32) NOT NULL, \n\tcv_revision_id UUID NOT NULL, \n\tjob_revision_id UUID NOT NULL, \n\tprovider_configuration_id UUID NOT NULL, \n\tinput_snapshot JSON NOT NULL, \n\tconfig_snapshot JSON NOT NULL, \n\toutput_language VARCHAR(2) NOT NULL, \n\tstatus VARCHAR(24) NOT NULL, \n\tlease_owner VARCHAR(200), \n\tlease_expires_at TIMESTAMP WITH TIME ZONE, \n\theartbeat_at TIMESTAMP WITH TIME ZONE, \n\tcancellation_requested_at TIMESTAMP WITH TIME ZONE, \n\tretry_of_id UUID, \n\texecution_pid INTEGER, \n\texecution_created_at TIMESTAMP WITH TIME ZONE, \n\tsandbox_id VARCHAR(255), \n\tadapter_instance_id UUID, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tfinished_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, session_id) REFERENCES sessions (project_id, id), \n\tFOREIGN KEY(project_id, cv_revision_id) REFERENCES cv_revisions (project_id, id), \n\tFOREIGN KEY(project_id, job_revision_id) REFERENCES job_revisions (project_id, id), \n\tFOREIGN KEY(project_id, provider_configuration_id) REFERENCES provider_configurations (project_id, id), \n\tFOREIGN KEY(project_id, retry_of_id) REFERENCES runs (project_id, id), \n\tCONSTRAINT uq_run_idempotency_scope UNIQUE (project_id, actor_scope, idempotency_key), \n\tCONSTRAINT uq_runs_project_id UNIQUE (project_id, id), \n\tCONSTRAINT ck_runs_status CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled','interrupted')), \n\tCONSTRAINT ck_runs_idempotency_key_length CHECK (length(idempotency_key) BETWEEN 1 AND 128), \n\tCONSTRAINT ck_runs_operation CHECK (operation IN ('evaluate_job','draft_documents')), \n\tCONSTRAINT ck_runs_language CHECK (output_language IN ('th','en')), \n\tCONSTRAINT ck_runs_digest_length CHECK (length(request_digest) = 64)\n)",
    "CREATE TABLE approvals (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\trun_id UUID NOT NULL, \n\taction VARCHAR(32) NOT NULL, \n\trevision_id UUID, \n\texpected_cv_revision_id UUID, \n\ttarget_file_id UUID, \n\tchange_digest VARCHAR(64) NOT NULL, \n\ttoken_hash BYTEA NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tconsumed_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, run_id) REFERENCES runs (project_id, id) ON DELETE CASCADE, \n\tFOREIGN KEY(project_id, revision_id) REFERENCES document_revisions (project_id, id), \n\tFOREIGN KEY(project_id, expected_cv_revision_id) REFERENCES cv_revisions (project_id, id), \n\tFOREIGN KEY(project_id, target_file_id) REFERENCES files (project_id, id), \n\tCONSTRAINT ck_approval_action CHECK (action IN ('promote_cv','delete_document_revision','delete_file')), \n\tCONSTRAINT ck_approval_change_digest_length CHECK (length(change_digest) = 64), \n\tCONSTRAINT ck_approval_target_shape CHECK ((action = 'promote_cv' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NOT NULL AND target_file_id IS NULL) OR (action = 'delete_document_revision' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL) OR (action = 'delete_file' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NOT NULL)), \n\tCONSTRAINT uq_approval_run_revision UNIQUE (run_id, revision_id), \n\tCONSTRAINT uq_approval_run_file UNIQUE (run_id, target_file_id), \n\tUNIQUE (token_hash)\n)",
    'CREATE TABLE run_events (\n\tid UUID NOT NULL, \n\tproject_id UUID NOT NULL, \n\trun_id UUID NOT NULL, \n\tsequence INTEGER NOT NULL, \n\tevent_type VARCHAR(80) NOT NULL, \n\tpublic_data JSON NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(project_id, run_id) REFERENCES runs (project_id, id) ON DELETE CASCADE, \n\tCONSTRAINT uq_run_event_sequence UNIQUE (run_id, sequence), \n\tCONSTRAINT ck_run_event_sequence_positive CHECK (sequence >= 1)\n)',
]
_INDEXES = [
    "CREATE UNIQUE INDEX uq_runs_one_active_per_project ON runs (project_id) WHERE status IN ('running', 'waiting_approval')",
]

_DROP_ORDER = ('run_events', 'approvals', 'runs', 'job_submissions', 'document_revisions', 'messages', 'job_revisions', 'cv_revisions', 'tool_connector_configurations', 'sessions', 'provider_configurations', 'project_preferences', 'grants', 'files', 'documents', 'projects', 'owner_sessions', 'owner_launch_nonces')

def upgrade() -> None:
    for statement in _TABLES:
        op.execute(statement)
    for statement in _INDEXES:
        op.execute(statement)
    op.execute("""CREATE FUNCTION reject_revision_mutation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'immutable_revision' USING ERRCODE = 'check_violation'; END;
        $$ LANGUAGE plpgsql""")
    for table in ("cv_revisions", "job_revisions", "document_revisions",
                  "provider_configurations", "tool_connector_configurations"):
        op.execute(f"CREATE TRIGGER {table}_immutable BEFORE UPDATE ON {table} "
                   "FOR EACH ROW EXECUTE FUNCTION reject_revision_mutation()")
    op.execute("""CREATE FUNCTION reject_run_snapshot_mutation() RETURNS trigger AS $$
        BEGIN
            IF ROW(OLD.project_id, OLD.actor_scope, OLD.idempotency_key, OLD.request_digest,
                   OLD.session_id, OLD.operation, OLD.cv_revision_id, OLD.job_revision_id,
                   OLD.provider_configuration_id, OLD.output_language, OLD.retry_of_id)
               IS DISTINCT FROM
               ROW(NEW.project_id, NEW.actor_scope, NEW.idempotency_key, NEW.request_digest,
                   NEW.session_id, NEW.operation, NEW.cv_revision_id, NEW.job_revision_id,
                   NEW.provider_configuration_id, NEW.output_language, NEW.retry_of_id)
               OR OLD.input_snapshot::jsonb IS DISTINCT FROM NEW.input_snapshot::jsonb
               OR OLD.config_snapshot::jsonb IS DISTINCT FROM NEW.config_snapshot::jsonb THEN
                RAISE EXCEPTION 'immutable_run_snapshot' USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END; $$ LANGUAGE plpgsql""")
    op.execute("CREATE TRIGGER runs_snapshot_immutable BEFORE UPDATE ON runs "
               "FOR EACH ROW EXECUTE FUNCTION reject_run_snapshot_mutation()")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS runs_snapshot_immutable ON runs")
    op.execute("DROP FUNCTION IF EXISTS reject_run_snapshot_mutation()")
    for table in ("tool_connector_configurations", "provider_configurations",
                  "document_revisions", "job_revisions", "cv_revisions"):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_immutable ON {table}")
    op.execute("DROP FUNCTION IF EXISTS reject_revision_mutation()")
    for table in _DROP_ORDER:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
