// CH-03 (Today start card) and CH-04 (paste a job posting). Fixture default: no CV, one saved job, no runs.
import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const base = `/app/projects/${projectId}`;
const cv = [{ id: 'cv', name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', latest_revision: { id: 'cv1', revision: 1, original_filename: 'data-cv.pdf', skill_profile_ready: true, created_at: '2026-10-01T00:00:00Z' } }];
const runsUrl = new RegExp(`(?:/v1/projects/${projectId}/runs|/v1/async/projects/${projectId}/agent-runs)(?:\\?.*)?$`);
const evaluated = { id: 'run-eval', project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: 4.2 };

async function setup(page: Page, o: { cv?: boolean; jobs?: boolean; runs?: unknown[]; locale?: 'th' | 'en' } = {}) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), o.locale ?? 'en');
  await useSyntheticApplication(page);
  if (o.cv) await page.route(`**/v1/projects/${projectId}/cvs`, route => route.request().method() === 'GET' ? route.fulfill({ json: cv }) : route.fallback());
  if (o.jobs === false) await page.route(`**/v1/projects/${projectId}/jobs`, route => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback());
  if (o.runs) await page.route(runsUrl, route => route.fulfill({ json: o.runs }));
}
const card = (page: Page) => page.getByRole('region', { name: /Start in 3 steps|เริ่มใน 3 ขั้น/ });
const step = (page: Page, n: number) => card(page).getByRole('listitem').nth(n);

test('no CV: step 1 is current with the drop zone, 2 and 3 wait', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/overview`);
  await expect(card(page)).toBeVisible();
  await expect(step(page, 0)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 0).getByText('Drop your CV file here')).toBeVisible();
  await expect(step(page, 0).getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect(step(page, 1)).toContainText('not yet');
  await expect(step(page, 2)).toContainText('not yet');
  await expect(page.getByRole('main').locator('.bg-hero')).toHaveCount(0);
});

test('Thai copy of the start card', async ({ page }) => {
  await setup(page, { locale: 'th' });
  await page.goto(`${base}/overview`);
  await expect(card(page)).toBeVisible();
  for (const name of ['ใส่ CV', 'เลือกงาน', 'ดูคะแนน']) await expect(card(page).getByRole('heading', { name })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'เลือกไฟล์' })).toBeVisible();
});

test('reading: step 1 shows a status and no upload control', async ({ page }) => {
  await setup(page, { cv: true, runs: [{ id: 'r-read', project_id: projectId, session_id: null, operation: 'extract_experience', status: 'running', created_at: '2026-10-16T00:00:00Z' }] });
  await page.goto(`${base}/overview`);
  await expect(step(page, 0)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 0).getByRole('status')).toContainText('Reading your CV');
  await expect(card(page).getByRole('button', { name: 'Choose file' })).toHaveCount(0);
});

test('CV but no job: step 1 done, step 2 offers search and paste', async ({ page }) => {
  await setup(page, { cv: true, jobs: false });
  await page.goto(`${base}/overview`);
  await expect(step(page, 0)).toContainText('done');
  await expect(step(page, 1)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 1).getByRole('link', { name: 'Search jobs' })).toHaveAttribute('href', `${base}/search`);
  await expect(step(page, 1).getByRole('button', { name: 'Paste a posting' })).toBeVisible();
});

test('job not scored: step 3 is current with the score action', async ({ page }) => {
  await setup(page, { cv: true });
  await page.goto(`${base}/overview`);
  await expect(step(page, 1)).toContainText('done');
  await expect(step(page, 2)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 2).getByRole('button', { name: 'Get a fit score' })).toBeVisible();
});

test('scored: the start card gives way to the next-step card', async ({ page }) => {
  await setup(page, { cv: true, runs: [evaluated] });
  await page.goto(`${base}/overview`);
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Get a fit score' }).getByText('Next step')).toBeVisible(); // the old hero, not the start card
});

test('dropping a CV on the card uploads it; a bad file shows the CV page message', async ({ page }) => {
  await setup(page);
  let posted = 0;
  await page.route(`**/v1/projects/${projectId}/cvs`, route => { if (route.request().method() !== 'POST') return route.fallback(); posted += 1; return route.fulfill({ status: 201, json: { id: 'cv', name: 'x' } }); });
  await page.goto(`${base}/overview`);
  await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('x') });
  await expect(card(page).getByRole('alert')).toContainText('PDF, DOCX');
  expect(posted).toBe(0);
  await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect.poll(() => posted).toBe(1);
});

test('upload rejected by the server shows its reason', async ({ page }) => {
  await setup(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.request().method() === 'POST' ? route.fulfill({ status: 422, json: { code: 'scanned_pdf_unsupported', message_key: 'x', retryable: false } }) : route.fallback());
  await page.goto(`${base}/overview`);
  await page.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(card(page).getByRole('alert')).toBeVisible();
});

test.describe('paste a job posting', () => {
  const open = async (page: Page) => { await setup(page, { cv: true, jobs: false }); await page.goto(`${base}/overview`); await page.getByRole('button', { name: 'Paste a posting' }).click(); return page.getByRole('dialog'); };

  test('saves, then scores right away', async ({ page }) => {
    let body: Record<string, unknown> = {};
    const dialog = await open(page);
    await page.route(`**/v1/projects/${projectId}/jobs`, route => { if (route.request().method() !== 'POST') return route.fallback(); body = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: jobId, title: body.title, company: body.company, created_at: '2026-10-20T00:00:00Z' } }); });
    await dialog.getByLabel('Posting text').fill('Data analyst\nBuild dashboards in SQL.');
    await dialog.getByLabel('Company (optional)').fill('Example Co');
    await dialog.getByRole('button', { name: 'Save posting' }).click();
    await expect(dialog.getByRole('status')).toContainText('Saved “Data analyst”');
    expect(body).toMatchObject({ title: 'Data analyst', company: 'Example Co', source_url: null });
    await dialog.getByRole('button', { name: 'Score it against my CV' }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}\\?start=evaluate`));
  });

  test('empty text, bad link and server failure each say what to do', async ({ page }) => {
    const dialog = await open(page);
    await page.route(`**/v1/projects/${projectId}/jobs`, route => route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { code: 'service.unavailable' } }) : route.fallback());
    await dialog.getByLabel('Posting text').fill('   ');
    await dialog.getByRole('button', { name: 'Save posting' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Paste the posting text first');
    await dialog.getByLabel('Posting text').fill('Analyst');
    await dialog.getByLabel('Link to the posting (optional)').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Save posting' }).click();
    await expect(dialog.getByRole('alert')).toContainText('http://');
    await dialog.getByLabel('Link to the posting (optional)').fill('https://jobs.example.test/1');
    await dialog.getByRole('button', { name: 'Save posting' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Could not save the posting');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
