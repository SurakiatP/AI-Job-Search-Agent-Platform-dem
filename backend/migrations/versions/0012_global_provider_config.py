"""Provider settings become one owner-level (global) configuration.

Global rows have project_id NULL. Legacy per-project rows stay so run history keeps
its provider_configuration_id; runs now reference provider_configurations.id directly.
Upgrade copies provider/model/secret_reference/base_url (the secret itself is untouched)
of the most recently updated legacy row into global revision 1.

Downgrade: global rows are deleted, so it fails while any run references one (runs are
immutable). Legacy per-project rows are untouched.
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_global_provider_config"
down_revision = "0011_session_removed_at"
branch_labels = None
depends_on = None

_FK = "runs_project_id_provider_configuration_id_fkey"


def upgrade() -> None:
    op.drop_constraint(_FK, "runs", type_="foreignkey")
    op.drop_constraint("uq_provider_config_project_id", "provider_configurations", type_="unique")
    op.alter_column("provider_configurations", "project_id", nullable=True)
    op.create_foreign_key("runs_provider_configuration_id_fkey", "runs", "provider_configurations",
                          ["provider_configuration_id"], ["id"])
    op.create_index("uq_provider_config_global_revision", "provider_configurations", ["revision"],
                    unique=True, postgresql_where=sa.text("project_id IS NULL"))
    op.execute("""INSERT INTO provider_configurations
        (id, project_id, provider, model, secret_reference, base_url, revision)
        SELECT gen_random_uuid(), NULL, provider, model, secret_reference, base_url, 1
        FROM provider_configurations WHERE project_id IS NOT NULL
        ORDER BY updated_at DESC, revision DESC LIMIT 1""")


def downgrade() -> None:
    # Global rows cannot stay project-less; runs are immutable, so refuse if any use one.
    if op.get_bind().execute(sa.text(
            "SELECT 1 FROM runs r JOIN provider_configurations p ON p.id = r.provider_configuration_id "
            "WHERE p.project_id IS NULL LIMIT 1")).first():
        raise RuntimeError("downgrade_blocked: runs reference the global provider configuration")
    op.execute("DELETE FROM provider_configurations WHERE project_id IS NULL")
    op.drop_index("uq_provider_config_global_revision", table_name="provider_configurations")
    op.drop_constraint("runs_provider_configuration_id_fkey", "runs", type_="foreignkey")
    op.alter_column("provider_configurations", "project_id", nullable=False)
    op.create_unique_constraint("uq_provider_config_project_id", "provider_configurations", ["project_id", "id"])
    op.create_foreign_key(_FK, "runs", "provider_configurations",
                         ["project_id", "provider_configuration_id"], ["project_id", "id"])
