"""Six-digit email codes: sign-up verification and account deletion."""

from alembic import op

revision = "0031_otp_codes"
down_revision = "0030_telegram"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_tokens DROP CONSTRAINT ck_user_tokens_purpose")
    op.execute("ALTER TABLE user_tokens ADD CONSTRAINT ck_user_tokens_purpose CHECK "
               "(purpose IN ('verify_email','reset_password','verify_code','delete_account'))")


def downgrade() -> None:
    op.execute("DELETE FROM user_tokens WHERE purpose IN ('verify_code','delete_account')")
    op.execute("ALTER TABLE user_tokens DROP CONSTRAINT ck_user_tokens_purpose")
    op.execute("ALTER TABLE user_tokens ADD CONSTRAINT ck_user_tokens_purpose CHECK "
               "(purpose IN ('verify_email','reset_password'))")
