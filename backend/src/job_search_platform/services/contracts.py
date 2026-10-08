"""Stable, transport-neutral Pydantic contracts shared by REST and protocols."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, AsyncIterator, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, StringConstraints, model_validator


Capability = Literal["results:read", "jobs:evaluate", "documents:draft"]
RunStatus = Literal["queued", "running", "waiting_approval", "completed", "failed", "cancelled", "interrupted"]
Operation = Literal["evaluate_job", "draft_documents"]


@dataclass(frozen=True, slots=True)
class Actor:
    kind: Literal["owner", "grant"]
    owner_session_id: UUID | None
    grant_id: UUID | None
    project_id: UUID | None
    capabilities: frozenset[str]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RunRequest(DTO):
    session_id: UUID
    operation: Operation
    cv_revision_id: UUID | None = None
    cv_id: UUID | None = None
    # Optional only because a paired session supplies its own job.
    job_revision_id: UUID | None = None
    output_language: Literal["th", "en"]
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    retry_of_id: UUID | None = None
    owner_instructions: Annotated[str | None, StringConstraints(max_length=4000)] = None
    # Draft runs only: append the result as a new revision of this document.
    document_id: UUID | None = None


class ProjectCreate(DTO):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ProjectView(DTO):
    id: UUID
    name: str
    created_at: datetime


class ProjectUpdate(DTO):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PreferencesUpdate(DTO):
    locale: Literal["th", "en"] | None = None
    output_language: Literal["th", "en"] | None = None
    notifications_enabled: bool | None = None


class PreferencesView(DTO):
    project_id: UUID
    locale: Literal["th", "en"]
    output_language: Literal["th", "en"]
    notifications_enabled: bool
    updated_at: datetime


class InlineJob(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    company: Annotated[str, StringConstraints(max_length=300)] | None = None
    source_url: Annotated[str, StringConstraints(max_length=2048)] | None = None
    description: Annotated[str, StringConstraints(min_length=1, max_length=50000)]


class SessionCreate(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    cv_revision_id: UUID
    job_revision_id: UUID | None = None
    job: InlineJob | None = None

    @model_validator(mode="after")
    def exactly_one_job_source(self):
        if (self.job is None) == (self.job_revision_id is None):
            raise ValueError("exactly_one_job_source_required")
        return self


class SessionUpdate(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class SessionView(DTO):
    id: UUID
    project_id: UUID
    title: str
    created_at: datetime
    # All null for legacy unpaired sessions.
    cv_revision_id: UUID | None = None
    job_revision_id: UUID | None = None
    cv_name: str | None = None
    cv_revision: int | None = None
    job_title: str | None = None
    job_company: str | None = None
    cv_outdated: bool = False
    # Only set on the create response.
    evaluation_run_id: UUID | None = None


class MessageCreate(DTO):
    content: Annotated[str, StringConstraints(min_length=1, max_length=20000)]


class MessageView(DTO):
    id: UUID
    session_id: UUID
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: datetime


class RevisionView(DTO):
    id: UUID
    revision: int
    created_at: datetime


class JobRevisionView(RevisionView):
    description: Annotated[str, StringConstraints(max_length=50000)] | None = None
    title: str
    company: str | None = None
    source_url: str | None = None


    application_status: Literal["saved", "applied"] = "saved"

class JobApplicationStatusUpdate(DTO):
    application_status: Literal["saved", "applied"]

class JobApplicationStatusView(DTO):
    job_revision_id: UUID
    application_status: Literal["saved", "applied"]

class JobCreate(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    company: Annotated[str, StringConstraints(max_length=300)] | None = None
    source_url: Annotated[str, StringConstraints(max_length=2048)] | None = None
    description: Annotated[str, StringConstraints(min_length=1, max_length=50000)]


class CVRevisionView(RevisionView):
    original_filename: str
    mime_type: str
    size_bytes: int


class CVUpdate(DTO):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    is_primary: Literal[True] | None = None


class CVView(DTO):
    id: UUID
    name: str
    is_primary: bool
    created_at: datetime
    latest_revision: CVRevisionView | None = None
    revision_count: int
    in_use: bool


class DocumentView(DTO):
    id: UUID
    document_type: Literal["cv", "cover_letter", "other"]
    title: str
    latest_revision: RevisionView | None = None
    content_markdown: Annotated[str, StringConstraints(min_length=1, max_length=200000)] | None = None
    output_language: Literal["th", "en"] | None = None
    source_run_id: UUID | None = None
    partial: bool = False
    trashed_at: datetime | None = None


class DocumentRevisionView(RevisionView):
    document_id: UUID
    source_cv_revision_id: UUID | None = None
    source_job_revision_id: UUID | None = None
    file_id: UUID | None = None
    content_markdown: Annotated[str, StringConstraints(min_length=1, max_length=200000)] | None = None


class FileView(DTO):
    id: UUID
    kind: Literal["cv_original", "job_source", "generated_document", "chat_attachment"]
    publication_state: Literal["pending", "published", "unavailable"]
    display_name: str
    mime_type: str
    size_bytes: int
    checksum_sha256: str
    created_at: datetime


class UploadRequest(DTO):
    filename: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    mime_type: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    size_bytes: Annotated[int, Field(ge=0, le=20 * 1024 * 1024)]


SkillName = Annotated[str, StringConstraints(min_length=1, max_length=80)]


class SkillCoverage(DTO):
    """Deterministic keyword coverage; never produced by the model."""
    required: Annotated[tuple[SkillName, ...], Field(max_length=60)]
    matched: Annotated[tuple[SkillName, ...], Field(max_length=60)]
    missing: Annotated[tuple[SkillName, ...], Field(max_length=60)]
    ratio: Annotated[float, Field(ge=0, le=1)]
    method: Annotated[str, StringConstraints(max_length=40)]


class EvaluationResult(DTO):
    report_markdown: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200000)]
    score: Annotated[float, Field(ge=1, le=5, strict=True)] | None = None
    skill_coverage: SkillCoverage | None = None


class RunView(DTO):
    id: UUID
    project_id: UUID
    session_id: UUID
    job_revision_id: UUID | None = None
    operation: Operation
    status: RunStatus
    output_language: Literal["th", "en"]
    result_file_ids: tuple[UUID, ...] = ()
    created_at: datetime
    finished_at: datetime | None = None
    retry_of_id: UUID | None = None
    evaluation_result: EvaluationResult | None = None
    job_removed: bool = False


class RunEventData(DTO):
    approval_id: UUID | None = None
    step: Annotated[str, StringConstraints(max_length=80)] | None = None
    status: RunStatus | None = None
    artifact_ids: tuple[UUID, ...] = ()
    message_key: Annotated[str, StringConstraints(max_length=120)] | None = None
    progress_percent: Annotated[int, Field(ge=0, le=100)] | None = None


class RunEventView(DTO):
    sequence: int
    event_type: str
    data: RunEventData
    created_at: datetime


RunEvent = RunEventView


class ApprovalView(DTO):
    id: UUID
    run_id: UUID
    action: Literal["promote_cv", "delete_document_revision", "delete_file"]
    revision_id: UUID | None = None
    expected_cv_revision_id: UUID | None = None
    target_file_id: UUID | None = None
    change_digest: str
    expires_at: datetime
    consumed_at: datetime | None = None
    decision: Literal["approve", "reject"] | None = None
    applied_at: datetime | None = None


class ApprovalRequest(DTO):
    action: Literal["promote_cv", "delete_document_revision", "delete_file"]
    revision_id: UUID | None = None
    expected_cv_revision_id: UUID | None = None
    target_file_id: UUID | None = None

    @model_validator(mode="after")
    def target_matches_action(self) -> "ApprovalRequest":
        if self.action == "promote_cv":
            valid = self.revision_id is not None and self.expected_cv_revision_id is not None and self.target_file_id is None
        elif self.action == "delete_document_revision":
            valid = self.revision_id is not None and self.expected_cv_revision_id is None and self.target_file_id is None
        else:
            valid = self.revision_id is None and self.expected_cv_revision_id is None and self.target_file_id is not None
        if not valid:
            raise ValueError("approval_target_mismatch")
        return self


class ApprovalDecision(DTO):
    decision: Literal["approve", "reject"]


class OwnerBootstrapRequest(DTO):
    nonce: Annotated[SecretStr, Field(min_length=32, max_length=256)]


class OwnerBootstrapView(DTO):
    authenticated: Literal[True]
    csrf_token: str
    expires_at: datetime


class GrantIssueRequest(DTO):
    capabilities: frozenset[Capability]
    expires_at: datetime


class GrantIssuedView(DTO):
    id: UUID
    token: str = Field(repr=False)
    project_id: UUID
    capabilities: frozenset[Capability]
    expires_at: datetime


class GrantView(DTO):
    id: UUID
    project_id: UUID
    capabilities: frozenset[Capability]
    expires_at: datetime
    revoked_at: datetime | None = None


class ProviderSettingsUpdate(DTO):
    provider: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    model: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    credential: Annotated[SecretStr, Field(min_length=1, max_length=4096)] | None = None
    base_url: Annotated[str, StringConstraints(max_length=512)] | None = None


class ProviderSettingsView(DTO):
    provider: str | None = None
    provider_label: str | None = None
    base_url: str | None = None
    model: str | None = None
    configured: bool
    revision: int | None = None
    masked_secret: str | None = None


class ProviderCatalogEntry(DTO):
    id: str
    label: str
    default_base_url: str
    requires_base_url: bool
    local: bool
    key_optional: bool


class ProviderCatalogView(DTO):
    providers: list[ProviderCatalogEntry]


class ProviderModelsRequest(DTO):
    provider: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    base_url: Annotated[str, StringConstraints(max_length=512)] | None = None
    credential: Annotated[SecretStr, Field(min_length=1, max_length=4096)] | None = None


class ProviderModelView(DTO):
    id: str
    name: str | None = None


class ProviderModelsView(DTO):
    models: list[ProviderModelView]


class ProviderConnectionTestView(DTO):
    status: Literal["succeeded", "failed", "unavailable"]
    message_key: str
    checked_at: datetime
    duration_ms: Annotated[int, Field(ge=0, le=30000)]


class ToolConnectorUpdate(DTO):
    enabled: bool


class ToolConnectorView(DTO):
    adapter: Literal["career_ops"]
    enabled: bool
    revision: int
    updated_at: datetime


class ToolConnectorSettingsView(DTO):
    connectors: tuple[ToolConnectorView, ...]


class ToolRunRequest(RunRequest):
    """Protocol inputs intentionally share the REST request allowlist."""


class ToolDescriptor(DTO):
    name: Literal["evaluate_job", "draft_documents", "get_run", "cancel_run", "list_results"]
    description: str
    required_capability: Capability


class ToolsView(DTO):
    tools: tuple[ToolDescriptor, ...]


class RunService(Protocol):
    """Shared run interface; REST, MCP and A2A adapters delegate here."""

    async def submit(self, actor: Actor, project_id: UUID, request: RunRequest) -> RunView: ...
    async def get(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView: ...
    async def cancel(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView: ...
    async def events(self, actor: Actor, project_id: UUID, run_id: UUID,
                     after: int) -> AsyncIterator[RunEvent]: ...


class ErrorView(DTO):
    code: str
    message_key: str
    retryable: bool
    fields: dict[str, str] | None = None
    correlation_id: UUID
