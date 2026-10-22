"""Richer experience-bank fields: dates, employment type, location, industry, duties, achievements, skills."""

from alembic import op

revision = "0038_experience_fields"
down_revision = "0037_interview_report"
branch_labels = None
depends_on = None

DATE = r"'^[0-9]{4}-(0[1-9]|1[0-2])$'"


def upgrade() -> None:
    op.execute("""ALTER TABLE experience_items
        ADD COLUMN employment_type varchar(20), ADD COLUMN location varchar(200),
        ADD COLUMN start_date varchar(7), ADD COLUMN end_date varchar(7),
        ADD COLUMN is_current boolean NOT NULL DEFAULT false, ADD COLUMN industry varchar(200),
        ADD COLUMN responsibilities text, ADD COLUMN achievements text, ADD COLUMN skills_used text""")
    op.execute(f"ALTER TABLE experience_items ADD CONSTRAINT ck_experience_items_dates CHECK "
               f"((start_date IS NULL OR start_date ~ {DATE}) AND (end_date IS NULL OR end_date ~ {DATE}) "
               f"AND NOT (is_current AND end_date IS NOT NULL))")
    op.execute("ALTER TABLE experience_items ADD CONSTRAINT ck_experience_items_employment_type CHECK "
               "(employment_type IS NULL OR employment_type IN ('full_time','part_time','contract','internship','freelance'))")


def downgrade() -> None:
    op.execute("ALTER TABLE experience_items DROP CONSTRAINT ck_experience_items_employment_type")
    op.execute("ALTER TABLE experience_items DROP CONSTRAINT ck_experience_items_dates")
    op.execute("""ALTER TABLE experience_items DROP COLUMN employment_type, DROP COLUMN location,
        DROP COLUMN start_date, DROP COLUMN end_date, DROP COLUMN is_current, DROP COLUMN industry,
        DROP COLUMN responsibilities, DROP COLUMN achievements, DROP COLUMN skills_used""")
