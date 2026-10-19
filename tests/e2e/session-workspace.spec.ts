import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';
import commonEn from '../../frontend/src/locales/common.en.json';
async function ensureScreenshotFonts(page: import('@playwright/test').Page) {
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('400 16px "Noto Sans Thai"', 'ภาษาไทย');
    await document.fonts.ready;
    return document.fonts.check('400 16px "Noto Sans Thai"', 'ภาษาไทย');
  });
  expect(loaded).toBe(true);
}


test('paired session synthetic fixture loads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId,
      operation: 'evaluate_job', status: 'completed', job_revision_id: '33333333-3333-4333-8333-333333333333',
      output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z',
      finished_at: '2026-10-10T00:01:00Z', retry_of_id: null,
      evaluation_result: { score: 3.6, skill_coverage: { matched: ['Python', 'SQL'], missing: ['dbt'], required: ['Python', 'SQL', 'dbt'], ratio: 2 / 3 }, report_markdown: 'Strong analytical foundation with Python and SQL.\n\n**Next step:** strengthen the dbt evidence.' },
    }]),
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.waitForLoadState('networkidle');
  await ensureScreenshotFonts(page); await page.screenshot({ path: '/tmp/jsp-ux-session/evidence/after-desktop-en-light.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await ensureScreenshotFonts(page); await page.screenshot({ path: '/tmp/jsp-ux-session/evidence/after-mobile-en-light.png', fullPage: true });
});

test('Session workspace falls back to shared translations for account errors and legacy page keys', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z',
    cv_revision_id: 'c1', job_revision_id: '33333333-3333-4333-8333-333333333333', cv_name: 'Data CV', cv_revision: 4,
    job_title: 'Synthetic data analyst', job_company: 'Example Co',
  }) }));
  await page.route(`**/api/v1/projects/${projectId}/jobs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', revision: 7, title: 'Synthetic data analyst', company: 'Example Co', created_at: '2026-10-01T00:00:00Z' }]) }));
  await page.route(`**/api/v1/projects/${projectId}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: projectId, name: null, created_at: '2026-10-01T00:00:00Z' }) }));
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'email_unverified', message_key: 'errors.email_unverified', retryable: false }) })
    : route.fallback());
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('link', { name: commonEn.pages.project, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Evaluate this job' }).click();
  await expect(page.getByText(commonEn.errors.email_unverified, { exact: true })).toBeVisible();
});

test('capture paired session desktop, tablet and mobile evidence in Thai and English light and dark', async ({ browser }) => {
  mkdirSync('/tmp/jsp-ux-session/evidence', { recursive: true });
  for (const locale of ['en', 'th'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [device, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1100], ['mobile', 390, 844]] as const) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale, theme });
        await useSyntheticApplication(page);
        await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({
            id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z',
            cv_revision_id: 'c1', job_revision_id: '33333333-3333-4333-8333-333333333333', cv_name: 'Data CV', cv_revision: 4,
            job_title: 'Synthetic data analyst', job_company: 'Example Co',
          }),
        }));
        await page.route(`**/api/v1/projects/${projectId}/jobs`, route => route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', revision: 7, title: 'Synthetic data analyst', company: 'Example Co', created_at: '2026-10-01T00:00:00Z' }]),
        }));
        await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify([{
            id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId,
            operation: 'evaluate_job', status: 'completed', job_revision_id: '33333333-3333-4333-8333-333333333333',
            output_language: locale, result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null,
            evaluation_result: { score: 3.6, skill_coverage: { matched: ['Python', 'SQL'], missing: ['dbt'], required: ['Python', 'SQL', 'dbt'], ratio: 2 / 3 }, report_markdown: 'Strong analytical foundation with Python and SQL.\n\n**Next step:** strengthen the dbt evidence.' },
          }]),
        }));
        await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
        await expect(page.getByRole('tab').first()).toBeVisible();
        await expect(page.getByRole('img', { name: locale === 'th' ? 'คะแนนความเหมาะสม: 3.6 / 5' : 'Fit score: 3.6 / 5' })).toBeVisible();
        await ensureScreenshotFonts(page);
        await page.screenshot({ path: `/tmp/jsp-ux-session/evidence/after-${device}-${locale}-${theme}.png`, fullPage: true });
        await page.close();
      }
    }
  }
});

test('paired session keeps exact immutable context, global evaluation and task tabs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z',
      cv_revision_id: 'c1', job_revision_id: '33333333-3333-4333-8333-333333333333', cv_name: 'Data CV', cv_revision: 4,
      job_title: 'Synthetic data analyst', job_company: 'Example Co',
    }),
  }));
  await page.route(`**/api/v1/projects/${projectId}/jobs`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', revision: 7, title: 'Synthetic data analyst', company: 'Example Co', created_at: '2026-10-01T00:00:00Z' }]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId,
      operation: 'evaluate_job', status: 'completed', job_revision_id: '33333333-3333-4333-8333-333333333333',
      output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null,
      evaluation_result: { score: 3.6, skill_coverage: { matched: ['Python', 'SQL'], missing: ['dbt'], required: ['Python', 'SQL', 'dbt'], ratio: 2 / 3 }, report_markdown: 'Strong analytical foundation with Python and SQL.' },
    }, {
      id: 'cccccccc-0000-4000-8000-000000000002', project_id: projectId, session_id: sessionId,
      operation: 'draft_documents', status: 'failed', job_revision_id: '33333333-3333-4333-8333-333333333333',
      output_language: 'en', result_file_ids: [], created_at: '2026-10-09T00:00:00Z', finished_at: '2026-10-09T00:01:00Z', retry_of_id: null, evaluation_result: null,
    }]),
  }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic data analyst', exact: true })).toBeVisible();
  await expect(page.getByText('Data CV · v4')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic data analyst · Example Co' })).toBeVisible();
  await expect(page.getByText('Version 7', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Evaluation' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Prepare documents' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Application answers' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Application answers' }).getByLabel('Question')).toBeHidden();
  await expect(page.getByTestId('run-status')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Evaluation' }).getByText('Strong analytical foundation with Python and SQL.')).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('tabpanel', { name: 'History' }).getByRole('status').filter({ hasText: 'Failed' })).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveCount(1);
});

test('task tabs preserve application draft and do not create another run when switching', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  let runPosts = 0;
  await page.route(`**/api/v1/projects/${projectId}/runs`, async route => {
    if (route.request().method() === 'POST') runPosts += 1;
    await route.fallback();
  });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Application answers' }).click();
  await page.getByLabel('Question').fill('What did you ship?');
  await page.getByRole('tab', { name: 'Prepare documents' }).click();
  await expect(page.getByRole('tab', { name: 'Evaluation' })).toBeVisible();
  await page.getByRole('tab', { name: 'Application answers' }).click();
  await expect(page.getByLabel('Question')).toHaveValue('What did you ship?');
  expect(runPosts).toBe(0);
});

test('active, waiting, completed and terminal run states stay visible above task tabs', async ({ browser }) => {
  const states = [
    ['queued', 'Queued'], ['running', 'Running'], ['waiting_approval', 'Waiting for approval'], ['needs_input', 'Needs input'],
    ['completed', 'Completed'], ['failed', 'Failed'], ['interrupted', 'Interrupted'], ['cancelled', 'Cancelled'],
  ] as const;
  for (const [status, label] of states) {
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
    await useSyntheticApplication(page);
    const currentRun = {
      id: `cccccccc-0000-4000-8000-${String(states.indexOf([status, label]) + 10).padStart(12, '0')}`,
      project_id: projectId, session_id: sessionId, operation: 'draft_documents', status,
      job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [],
      created_at: '2026-10-10T00:00:00Z', finished_at: status === 'completed' ? '2026-10-10T00:01:00Z' : null,
      retry_of_id: null, evaluation_result: null,
    };
    await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([currentRun]) }));
    await page.route(`**/api/v1/projects/${projectId}/approvals`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status === 'waiting_approval' ? [{
      id: 'dddddddd-0000-4000-8000-000000000001', run_id: currentRun.id, action: 'delete_file', revision_id: null,
      expected_cv_revision_id: null, target_file_id: 'eeeeeeee-0000-4000-8000-000000000001', target_run_id: null,
      change_digest: 'synthetic-digest', expires_at: '2030-01-01T00:00:00Z', consumed_at: null, decision: null, applied_at: null,
    }] : []) }));
    await page.route(`**/api/v1/projects/${projectId}/runs/*/events`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
    await expect(page.getByTestId('run-status')).toContainText(label);
    if (status === 'needs_input') await expect(page.getByText('This run needs your input.')).toBeVisible();
    if (status === 'waiting_approval') await expect(page.getByText('eeeeeeee-0000-4000-8000-000000000001')).toBeVisible();
    await page.getByRole('tab', { name: 'Prepare documents' }).click();
    await page.getByRole('tab', { name: 'Application answers' }).click();
    await expect(page.getByTestId('run-status')).toContainText(label);
    await page.close();
  }
});

test('unpaired legacy session remains read-only and a newer CV keeps this session bound to its old revision', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: sessionId, project_id: projectId, title: 'Legacy session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: null, job_revision_id: null,
  }) }));
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}/messages`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'f1', session_id: sessionId, role: 'assistant', content: 'Historical read-only note', created_at: '2026-10-01T00:00:00Z' }]) }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByText('Historical read-only note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a paired session' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Evaluate this job' })).toHaveCount(0);
  await page.close();

  const pairedPage = await page.context().newPage();
  await pairedPage.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(pairedPage);
  await pairedPage.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: sessionId, project_id: projectId, title: 'Bound session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: '33333333-3333-4333-8333-333333333333', cv_name: 'Data CV', cv_revision: 1, cv_outdated: true, job_title: 'Synthetic data analyst', job_company: 'Example Co',
  }) }));
  await pairedPage.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'c1', name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', latest_revision: { id: 'c2', revision: 2, created_at: '2026-10-11T00:00:00Z', original_filename: 'Data CV.pdf', mime_type: 'application/pdf', size_bytes: 10 }, revision_count: 2, in_use: true }]) }));
  await pairedPage.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(pairedPage.getByText('Data CV · v1')).toBeVisible();
  await expect(pairedPage.getByText('A newer CV revision is available')).toBeVisible();
  await expect(pairedPage.getByRole('button', { name: 'Start with latest CV' })).toBeVisible();
});

test('SSE reconnect and task switching keep one watcher and issue no new run mutation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const requests: string[] = [];
  const posts: unknown[] = [];
  const running = { id: 'cccccccc-0000-4000-8000-000000000009', project_id: projectId, session_id: sessionId, operation: 'draft_documents', status: 'running', job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null };
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => {
    if (route.request().method() === 'POST') posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([running]) });
  });
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, route => {
    requests.push(route.request().headers()['last-event-id'] ?? '');
    if (requests.length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable' }) });
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ sequence: 1, event_type: 'run_completed', created_at: '2026-10-10T00:01:00Z', data: { approval_id: null, step: null, status: 'completed', artifact_ids: [], message_key: null, progress_percent: null } })}\n\n` });
  });
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...running, status: 'completed', finished_at: '2026-10-10T00:01:00Z' }) }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual(['0', '0']);
  await page.getByRole('tab', { name: 'Prepare documents' }).click();
  await page.getByRole('tab', { name: 'Application answers' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(posts).toEqual([]);
});

test('empty evaluation can start a real evaluate run and partial completed output remains labelled', async ({ browser }) => {
  const emptyPage = await browser.newPage();
  await emptyPage.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(emptyPage);
  let posted: Record<string, unknown> | null = null;
  await emptyPage.route(`**/api/v1/projects/${projectId}/runs`, route => {
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON();
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'cccccccc-0000-4000-8000-000000000008' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await emptyPage.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(emptyPage.getByRole('heading', { name: 'Evaluate this job against your CV' })).toBeVisible();
  await expect(emptyPage.getByRole('button', { name: 'Evaluate this job' })).toHaveCount(1);
  await emptyPage.getByRole('button', { name: 'Evaluate this job' }).click();
  await expect.poll(() => posted).toMatchObject({ session_id: sessionId, operation: 'evaluate_job' });
  await emptyPage.close();

  const partialPage = await browser.newPage();
  await partialPage.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(partialPage);
  const evaluation = { id: 'cccccccc-0000-4000-8000-000000000007', project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: null };
  await partialPage.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([evaluation]) }));
  await partialPage.route(`**/api/v1/projects/${projectId}/documents`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '44444444-4444-4444-8444-444444444444', document_type: 'cover_letter', title: 'Partial cover letter', partial: true, source_run_id: evaluation.id, content_markdown: 'A partial result.', latest_revision: null }]) }));
  await partialPage.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(partialPage.getByText('Partial document')).toBeVisible();
  await expect(partialPage.getByText('A partial result.')).toBeVisible();
  await partialPage.close();
});

const jobRevisionId = '33333333-3333-4333-8333-333333333333';
const documentIdForTest = '44444444-4444-4444-8444-444444444444';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pairedSession = { id: sessionId, project_id: projectId, title: 'Evaluation 014', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobRevisionId, cv_name: 'Data CV', cv_revision: 4, job_title: 'Senior Data Analyst', job_company: 'Northstar' };
const sessionRun = (operation: string, status: string, extra: Record<string, unknown> = {}) => ({ id: `cccccccc-0000-4000-8000-${String(Math.abs([...operation + status].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7)) % 1e12).padStart(12, '0')}`, project_id: projectId, session_id: sessionId, operation, status, job_revision_id: jobRevisionId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null, ...extra });

test('SCR-03 evaluations list: next action names the real state, counts are real, rows stack at 390px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const mk = (id: string, title: string) => ({ ...pairedSession, id, title, job_title: title, job_company: `${title} Co` });
  const ids = ['a1', 'b2', 'c3', 'd4', 'e5'].map(key => `${key}${key}${key}${key}${key}${key}${key}${key}-0000-4000-8000-000000000000`);
  await page.route(`**/api/v1/projects/${projectId}/sessions`, route => route.fulfill(json([mk(ids[0], 'Waiting job'), mk(ids[1], 'Running job'), mk(ids[2], 'Done job'), mk(ids[3], 'Failed job'), { ...mk(ids[4], 'Fresh job'), cv_revision_id: 'c1' }])));
  const run = (index: number, status: string, operation = 'evaluate_job') => ({ ...sessionRun(operation, status), id: `dddddddd-0000-4000-8000-00000000000${index}`, session_id: ids[index] });
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill(json([run(0, 'waiting_approval', 'tailor_cv'), run(1, 'running'), run(2, 'completed'), run(3, 'failed')])));
  await page.route(`**/api/v1/projects/${projectId}/jobs`, route => route.fulfill(json([{ id: jobRevisionId, revision: 3, title: 'x', company: null, created_at: '2026-10-01T00:00:00Z' }])));
  await page.goto(`/app/projects/${projectId}/sessions`);
  const row = (title: string) => page.getByRole('listitem').filter({ hasText: title });
  await expect(row('Waiting job').getByRole('link', { name: 'Review changes' })).toBeVisible();
  await expect(row('Running job').getByRole('link', { name: 'View progress' })).toBeVisible();
  await expect(row('Done job').getByRole('link', { name: 'Open result' })).toBeVisible();
  await expect(row('Failed job').getByRole('link', { name: 'See what failed' })).toBeVisible();
  await expect(row('Fresh job').getByRole('link', { name: 'Evaluate this job' })).toBeVisible();
  await expect(row('Done job').getByText('Data CV · v4')).toBeVisible();
  await expect(row('Done job').getByText('Job posting · version 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All (5)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Waiting for you (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Completed (1)' }).click();
  await expect(row('Done job')).toHaveCount(1);
  await expect(row('Waiting job')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^All/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('SCR-03 evaluations list empty state offers one New evaluation button', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions`, route => route.fulfill(json([])));
  await page.goto(`/app/projects/${projectId}/sessions`);
  await expect(page.getByRole('heading', { name: 'No evaluations yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New evaluation' })).toHaveCount(1);
});

test('SCR-04 exactly one primary action per run state; pending tailor proposals are never listed as documents', async ({ browser }) => {
  const proposal = { kind: 'tailor', mode: 'interactive', coverage_before: 0.4, coverage_after: 0.6, proposals: [{ id: 0, find: '', text: 'Pending Airflow proposal text', evidence_ids: ['f1'], status: 'proposed' }] };
  const evaluation = sessionRun('evaluate_job', 'completed', { evaluation_result: { score: 4.2, report_markdown: 'Strong SQL.', skill_coverage: { matched: ['SQL'], missing: ['dbt'], required: ['SQL', 'dbt'], ratio: 0.5 } } });
  const cases: [string, unknown[], string | null][] = [
    ['no run', [], 'Evaluate this job'],
    ['running', [sessionRun('evaluate_job', 'running')], null],
    ['completed', [evaluation], null],
    ['failed evaluation', [sessionRun('evaluate_job', 'failed')], 'Retry as'],
    ['waiting approval', [sessionRun('draft_documents', 'waiting_approval')], 'Approve'],
    ['tailor needs input', [sessionRun('tailor_cv', 'needs_input', { result_payload: proposal }), evaluation], 'Review proposed CV changes'],
  ];
  for (const [name, runs, label] of cases) {
    const firstId = (runs[0] as { id?: string } | undefined)?.id ?? 'none';
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
    await useSyntheticApplication(page);
    await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill(json(pairedSession)));
    await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill(json(runs)));
    await page.route(`**/api/v1/projects/${projectId}/runs/*/events`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
    await page.route(`**/api/v1/projects/${projectId}/approvals`, route => route.fulfill(json(name === 'waiting approval' ? [{ id: 'dddddddd-0000-4000-8000-000000000001', run_id: firstId, action: 'delete_file', revision_id: null, expected_cv_revision_id: null, target_file_id: 'eeeeeeee-0000-4000-8000-000000000001', target_run_id: null, change_digest: 'd', expires_at: '2030-01-01T00:00:00Z', consumed_at: null, decision: null, applied_at: null }] : [])));
    await page.route(`**/api/v1/projects/${projectId}/documents`, route => route.fulfill(json([{ id: documentIdForTest, document_type: 'cv', title: 'Saved CV copy', partial: false, source_run_id: firstId, content_markdown: 'Saved text', latest_revision: { id: 'r1', revision: 2, created_at: '2026-10-10T00:00:00Z' } }])));
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
    await expect(page.getByRole('heading', { name: 'Agent workflow' }), name).toBeVisible();
    await expect(page.locator('main button.bg-primary:visible, main a.bg-primary:visible'), name).toHaveCount(label ? 1 : 0);
    if (label) await expect(page.locator('main .bg-primary:visible').filter({ hasText: label }), name).toHaveCount(1);
    if (name === 'completed') {
      await expect(page.getByText('4.2')).toBeVisible();
      await expect(page.getByText('Strong fit')).toBeVisible();
      await expect(page.getByText(/Not a hiring prediction/)).toBeVisible();
      await expect(page.getByText('1 of 2')).toBeVisible();
      await page.getByText('Show evidence').click();
      await expect(page.getByText('dbt', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open document' })).toHaveAttribute('href', `/app/projects/${projectId}/documents/${documentIdForTest}`);
    }
    if (name === 'tailor needs input') {
      await expect(page.getByText('Pending Airflow proposal text')).toBeHidden();
      await expect(page.getByRole('link', { name: 'Open document' })).toHaveCount(1);
      await page.getByRole('button', { name: 'Review proposed CV changes' }).click();
      await expect(page.getByText('Pending Airflow proposal text')).toBeVisible();
      await expect(page.locator('main button.bg-primary:visible, main a.bg-primary:visible')).toHaveCount(1);
    }
    await page.close();
  }
});

test('SCR-04 header, language label and rich empty state', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill(json(pairedSession)));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Senior Data Analyst', exact: true })).toBeVisible();
  await expect(page.getByText('Northstar · Evaluation 014')).toBeVisible();
  await expect(page.getByText('Compared using')).toBeVisible();
  await expect(page.getByLabel('Language of generated documents')).toBeVisible();
  await expect(page.getByText('Separate from the app language')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Evaluate this job' })).toHaveCount(1);
  await expect(page.getByText('A written report you can copy')).toBeVisible();
});
