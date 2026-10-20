"""Interview practice sets, questions and attempts (CR-IVP-01)."""

from alembic import op
import sqlalchemy as sa


revision = "0036_interview_practice"
down_revision = "0035_cv_trash_and_photo"
branch_labels = None
depends_on = None

_OPS = ("'evaluate_job','draft_documents','export_document','profile_cv','match_jobs','extract_experience',"
        "'tailor_cv','apply_prepare','apply_submit','draft_follow_up'")
_NEW = ",'interview_generate','interview_grade','interview_report'"
_SECTIONS = "'intro','behavioral','situational','technical','cv_deep_dive','gaps','company','logistics'"


def _operations(ops: str) -> None:
    op.drop_constraint("ck_runs_operation", "runs", type_="check")
    op.create_check_constraint("ck_runs_operation", "runs", f"operation IN ({ops})")


def upgrade() -> None:
    _operations(_OPS + _NEW)
    op.create_table(
        "interview_sets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("level", sa.String(8), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("runs.id", ondelete="SET NULL")),
        sa.Column("reverse_questions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["project_id", "session_id"], ["sessions.project_id", "sessions.id"], ondelete="CASCADE"),
        sa.CheckConstraint("level IN ('entry','mid','senior')", name="ck_interview_sets_level"),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="ck_interview_sets_name"),
    )
    op.create_index("ix_interview_sets_session", "interview_sets", ["project_id", "session_id"])
    op.create_table(
        "interview_questions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("set_id", sa.Uuid(), sa.ForeignKey("interview_sets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section", sa.String(16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.String(600), nullable=False),
        sa.Column("why", sa.String(300), nullable=False),
        sa.Column("key_points", sa.JSON(), nullable=False),
        sa.Column("model_answer", sa.String(3000)),
        sa.Column("evidence_ids", sa.JSON(), nullable=False),
        sa.Column("ready", sa.Boolean(), nullable=False),
        sa.Column("card_rating", sa.String(8)),
        sa.CheckConstraint(f"section IN ({_SECTIONS})", name="ck_interview_questions_section"),
        sa.CheckConstraint("card_rating IS NULL OR card_rating IN ('know','learning')", name="ck_interview_questions_rating"),
    )
    op.create_index("ix_interview_questions_set", "interview_questions", ["set_id", "position"])
    op.create_table(
        "interview_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("question_id", sa.Uuid(), sa.ForeignKey("interview_questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("feedback", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("char_length(answer) BETWEEN 1 AND 4000", name="ck_interview_attempts_answer"),
    )
    op.create_index("ix_interview_attempts_question", "interview_attempts", ["question_id", "created_at"])


def downgrade() -> None:
    op.drop_table("interview_attempts")
    op.drop_table("interview_questions")
    op.drop_table("interview_sets")
    op.execute("DELETE FROM runs WHERE operation IN ('interview_generate','interview_grade','interview_report')")
    _operations(_OPS)
