import type { Page, Route } from '@playwright/test';

/** Synthetic runs for /v1/admin/runs. Metadata only, like the real endpoint; shapes follow AdminRunItem in docs/contracts/application-api.yaml. */
export type RunRow = {
  id: string; user_id: string | null; user_short_id: string | null; operation: string; status: string; model: string | null; effort: string | null;
  created_at: string; started_at: string | null; finished_at: string | null; duration_seconds: number | null;
  input_tokens: number; output_tokens: number; cached_tokens: number; cost_usd: number | null; cost_is_manual: boolean;
  failure_key: string | null; retry_of_id: string | null;
};
export type RunEventRow = { sequence: number; event_type: string; step: string | null; status: string | null; message_key: string | null; model: string | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; created_at: string };
export type CallRow = { operation: string; model: string; input_tokens: number; output_tokens: number; cached_tokens: number; api_calls: number; latency_ms: number; price_source: 'openrouter' | 'litellm' | 'manual' | null; cost_usd: number | null; created_at: string };

export const ids = {
  failed: '11111111-0000-4000-8000-000000000001', running: '11111111-0000-4000-8000-000000000002', manual: '11111111-0000-4000-8000-000000000003',
  free: '11111111-0000-4000-8000-000000000004', queued: '11111111-0000-4000-8000-000000000005', cancelled: '11111111-0000-4000-8000-000000000006',
  retried: '11111111-0000-4000-8000-000000000007',
};

export function run(over: Partial<RunRow> & Pick<RunRow, 'id' | 'operation' | 'status'>): RunRow {
  return {
    user_id: '22222222-0000-4000-8000-000000000001', user_short_id: 'u_8f3a…c21', model: 'google/gemini-3-flash', effort: 'medium',
    created_at: '2026-11-04T07:30:00Z', started_at: '2026-11-04T07:30:02Z', finished_at: '2026-11-04T07:30:50Z', duration_seconds: 48,
    input_tokens: 12400, output_tokens: 3100, cached_tokens: 4000, cost_usd: 0.0123, cost_is_manual: false, failure_key: null, retry_of_id: null, ...over,
  };
}

/** `n` more completed runs, older than baseRuns, for paging specs. */
export const manyRuns = (n: number): RunRow[] => Array.from({ length: n }, (_, i) => run({ id: `33333333-0000-4000-8000-${String(i).padStart(12, '0')}`, operation: 'match_jobs', status: 'completed', created_at: `2026-11-03T07:${String(59 - i).padStart(2, '0')}:00Z` }));

export const baseRuns: RunRow[] = [
  run({ id: ids.failed, operation: 'tailor_cv', status: 'failed', failure_key: 'errors.execution_failed', created_at: '2026-11-04T07:40:00Z' }),
  run({ id: ids.running, operation: 'evaluate_job', status: 'running', finished_at: null, duration_seconds: 41, user_short_id: 'u_41bc…9d0', created_at: '2026-11-04T07:35:00Z' }),
  run({ id: ids.manual, operation: 'draft_documents', status: 'completed', model: 'acme/own-priced', effort: null, cost_usd: 0.0042, cost_is_manual: true, created_at: '2026-11-04T07:20:00Z' }),
  run({ id: ids.free, operation: 'interview_generate', status: 'completed', model: 'acme/free-model', cost_usd: null, created_at: '2026-11-04T07:10:00Z' }),
  run({ id: ids.queued, operation: 'evaluate_job', status: 'queued', started_at: null, finished_at: null, duration_seconds: null, input_tokens: 0, output_tokens: 0, cached_tokens: 0, cost_usd: null, model: null, effort: null, created_at: '2026-11-04T07:05:00Z' }),
  run({ id: ids.cancelled, operation: 'apply_prepare', status: 'cancelled', created_at: '2026-11-04T07:00:00Z' }),
];

const ev = (sequence: number, event_type: string, over: Partial<RunEventRow> = {}): RunEventRow =>
  ({ sequence, event_type, step: null, status: null, message_key: null, model: null, latency_ms: null, input_tokens: null, output_tokens: null, created_at: `2026-11-04T07:30:0${sequence}Z`, ...over });

export const failedEvents = [
  ev(1, 'run_queued', { status: 'queued' }),
  ev(2, 'run_started', { status: 'running' }),
  ev(3, 'run_progress', { step: 'llm_round', model: 'google/gemini-3-flash', latency_ms: 2400, input_tokens: 6200, output_tokens: 1500 }),
  ev(4, 'run_failed', { status: 'failed', message_key: 'errors.execution_failed' }),
];
export const failedCalls: CallRow[] = [
  { operation: 'tailor_cv', model: 'google/gemini-3-flash', input_tokens: 6200, output_tokens: 1500, cached_tokens: 2000, api_calls: 1, latency_ms: 2400, price_source: 'manual', cost_usd: 0.0042, created_at: '2026-11-04T07:30:05Z' },
  { operation: 'tailor_cv', model: 'openai/gpt-5-mini', input_tokens: 6200, output_tokens: 1600, cached_tokens: 2000, api_calls: 2, latency_ms: 800, price_source: 'openrouter', cost_usd: 0.0081, created_at: '2026-11-04T07:30:09Z' },
];

type Options = {
  runs?: RunRow[];
  events?: Record<string, RunEventRow[]>;
  calls?: Record<string, CallRow[]>;
  /** List requests answer 500 until the spec sets `log.failing = false`. */
  failList?: boolean;
  /** Error code for the cancel / retry POST, answered as 409 / 422 problem bodies. */
  cancelError?: string;
  retryError?: string;
};

/** Routes /v1/admin/runs*. Returns what the page asked for so a spec can assert on it. Call after mockAdminAccount (later routes win). */
export async function mockAdminRuns(page: Page, options: Options = {}) {
  const rows = (options.runs ?? baseRuns).map(r => ({ ...r }));
  const log = { lists: [] as URL[], gets: [] as string[], posts: [] as string[], failing: options.failList ?? false };
  const detail = (r: RunRow) => ({ run: r, events: options.events?.[r.id] ?? (r.id === ids.failed ? failedEvents : [ev(1, 'run_queued')]), calls: options.calls?.[r.id] ?? (r.id === ids.failed ? failedCalls : []) });
  const problem = (route: Route, status: number, code: string) => route.fulfill({ status, json: { code, message_key: `errors.${code}`, retryable: false } });

  await page.route(url => url.pathname.startsWith('/v1/admin/runs'), async route => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/').filter(Boolean); // v1 admin runs [id [action]]
    const method = route.request().method();
    if (parts.length === 3) {
      log.lists.push(url);
      if (log.failing) { return route.fulfill({ status: 500, json: { code: 'internal_error', message_key: 'errors.internal_error', retryable: true } }); }
      const q = url.searchParams;
      const items = rows.filter(r => (!q.get('status') || r.status === q.get('status')) && (!q.get('operation') || r.operation === q.get('operation')) && (!q.get('model') || r.model === q.get('model')));
      const size = Number(q.get('page_size') ?? 10), last = Math.max(0, Math.ceil(items.length / size) - 1), at = Math.min(Number(q.get('page') ?? 0), last);
      return route.fulfill({ json: { items: items.slice(at * size, (at + 1) * size), total: items.length, page: at, page_size: size } });
    }
    const target = rows.find(r => r.id === parts[3]);
    if (!target) return problem(route, 404, 'not_found');
    if (method === 'GET') { log.gets.push(target.id); return route.fulfill({ json: detail(target) }); }
    log.posts.push(`${parts[4]}:${target.id}`);
    if (parts[4] === 'cancel') {
      if (options.cancelError) return problem(route, 409, options.cancelError);
      target.status = 'cancelled'; target.finished_at = '2026-11-04T07:36:00Z';
      return route.fulfill({ json: detail(target) });
    }
    if (options.retryError) return problem(route, options.retryError === 'retry_not_allowed' ? 409 : 429, options.retryError);
    const fresh = run({ id: '11111111-0000-4000-8000-0000000000ff', operation: target.operation, status: 'queued', started_at: null, finished_at: null, duration_seconds: null, input_tokens: 0, output_tokens: 0, cached_tokens: 0, cost_usd: null, model: null, effort: null, retry_of_id: target.id, created_at: '2026-11-04T07:45:00Z' });
    rows.unshift(fresh);
    return route.fulfill({ json: detail(fresh) });
  });
  return log;
}
