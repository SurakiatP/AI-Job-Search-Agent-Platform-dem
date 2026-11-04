import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId } from '../fixtures/application';
import { useApplicationsWorkspaceFixture } from '../fixtures/applications-workspace';

// CH-05 / CH-06 / CH-07 / CH-09 / CH-13 and the visible gate reason: one job page that holds the session workspace.
async function open(page: Page, path = '') {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.goto(`/app/projects/${projectId}${path.replace('<session>', fixture.evaluationSessionId).replace('<job>', jobId)}`);
  return fixture;
}

test('a session address redirects to the job page and keeps tab and other params', async ({ page }) => {
  await open(page, '/sessions/<session>?tab=documents&x=1');
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}\\?.*session=22222222-2222-4222-8222-222222222223`));
  await expect(page).toHaveURL(/tab=documents/);
  await expect(page).toHaveURL(/x=1/);
  await expect(page.getByRole('tab', { name: 'Prepare documents' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Senior Data Analyst' })).toBeVisible();
});

test('progress line shows what is done and the current step; the score names its CV (CH-07)', async ({ page }) => {
  await open(page, '/jobs/<job>');
  const progress = page.getByTestId('job-progress');
  await expect(progress.getByRole('listitem').filter({ hasText: 'Evaluate' })).toContainText('done');
  await expect(progress.locator('[aria-current=step]')).toContainText('Prepare documents');
  await expect(page.getByTestId('evaluation-provenance')).toHaveText('Scored against CV: Healthcare Analytics · version 3');
});

test('a draft opens in a side panel with the AI label, and the full page is one link away (CH-09)', async ({ page }) => {
  await open(page, '/jobs/<job>');
  await page.getByTestId('related-documents').getByRole('button', { name: 'Northstar cover letter' }).click();
  const sheet = page.getByTestId('document-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Check before use');
  await expect(sheet.getByRole('link', { name: 'Open full page' })).toHaveAttribute('href', /\/documents\/44444444-4444-4444-8444-444444444445$/);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('stage Interview names practice as the step and opens the practice tab (CH-13)', async ({ page }) => {
  await open(page, '/jobs/<job>');
  await page.route(`**/v1/projects/${projectId}/jobs`, route => route.fulfill({ json: [{ id: jobId, revision: 1, title: 'Senior Data Analyst', company: 'Northstar Health', source_url: null, created_at: '2026-10-01T00:00:00Z', description: 'Synthetic posting.', application_status: 'interview' }] }));
  await page.reload();
  await expect(page.getByTestId('job-progress').locator('[aria-current=step]')).toContainText('Interview');
  await expect(page.getByRole('tab', { name: 'Interview practice' })).toHaveAttribute('aria-selected', 'true');
});

test('an AI wait shows the real steps, the elapsed time and a usual range, never a percentage (CH-06)', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const running = { id: 'cccccccc-0000-4000-8000-000000000019', project_id: projectId, session_id: fixture.evaluationSessionId, operation: 'evaluate_job', status: 'running', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: new Date().toISOString(), finished_at: null, retry_of_id: null, evaluation_result: null };
  await page.route(new RegExp(`(?:/v1/projects/${projectId}/runs|/v1/async/projects/${projectId}/agent-runs)(?:\\?.*)?$`), route => route.request().method() === 'GET' ? route.fulfill({ json: [running] }) : route.fallback());
  await page.route(`**/v1/projects/${projectId}/runs/${running.id}/events`, () => new Promise(() => undefined));
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByText('Usually takes 20 to 60 seconds').first()).toBeVisible();
  await expect(page.getByRole('main').getByText(/\d+%/)).toHaveCount(0);
});

test('an unconfirmed email shows why the AI buttons are disabled, in words (GateNote)', async ({ page }) => {
  await open(page, '/jobs/<job>');
  await page.route('**/v1/auth/session', route => route.fulfill({ json: { authenticated: true, csrf_token: 'x', expires_at: '2030-01-01T00:00:00Z', user: { id: '99999999-0000-4000-8000-000000000001', email: 'synthetic@example.test', locale: 'en', email_verified: false, created_at: '2026-10-01T00:00:00Z' } } }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Draft cover letter' }).first()).toBeDisabled();
  await expect(page.getByTestId('gate-note').first()).toContainText('Confirm your email to use this');
});

test('Landing search with no project creates the first project, then opens Find jobs with the query (AppSearchStart)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const newId = '33333333-3333-4333-8333-33333333aaaa';
  const posts: string[] = [];
  await page.route('**/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/v1', '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === '/auth/session') return json({ csrf_token: 'c', expires_at: '2030-01-01T00:00:00Z', user: { id: '99999999-0000-4000-8000-000000000002', email: 'n@example.test', locale: 'en', email_verified: true, created_at: '2026-10-01T00:00:00Z' } });
    if (path === '/projects' && req.method() === 'POST') { posts.push(req.postDataJSON().name); return json({ id: newId, name: 'x', created_at: '2026-10-01T00:00:00Z' }, 201); }
    if (path === '/projects') return json(posts.length ? [{ id: newId, name: 'x', created_at: '2026-10-01T00:00:00Z' }] : []);
    return json([]);
  });
  await page.goto('/app/search?q=data');
  await expect(page).toHaveURL(new RegExp(`/app/projects/${newId}/search\\?q=data$`));
  expect(posts).toEqual(['My job search']);
});
