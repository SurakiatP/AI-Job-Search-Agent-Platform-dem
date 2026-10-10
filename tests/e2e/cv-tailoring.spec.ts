import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const cvDocId = '55555555-5555-4555-8555-5555555555aa';
const rev1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const rev2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const tailorRunId = 'bbbbbbbb-0000-4000-8000-000000000001';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const run = (id: string, operation: string, extra: Record<string, unknown> = {}) => ({ id, project_id: projectId, session_id: sessionId, operation, status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: null, ...extra });
const payload = { kind: 'tailor', mode: 'interactive', base_revision_id: null, stop_reason: 'interactive', coverage_before: 0.4, coverage_after: 0.6, proposals: [
  { id: 0, find: '', text: 'Built Airflow pipelines serving 40 dashboards', evidence_ids: ['f1', 'f2'], status: 'proposed' },
  { id: 1, find: 'Python', text: 'Led a team of 50 engineers', evidence_ids: ['f9'], status: 'rejected_by_gate' },
] };

async function mock(page: Page, locale: 'en' | 'th', body: Record<string, unknown> = payload) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  const seen = { runs: [] as unknown[], apply: null as unknown, restoreUrl: '' };
  let runs: unknown[] = [];
  const api = `**/api/v1/projects/${projectId}`;
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill(json({ id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId, cv_name: 'Data CV', cv_revision: 1, job_title: 'Synthetic data analyst', job_company: 'Example Co' })));
  await page.route(`${api}/runs`, async r => {
    if (r.request().method() === 'POST') { seen.runs.push(r.request().postDataJSON()); runs = [run(tailorRunId, 'tailor_cv', { result_payload: body })]; return r.fulfill(json(runs[0], 202)); }
    return r.fulfill(json(runs));
  });
  await page.route(`${api}/runs/*/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route(`${api}/runs/${tailorRunId}/tailor/apply`, r => { seen.apply = r.request().postDataJSON(); runs = [run('bbbbbbbb-0000-4000-8000-000000000002', 'export_document'), ...runs]; return r.fulfill(json(runs[0], 202)); });
  await page.route(`${api}/runs/bbbbbbbb-0000-4000-8000-00000000000*`, r => r.fulfill(json(run(r.request().url().slice(-36), 'export_document'))));
  await page.route(`${api}/documents`, r => r.fulfill(json([{ id: cvDocId, document_type: 'cv', title: 'Tailored CV', output_language: 'en', partial: false, content_markdown: 'v2 text', latest_revision: { id: rev2, revision: 2, created_at: '2026-10-10T00:00:00Z' } }])));
  await page.route(`${api}/documents/${cvDocId}/revisions`, r => r.fulfill(json([
    { id: rev1, revision: 1, document_id: cvDocId, created_at: '2026-10-09T00:00:00Z', content_markdown: 'v1 text', origin: 'agent' },
    { id: rev2, revision: 2, document_id: cvDocId, created_at: '2026-10-10T00:00:00Z', content_markdown: 'v2 text', origin: 'agent', file_id: '88888888-8888-4888-8888-888888888888' },
  ])));
  await page.route(`${api}/documents/${cvDocId}/revisions/${rev1}/restore`, r => { seen.restoreUrl = new URL(r.request().url()).pathname; return r.fulfill(json(run('bbbbbbbb-0000-4000-8000-000000000003', 'export_document', { status: 'queued' }), 202)); });
  await page.route(`${api}/cv`, r => r.fulfill(json([{ id: 'c1', revision: 1 }])));
  return seen;
}

test('interactive tailor: review proposals, apply one, restore an older CV revision', async ({ page }) => {
  const seen = await mock(page, 'en');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByLabel('Interactive').check();
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  expect(seen.runs[0]).toMatchObject({ operation: 'tailor_cv', tailor_mode: 'interactive' });

  await expect(page.getByText('Built Airflow pipelines serving 40 dashboards')).toBeVisible();
  await expect(page.getByTestId('tailor-coverage')).toHaveText('40% → 60%');
  await expect(page.getByText('Adds to the end of the CV')).toBeVisible();
  await expect(page.getByText('Disabled: its cited facts are missing')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select proposal 2' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Select proposal 1' }).check();
  await page.getByRole('button', { name: 'Apply selected' }).click();
  await expect.poll(() => seen.apply).toEqual({ proposal_ids: [0] });

  await page.goto(`/app/projects/${projectId}/documents/${cvDocId}`);
  await expect(page.getByRole('button', { name: 'Restore this version' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await expect.poll(() => seen.restoreUrl).toBe(`/api/v1/projects/${projectId}/documents/${cvDocId}/revisions/${rev1}/restore`);
});

test('tailor card is Thai and fits 320px', async ({ page }) => {
  await mock(page, 'th');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('button', { name: 'ปรับ CV', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('autopilot result shows the backend stop reason in words', async ({ page }) => {
  await mock(page, 'en', { ...payload, mode: 'autopilot', stop_reason: 'full_coverage' });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect(page.getByText('Every required skill is covered')).toBeVisible();
});
