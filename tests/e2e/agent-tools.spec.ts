import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const prepareRunId = 'cccccccc-0000-4000-8000-000000000001';
const approvalId = 'dddddddd-0000-4000-8000-000000000001';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const run = (id: string, operation: string, extra: Record<string, unknown> = {}) => ({ id, project_id: projectId, session_id: sessionId, operation, status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: null, ...extra });
const pack = { kind: 'apply_pack', state: 'parked', missing_required: ['q2'], answers: [
  { question_id: 'q1', label: 'Why this job?', answer: 'Packaged services with Docker', evidence_ids: ['f1', 'f2'] },
  { question_id: 'q2', label: 'Authorised to work?', answer: null, evidence_ids: [], reason: 'not_answerable' },
] };
const job = (applied: boolean) => ({ id: jobId, revision: 1, created_at: '2026-10-01T00:00:00Z', title: 'Synthetic data analyst', company: 'Example Co', source_url: null, description: 'Synthetic', application_status: applied ? 'applied' : 'saved' });

async function mock(page: Page, locale: 'en' | 'th', applied = false, payload: unknown = pack) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  const seen = { decision: null as unknown, runs: [] as Record<string, unknown>[] };
  const api = `**/api/v1/projects/${projectId}`;
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill(json({ id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId, cv_name: 'Data CV', cv_revision: 1, job_title: 'Synthetic data analyst', job_company: 'Example Co' })));
  await page.route(`${api}/runs`, r => {
    if (r.request().method() === 'POST') { seen.runs.push(r.request().postDataJSON()); return r.fulfill(json(run('cccccccc-0000-4000-8000-000000000009', 'apply_prepare', { status: 'queued' }), 202)); }
    return r.fulfill(json([run(prepareRunId, 'apply_prepare', { result_payload: payload })]));
  });
  await page.route(`${api}/runs/${prepareRunId}`, r => r.fulfill(json(run(prepareRunId, 'apply_prepare', { result_payload: payload }))));
  await page.route(`${api}/runs/*/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route(`${api}/jobs`, r => r.fulfill(json([job(applied)])));
  await page.route(`${api}/approvals`, r => r.fulfill(json([{ id: approvalId, run_id: 'cccccccc-0000-4000-8000-000000000002', action: 'submit_application', revision_id: null, expected_cv_revision_id: null, target_file_id: null, target_run_id: prepareRunId, change_digest: 'd', expires_at: '2030-01-01T00:00:00Z', consumed_at: null, decision: null, applied_at: null }])));
  await page.route(`${api}/approvals/${approvalId}/decision`, r => { seen.decision = r.request().postDataJSON(); return r.fulfill(json({ id: approvalId, decision: 'approve' })); });
  await page.route(`${api}/grants`, r => r.fulfill(json([])));
  return seen;
}

test('submit approval shows answers, evidence, missing list and approving POSTs the decision', async ({ page }) => {
  const seen = await mock(page, 'en');
  await page.goto(`/app/projects/${projectId}/console?tab=approvals`);
  await expect(page.getByText('Synthetic data analyst')).toBeVisible();
  await expect(page.getByText('Packaged services with Docker')).toBeVisible();
  await expect(page.getByText('Why this job?')).toBeVisible();
  await expect(page.getByText('Authorised to work?')).toHaveCount(2); // the answer row and the missing-required list
  await expect(page.getByText('q1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('2 facts cited')).toBeVisible();
  await expect(page.getByText('Not answerable')).toBeVisible();
  await expect(page.getByText('Required questions with no answer')).toBeVisible();
  await expect(page.getByText(/submit the application on the company site yourself/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve: record as applied' }).click();
  await expect.poll(() => seen.decision).toEqual({ decision: 'approve' });
});

test('answer pack has copy buttons, parked reason, and submit is disabled until ready', async ({ page }) => {
  const seen = await mock(page, 'en');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(1);
  await expect(page.getByText('Why this job?')).toBeVisible();
  await expect(page.getByText('q1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('No fact in your experience bank supports an answer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request submit' })).toBeDisabled();
  await page.getByLabel('Question').fill('Why this job?');
  await page.getByRole('button', { name: 'Prepare application' }).click();
  await expect.poll(() => seen.runs[0]).toMatchObject({ operation: 'apply_prepare', questions: [{ id: 'q1', label: 'Why this job?', required: true, kind: 'text' }] });
});

test('follow-up action appears only for applied jobs', async ({ page }) => {
  await mock(page, 'en', false);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('button', { name: 'Prepare application' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft follow-up' })).toHaveCount(0);
  const seen = await mock(page, 'en', true);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'Draft follow-up' }).click();
  await expect.poll(() => seen.runs[0]).toMatchObject({ operation: 'draft_follow_up' });
});

test('grant picker lists both new capabilities in Thai and fits 320px', async ({ page }) => {
  await mock(page, 'th');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/console?tab=agents`);
  await expect(page.getByText('jobs:search')).toBeVisible();
  await expect(page.getByText('applications:apply')).toBeVisible();
  await expect(page.getByText('ค้นหาประกาศงาน (รายละเอียดฉบับเต็ม)')).toBeVisible();
  await expect(page.getByText('เตรียมคำตอบใบสมัครจาก CV และขอให้คุณอนุมัติการยื่นสมัคร')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

const reasonPack = { kind: 'apply_pack', state: 'parked', missing_required: [], answers: ['not_answerable', 'invalid_answer', 'evidence_required', 'unsupported_claim']
  .map((reason, i) => ({ question_id: `q${i + 1}`, answer: null, evidence_ids: [], reason })) };

test('every parked-pack reason the backend emits is translated, never shown as a raw code', async ({ page }) => {
  for (const locale of ['en', 'th'] as const) {
    await mock(page, locale, false, reasonPack);
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
    const items = page.getByRole('listitem').filter({ hasText: /q[1-4]|เหตุผล|Reason/ });
    await expect(items.first()).toBeVisible();
    for (const code of ['not_answerable', 'invalid_answer', 'evidence_required', 'unsupported_claim']) {
      await expect(page.getByText(code)).toHaveCount(0);
    }
    await expect(page.getByText(locale === 'en' ? /^Reason: /: /^เหตุผล: /)).toHaveCount(4);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});
