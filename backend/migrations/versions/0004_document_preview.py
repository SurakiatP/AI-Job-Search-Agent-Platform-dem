"""Immutable bounded previews of generated documents for authorized readers."""

from alembic import op
import sqlalchemy as sa

revision = "0004_document_preview"
down_revision = "0003_evaluation_result"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_revisions", sa.Column("content_markdown", sa.Text()))
    op.create_check_constraint(
        "ck_document_preview_length", "document_revisions",
        "content_markdown IS NULL OR char_length(content_markdown) BETWEEN 1 AND 200000",
    )


def downgrade() -> None:
    op.drop_constraint("ck_document_preview_length", "document_revisions", type_="check")
    op.drop_column("document_revisions", "content_markdown")
