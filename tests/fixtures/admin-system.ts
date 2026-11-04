import type { Page } from '@playwright/test';
import { mockAdminAccount } from './admin';

/** Synthetic data for the admin System and Audit pages. Metadata only, like the real API. */
export const generatedAt = '2026-11-04T07:00:00Z';
const end = Date.parse(generatedAt);
const up = { postgres: 'ok', object_store: 'ok', llm_gateway: 'ok', sandbox: 'ok' } as const;

const SPAN: Record<string, [number, number]> = { '1m': [60, 30], '5m': [300, 30], '10m': [600, 30], '15m': [900, 30], '30m': [1800, 30], '1h': [3600, 30], '4h': [14400, 120],
  '10h': [36000, 300], '7d': [604800, 3600], '30d': [2592000, 21600], '90d': [7776000, 86400], all: [7776000, 86400] };
const cell = (status: string, ms: number | null, checks = 1) => ({ status, ms, failed: status === 'down' ? checks : 0, checks });

/** The buckets of a range, oldest first, like the server: the first 3 hold no check, the AI gateway fails in bucket count-20, the sandbox is slow (2.5 s) in count-10. */
export function probesFor(range: string) {
  const [span, size] = SPAN[range] ?? SPAN['1h'];
  const count = span / size;
  const last = Math.floor(end / 1000 / size) * size;
  return Array.from({ length: count }, (_, i) => {
    const none = i < 3;
    const c = (status: string, ms: number) => (none ? cell('unknown', null, 0) : cell(status, status === 'down' ? 2000 : ms));
    return { checked_at: new Date((last - (count - 1 - i) * size) * 1000).toISOString(),
      components: { postgres: c('ok', 4 + (i % 5)), object_store: c('ok', 20), llm_gateway: c(i === count - 20 ? 'down' : 'ok', 150), sandbox: c('ok', i === count - 10 ? 2500 : 60) } };
  });
}

export const gateway = { configured: true, reachable: true, base_url: 'http://127.0.0.1:54000', analyze_model: 'openai/gpt-6-luna', decision_model: 'typesafe/jev-1.13', models: ['openai/gpt-6-luna', 'ai-extra'] };
export const tools = [
  { name: 'evaluate_job', description: 'Evaluate a job posting against a CV.', required_capability: 'jobs:evaluate' },
  { name: 'get_run', description: 'Read an authorized Project run and its published result view.', required_capability: 'results:read' },
];
export const ingest = [
  { board: 'greenhouse', at: '2026-11-04T06:30:00Z', status: 'complete', jobs_total: 120, jobs_new: 7, error_code: null },
  { board: 'lever', at: '2026-11-04T06:30:00Z', status: 'partial', jobs_total: 40, jobs_new: 1, error_code: 'timeout' },
  { board: 'greenhouse', at: '2026-11-03T06:30:00Z', status: 'failed', jobs_total: 0, jobs_new: 0, error_code: 'http_503' },
];
export const dead = { id: 'dddddddd-0000-4000-8000-000000000001', user_short_id: '3fa9b2c1', host: 'hooks.example.test', event_type: 'job.saved', status: 'dead', attempts: 5, last_status_code: 500, created_at: '2026-11-04T05:00:00Z', delivered_at: null };
export const pending = { id: 'dddddddd-0000-4000-8000-000000000002', user_short_id: '7b2e91aa', host: 'notify.example.test', event_type: 'run.completed', status: 'pending', attempts: 0, last_status_code: null, created_at: '2026-11-04T06:50:00Z', delivered_at: null };

export type SystemOptions = { components?: Partial<Record<keyof typeof up, 'ok' | 'down'>>; ingest?: unknown[]; probes?: unknown[]; gateway?: unknown; down?: boolean; deliveries?: Array<typeof dead>; resend?: 'ok' | 'not_dead' };
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Signs in as admin and answers /v1/admin/system and /v1/admin/webhooks. `down` makes /system answer 500 until heal() (StrictMode sends the first request twice, so a count would be flaky). */
export async function mockSystem(page: Page, o: SystemOptions = {}) {
  await mockAdminAccount(page);
  const resends: string[] = [];
  const ranges: Array<string | null> = [];
  const state = { down: o.down === true };
  const deliveries = o.deliveries ?? [dead, pending];
  await page.route(/\/v1\/admin\/system(\?.*)?$/, route => {
    const range = new URL(route.request().url()).searchParams.get('range');
    ranges.push(range);
    if (state.down) return route.fulfill(json({ code: 'internal_error', message_key: 'errors.internal_error', retryable: true }, 500));
    return route.fulfill(json({ generated_at: generatedAt, range: range ?? '1h', bucket_seconds: (SPAN[range ?? '1h'] ?? SPAN['1h'])[1], health: { components: { ...up, ...o.components } }, probes: o.probes ?? probesFor(range ?? '1h'), ingest: o.ingest ?? ingest, webhooks: { pending: 1, delivered: 40, dead: 1 }, gateway: o.gateway ?? gateway, tools: { tools } }));
  });
  await page.route(/\/v1\/admin\/webhooks(\?.*)?$/, route => {
    const status = new URL(route.request().url()).searchParams.get('status');
    return route.fulfill(json(status ? deliveries.filter(d => d.status === status) : deliveries));
  });
  await page.route('**/v1/admin/webhooks/*/resend', route => {
    resends.push(new URL(route.request().url()).pathname.split('/')[4]);
    return o.resend === 'not_dead'
      ? route.fulfill(json({ code: 'delivery_not_dead', message_key: 'errors.delivery_not_dead', retryable: false }, 409))
      : new Promise<void>(done => setTimeout(() => { void route.fulfill(json({ ...dead, status: 'pending', attempts: 0 })); done(); }, 300));
  });
  return { resends, ranges, heal: () => { state.down = false; } };
}

export const entry = (n: number, over: Record<string, unknown> = {}) => ({ id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`, created_at: `2026-11-04T0${Math.min(n, 9)}:00:00Z`, actor_email: 'ops@example.test', action: 'user.suspend', target_type: 'user', target_id: '3fa9b2c1-1111-4111-8111-111111111111', detail: {}, ...over });
const page1 = [entry(5, { action: 'model.price', target_type: 'model', target_id: 'openai/gpt-5', detail: { price_in: 1.25, price_out: 10, source: 'manual', note: null } }), entry(4, { action: 'run.retry', target_type: 'run', target_id: '5d1c2b3a-2222-4222-8222-222222222222', detail: { operation: 'evaluate_job' } }), entry(3)];
const page2 = [entry(2, { action: 'webhook.resend', target_type: 'webhook', target_id: 'dddddddd-0000-4000-8000-000000000001', detail: { event_type: 'job.saved' } }), entry(1, { action: 'legacy.unknown', target_type: null, target_id: null })];

export type AuditOptions = { items?: unknown[]; down?: boolean };
/** Signs in as admin and answers /v1/admin/audit: page 1 (3 rows, cursor c2) then page 2 (2 rows). Filters on action. `down` makes it answer 500 until heal(). Returns the query strings seen. */
export async function mockAudit(page: Page, o: AuditOptions = {}) {
  await mockAdminAccount(page);
  const queries: string[] = [];
  const state = { down: o.down === true };
  await page.route(/\/v1\/admin\/audit(\?.*)?$/, route => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    if (state.down) return route.fulfill(json({ code: 'internal_error', message_key: 'errors.internal_error', retryable: true }, 500));
    if (o.items) return route.fulfill(json({ items: o.items, next_cursor: null }));
    const action = url.searchParams.get('action');
    if (action) return route.fulfill(json({ items: [...page1, ...page2].filter(e => e.action === action), next_cursor: null }));
    return route.fulfill(json(url.searchParams.get('cursor') ? { items: page2, next_cursor: null } : { items: page1, next_cursor: 'c2' }));
  });
  return { queries, heal: () => { state.down = false; } };
}
