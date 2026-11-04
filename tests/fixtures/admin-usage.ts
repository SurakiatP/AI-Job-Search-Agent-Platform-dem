import type { Page } from '@playwright/test';

const row = (key: string, requests: number, input: number, output: number, cached: number, cost: number | null, over: Record<string, unknown> = {}) =>
  ({ key, requests, input_tokens: input, output_tokens: output, cached_tokens: cached, cost_usd: cost, cost_per_request_usd: cost == null ? null : cost / requests, has_manual: false, uncosted_requests: cost == null ? requests : 0, ...over });

/** Server order is cost descending (day: ascending by date). tailor_cv uses a manual price; document_ocr ran before cost tracking. */
const rows = {
  task: [row('tailor_cv', 40, 120000, 80000, 0, 3.6, { has_manual: true }), row('evaluate_job', 120, 240000, 60000, 10000, 1.2), row('document_ocr', 12, 5000, 900, 0, null)],
  model: [row('ai-analyze', 150, 300000, 120000, 10000, 4.2), row('vendor/manual-model', 22, 65000, 20900, 0, 0.6, { has_manual: true })],
  day: [row('2026-10-01', 80, 150000, 60000, 5000, 2.0), row('2026-10-02', 92, 215000, 80900, 5000, 2.8, { has_manual: true })],
  user: [row('a1b2c3d4', 100, 200000, 90000, 8000, 3.0), row('e5f6a7b8', 72, 165000, 50900, 2000, 1.8, { has_manual: true })],
} as const;
const totals = { ...row('all', 172, 370000, 140900, 10000, 4.8, { has_manual: true, uncosted_requests: 12 }), cost_per_request_usd: 0.03 };

export type UsageMock = { requests: string[]; puts: unknown[] };
export type UsageOptions = { empty?: boolean; failFirst?: boolean; rate?: number; prefsFail?: boolean };

/** Mocks GET /v1/admin/usage and GET/PUT /v1/admin/prefs on top of mockAdminAccount(page). `requests` collects each usage URL (path and query). */
export async function mockAdminUsage(page: Page, opts: UsageOptions = {}): Promise<UsageMock> {
  const mock: UsageMock = { requests: [], puts: [] };
  let failures = opts.failFirst ? 1 : 0;
  let prefs = { widgets: ['trend', 'tasks'], thb_rate: opts.rate ?? 35 };
  await page.route(/\/v1\/admin\/usage\?/, route => {
    const url = new URL(route.request().url());
    mock.requests.push(url.pathname + url.search);
    if (failures-- > 0) return route.fulfill({ status: 500, json: { code: 'internal_error', message_key: 'errors.request_failed', retryable: true } });
    const group = url.searchParams.get('group_by') as keyof typeof rows;
    const body = opts.empty
      ? { range: '7d', group_by: group, generated_at: '2026-11-04T05:00:00Z', totals: row('all', 0, 0, 0, 0, null, { uncosted_requests: 0 }), rows: [] }
      : { range: url.searchParams.get('range'), group_by: group, generated_at: '2026-11-04T05:00:00Z', totals, rows: rows[group] };
    return route.fulfill({ json: body });
  });
  await page.route(/\/v1\/admin\/prefs$/, route => {
    const req = route.request();
    if (req.method() === 'PUT') { mock.puts.push(req.postDataJSON()); prefs = req.postDataJSON(); return route.fulfill({ json: prefs }); }
    return opts.prefsFail ? route.fulfill({ status: 500, json: { code: 'internal_error', message_key: 'errors.request_failed', retryable: true } }) : route.fulfill({ json: prefs });
  });
  return mock;
}
