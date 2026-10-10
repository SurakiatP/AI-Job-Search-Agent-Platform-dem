"""SQLAlchemy schema. Project-bound foreign keys are composite by design."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Float, ForeignKey, ForeignKeyConstraint,
    Index, Integer, JSON, LargeBinary, String, Text, UniqueConstraint,
    Uuid, func, text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
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
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "source_cv_revision_id"], ["cv_revisions.project_id", "cv_revisions.id"], ondelete="CASCADE"),
        UniqueConstraint("project_id", "text_hash", name="uq_experience_items_hash"),
        UniqueConstraint("project_id", "id", name="uq_experience_items_project_id"),
        CheckConstraint("kind IN ('experience','education','skill','certification','project','other')", name="ck_experience_items_kind"),
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


class JobApplicationStatus(Base):
    """Mutable owner status kept separate from immutable job and run revisions."""
    __tablename__ = "job_application_statuses"
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    job_revision_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "job_revision_id"], ["job_revisions.project_id", "job_revisions.id"], ondelete="CASCADE"),
        CheckConstraint("status IN ('saved','applied')", name="ck_job_application_status_value"),
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
    __table_args__ = (UniqueConstraint("project_id", "id", name="uq_files_project_id"), CheckConstraint("kind IN ('cv_original','job_source','generated_document','chat_attachment')", name="ck_files_kind"), CheckConstraint("publication_state IN ('pending','published','unavailable','deleting')", name="ck_files_publication_state"), CheckConstraint("size_bytes >= 0", name="ck_files_nonnegative_size"), CheckConstraint("length(checksum_sha256) = 64", name="ck_files_checksum_length"))


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


class OwnerLaunchNonce(Base):
    __tablename__ = "owner_launch_nonces"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nonce_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    origin: Mapped[str] = mapped_column(String(512), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Grant(Base):
    __tablename__ = "grants"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    label: Mapped[str | None] = mapped_column(String(80))
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
