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
    job_revision_id: UUID
    output_language: Literal["th", "en"]
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)]


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


class SessionCreate(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] = "New session"


class SessionView(DTO):
    id: UUID
    project_id: UUID
    title: str
    created_at: datetime


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
    title: str
    company: str | None = None
    source_url: str | None = None


class JobCreate(DTO):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    company: Annotated[str, StringConstraints(max_length=300)] | None = None
    source_url: Annotated[str, StringConstraints(max_length=2048)] | None = None
    description: Annotated[str, StringConstraints(min_length=1, max_length=50000)]


class CVRevisionView(RevisionView):
    original_filename: str
    mime_type: str
    size_bytes: int


class DocumentView(DTO):
    id: UUID
    document_type: Literal["cv", "cover_letter", "other"]
    title: str
    latest_revision: RevisionView | None = None


class DocumentRevisionView(RevisionView):
    document_id: UUID
    source_cv_revision_id: UUID | None = None
    source_job_revision_id: UUID | None = None
    file_id: UUID | None = None


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


class RunView(DTO):
    id: UUID
    project_id: UUID
    session_id: UUID
    operation: Operation
    status: RunStatus
    output_language: Literal["th", "en"]
    result_file_ids: tuple[UUID, ...] = ()
    created_at: datetime
    finished_at: datetime | None = None
    retry_of_id: UUID | None = None


class RunEventData(DTO):
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
    token: str
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
    credential: Annotated[SecretStr, Field(min_length=1, max_length=4096)]


class ProviderSettingsView(DTO):
    provider: str | None = None
    model: str | None = None
    configured: bool
    revision: int | None = None
    masked_secret: str | None = None


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
