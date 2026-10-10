"""Stable, transport-neutral Pydantic contracts shared by REST and protocols."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, AsyncIterator, Literal, Protocol, TypeVar
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, SecretStr, StringConstraints, model_validator


Capability = Literal["results:read", "jobs:evaluate", "documents:draft", "cv:tailor", "jobs:search"]
RunStatus = Literal["queued", "running", "waiting_approval", "completed", "failed", "cancelled", "interrupted"]
Operation = Literal["evaluate_job", "draft_documents", "tailor_cv"]
# profile_cv (CV skill profile, no LLM) and extract_experience (LLM experience-bank extraction) are likewise owner-only and internal.
# export_document is an owner-only, non-LLM run created by the manual-edit endpoint; never a request operation.
ViewOperation = Literal["evaluate_job", "draft_documents", "tailor_cv", "export_document", "profile_cv", "match_jobs", "extract_experience"]
DraftKind = Literal["cover_letter", "application_message"]


@dataclass(frozen=True, slots=True)
class Actor:
    kind: Literal["owner", "grant"]
    owner_session_id: UUID | None
    grant_id: UUID | None
    project_id: UUID | None
    capabilities: frozenset[str]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


T = TypeVar("T")
# Sorted and de-duplicated so equal filter sets compare equal in run snapshots.
_Choices = Annotated[list[T], Field(max_length=10), AfterValidator(lambda v: sorted(set(v)))]


class MatchRunRequest(DTO):
    cv_revision_id: UUID
    q: Annotated[str, StringConstraints(max_length=200)] = ""
    cities: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=80)]], Field(max_length=10)] = []
    work_mode: Literal["remote", "hybrid", "onsite"] | None = None
    posted_within_days: Annotated[int, Field(ge=1, le=90)] | None = None
    category: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{1,60}$")] | None = None
    seniority: _Choices[Literal["intern", "junior", "middle", "senior", "lead", "staff", "principal", "c_level"]] = []
    employment_type: _Choices[Literal["full_time", "part_time", "contract", "internship", "fellowship"]] = []
    company_type: _Choices[Literal["product", "startup", "agency", "outsource", "outstaff", "inhouse", "government"]] = []
    skills: Annotated[list[Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9][a-z0-9.+#-]{0,40}$")]],
                      AfterValidator(lambda v: sorted(set(v))), Field(max_length=5)] = []
    posting_language: Literal["th"] | None = None
    salary_min: Annotated[int, Field(ge=1, le=1_000_000)] | None = None
    pool: Annotated[int, Field(ge=1, le=100)] = 100
    offset: Annotated[int, Field(ge=0, le=1000)] = 0


class HiddenCreate(DTO):
    kind: Literal["job", "company"]
    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class ExperienceItemCreate(DTO):
    kind: Literal["experience", "education", "skill", "certification", "project", "other"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    role: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    organization: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    period: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None


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
    # Draft runs only (owner-only): the document kind to produce; an existing live document
    # of this kind for the paired job gets a new revision instead of a new document.
    draft_kind: DraftKind | None = None
    # tailor_cv only; omitted means autopilot. Grants cannot ask for interactive.
    tailor_mode: Literal["autopilot", "interactive"] | None = None

    @model_validator(mode="after")
    def draft_kind_needs_draft(self):
        if self.draft_kind is not None and self.operation != "draft_documents":
            raise ValueError("draft_kind_requires_draft_documents")
        if self.tailor_mode is not None and self.operation != "tailor_cv":
            raise ValueError("tailor_mode_requires_tailor_cv")
        return self


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
    cv_file_id: UUID | None = None
    # Only set on the create response.
    evaluation_run_id: UUID | None = None


class SessionDeleteResult(DTO):
    # "deleted": removed for good (no runs); "hidden": kept for run history, restorable.
    mode: Literal["deleted", "hidden"]


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


class ProtocolJobInput(DTO):
    job: JobCreate | None = None
    job_revision_id: UUID | None = None
    cv_id: UUID | None = None
    output_language: Literal["th", "en"]
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    @model_validator(mode="after")
    def validate_intent(self):
        if (self.job is None) == (self.job_revision_id is None):
            raise ValueError("exactly_one_job_source_required")
        if not self.idempotency_key.strip():
            raise ValueError("idempotency_key_required")
        if self.job is not None and not self.job.description.strip():
            raise ValueError("job_description_required")
        return self


class CVRevisionView(RevisionView):
    original_filename: str
    mime_type: str
    size_bytes: int
    file_id: UUID | None = None
    skill_profile_ready: bool = False
    skill_count: int | None = None


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
    document_type: Literal["cv", "cover_letter", "application_message", "other"]
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
    # "manual" when produced by an owner edit (export_document run), else "agent".
    origin: Literal["agent", "manual"] = "agent"


class DocumentEdit(DTO):
    content_markdown: Annotated[str, StringConstraints(min_length=1, max_length=200000)]
    format: Literal["pdf", "docx"] | None = None


class TailorApply(DTO):
    proposal_ids: Annotated[list[int], Field(min_length=1, max_length=50)]


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
    session_id: UUID | None = None  # None only for profile_cv
    job_revision_id: UUID | None = None
    operation: ViewOperation
    status: RunStatus
    output_language: Literal["th", "en"]
    result_file_ids: tuple[UUID, ...] = ()
    created_at: datetime
    finished_at: datetime | None = None
    retry_of_id: UUID | None = None
    evaluation_result: EvaluationResult | None = None
    job_removed: bool = False
    result_payload: dict[str, Any] | None = None


class RunEventData(DTO):
    approval_id: UUID | None = None
    step: Annotated[str, StringConstraints(max_length=80)] | None = None
    status: RunStatus | None = None
    artifact_ids: tuple[UUID, ...] = ()
    message_key: Annotated[str, StringConstraints(max_length=120)] | None = None
    progress_percent: Annotated[int, Field(ge=0, le=100)] | None = None
    round: Annotated[int, Field(ge=1, le=100)] | None = None
    coverage: Annotated[float, Field(ge=0, le=1)] | None = None


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


class AgentJobSearch(DTO):
    """Direct jobs_search input: one page of the public job source with full descriptions."""
    q: Annotated[str, StringConstraints(max_length=200)] = ""
    cities: Annotated[list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]], Field(max_length=5)] = []
    work_mode: Literal["remote", "hybrid", "onsite"] | None = None
    posted_within_days: Annotated[int, Field(ge=1, le=90)] | None = None
    category: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{1,60}$")] | None = None
    limit: Annotated[int, Field(ge=1, le=50)] = 20
    description_format: Literal["markdown", "text"] = "markdown"


class AgentJobItem(DTO):
    source_id: str
    title: str
    company: str | None = None
    city: str | None = None
    work_mode: str | None = None
    posted_at: str | None = None
    posting_age_days: int | None = None
    stale: bool
    source_url: str | None = None
    description: str
    description_format: Literal["markdown", "text"]


class AgentJobSearchResult(DTO):
    jobs: tuple[AgentJobItem, ...]


class AgentJobFit(DTO):
    """Direct jobs_fit input: a supplied job or a same-Project job revision, plus an optional CV."""
    job: JobCreate | None = None
    job_revision_id: UUID | None = None
    cv_id: UUID | None = None

    @model_validator(mode="after")
    def validate_intent(self):
        if (self.job is None) == (self.job_revision_id is None):
            raise ValueError("exactly_one_job_source_required")
        return self


class AgentJobFitResult(DTO):
    method: str
    ratio: Annotated[float, Field(ge=0, le=1)] | None = None
    required: tuple[str, ...] = ()
    matched: tuple[str, ...] = ()
    missing: tuple[str, ...] = ()
    reason: str | None = None


class ToolDescriptor(DTO):
    # A nested Literal flattens to one OpenAPI enum; `Operation | Literal[...]` would emit anyOf.
    name: Literal[Operation, Literal["jobs_search", "jobs_fit", "get_run", "cancel_run", "list_results"]]
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
