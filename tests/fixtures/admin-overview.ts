import type { Page, Route } from '@playwright/test';
import { mockAdminAccount } from './admin';

type Json = Record<string, unknown>;
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-04T07:30:00Z');
const point = (i: number, n: number, back = 0) => ({
  start: new Date(NOW - (n - i + back * n) * DAY).toISOString(), runs: 100 + i * 10, failures: 4 + (i % 3), active_users: 20 + i, cost_usd: 0.5 + i * 0.1,
});

export const healthyComponents = { postgres: 'ok', object_store: 'ok', llm_gateway: 'ok', sandbox: 'ok' };

export const overviewBody = (over: Json = {}): Json => ({
  range: '7d', bucket_seconds: 86400, generated_at: '2026-11-04T07:30:00Z', compare: true,
  kpis: {
    runs: { value: 1204, previous: 1000 }, active_users: { value: 96, previous: 88 }, failure_rate: { value: 0.05, previous: 0.1 },
    cost_usd: { value: 12.5, previous: 10 }, cost_has_manual: false,
  },
  series: Array.from({ length: 7 }, (_, i) => point(i, 7)),
  previous_series: Array.from({ length: 7 }, (_, i) => point(i, 7, 1)),
  attention: [
    { kind: 'failed_runs', severity: 'bad', title_key: 'attention.failed_runs', params: { count: 4, operation: 'evaluate_job', hours: 24 }, target: '/admin/runs?status=failed&operation=evaluate_job' },
    { kind: 'dead_webhooks', severity: 'warn', title_key: 'attention.dead_webhooks', params: { count: 2 }, target: '/admin/system' },
  ],
  health: { components: healthyComponents },
  weekday: [412, 1096, 1188, 1342, 1170, 1018, 463],
  speed: { within_30s_ratio: 0.86, target: 0.9 },
  top_tasks: [
    { operation: 'evaluate_job', runs: 457, failure_rate: 0.31, p50_seconds: 9.6, cost_usd: 4.5 },
    { operation: 'draft_documents', runs: 253, failure_rate: 0.08, p50_seconds: 6.4, cost_usd: 2.1 },
    { operation: 'document_ocr', runs: 36, failure_rate: 0.92, p50_seconds: null, cost_usd: 0.3 },
  ],
  cost_by_model: [{ model: 'openai/gpt-6-luna', calls: 800, cost_usd: 9, has_manual: false }, { model: 'qwen/qwen3.7-flash', calls: 400, cost_usd: 3.5, has_manual: true }],
  activity: [{ id: 'a1', created_at: '2026-11-04T07:00:00Z', actor_email: 'ops@example.test', action: 'user.suspend', target_type: 'user', target_id: '31d09a00-0000-4000-8000-000000000001', detail: {} }],
  ...over,
});

export const emptyOverview = (): Json => overviewBody({
  kpis: { runs: { value: 0, previous: 0 }, active_users: { value: 0, previous: 0 }, failure_rate: { value: 0, previous: 0 }, cost_usd: { value: 0, previous: 0 }, cost_has_manual: false },
  series: Array.from({ length: 7 }, (_, i) => ({ ...point(i, 7), runs: 0, failures: 0, active_users: 0, cost_usd: 0 })),
  previous_series: [], attention: [], weekday: [0, 0, 0, 0, 0, 0, 0], speed: { within_30s_ratio: null, target: 0.9 }, top_tasks: [], cost_by_model: [], activity: [],
});

export interface OverviewMock {
  ranges: string[];
  prefsPut: Json[];
  csvUrls: string[];
  bucketUrls: string[];
}

/** Admin session plus the Overview endpoints. `overview` may be a function of the requested range. */
export async function mockOverview(page: Page, opts: { overview?: Json | ((range: string) => Json); widgets?: string[]; failPrefs?: boolean; fxFail?: boolean; probes?: unknown[] } = {}): Promise<OverviewMock> {
  await mockAdminAccount(page);
  const seen: OverviewMock = { ranges: [], prefsPut: [], csvUrls: [], bucketUrls: [] };
  let widgets = opts.widgets ?? ['trend', 'attention', 'weekday', 'speed', 'tasks'];
  const json = (route: Route, body: unknown) => route.fulfill({ json: body });
  await page.route('**/v1/admin/overview?**', route => {
    const range = new URL(route.request().url()).searchParams.get('range') ?? '7d';
    seen.ranges.push(range);
    const body = typeof opts.overview === 'function' ? opts.overview(range) : opts.overview ?? overviewBody();
    return json(route, { ...body, range });
  });
  await page.route('**/v1/admin/overview/bucket?**', route => {
    seen.bucketUrls.push(route.request().url());
    const q = new URL(route.request().url()).searchParams;
    return json(route, { range: q.get('range'), metric: q.get('metric'), start: q.get('start'), end: q.get('start'), value: 130, parts: [{ operation: 'evaluate_job', value: 60 }, { operation: 'draft_documents', value: 40 }, { operation: 'tailor_cv', value: 30 }] });
  });
  await page.route('**/v1/admin/overview.csv?**', route => {
    seen.csvUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/csv', body: 'bucket_start,runs,failures,active_users,cost_usd\n2026-11-03T00:00:00+00:00,10,1,3,0.500000\n' });
  });
  await page.route('**/v1/admin/prefs', route => {
    if (route.request().method() === 'PUT') {
      if (opts.failPrefs) return route.fulfill({ status: 500, json: { code: 'internal_error', message_key: 'errors.internal_error', retryable: false } });
      const body = route.request().postDataJSON() as Json;
      seen.prefsPut.push(body);
      widgets = body.widgets as string[];
      return json(route, body);
    }
    return json(route, { widgets });
  });
  await page.route('**/v1/admin/fx', route => opts.fxFail
    ? route.fulfill({ status: 503, json: { code: 'fx_unavailable', message_key: 'errors.fx_unavailable', retryable: true } })
    : json(route, { rate: 35, source: 'Frankfurter (European Central Bank reference rates)', source_url: 'https://frankfurter.dev', as_of: '2026-11-03', fetched_at: '2026-11-04T07:00:00Z', stale: false }));
  await page.route('**/v1/admin/system', route => json(route, {
    generated_at: '2026-11-04T07:30:00Z', health: { components: healthyComponents },
    probes: opts.probes ?? [], ingest: [], webhooks: { pending: 0, delivered: 0, dead: 0 },
    gateway: { configured: true, reachable: true, base_url: null, analyze_model: 'a', decision_model: 'b', models: [] }, tools: { tools: [] },
  }));
  return seen;
}
