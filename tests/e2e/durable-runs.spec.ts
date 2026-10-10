import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const runId = 'cccccccc-0000-4000-8000-000000000001';
const grantId = 'eeeeeeee-0000-4000-8000-000000000001';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const questions = [
  { id: 'q1', label: 'Why this job?', required: true, kind: 'text' },
  { id: 'q2', label: 'Authorised to work?', required: true, kind: 'boolean' },
  { id: 'q3', label: 'Notice period?', required: true, kind: 'choice', choices: ['Immediate', '30 days'] },
];
const pack = { kind: 'apply_pack', state: 'parked', missing_required: ['q2', 'q3'], answers: [
  { question_id: 'q1', label: 'Why this job?', answer: 'Docker services', evidence_ids: ['f1'] },
  { question_id: 'q2', label: 'Authorised to work?', answer: null, evidence_ids: [], reason: 'not_answerable' },
  { question_id: 'q3', label: 'Notice period?', answer: null, evidence_ids: [], reason: 'not_answerable' },
] };
const run = (extra: Record<string, unknown> = {}) => ({ id: runId, project_id: projectId, session_id: sessionId, operation: 'apply_prepare', status: 'needs_input', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null, result_payload: pack, requester: { kind: 'agent', grant_id: grantId, label: null }, ...extra });
const ev = (sequence: number, event_type: string, data: Record<string, unknown>) => `data: ${JSON.stringify({ sequence, event_type, created_at: '2026-10-10T00:00:00Z', data: { approval_id: null, step: null, status: null, artifact_ids: [], message_key: null, progress_percent: null, ...data } })}\n\n`;
const stream = ev(1, 'run_progress', { step: 'llm_round', model: 'hermes-x', latency_ms: 1500, input_tokens: 100, output_tokens: 20 })
  + ev(2, 'run_resumed', { message_key: 'events.run_resumed' })
  + ev(3, 'run_progress', { step: 'llm_round', model: 'hermes-x', latency_ms: 2500, input_tokens: null, output_tokens: null });

async function mock(page: Page, locale: 'en' | 'th') {
  await page.addInitScript(([l, key, q]) => { localStorage.setItem('ui.locale', l); sessionStorage.setItem(key, q); }, [locale, `apply-questions:${sessionId}`, JSON.stringify(questions)]);
  await useSyntheticApplication(page);
  const seen = { input: null as unknown, grant: null as unknown };
  let current = run();
  const api = `**/api/v1/projects/${projectId}`;
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill(json({ id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId, cv_name: 'Data CV', cv_revision: 1, job_title: 'Synthetic data analyst', job_company: 'Example Co' })));
  await page.route(`${api}/runs`, r => r.fulfill(json([current])));
  await page.route(`${api}/runs/${runId}`, r => r.fulfill(json(current)));
  await page.route(`${api}/runs/${runId}/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: stream }));
  await page.route(`${api}/runs/${runId}/input`, r => { seen.input = r.request().postDataJSON(); current = run({ status: 'completed', result_payload: { ...pack, state: 'ready', missing_required: [], answers: pack.answers.map(a => a.answer === null ? { ...a, answer: a.question_id === 'q2' ? true : '30 days', source: 'owner', reason: undefined } : a) } }); return r.fulfill(json(current)); });
  await page.route(`${api}/jobs`, r => r.fulfill(json([{ id: jobId, revision: 1, created_at: '2026-10-01T00:00:00Z', title: 'Synthetic data analyst', company: 'Example Co', source_url: null, description: 'Synthetic', application_status: 'saved' }])));
  await page.route(`${api}/grants`, r => {
    if (r.request().method() === 'POST') { seen.grant = r.request().postDataJSON(); return r.fulfill(json({ id: grantId, project_id: projectId, label: 'CI bot', capabilities: ['results:read'], expires_at: '2030-01-01T00:00:00Z', revoked_at: null, token: 't' }, 201)); }
    return r.fulfill(json([{ id: grantId, project_id: projectId, label: 'CI bot', capabilities: ['results:read'], expires_at: '2030-01-01T00:00:00Z', revoked_at: null }]));
  });
  return seen;
}

test('timeline shows the requester, llm_round stats with a total, and the resumed line', async ({ page }) => {
  await mock(page, 'en');
  await page.goto(`/app/projects/${projectId}/console`);
  await expect(page.getByText('Agent · eeeeeeee')).toBeVisible();
  await page.getByRole('button', { name: 'Run details' }).click();
  await expect(page.getByText('Resumed after a server restart')).toBeVisible();
  await expect(page.getByText('LLM round · hermes-x · 1.5 s · 100 tokens in / 20 tokens out')).toBeVisible();
  await expect(page.getByText('LLM round · hermes-x · 2.5 s · — tokens in / — tokens out')).toBeVisible();
  await expect(page.getByText('Total: 2 rounds · 4.0 s · 100 tokens in / 20 tokens out')).toBeVisible();
});

test('needs_input pack renders per-kind inputs and saving POSTs the answers', async ({ page }) => {
  const seen = await mock(page, 'en');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('button', { name: 'Request submit' })).toBeDisabled();
  await expect(page.getByText('Still missing required answers: Authorised to work?, Notice period?')).toBeVisible();
  await page.getByRole('radio', { name: 'Yes' }).check();
  await page.getByLabel('Notice period?').selectOption('30 days');
  await page.getByRole('button', { name: 'Save answers' }).click();
  await expect.poll(() => seen.input).toEqual({ answers: { q2: true, q3: '30 days' } });
  await expect(page.getByText('Saved. The answer pack is ready.')).toBeVisible();
  await expect(page.getByText('Your answer')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Request submit' })).toBeEnabled();
});

test('grant issue form has an optional name sent as label, shown in the list (Thai)', async ({ page }) => {
  const seen = await mock(page, 'th');
  await page.goto(`/app/projects/${projectId}/console?tab=agents`);
  await expect(page.getByText('CI bot')).toBeVisible();
  await page.getByLabel('ชื่อ (ไม่บังคับ)').fill('CI bot');
  await page.getByRole('button', { name: 'ออก token' }).click();
  await expect.poll(() => seen.grant).toMatchObject({ label: 'CI bot', capabilities: ['results:read', 'jobs:evaluate'] });
});
