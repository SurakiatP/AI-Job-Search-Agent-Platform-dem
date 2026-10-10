export type Locale = 'th' | 'en';

export type RunRequest = {
  session_id: string;
  operation: RunOperation;
  cv_revision_id?: string | null;
  job_revision_id?: string;
  document_id?: string;
  output_language: Locale;
  idempotency_key: string;
  retry_of_id?: string | null;
  owner_instructions?: string | null;
  questions?: ApplyQuestion[];
};
export type ApplyQuestion = { id: string; label: string; required: boolean; kind: 'text' | 'choice' | 'boolean'; choices?: string[] };
export type ApplyPack = { kind: 'apply_pack'; state: 'ready' | 'parked'; answers: { question_id: string; label?: string; kind?: ApplyQuestion['kind']; choices?: string[] | null; required?: boolean; answer: string | boolean | null; evidence_ids: string[]; reason?: string; source?: 'owner' | null }[]; missing_required: string[] };

export type ApiErrorBody = {
  code: string;
  message_key: string;
  retryable: boolean;
  correlation_id?: string | null;
  fields?: Record<string, string> | null;
};

export class ApiError extends Error {
  readonly code: string;
  readonly message_key: string;
  readonly retryable: boolean;
  readonly correlation_id?: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(status: number, body?: Partial<ApiErrorBody>) {
    super(isSafeMessageKey(body?.message_key) ? body.message_key : 'errors.request_failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = isSafeCode(body?.code) ? body.code : 'request_failed';
    this.message_key = isSafeMessageKey(body?.message_key) ? body.message_key : 'errors.request_failed';
    this.retryable = body?.retryable === true;
    this.fields = body?.fields && typeof body.fields === 'object' ? body.fields : undefined;
    this.correlation_id = typeof body?.correlation_id === 'string' ? body.correlation_id : undefined;
  }
}

function isSafeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value);
}

function isSafeMessageKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_.]{0,119}$/.test(value);
}

export type OwnerSessionState =
  | { status: 'loading' }
  | { status: 'ready'; expires_at: string }
  | { status: 'error'; error: ApiError };

export type ProjectView = { id: string; name: string; created_at: string };
export type SessionView = {
  id: string; project_id: string; title: string; created_at: string;
  cv_revision_id?: string | null; job_revision_id?: string | null; cv_name?: string | null; cv_revision?: number | null;
  job_title?: string | null; job_company?: string | null; cv_outdated?: boolean; cv_file_id?: string | null; evaluation_run_id?: string | null;
};
export type CVRevisionInfo = { id: string; revision: number; created_at: string; original_filename: string; mime_type: string; size_bytes: number; file_id?: string | null; skill_profile_ready?: boolean; skill_count?: number | null };
export type CVView = { id: string; name: string; is_primary: boolean; created_at: string; latest_revision: CVRevisionInfo | null; revision_count: number; in_use: boolean };
export type MessageView = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};
export type JobRevisionView = {
  description?: string | null;
  id: string;
  revision: number;
  created_at: string;
  title: string;
  company: string | null;
  source_url: string | null;
  application_status?: 'saved' | 'applied';
};
export type JobApplicationStatusView = { job_revision_id: string; application_status: 'saved' | 'applied' };
export type ExperienceKind = 'experience' | 'education' | 'skill' | 'certification' | 'project' | 'other';
export type ExperienceItem = { id: string; kind: ExperienceKind; text: string; role: string | null; organization: string | null; period: string | null; source: 'cv' | 'owner'; source_cv_id: string | null; source_cv_name: string | null; created_at: string };
export type ExperienceView = { items: ExperienceItem[]; extraction: { run_id: string; status: RunStatus; cv_id: string; summary: { added: number; duplicates: number; rejected: number } | null } | null; provider_configured: boolean };
export type RunOperation = 'evaluate_job' | 'draft_documents' | 'export_document' | 'profile_cv' | 'match_jobs' | 'extract_experience' | 'tailor_cv' | 'apply_prepare' | 'apply_submit' | 'draft_follow_up';
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'needs_input' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type SkillCoverage = { required: string[]; matched: string[]; missing: string[]; ratio: number; method: string };
export type EvaluationResult = { report_markdown: string; score: number | null; skill_coverage?: SkillCoverage | null };
export type TailorProposal = { id: number; find: string; text: string; evidence_ids: string[]; status: 'proposed' | 'applied' | 'rejected_by_gate' };
export type TailorPayload = { kind: 'tailor'; mode: 'autopilot' | 'interactive'; base_revision_id?: string | null; stop_reason?: string | null; rounds?: { round: number; accepted: number; rejected: number; coverage: number | null }[]; proposals?: TailorProposal[]; coverage_before?: number | null; coverage_after?: number | null };
export type TailorMode = 'autopilot' | 'interactive';
export type RunView = {
  id: string;
  project_id: string;
  session_id: string;
  operation: RunOperation;
  status: RunStatus;
  job_revision_id?: string | null;
  output_language: Locale;
  result_file_ids: string[];
  created_at: string;
  finished_at: string | null;
  retry_of_id: string | null;
  evaluation_result: EvaluationResult | null;
  result_payload?: TailorPayload | ApplyPack | Record<string, unknown> | null;
  requester?: RunRequester | null;
};
export type RunRequester = { kind: 'owner' | 'agent'; grant_id?: string | null; label?: string | null };
export type RunInputBody = { answers: Record<string, string | boolean> };
export type RunEventData = {
  approval_id: string | null;
  step: string | null;
  status: RunStatus | null;
  artifact_ids: string[];
  message_key: string | null;
  progress_percent: number | null;
  round?: number | null;
  coverage?: number | null;
  model?: string | null;
  latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
};
export type PublicEventPayload = RunEventData;
export type RunEventView = {
  sequence: number;
  event_type: string;
  data: PublicEventPayload;
  created_at: string;
};
export type RunEvent = RunEventView & { run_id: string };
export type DocumentView = {
  id: string;
  document_type: 'cv' | 'cover_letter' | 'application_message' | 'other';
  title: string;
  latest_revision: { id: string; revision: number; created_at: string } | null;
  content_markdown: string | null;
  output_language: Locale | null;
  source_run_id: string | null;
  partial: boolean;
  trashed_at?: string | null;
};
export type ApprovalView = {
  id: string;
  run_id: string;
  action: 'promote_cv' | 'delete_document_revision' | 'delete_file' | 'submit_application';
  revision_id: string | null;
  expected_cv_revision_id: string | null;
  target_file_id: string | null;
  target_run_id?: string | null;
  change_digest: string;
  expires_at: string;
  consumed_at: string | null;
  decision: 'approve' | 'reject' | null;
  applied_at: string | null;
};
