import type { Page, Route } from '@playwright/test';
import { projectId, useSyntheticApplication } from './application';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const approvalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const grantId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const jobId = '33333333-3333-4333-8333-333333333333';
const sessionId = '22222222-2222-4222-8222-222222222222';
const headers = { 'content-type': 'application/json' };
const json = (data: unknown, status = 200) => ({ status, headers, body: JSON.stringify(data) });

const runs = [
  { id: runId, project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-15T10:00:00Z', finished_at: '2026-10-15T10:02:30Z', retry_of_id: null, evaluation_result: { score: 4, report_markdown: 'Synthetic evaluation.', skill_coverage: { required: ['Python', 'SQL'], matched: ['Python'], missing: ['SQL'], ratio: 0.5, method: 'keyword' } }, requester: { kind: 'owner' } },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', project_id: projectId, session_id: sessionId, operation: 'draft_documents', status: 'waiting_approval', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-15T11:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null, requester: { kind: 'agent', grant_id: grantId, label: 'Synthetic research agent' } },
];
const grants = [{ id: grantId, project_id: projectId, label: 'Synthetic research agent', capabilities: ['results:read', 'jobs:evaluate'], expires_at: '2026-10-20T00:00:00Z', revoked_at: null }];
const approvals = [{ id: approvalId, run_id: runs[1].id, action: 'promote_cv', revision_id: null, expected_cv_revision_id: null, target_file_id: null, target_run_id: null, change_digest: 'synthetic-change-digest', expires_at: '2026-10-17T00:00:00Z', consumed_at: null, decision: null, applied_at: null, decided_by: null }];

/** Install contract-shaped synthetic responses used by Console and Settings journeys. */
export async function useUtilitiesFixture(page: Page, options: { preferences?: { locale?: 'en' | 'th'; theme?: 'light' | 'dark' } } = {}) {
  const preferences = { locale: 'en' as const, theme: 'light' as const, ...options.preferences };
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, preferences);
  await useSyntheticApplication(page);
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === `/projects/${projectId}/runs` && request.method() === 'GET') return route.fulfill(json(runs));
    if (path === `/projects/${projectId}/approvals` && request.method() === 'GET') return route.fulfill(json(approvals));
    if (path === `/projects/${projectId}/approvals/${approvalId}/decision` && request.method() === 'POST') return route.fulfill(json({ ...approvals[0], decision: request.postDataJSON().decision, decided_by: 'owner' }));
    if (path === `/projects/${projectId}/grants` && request.method() === 'GET') return route.fulfill(json(grants));
    if (path === `/projects/${projectId}/grants` && request.method() === 'POST') return route.fulfill(json({ id: grantId, project_id: projectId, ...request.postDataJSON(), revoked_at: null, token: 'jspg_SYNTHETIC_ONE_TIME_TOKEN' }, 201));
    if (path === `/projects/${projectId}/grants/${grantId}` && request.method() === 'DELETE') return route.fulfill({ status: 204 });
    if (path === `/projects/${projectId}/jobs` && request.method() === 'GET') return route.fulfill(json([{ id: jobId, revision: 1, created_at: '2026-10-15T00:00:00Z', title: 'Synthetic data analyst', company: 'Example Co', source_url: 'https://jobs.example.test/analyst', description: 'Synthetic job description.' }]));
    if (path === `/projects/${projectId}/runs/${runs[1].id}`) return route.fulfill(json({ ...runs[1], result_payload: null }));
    if (/^\/projects\/[^/]+\/runs\/[^/]+\/events$/.test(path)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ sequence: 1, event_type: 'run_completed', data: { approval_id: null, step: 'llm_round', status: 'completed', artifact_ids: [], message_key: null, progress_percent: null, model: 'synthetic/model', latency_ms: 1000, input_tokens: 100, output_tokens: 20 }, created_at: '2026-10-15T10:02:30Z' })}\n\n` });
    if (path === `/projects/${projectId}/settings/tools` && request.method() === 'GET') return route.fulfill(json({ connectors: [{ adapter: 'career_ops', enabled: true, revision: 1, updated_at: '2026-10-15T00:00:00Z' }] }));
    if (path === `/projects/${projectId}/settings/tools/career_ops` && request.method() === 'PUT') return route.fulfill(json({ adapter: 'career_ops', enabled: request.postDataJSON().enabled, revision: 2, updated_at: '2026-10-16T00:00:00Z' }));
    if (path === '/gateway') return route.fulfill(json({ configured: true, reachable: true, base_url: 'http://127.0.0.1:4000', analyze_model: 'synthetic/analyze', decision_model: 'synthetic/decision', models: ['synthetic/analyze', 'synthetic/decision'] }));
    if (path === '/account/telegram') return route.fulfill(json({ enabled: true, linked: true, bot_username: 'synthetic_bot', linked_at: '2026-10-15T00:00:00Z' }));
    if (path === `/projects/${projectId}/webhooks` && request.method() === 'GET') return route.fulfill(json([{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', url: 'https://hooks.example.test/notify', events: ['run.completed', 'run.waiting_approval'], enabled: true, created_at: '2026-10-14T00:00:00Z' }]));
    if (path === `/projects/${projectId}/webhooks/deliveries`) return route.fulfill(json([]));
    return route.fallback();
  });
}

export { projectId };
