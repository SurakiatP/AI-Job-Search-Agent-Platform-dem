"""Skill group for skill facts in the experience bank."""

from alembic import op

revision = "0039_skill_group"
down_revision = "0038_experience_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE experience_items ADD COLUMN skill_group varchar(12)")
    op.execute("ALTER TABLE experience_items ADD CONSTRAINT ck_experience_items_skill_group CHECK "
               "(skill_group IS NULL OR skill_group IN ('technical','tools','soft','language','domain'))")


def downgrade() -> None:
    op.execute("ALTER TABLE experience_items DROP CONSTRAINT ck_experience_items_skill_group")
    op.execute("ALTER TABLE experience_items DROP COLUMN skill_group")
