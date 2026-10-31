"""Custom resume themes (SPEC-RTH): the themes table and wider template ids on drafts."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0040_resume_themes"
down_revision = "0039_skill_group"
branch_labels = None
depends_on = None

_OLD = "'onyx','kakuna','ditgar','lotus','teak','saffron'"
_NEW = _OLD + ",'paper','compact','banner','classic','portrait','studio'"


def _check(sql: str) -> None:
    op.execute("ALTER TABLE resume_drafts DROP CONSTRAINT ck_resume_drafts_template")
    op.execute(f"ALTER TABLE resume_drafts ADD CONSTRAINT ck_resume_drafts_template CHECK ({sql})")


def upgrade() -> None:
    op.create_table(
        "resume_themes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("layout", sa.String(20), nullable=False),
        sa.Column("tokens", postgresql.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("owner_id", "name", name="uq_resume_themes_owner_name"),
    )
    op.execute("ALTER TABLE resume_drafts ALTER COLUMN template_id TYPE varchar(48)")
    _check(f"template_id IN ({_NEW}) OR template_id LIKE 'custom:%'")


def downgrade() -> None:
    op.execute("UPDATE resume_drafts SET template_id = 'onyx' WHERE template_id NOT IN (" + _OLD + ")")
    _check(f"template_id IN ({_OLD})")
    op.execute("ALTER TABLE resume_drafts ALTER COLUMN template_id TYPE varchar(20)")
    op.drop_table("resume_themes")
