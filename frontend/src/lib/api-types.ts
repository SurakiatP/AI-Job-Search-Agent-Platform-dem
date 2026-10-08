export type Locale = 'th' | 'en';

export type RunRequest = {
  session_id: string;
  operation: RunOperation;
  cv_revision_id?: string | null;
  job_revision_id: string;
  output_language: Locale;
  idempotency_key: string;
  retry_of_id?: string | null;
  owner_instructions?: string | null;
};

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

  constructor(status: number, body?: Partial<ApiErrorBody>) {
    super(isSafeMessageKey(body?.message_key) ? body.message_key : 'errors.request_failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = isSafeCode(body?.code) ? body.code : 'request_failed';
    this.message_key = isSafeMessageKey(body?.message_key) ? body.message_key : 'errors.request_failed';
    this.retryable = body?.retryable === true;
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
export type SessionView = { id: string; project_id: string; title: string; created_at: string };
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
export type RunOperation = 'evaluate_job' | 'draft_documents';
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type SkillCoverage = { required: string[]; matched: string[]; missing: string[]; ratio: number; method: string };
export type EvaluationResult = { report_markdown: string; score: number | null; skill_coverage?: SkillCoverage | null };
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
};
export type RunEventData = {
  approval_id: string | null;
  step: string | null;
  status: RunStatus | null;
  artifact_ids: string[];
  message_key: string | null;
  progress_percent: number | null;
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
  document_type: 'cv' | 'cover_letter' | 'other';
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
  action: 'promote_cv' | 'delete_document_revision' | 'delete_file';
  revision_id: string | null;
  expected_cv_revision_id: string | null;
  target_file_id: string | null;
  change_digest: string;
  expires_at: string;
  consumed_at: string | null;
  decision: 'approve' | 'reject' | null;
  applied_at: string | null;
};
