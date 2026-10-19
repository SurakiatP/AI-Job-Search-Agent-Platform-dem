"""SQLAlchemy schema. Project-bound foreign keys are composite by design."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, ForeignKeyConstraint,
    Index, Integer, JSON, LargeBinary, String, Text, UniqueConstraint,
    Uuid, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    locale: Mapped[str] = mapped_column(String(2), nullable=False, default="th", server_default="th")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avatar_preset: Mapped[str | None] = mapped_column(String(20))
    avatar_image: Mapped[bytes | None] = mapped_column(LargeBinary)
    avatar_mime: Mapped[str | None] = mapped_column(String(20))
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        CheckConstraint("email = lower(email) AND email LIKE '%_@_%'", name="ck_users_email"),
        CheckConstraint("locale IN ('th','en')", name="ck_users_locale"),
    )


class UserToken(Base):
    __tablename__ = "user_tokens"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (CheckConstraint("purpose IN ('verify_email','reset_password','verify_code','delete_account')", name="ck_user_tokens_purpose"),)


class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"
    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    bucket: Mapped[str] = mapped_column(String(40), nullable=False)
    key_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("ix_rate_limit_events_lookup", "bucket", "key_hash", "created_at"),)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectPreference(Base):
    __tablename__ = "project_preferences"
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    values: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    submit_autopilot_daily_limit: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("submit_autopilot_daily_limit IS NULL OR submit_autopilot_daily_limit BETWEEN 1 AND 20",
                                      name="ck_pref_autopilot_limit"),)


class ConversationSession(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New session")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Paired sessions pin one CV revision and one job revision; legacy sessions have neither.
    cv_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    job_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # Set when a session with run history is deleted; it stays so runs and documents keep their source.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_sessions_project_id"),
        ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"]),
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"]),
        Index("uq_sessions_pair", "project_id", "cv_revision_id", "job_revision_id", unique=True,
              postgresql_where=text("removed_at IS NULL")),
        CheckConstraint("(cv_revision_id IS NULL) = (job_revision_id IS NULL)", name="ck_sessions_pair_complete"),
    )


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "session_id"], ["sessions.project_id", "sessions.id"], ondelete="CASCADE"),
        CheckConstraint("role IN ('user','assistant','system')", name="ck_messages_role"),
        UniqueConstraint("project_id", "id", name="uq_messages_project_id"),
    )


class CV(Base):
    """A named CV; its uploads are CVRevision rows. Removal is soft."""
    __tablename__ = "cvs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_cvs_project_id"),
        Index("uq_cvs_one_primary_per_project", "project_id", unique=True,
              postgresql_where=text("is_primary AND removed_at IS NULL")),
    )


class CVRevision(Base):
    __tablename__ = "cv_revisions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    cv_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # {"skills": [canonical names], "method": ...}; names only, never CV text. NULL until a run parsed the CV.
    skill_profile: Mapped[dict | None] = mapped_column(JSON)
    resume_data: Mapped[dict | None] = mapped_column(JSON)  # set only for CVs made in the builder
    resume_style: Mapped[dict | None] = mapped_column(JSON)  # {"template_id", "accent"}
    __table_args__ = (ForeignKeyConstraint(["project_id", "file_id"], ["files.project_id", "files.id"]), ForeignKeyConstraint(["project_id", "cv_id"], ["cvs.project_id", "cvs.id"]), UniqueConstraint("project_id", "id", name="uq_cv_revisions_project_id"), UniqueConstraint("cv_id", "revision", name="uq_cv_revisions_number"), CheckConstraint("revision > 0", name="ck_cv_revision_positive"))


class CVRevisionText(Base):
    """Parsed CV text, written once per revision by a sandbox parse; never returned by any API."""
    __tablename__ = "cv_revision_texts"
    cv_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
                      CheckConstraint("char_length(text) BETWEEN 1 AND 200000", name="ck_cv_revision_text_length"))


class ExperienceItem(Base):
    """One candidate fact; its id is the evidence_id AI edits cite. Text is immutable; removal is soft."""
    __tablename__ = "experience_items"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str | None] = mapped_column(String(200))
    organization: Mapped[str | None] = mapped_column(String(200))
    period: Mapped[str | None] = mapped_column(String(60))
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    source_cv_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    builder_cv_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("cvs.id", ondelete="SET NULL"))
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "source_cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        UniqueConstraint("project_id", "text_hash", name="uq_experience_items_hash"),
        UniqueConstraint("project_id", "id", name="uq_experience_items_project_id"),
        CheckConstraint("kind IN ('experience','education','skill','certification','project','other','award','publication',"
                        "'volunteer','interest','language')", name="ck_experience_items_kind"),
        CheckConstraint("char_length(text) BETWEEN 1 AND 1000", name="ck_experience_items_text_length"),
        CheckConstraint("source IN ('cv','owner')", name="ck_experience_items_source"),
        CheckConstraint("(source = 'owner') = (source_cv_revision_id IS NULL)", name="ck_experience_items_source_revision"),
        CheckConstraint("length(text_hash) = 64", name="ck_experience_items_hash_length"),
    )


class JobMatchScore(Base):
    """One Jev score of a job-board posting (slug + content hash) against a CV revision."""
    __tablename__ = "job_match_scores"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    cv_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    job_slug: Mapped[str] = mapped_column(String(200), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    fit_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    uncertain: Mapped[bool] = mapped_column(Boolean, nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
                      UniqueConstraint("cv_revision_id", "job_slug", "content_hash", "model", name="uq_job_match_scores_key"),
                      CheckConstraint("fit_percent BETWEEN 0 AND 100", name="ck_job_match_fit_range"),
                      Index("ix_job_match_scores_lookup", "cv_revision_id", "job_slug"))


class JobSearchHidden(Base):
    """A job (slug) or company (normalized name) the owner hid from Smart match in this project."""
    __tablename__ = "job_search_hidden"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    value: Mapped[str] = mapped_column(String(300), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("project_id", "kind", "value", name="uq_job_search_hidden_key"),
                      UniqueConstraint("project_id", "id", name="uq_job_search_hidden_project_id"),
                      CheckConstraint("kind IN ('job','company')", name="ck_job_search_hidden_kind"))


class JobRevision(Base):
    __tablename__ = "job_revisions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    company: Mapped[str | None] = mapped_column(String(300))
    source_url: Mapped[str | None] = mapped_column(Text)
    content_file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (ForeignKeyConstraint(["project_id", "content_file_id"], ["files.project_id", "files.id"]), UniqueConstraint("project_id", "id", name="uq_job_revisions_project_id"), UniqueConstraint("project_id", "revision", name="uq_job_revisions_number"), CheckConstraint("revision > 0", name="ck_job_revision_positive"))


APPLICATION_STAGES = ("saved", "applied", "responded", "interview", "offer", "hired", "rejected", "withdrawn")
APPLICATION_EVENT_KINDS = ("stage_changed", "note", "contact_updated", "email_logged", "applied_via_approval")


def _in(values: tuple[str, ...]) -> str:
    return ",".join(f"'{value}'" for value in values)


class JobApplicationStatus(Base):
    """Mutable owner status and recruiter contact, kept separate from immutable job and run revisions."""
    __tablename__ = "job_application_statuses"
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    job_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_role: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"], ondelete="CASCADE"),
        CheckConstraint(f"status IN ({_in(APPLICATION_STAGES)})", name="ck_job_application_status_value"),
    )


class ApplicationEvent(Base):
    """Append-only FR-T01 ledger. A trigger rejects UPDATE and any DELETE that is not an FK cascade."""
    __tablename__ = "application_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    job_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"],
                             ondelete="CASCADE", name="fk_application_events_job"),
        CheckConstraint(f"kind IN ({_in(APPLICATION_EVENT_KINDS)})", name="ck_application_events_kind"),
        Index("ix_application_events_job", "project_id", "job_revision_id", "created_at"),
    )

class JobSubmission(Base):
    """Idempotency reservation for callers that submit job text inline."""
    __tablename__ = "job_submissions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    actor_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "revision_id"], ["job_revisions.project_id", "job_revisions.id"]),
        UniqueConstraint("project_id", "actor_scope", "idempotency_key", name="uq_job_submission_idempotency"),
        CheckConstraint("length(idempotency_key) BETWEEN 1 AND 128", name="ck_job_submission_key_length"),
        CheckConstraint("length(payload_digest) = 64", name="ck_job_submission_digest_length"),
    )


class StoredFile(Base):
    __tablename__ = "files"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    publication_state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("project_id", "id", name="uq_files_project_id"), CheckConstraint("kind IN ('cv_original','job_source','generated_document','chat_attachment','resume_render')", name="ck_files_kind"), CheckConstraint("publication_state IN ('pending','published','unavailable','deleting')", name="ck_files_publication_state"), CheckConstraint("size_bytes >= 0", name="ck_files_nonnegative_size"), CheckConstraint("length(checksum_sha256) = 64", name="ck_files_checksum_length"))


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("project_id", "id", name="uq_documents_project_id"),)


class DocumentRevision(Base):
    __tablename__ = "document_revisions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    source_cv_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    source_job_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    content_markdown: Mapped[str | None] = mapped_column(Text)
    resume_data: Mapped[dict | None] = mapped_column(JSON)  # tailored builder CV: rendered from a template
    resume_style: Mapped[dict | None] = mapped_column(JSON)  # {"template_id", "accent"}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "document_id"], ["documents.project_id", "documents.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["project_id", "source_cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"]),
        ForeignKeyConstraint(["project_id", "source_job_revision_id"], ["job_revisions.project_id", "job_revisions.id"]),
        ForeignKeyConstraint(["project_id", "file_id"], ["files.project_id", "files.id"]),
        UniqueConstraint("project_id", "id", name="uq_document_revisions_project_id"), UniqueConstraint("document_id", "revision", name="uq_document_revision_number"), CheckConstraint("revision > 0", name="ck_document_revision_positive"),
        CheckConstraint("content_markdown IS NULL OR char_length(content_markdown) BETWEEN 1 AND 200000", name="ck_document_preview_length"),
    )


class ProviderConfiguration(Base):
    __tablename__ = "provider_configurations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # NULL = the one system-wide (owner-level) configuration; non-NULL rows are legacy per-project history.
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    secret_reference: Mapped[str] = mapped_column(String(512), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("project_id", "revision", name="uq_provider_config_revision"), CheckConstraint("revision > 0", name="ck_provider_config_revision_positive"),
                      Index("uq_provider_config_global_revision", "revision", unique=True, postgresql_where=text("project_id IS NULL")))


class ToolConnectorConfiguration(Base):
    """Versioned, typed configuration for built-in allowlisted connectors."""
    __tablename__ = "tool_connector_configurations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    adapter_key: Mapped[str] = mapped_column(String(40), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_tool_connector_project_id"),
        UniqueConstraint("project_id", "adapter_key", "revision", name="uq_tool_connector_revision"),
        CheckConstraint("adapter_key IN ('career_ops')", name="ck_tool_connector_allowlist"),
        CheckConstraint("revision > 0", name="ck_tool_connector_revision_positive"),
    )


class OwnerSession(Base):
    __tablename__ = "owner_sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    csrf_hash: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Grant(Base):
    __tablename__ = "grants"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[bytes | None] = mapped_column(LargeBinary(32), unique=True)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    label: Mapped[str | None] = mapped_column(String(80))
    oauth_client_id: Mapped[str | None] = mapped_column(String(2048), ForeignKey("oauth_clients.client_id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("project_id", "id", name="uq_grants_project_id"),)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    actor_scope: Mapped[str] = mapped_column(String(80), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    # session / job are NULL for profile_cv, match_jobs and extract_experience; provider only for profile_cv.
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    cv_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    job_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    provider_configuration_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    input_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    config_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_language: Mapped[str] = mapped_column(String(2), nullable=False)
    evaluation_result: Mapped[dict | None] = mapped_column(JSON)
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued")
    lease_owner: Mapped[str | None] = mapped_column(String(200))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retry_of_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    execution_pid: Mapped[int | None] = mapped_column(Integer)
    execution_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sandbox_id: Mapped[str | None] = mapped_column(String(255))
    adapter_instance_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    resume_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "session_id"], ["sessions.project_id", "sessions.id"]),
        ForeignKeyConstraint(["project_id", "cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"]),
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"]),
        ForeignKeyConstraint(["provider_configuration_id"], ["provider_configurations.id"]),
        ForeignKeyConstraint(["project_id", "retry_of_id"], ["runs.project_id", "runs.id"]),
        UniqueConstraint("project_id", "actor_scope", "idempotency_key", name="uq_run_idempotency_scope"),
        UniqueConstraint("project_id", "id", name="uq_runs_project_id"),
        CheckConstraint("status IN ('queued','running','waiting_approval','needs_input','completed','failed','cancelled','interrupted')", name="ck_runs_status"),
        CheckConstraint("length(idempotency_key) BETWEEN 1 AND 128", name="ck_runs_idempotency_key_length"),
        CheckConstraint("operation IN ('evaluate_job','draft_documents','export_document','profile_cv','match_jobs','extract_experience','tailor_cv','apply_prepare','apply_submit','draft_follow_up')", name="ck_runs_operation"),
        CheckConstraint("operation IN ('profile_cv','match_jobs','extract_experience') OR (session_id IS NOT NULL AND job_revision_id IS NOT NULL)", name="ck_runs_context_required"),
        CheckConstraint("output_language IN ('th','en')", name="ck_runs_language"),
        CheckConstraint("length(request_digest) = 64", name="ck_runs_digest_length"),
        CheckConstraint("active_seconds >= 0", name="ck_runs_active_seconds"),
        CheckConstraint("tool_calls BETWEEN 0 AND 30", name="ck_runs_tool_calls"),
        CheckConstraint("resume_count >= 0", name="ck_runs_resume_count"),
        Index("uq_runs_one_active_per_project", "project_id", unique=True, postgresql_where=(status.in_(["running", "waiting_approval"]) & (operation != "apply_submit"))),
    )


class RunEvent(Base):
    __tablename__ = "run_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    public_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (ForeignKeyConstraint(["project_id", "run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE"), UniqueConstraint("run_id", "sequence", name="uq_run_event_sequence"), CheckConstraint("sequence >= 1", name="ck_run_event_sequence_positive"))


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    expected_cv_revision_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    target_file_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    target_run_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    change_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision: Mapped[str | None] = mapped_column(String(8))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(16))
    __table_args__ = (
        CheckConstraint("decided_by IS NULL OR decided_by IN ('owner','autopilot')", name="ck_approval_decided_by"),
        ForeignKeyConstraint(["project_id", "run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["project_id", "revision_id"], ["document_revisions.project_id", "document_revisions.id"]),
        ForeignKeyConstraint(["project_id", "expected_cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"]),
        ForeignKeyConstraint(["project_id", "target_file_id"], ["files.project_id", "files.id"]),
        ForeignKeyConstraint(["project_id", "target_run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE", name="fk_approvals_target_run"),
        CheckConstraint("action IN ('promote_cv','delete_document_revision','delete_file','submit_application')", name="ck_approval_action"),
        CheckConstraint("length(change_digest) = 64", name="ck_approval_change_digest_length"),
        CheckConstraint("decision IS NULL OR decision IN ('approve','reject')", name="ck_approval_decision"),
        CheckConstraint("(action = 'promote_cv' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NOT NULL AND target_file_id IS NULL AND target_run_id IS NULL) OR (action = 'delete_document_revision' AND revision_id IS NOT NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL AND target_run_id IS NULL) OR (action = 'delete_file' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NOT NULL AND target_run_id IS NULL) OR (action = 'submit_application' AND revision_id IS NULL AND expected_cv_revision_id IS NULL AND target_file_id IS NULL AND target_run_id IS NOT NULL)", name="ck_approval_target_shape"),
        UniqueConstraint("run_id", "revision_id", name="uq_approval_run_revision"),
        UniqueConstraint("run_id", "target_file_id", name="uq_approval_run_file"),
    )


class RunArtifact(Base):
    """Published output provenance; public views resolve scoped file metadata."""
    __tablename__ = "run_artifacts"
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    document_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    lease_owner: Mapped[str | None] = mapped_column(String(200))
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["project_id", "file_id"], ["files.project_id", "files.id"]),
        ForeignKeyConstraint(["project_id", "document_revision_id"], ["document_revisions.project_id", "document_revisions.id"]),
    )


class SavedSearch(Base):
    """FR-J05 saved job-search filters with a scheduled email digest."""
    __tablename__ = "saved_searches"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    filters: Mapped[dict] = mapped_column(JSON, nullable=False)
    frequency: Mapped[str] = mapped_column(String(8), nullable=False)
    digest_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    unsubscribe_token_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, unique=True)
    prev_unsubscribe_token_hash: Mapped[bytes | None] = mapped_column(LargeBinary)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_saved_searches_name"),
        CheckConstraint("frequency IN ('daily','weekly')", name="ck_saved_searches_frequency"),
        CheckConstraint("length(btrim(name)) BETWEEN 1 AND 80", name="ck_saved_searches_name"),
        Index("ix_saved_searches_due", "next_run_at", postgresql_where=text("(digest_enabled OR push_enabled OR telegram_enabled)")),
    )


class TelegramLink(Base):
    """FR-J05 one Telegram chat per account; ``code_hash`` is a pending single-use link code (10 minutes)."""
    __tablename__ = "telegram_links"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    code_hash: Mapped[bytes | None] = mapped_column(LargeBinary, unique=True)
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SavedSearchSeen(Base):
    """Job slugs already sent in a digest for one saved search; pruned after 90 days."""
    __tablename__ = "saved_search_seen"
    saved_search_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("saved_searches.id", ondelete="CASCADE"), primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("ix_saved_search_seen_at", "seen_at"),)


class WebhookEndpoint(Base):
    """FR-P06 owner project webhook. ``secret`` signs deliveries; shown once at creation, never returned again."""
    __tablename__ = "webhook_endpoints"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    events: Mapped[list] = mapped_column(JSON, nullable=False)
    secret: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class A2APushConfig(Base):
    """FR-P04 per-task A2A push config, owned by the grant that created the run."""
    __tablename__ = "a2a_push_configs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    grant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("grants.id", ondelete="CASCADE"), nullable=False)
    config_id: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    token: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "run_id"], ["runs.project_id", "runs.id"], ondelete="CASCADE",
                             name="fk_a2a_push_configs_run"),
        UniqueConstraint("run_id", "config_id", name="uq_a2a_push_configs_config"),
    )


class WebhookDelivery(Base):
    """FR-P06 outbox row and delivery history; exactly one of endpoint_id / push_config_id is set."""
    __tablename__ = "webhook_deliveries"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    endpoint_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"))
    push_config_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("a2a_push_configs.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending", server_default=text("'pending'"))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_status_code: Mapped[int | None] = mapped_column(Integer)
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("(endpoint_id IS NULL) <> (push_config_id IS NULL)", name="ck_webhook_deliveries_target"),
        CheckConstraint("status IN ('pending','delivered','dead')", name="ck_webhook_deliveries_status"),
        Index("ix_webhook_deliveries_due", "next_attempt_at", postgresql_where=text("status = 'pending'")),
        Index("ix_webhook_deliveries_project", "project_id", "created_at"),
    )


class OAuthClient(Base):
    """FR-P03 OAuth client: DCR-registered (public) or a cached Client ID Metadata Document."""
    __tablename__ = "oauth_clients"
    client_id: Mapped[str] = mapped_column(String(2048), primary_key=True)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    client_info: Mapped[dict] = mapped_column(JSON, nullable=False)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("kind IN ('dcr','cimd')", name="ck_oauth_clients_kind"),)


class OAuthAuthorization(Base):
    """A pending /authorize request; becomes a single-use code once the user approves."""
    __tablename__ = "oauth_authorizations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    request_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(2048), ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(2048), nullable=False)
    redirect_uri_explicit: Mapped[bool] = mapped_column(Boolean, nullable=False)
    state: Mapped[str | None] = mapped_column(String(512))
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    resource: Mapped[str] = mapped_column(String(2048), nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    code_hash: Mapped[bytes | None] = mapped_column(LargeBinary(32), unique=True)
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("grants.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OAuthToken(Base):
    """Opaque OAuth access/refresh token (hash only). ``pair_id`` links the two issued together."""
    __tablename__ = "oauth_tokens"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    pair_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    grant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("grants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(2048), ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), nullable=False)
    resource: Mapped[str] = mapped_column(String(2048), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("kind IN ('access','refresh')", name="ck_oauth_tokens_kind"),)


JOB_POSTING_SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters", "jobtopgun", "jobbkk")


class JobPosting(Base):
    """WP5 job store: one ingested posting per (source, external_id); Postgres is the system of record."""
    __tablename__ = "job_postings"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    board: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    company: Mapped[str | None] = mapped_column(String(300))
    location: Mapped[str | None] = mapped_column(String(300))
    cities: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    province: Mapped[str | None] = mapped_column(String(8))
    work_mode: Mapped[str | None] = mapped_column(String(10))
    seniority: Mapped[str | None] = mapped_column(String(12))
    employment_type: Mapped[str | None] = mapped_column(String(12))
    company_type: Mapped[str | None] = mapped_column(String(12))
    category: Mapped[str | None] = mapped_column(String(60))
    skills: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    salary_currency: Mapped[str | None] = mapped_column(String(3))
    salary_period: Mapped[str | None] = mapped_column(String(5))
    salary_thb_month_min: Mapped[int | None] = mapped_column(Integer)
    posting_language: Mapped[str | None] = mapped_column(String(2))
    description_markdown: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    url_key: Mapped[str | None] = mapped_column(String(2048))
    match_key: Mapped[str | None] = mapped_column(String(700))
    canonical_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("job_postings.id", ondelete="SET NULL"))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    missed_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reality_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    index_dirty: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_job_postings_source_external"),
        CheckConstraint(f"source IN ({_in(JOB_POSTING_SOURCES)})", name="ck_job_postings_source"),
        CheckConstraint("missed_runs >= 0", name="ck_job_postings_missed"),
        Index("ix_job_postings_url_key", "url_key"),
        Index("ix_job_postings_match_key", "match_key"),
        Index("ix_job_postings_canonical", "canonical_id"),
        Index("ix_job_postings_board", "source", "board"),
    )


class JobPostingTombstone(Base):
    """Remembers an aged-out posting so the source's still-listed copy is not re-ingested (spec D9)."""
    __tablename__ = "job_posting_tombstones"
    source: Mapped[str] = mapped_column(String(20), primary_key=True)
    external_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class JobIndexDelete(Base):
    """Queue of deleted posting ids the search index must drop."""
    __tablename__ = "job_index_deletes"
    posting_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CrawlState(Base):
    """Per-site crawler progress: JobTopGun company floors, JobBKK sweep cursor (spec 2026-10-15)."""
    __tablename__ = "crawl_state"
    source: Mapped[str] = mapped_column(String(20), primary_key=True)
    state: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IngestRun(Base):
    """One hourly ingest run; per_board maps 'source:board' to {state, fetched, error}."""
    __tablename__ = "ingest_runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    per_board: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    fetched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deleted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    merged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __table_args__ = (CheckConstraint("status IN ('running','ok','partial','failed')", name="ck_ingest_runs_status"),)


class ResumeDraft(Base):
    """Editable resume data of a builder CV or of a tailored builder document; revisions stay immutable."""
    __tablename__ = "resume_drafts"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    cv_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, unique=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, unique=True)
    resume_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    template_id: Mapped[str] = mapped_column(String(20), nullable=False)
    accent: Mapped[str] = mapped_column(String(20), nullable=False)
    document_language: Mapped[str] = mapped_column(String(2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "cv_id"], ["cvs.project_id", "cvs.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["project_id", "document_id"], ["documents.project_id", "documents.id"], ondelete="CASCADE"),
        CheckConstraint("(cv_id IS NULL) <> (document_id IS NULL)", name="ck_resume_drafts_owner"),
        CheckConstraint("template_id IN ('onyx','kakuna','ditgar')", name="ck_resume_drafts_template"),
        CheckConstraint("document_language IN ('th','en')", name="ck_resume_drafts_language"),
    )
