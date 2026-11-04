import type { Page, Route } from '@playwright/test';
import { mockAdminAccount } from './admin';

type Json = Record<string, any>;
export type Call = { method: string; path: string; body: Json | null };

const summary = (o: Json = {}) => ({ quality: 96, p50_seconds: 9.4, p95_seconds: 13, cost_per_call_usd: 0.00041, cost_has_manual: false, errors: 0, truncations: 0, ...o });
const task = (operation: string, o: Json = {}) => ({ operation, model: 'openai/gpt-6-luna', effort: 'default', source: 'stored', benchmark_id: null, quality: 96, cost_per_call_usd: 0.00037, cost_has_manual: false, updated_at: null, updated_by: null, ...o });
const model = (m: string, o: Json = {}) => ({ model: m, price_in: 0.35, price_out: 1.4, price_cache: 0.04, price_source: 'openrouter', is_free: false, official_price: null, updated_at: '2026-11-04T03:00:00Z', used_by: [], ...o });

export const baseTasks = () => [
  task('evaluate_job', { model: 'qwen/qwen3.7-flash', effort: 'low', benchmark_id: 'b-old', cost_per_call_usd: 0.00041 }),
  task('draft_documents', { quality: 100 }),
  task('interview_grade', { model: 'qwen/qwen3.7-flash', quality: null, cost_per_call_usd: null }),
  task('document_ocr', { model: 'qwen/qwen3.7-flash', effort: 'none', quality: null, cost_per_call_usd: 0.00052 }),
];
export const baseModels = () => [
  model('openai/gpt-6-luna', { used_by: ['draft_documents'] }),
  model('qwen/qwen3.7-flash', { price_in: 0.05, price_out: 0.2, price_cache: null, price_source: 'manual', official_price: { price_in: 0.06, price_out: 0.24, price_cache: null, source: 'openrouter' }, used_by: ['evaluate_job', 'interview_grade', 'document_ocr'] }),
];
export const baseCatalog = () => [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', price_in: 0.35, price_out: 1.4, price_cache: 0.04, context_length: 200000, registered: true },
  { id: 'openai/gpt-6-luna-mini', name: 'GPT-6 Luna Mini', price_in: 0.08, price_out: 0.32, price_cache: null, context_length: 100000, registered: false },
  { id: 'lunaris/luna-thai-7b', name: 'Luna Thai 7B', price_in: null, price_out: null, price_cache: null, context_length: 32000, registered: false },
];
export const baseHistory = () => [
  { id: 'b-1', operation: 'evaluate_job', model: 'openai/gpt-6-luna', effort: 'low', status: 'done', cases: [], summary: summary({ quality: 93.1 }), baseline: summary({ quality: 96 }), verdict: 'red', created_by: 'ops@example.test', started_at: '2026-11-04T07:18:00Z', finished_at: '2026-11-04T07:21:00Z' },
  { id: 'b-old', operation: 'evaluate_job', model: 'qwen/qwen3.7-flash', effort: 'low', status: 'done', cases: [], summary: summary({ quality: 96 }), baseline: summary({ quality: 94.5 }), verdict: 'green', created_by: 'ops@example.test', started_at: '2026-11-02T03:00:00Z', finished_at: '2026-11-02T03:03:00Z' },
  { id: 'b-2', operation: 'draft_documents', model: 'anthropic/claude-haiku-5-5', effort: 'default', status: 'done', cases: [], summary: summary({ quality: 90.4 }), baseline: summary({ quality: 89.7 }), verdict: 'green', created_by: 'ops@example.test', started_at: '2026-11-01T03:00:00Z', finished_at: '2026-11-01T03:03:00Z' },
];

const cases = (ok: number, bad: number[] = []) => Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, state: i < ok ? (bad.includes(i) ? 'bad' : 'ok') : i === ok ? 'running' : 'pending' }));

export interface ModelsMock {
  calls: Call[];
  tasks: Json[];
  models: Json[];
  history: Json[];
  /** green or red result of the next benchmark. */
  verdict: 'green' | 'red';
  /** Make POST /benchmarks answer 409 benchmark_busy. */
  busy: boolean;
  /** Make GET /tasks fail with 500 until set false. */
  failTasks: boolean;
  /** Make PUT /tasks/{op} fail with this code. */
  putError: string | null;
}

/** Mocks the admin AI-model endpoints on top of an admin session. Every write is recorded in `calls`. */
export async function mockAdminModels(page: Page, overrides: Partial<ModelsMock> = {}): Promise<ModelsMock> {
  await mockAdminAccount(page);
  const m: ModelsMock = { calls: [], tasks: baseTasks(), models: baseModels(), history: baseHistory(), verdict: 'green', busy: false, failTasks: false, putError: null, ...overrides };
  let polls = 0;
  const err = (route: Route, status: number, code: string) => route.fulfill({ status, json: { code, message_key: `errors.${code}`, retryable: false } });
  await page.route('**/v1/admin/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/v1/admin', '');
    const method = req.method();
    const body = method === 'GET' ? null : (req.postDataJSON() as Json);
    if (method !== 'GET') m.calls.push({ method, path, body });
    if (path === '/tasks' && method === 'GET') return m.failTasks ? err(route, 500, 'internal_error') : route.fulfill({ json: m.tasks });
    if (path === '/models' && method === 'GET') return route.fulfill({ json: m.models });
    if (path === '/models/catalog') { const q = (url.searchParams.get('q') ?? '').toLowerCase(); return route.fulfill({ json: baseCatalog().filter(i => i.id.includes(q) || i.name.toLowerCase().includes(q)) }); }
    if (path === '/models' && method === 'POST') {
      const price = body!.price_in != null ? { price_in: body!.price_in, price_out: body!.price_out, price_cache: body!.price_cache ?? null, price_source: 'manual', is_free: !!body!.is_free } : { price_source: 'openrouter' };
      const row = model(body!.model, price);
      m.models.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    if (path === '/models/use-official-price') {
      const row = m.models.find(x => x.model === body!.model)!;
      Object.assign(row, { price_in: 0.06, price_out: 0.24, price_source: 'openrouter', official_price: null });
      return route.fulfill({ json: row });
    }
    if (path === '/benchmarks' && method === 'GET') return route.fulfill({ json: m.history });
    if (path === '/benchmarks' && method === 'POST') {
      if (m.busy) return err(route, 409, 'benchmark_busy');
      polls = 0;
      return route.fulfill({ status: 202, json: { id: 'b-new', operation: body!.operation, model: body!.model, effort: body!.effort, status: 'queued', cases: cases(0).map(c => ({ ...c, state: 'pending' })), summary: null, baseline: null, verdict: 'na', created_by: 'ops@example.test', started_at: null, finished_at: null } });
    }
    if (path === '/benchmarks/b-new') {
      polls += 1;
      const red = m.verdict === 'red';
      const base = { id: 'b-new', operation: 'evaluate_job', model: 'openai/gpt-6-luna-mini', effort: 'low', created_by: 'ops@example.test', started_at: '2026-11-04T07:00:00Z' };
      if (polls < 2) return route.fulfill({ json: { ...base, status: 'running', cases: cases(8, [3]), summary: null, baseline: null, verdict: 'na', finished_at: null } });
      return route.fulfill({ json: { ...base, status: 'done', cases: cases(20, red ? [6, 13] : []).map((c, i) => ({ ...c, state: c.state === 'running' ? 'ok' : c.state })), finished_at: '2026-11-04T07:03:00Z',
        summary: red ? summary({ quality: 91.2, p50_seconds: 12.8, cost_per_call_usd: 0.00073 }) : summary({ quality: 96.6, p50_seconds: 6.1, cost_per_call_usd: 0.00019 }), baseline: summary(), verdict: red ? 'red' : 'green' } });
    }
    if (path.startsWith('/tasks/') && method === 'PUT') {
      if (m.putError) return err(route, 409, m.putError);
      const op = path.slice('/tasks/'.length);
      const row = m.tasks.find(x => x.operation === op)!;
      Object.assign(row, { model: body!.model, effort: body!.effort, benchmark_id: body!.benchmark_id ?? null, source: 'stored' });
      return route.fulfill({ json: row });
    }
    return route.fulfill({ json: [] });
  });
  return m;
}
