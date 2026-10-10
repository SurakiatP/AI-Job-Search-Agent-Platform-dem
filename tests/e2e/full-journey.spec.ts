import { expect, test } from '@playwright/test';
import { documentId, jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generatedDocument = {
  id: documentId,
  document_type: 'cover_letter' as const,
  title: 'Synthetic English cover letter',
  latest_revision: { id: '77777777-7777-4777-8777-777777777777', revision: 2, created_at: '2026-10-04T00:00:00Z' },
  content_markdown: 'Synthetic English draft for review.',
  output_language: 'en' as const,
  source_run_id: runId,
  partial: true,
};

test('synthetic Thai and English journey keeps drafts, output language, and routes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);

  await page.route(`**/api/v1/projects/${projectId}/cv`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '66666666-6666-4666-8666-666666666666', revision: 1 }]) });
      return;
    }
    await route.fallback();
  });

  let submittedRun: Record<string, unknown> | null = null;
  const completedRun = {
    id: runId,
    project_id: projectId,
    session_id: sessionId,
    operation: 'evaluate_job',
    status: 'completed',
    job_revision_id: jobId,
    output_language: 'en',
    result_file_ids: [],
    created_at: '2026-10-04T00:00:00Z',
    finished_at: '2026-10-04T00:01:00Z',
    retry_of_id: null,
    evaluation_result: { report_markdown: 'Synthetic evaluation fixture.', score: 82 },
  };
  await page.route(`**/api/v1/projects/${projectId}/runs`, async route => {
    if (route.request().method() === 'POST') {
      submittedRun = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(completedRun) });
      return;
    }
    if (route.request().method() === 'GET' && submittedRun) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([completedRun]) });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/v1/projects/${projectId}/documents`, async route => {
    if (route.request().method() === 'GET' && submittedRun) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([generatedDocument]) });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));

  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('link', { name: 'New project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Synthetic bilingual project');
  await page.getByRole('textbox', { name: 'What are you looking for?' }).fill('Thai and English data analyst roles');
  await page.getByRole('button', { name: 'Create a project' }).click();
  await expect(page.getByRole('heading', { name: 'Profile and CV' })).toBeVisible();
  await page.getByRole('textbox', { name: 'CV text' }).fill('Synthetic CV: data analysis and reporting experience.');
  await page.getByLabel('Document language').selectOption('en');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Save preferences' }).click();

  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Saved jobs', exact: true }).click();
  await page.getByRole('link', { name: 'Synthetic data analyst' }).click();
  await expect(page.getByTestId('job-description')).toContainText('Synthetic posting description.');
  await page.goBack();
  await expect(page).toHaveURL(`/app/projects/${projectId}/jobs`);

  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'First synthetic session', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Instructions for this task (used for evaluation or drafting)' });
  await composer.fill('Please evaluate this supplied synthetic posting.');
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Saved jobs', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'First synthetic session', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Instructions for this task (used for evaluation or drafting)' })).toHaveValue('Please evaluate this supplied synthetic posting.');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'คำแนะนำสำหรับงานนี้ (ใช้ในการประเมินหรือร่างเอกสาร)' })).toHaveValue('Please evaluate this supplied synthetic posting.');
  await page.getByLabel('ภาษาผลลัพธ์').selectOption('en');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Completed');
  expect(submittedRun).toMatchObject({
    session_id: sessionId,
    operation: 'evaluate_job',
    job_revision_id: jobId,
    output_language: 'en',
  });

  await page.getByRole('link', { name: 'Synthetic English cover letter' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic English cover letter' })).toBeVisible();
  await expect(page.getByTestId('document-language')).toContainText('English');
  await expect(page.getByRole('status')).toHaveText('Partial document');
  await expect(page.getByTestId('document-content')).toHaveText('Synthetic English draft for review.');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByTestId('document-language')).toContainText('English');
  await expect(page.getByTestId('document-content')).toHaveText('Synthetic English draft for review.');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goto('/app/settings');
  await page.getByRole('tab', { name: 'ลักษณะที่แสดง' }).click();
  await page.getByRole('button', { name: 'มืด' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByTestId('run-status')).toHaveText('เสร็จแล้ว');
});

test('synthetic upload and transport faults stay explicit without false completion', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/profile`);

  let uploadRequests = 0;
  await page.route(`**/api/v1/projects/${projectId}/cv`, async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'scanned_pdf_unsupported', message_key: 'errors.scanned_pdf_unsupported', retryable: false, correlation_id: '55555555-5555-4555-8555-555555555555' }),
      });
      return;
    }
    await route.fallback();
  });
  page.on('request', request => {
    if (request.url().endsWith(`/api/v1/projects/${projectId}/cv`) && request.method() === 'POST') uploadRequests += 1;
  });
  await page.getByLabel('Upload a CV file').setInputFiles({
    name: 'synthetic-scan-only.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 synthetic scanned-only fixture'),
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/scan|OCR|text/i);
  expect(uploadRequests).toBe(1);

  await page.unrouteAll();
  await useSyntheticApplication(page, { unsafeJobSource: true });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic data analyst' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open source posting' })).toHaveCount(0);
  await expect(page.getByTestId('job-description')).toHaveText('Synthetic posting description.');
});

test('expired approval is visible but cannot be approved from a stale request', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const pendingRun = {
    id: runId,
    project_id: projectId,
    session_id: sessionId,
    operation: 'draft_documents',
    status: 'waiting_approval',
    job_revision_id: jobId,
    output_language: 'en',
    result_file_ids: [],
    created_at: '2026-10-04T00:00:00Z',
    finished_at: null,
    retry_of_id: null,
    evaluation_result: null,
  };
  let submitted = false;
  await page.route(`**/api/v1/projects/${projectId}/cv`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '66666666-6666-4666-8666-666666666666', revision: 1 }]) });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/v1/projects/${projectId}/runs`, async route => {
    if (route.request().method() === 'POST') {
      submitted = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(pendingRun) });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(submitted ? [pendingRun] : []) });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/v1/projects/${projectId}/approvals`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', run_id: runId, action: 'promote_cv', revision_id: null, expected_cv_revision_id: null, target_file_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', change_digest: 'synthetic-expired-request', expires_at: '2020-01-01T00:00:00Z', consumed_at: null, decision: null, applied_at: null }]),
      });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/v1/projects/${projectId}/runs/${runId}/events`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));

  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('textbox', { name: 'Instructions for this task (used for evaluation or drafting)' }).fill('Draft synthetic application materials.');
  await page.getByLabel('Requested work').selectOption('draft_documents');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Waiting for approval');
  await expect(page.getByText('This request has expired', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh status' })).toBeVisible();
});

test('synthetic unavailable owner session is routed to the local launcher message', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.route('**/api/v1/owner/session', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'unauthorized', message_key: 'errors.unauthorized', retryable: false, correlation_id: '55555555-5555-4555-8555-555555555555' }),
  }));
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Open the app from the local launcher' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByText('errors.unauthorized')).toHaveCount(0);
});
