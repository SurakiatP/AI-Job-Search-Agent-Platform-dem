"""Profile picture: an uploaded image or one of the built-in avatars."""

from alembic import op

revision = "0032_avatar"
down_revision = "0031_otp_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN avatar_preset varchar(20), ADD COLUMN avatar_image bytea, "
               "ADD COLUMN avatar_mime varchar(20), ADD COLUMN avatar_updated_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN avatar_preset, DROP COLUMN avatar_image, "
               "DROP COLUMN avatar_mime, DROP COLUMN avatar_updated_at")
