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
export type ApplyPack = { kind: 'apply_pack'; state: 'ready' | 'parked'; answers: { question_id: string; label?: string; kind?: ApplyQuestion['kind']; choices?: string[] | null; required?: boolean; answer: string | boolean | null; suggestion?: string | boolean | null; evidence_ids: string[]; reason?: string; source?: 'owner' | null }[]; missing_required: string[] };

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

export type Account = { id: string; email: string; locale: Locale; email_verified: boolean; is_admin?: boolean; avatar_preset?: 'compass' | 'briefcase' | 'spark' | 'mountain' | null; has_avatar_image?: boolean; avatar_version?: string | null; created_at: string };
export type AccountAgent = {
  id: string; project_id: string; project_name: string; label: string | null; capabilities: string[];
  created_at: string; expires_at: string; revoked_at: string | null; client_id_host: string | null;
};

export type OwnerSessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; loggedOut?: boolean } // loggedOut: the person signed out (not an expired session)
  | { status: 'ready'; expires_at: string; user: Account }
  | { status: 'error'; error: ApiError };

export type ProjectView = { id: string; name: string; created_at: string };
export type SessionView = {
  trashed_at?: string | null;
  id: string; project_id: string; title: string; created_at: string;
  cv_revision_id?: string | null; job_revision_id?: string | null; cv_name?: string | null; cv_revision?: number | null;
  job_title?: string | null; job_company?: string | null; cv_outdated?: boolean; cv_file_id?: string | null; evaluation_run_id?: string | null;
};
export type CVRevisionInfo = { id: string; revision: number; created_at: string; original_filename: string; mime_type: string; size_bytes: number; file_id?: string | null; skill_profile_ready?: boolean; skill_count?: number | null; extracted_at?: string | null; extracted_count?: number };
export type CVView = { id: string; name: string; is_primary: boolean; created_at: string; latest_revision: CVRevisionInfo | null; revision_count: number; in_use: boolean; has_builder_draft?: boolean; trashed_at?: string | null };
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
  application_status?: ApplicationStage;
};
export type ApplicationStage = 'saved' | 'applied' | 'responded' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';
export type JobApplicationStatusView = { job_revision_id: string; application_status: ApplicationStage };
export type ApplicationContact = { name: string | null; email: string | null; role: string | null };
export type ApplicationEventView = { id: string; kind: 'stage_changed' | 'note' | 'contact_updated' | 'email_logged' | 'applied_via_approval'; actor: 'user' | 'agent' | 'system'; payload: Record<string, unknown>; created_at: string };
export type ApplicationCardView = { job_revision_id: string; title: string; company: string | null; created_at: string; stage: ApplicationStage; has_contact: boolean; last_activity_at: string };
export type ApplicationDetailView = { job_revision_id: string; title: string; company: string | null; stage: ApplicationStage; contact: ApplicationContact; events: ApplicationEventView[] };
export type ExperienceKind = 'experience' | 'education' | 'skill' | 'certification' | 'project' | 'other' | 'language' | 'award' | 'publication' | 'volunteer' | 'interest';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type SkillGroup = 'technical' | 'tools' | 'soft' | 'language' | 'domain';
export type ExperienceItem = { id: string; kind: ExperienceKind; skill_group: SkillGroup | null; text: string; role: string | null; organization: string | null; period: string | null; employment_type: EmploymentType | null; location: string | null; start_date: string | null; end_date: string | null; is_current: boolean; industry: string | null; responsibilities: string | null; achievements: string | null; skills_used: string | null; source: 'cv' | 'owner'; source_cv_id: string | null; source_cv_name: string | null; created_at: string };
export type ExperienceView = { items: ExperienceItem[]; extraction: { run_id: string; status: RunStatus; cv_id: string; summary: { added: number; duplicates: number; rejected: number } | null } | null; provider_configured: boolean; years_of_experience: number };
export type RunOperation = 'evaluate_job' | 'draft_documents' | 'export_document' | 'profile_cv' | 'match_jobs' | 'extract_experience' | 'tailor_cv' | 'apply_prepare' | 'apply_submit' | 'draft_follow_up'
  | 'interview_generate' | 'interview_grade' | 'interview_report';
// CR-IVP-01: practice runs belong to the practice screens, never to the session's workflow panel.
export const PRACTICE_OPERATIONS: readonly RunOperation[] = ['interview_generate', 'interview_grade', 'interview_report'];
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'needs_input' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type SkillCoverage = { required: string[]; matched: string[]; missing: string[]; ratio: number; method: string };
export type ReportMatch = 'strong' | 'partial' | 'missing' | 'not_applicable';
export type ReportRequirement = { requirement: string; importance: 'critical' | 'high' | 'meaningful' | 'preferred' | 'low_signal'; match: ReportMatch; evidence?: string };
export type EvaluationReport = { verdict: string; summary: string; requirements?: ReportRequirement[]; strengths?: string[]; risks?: string[]; interview_prep?: string[]; cv_changes?: string[] };
export type EvaluationResult = { report_markdown: string; score: number | null; score_percent?: number | null; score_band?: 'strong' | 'good' | 'partial' | 'weak' | 'poor' | null; score_basis?: { strong: number; partial: number; missing: number; not_applicable: number; critical_missing: boolean; capped: boolean } | null; skill_coverage?: SkillCoverage | null; report?: EvaluationReport | null };
export type TailorProposal = { id: number; find: string; text: string; evidence_ids: string[]; status: 'proposed' | 'applied' | 'rejected_by_gate' };
export type TailorPayload = { kind: 'tailor'; mode: 'autopilot' | 'interactive'; base_revision_id?: string | null; stop_reason?: string | null; rounds?: { round: number; accepted: number; rejected: number; coverage: number | null }[]; proposals?: TailorProposal[]; coverage_before?: number | null; coverage_after?: number | null; missing_skills?: string[] };
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
  has_builder_draft?: boolean;
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
  decided_by?: 'owner' | 'autopilot' | null;
};
export type DigestFrequency = 'daily' | 'weekly';
export type SavedSearchFilters = { q?: string; cities?: string[]; work_mode?: 'remote' | 'hybrid' | 'onsite' | null; category?: string | null; seniority?: string[]; employment_type?: string[]; company_type?: string[]; skills?: string[]; posting_language?: 'th' | null; salary_min?: number | null };
export type SavedSearchView = { id: string; name: string; filters: SavedSearchFilters; frequency: DigestFrequency; digest_enabled: boolean; push_enabled: boolean; telegram_enabled: boolean; next_run_at: string; last_sent_at: string | null; created_at: string };
export type SavedSearchList = { items: SavedSearchView[]; status: { email_verified: boolean; notifications_enabled: boolean } };

export type WebhookEvent = 'run.waiting_approval' | 'run.needs_input' | 'run.completed' | 'run.failed' | 'run.cancelled' | 'digest.ready';
export type WebhookView = { id: string; url: string; events: WebhookEvent[]; enabled: boolean; created_at: string };
export type WebhookDeliveryView = { id: string; endpoint_id: string | null; event_type: string; status: 'pending' | 'delivered' | 'dead'; attempts: number; last_status_code: number | null; last_error: string | null; created_at: string; delivered_at: string | null };

export type TelegramStatusView = { enabled: boolean; linked: boolean; bot_username: string | null; linked_at: string | null };
export type TelegramLinkView = { url: string; expires_at: string };

export type PracticeSection = 'intro' | 'behavioral' | 'situational' | 'technical' | 'cv_deep_dive' | 'gaps' | 'company' | 'logistics';
export type PracticeLevel = 'entry' | 'mid' | 'senior';
export type PracticeSet = {
  id: string; session_id: string; name: string; level: PracticeLevel; sections: { id: PracticeSection; count: number }[];
  status: 'generating' | 'ready' | 'failed'; run_id: string | null; created_at: string;
  question_count: number; ready_count: number; known_count: number;
};
export type PracticeDimension = 'structure' | 'relevance' | 'evidence' | 'clarity' | 'company_fit';
export type PracticeFeedback =
  | { status: 'pending' | 'failed' }
  | { status: 'done'; kind: 'answer'; scores: Record<PracticeDimension, number>; summary: string;
      star: { part: 'S' | 'T' | 'A' | 'R'; start: number; end: number }[]; add: string[]; unused_facts: { id: string; text: string }[] }
  | { status: 'done'; kind: 'card'; verdict: 'correct' | 'partial' | 'incorrect'; missing: string[]; note: string };
export type PracticeReport =
  | { status: 'pending' | 'failed' }
  | { status: 'done'; strengths: string[]; skills_to_build: string[]; plan: string[];
      readiness: { section: PracticeSection; level: 'ready' | 'almost' | 'not_yet'; note: string }[] };
export type PracticeAttempt = { id: string; answer: string; feedback: PracticeFeedback | null; created_at: string };
export type PracticeQuestion = {
  id: string; section: PracticeSection; position: number; prompt: string; why: string; key_points: string[];
  model_answer: string | null; evidence_ids: string[]; ready: boolean; card_rating: 'know' | 'learning' | null; attempts: PracticeAttempt[];
};
export type PracticeSetDetail = PracticeSet & { reverse_questions: string[]; questions: PracticeQuestion[]; report: PracticeReport | null };
export type ProjectPracticeSet = PracticeSet & { job_title: string | null; job_company: string | null };

export type NotificationKind = 'run_completed' | 'run_failed' | 'run_needs_input' | 'run_waiting_approval' | 'digest_ready';
export type NotificationView = {
  id: string; project_id: string; kind: NotificationKind; run_id: string | null;
  data: { operation?: RunOperation; session_id?: string; job_title?: string; job_company?: string; practice_set_id?: string; saved_search_name?: string; count?: number; [key: string]: unknown };
  created_at: string; read_at: string | null;
};
export type NotificationList = { items: NotificationView[]; unread_count: number };

// ---- Admin console (/v1/admin/*). Metadata only; mirrors docs/contracts/application-api.yaml. ----
export type AdminRange = '1m' | '5m' | '10m' | '15m' | '30m' | '1h' | '4h' | '10h' | '7d' | '30d' | '90d' | 'all';
export type AdminMetric = 'runs' | 'active_users' | 'failure_rate' | 'cost_usd';
export type AdminEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'default';
export type AdminHealthState = 'ok' | 'down';
export type AdminPriceSource = 'openrouter' | 'litellm' | 'manual';
export type AdminRunStatus = 'queued' | 'running' | 'waiting_approval' | 'needs_input' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type AdminKpi = { value: number; previous: number | null };
export type AdminKpis = { runs: AdminKpi; active_users: AdminKpi; failure_rate: AdminKpi; cost_usd: AdminKpi; cost_has_manual: boolean };
export type AdminSeriesPoint = { start: string; runs: number; failures: number; active_users: number; cost_usd: number };
export type AdminAttention = {
  kind: 'failed_runs' | 'health_down' | 'ingest_partial' | 'ingest_failed' | 'dead_webhooks';
  severity: 'bad' | 'warn';
  title_key: string;
  params: Record<string, string | number>;
  target: string;
};
export type AdminHealthComponents = { postgres: AdminHealthState; object_store: AdminHealthState; llm_gateway: AdminHealthState; sandbox: AdminHealthState };
export type AdminHealth = { components: AdminHealthComponents };
export type AdminSpeed = { within_30s_ratio: number | null; target: number };
export type AdminTopTask = { operation: string; runs: number; failure_rate: number; p50_seconds: number | null; cost_usd: number };
export type AdminModelCost = { model: string; calls: number; cost_usd: number; has_manual: boolean };
export type AdminAuditEntry = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  target_type: 'user' | 'run' | 'model' | 'task' | 'benchmark' | 'webhook' | null;
  target_id: string | null;
  detail: Record<string, unknown>;
};
export type AdminAuditPage = { items: AdminAuditEntry[]; next_cursor: string | null };
export type AdminOverview = {
  range: AdminRange;
  bucket_seconds: number;
  generated_at: string;
  compare: boolean;
  kpis: AdminKpis;
  series: AdminSeriesPoint[];
  previous_series: AdminSeriesPoint[];
  attention: AdminAttention[];
  health: AdminHealth;
  weekday: number[];
  speed: AdminSpeed;
  top_tasks: AdminTopTask[];
  cost_by_model: AdminModelCost[];
  activity: AdminAuditEntry[];
};
export type AdminBucket = {
  range: AdminRange;
  metric: AdminMetric;
  start: string;
  end: string;
  value: number;
  parts: { operation: string; value: number }[];
};
export type AdminPrefs = { widgets: string[] };
export type AdminFxRate = { rate: number; source: string; source_url: string; as_of: string; fetched_at: string; stale: boolean };
export type AdminUserStatus = 'active' | 'suspended' | 'deleting';
export type AdminUserItem = {
  id: string;
  short_id: string;
  email: string;
  status: AdminUserStatus;
  email_verified: boolean;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string | null;
  runs_in_range: number;
};
export type AdminUserPage = { items: AdminUserItem[]; total: number; page: number; page_size: number };
export type AdminUserDetail = { user: AdminUserItem; project_count: number; cv_count: number; run_count: number };
export type AdminRunEvent = {
  sequence: number;
  event_type: string;
  step: string | null;
  status: string | null;
  message_key: string | null;
  model: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};
export type AdminLlmCall = {
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  api_calls: number;
  latency_ms: number;
  price_source: AdminPriceSource | null;
  cost_usd: number | null;
  created_at: string;
};
export type AdminRunItem = {
  id: string;
  user_id: string | null;
  user_short_id: string | null;
  operation: string;
  status: AdminRunStatus;
  model: string | null;
  effort: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number | null;
  cost_is_manual: boolean;
  failure_key: string | null;
  retry_of_id: string | null;
};
export type AdminRunPage = { items: AdminRunItem[]; total: number; page: number; page_size: number };
export type AdminRunDetail = { run: AdminRunItem; events: AdminRunEvent[]; calls: AdminLlmCall[] };
export type AdminUsageGroup = 'task' | 'model' | 'day' | 'user';
export type AdminUsageRow = {
  key: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number | null;
  cost_per_request_usd: number | null;
  has_manual: boolean;
  uncosted_requests: number;
};
export type AdminUsage = { range: AdminRange; group_by: AdminUsageGroup; generated_at: string; totals: AdminUsageRow; rows: AdminUsageRow[] };
export type AdminModelCatalogItem = {
  id: string;
  name: string;
  price_in: number | null;
  price_out: number | null;
  price_cache: number | null;
  context_length: number | null;
  registered: boolean;
};
export type AdminOfficialPrice = { price_in: number; price_out: number; price_cache: number | null; source: 'openrouter' | 'litellm' };
export type AdminRegisteredModel = {
  model: string;
  price_in: number | null;
  price_out: number | null;
  price_cache: number | null;
  price_source: AdminPriceSource | null;
  is_free: boolean;
  official_price: AdminOfficialPrice | null;
  updated_at: string;
  used_by: string[];
};
export type AdminModelCreate = { model: string; price_in?: number | null; price_out?: number | null; price_cache?: number | null; is_free?: boolean };
export type AdminModelPrice = { model: string; price_in: number; price_out: number; price_cache?: number | null; is_free?: boolean };
export type AdminTaskSetting = {
  operation: string;
  model: string;
  effort: AdminEffort;
  source: 'stored' | 'env';
  benchmark_id: string | null;
  quality: number | null;
  cost_per_call_usd: number | null;
  cost_has_manual: boolean;
  updated_at: string | null;
  updated_by: string | null;
};
export type AdminTaskUpdate = { model: string; effort: AdminEffort; benchmark_id?: string | null; confirm?: string | null };
export type AdminBenchmarkCreate = { operation: string; model: string; effort: AdminEffort };
export type AdminBenchmarkCase = { id: string; state: 'pending' | 'running' | 'ok' | 'bad' };
export type AdminBenchmarkSummary = {
  quality: number;
  p50_seconds: number;
  p95_seconds: number;
  cost_per_call_usd: number | null;
  cost_has_manual: boolean;
  errors: number;
  truncations: number;
};
export type AdminBenchmark = {
  id: string;
  operation: string;
  model: string;
  effort: AdminEffort;
  status: 'queued' | 'running' | 'done' | 'failed';
  cases: AdminBenchmarkCase[];
  summary: AdminBenchmarkSummary | null;
  baseline: AdminBenchmarkSummary | null;
  verdict: 'green' | 'red' | 'na';
  created_by: string;
  started_at: string | null;
  finished_at: string | null;
};
export type AdminProbeCell = { status: 'ok' | 'down' | 'unknown'; ms: number | null; failed: number; checks: number };
export type AdminProbe = { checked_at: string; components: { postgres: AdminProbeCell; object_store: AdminProbeCell; llm_gateway: AdminProbeCell; sandbox: AdminProbeCell } };
export type AdminIngestRun = {
  board: string;
  at: string;
  status: 'complete' | 'partial' | 'failed';
  jobs_total: number;
  jobs_new: number;
  error_code: string | null;
};
export type AdminWebhookCounts = { pending: number; delivered: number; dead: number };
export type AdminGatewayStatus = { configured: boolean; reachable: boolean; base_url: string | null; analyze_model: string; decision_model: string; models: string[] };
export type AdminToolDescriptor = { name: string; description: string; required_capability: string };
export type AdminSystem = {
  generated_at: string;
  range: AdminRange;
  bucket_seconds: number;
  health: AdminHealth;
  probes: AdminProbe[];
  ingest: AdminIngestRun[];
  webhooks: AdminWebhookCounts;
  gateway: AdminGatewayStatus;
  tools: { tools: AdminToolDescriptor[] };
};
export type AdminWebhookDelivery = {
  id: string;
  user_short_id: string | null;
  host: string | null;
  event_type: string;
  status: 'pending' | 'delivered' | 'dead';
  attempts: number;
  last_status_code: number | null;
  created_at: string;
  delivered_at: string | null;
};
export type AdminListQuery = { cursor?: string | null };
export type AdminPageQuery = { page?: number; page_size?: number };
export type AdminRunsQuery = AdminPageQuery & { status?: AdminRunStatus; operation?: string; model?: string; since?: string; until?: string };
export type AdminUsersQuery = AdminPageQuery & { q?: string; status?: AdminUserStatus; range?: AdminRange };
export type AdminAuditQuery = AdminListQuery & { action?: string; actor?: string; since?: string };
