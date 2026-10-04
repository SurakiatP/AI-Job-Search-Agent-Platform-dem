import { expect, test } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from '../fixtures/application';

test('owner application status survives errors, reload, and browser history', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  let savedStatus: 'saved' | 'applied' = 'saved';
  let failNextSave = true;

  await page.route(`**/api/v1/projects/${projectId}/jobs`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: jobId,
        revision: 1,
        created_at: '2026-10-01T00:00:00Z',
        title: 'Synthetic data analyst',
        company: 'Example Co',
        source_url: 'https://jobs.example.test/analyst',
        description: 'Synthetic posting description.',
        application_status: savedStatus,
      }]),
    });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    if (failNextSave) {
      failNextSave = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    savedStatus = route.request().postDataJSON().application_status;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_revision_id: jobId, application_status: savedStatus }),
    });
  });

  await page.goto(`/app/projects/${projectId}/jobs`);
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.getByRole('button', { name: 'Mark as applied' }).click();
  await expect(page.getByRole('alert')).toContainText('could not save this status');
  await expect(page.getByRole('status').first()).toHaveText('Saved');

  await page.getByRole('button', { name: 'Mark as applied' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Marked as applied');
  await page.getByRole('link', { name: 'Synthetic data analyst' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Marked as applied');

  await page.goBack();
  await expect(page.getByRole('status').first()).toHaveText('Marked as applied');
  await page.reload();
  await expect(page.getByRole('status').first()).toHaveText('Marked as applied');
  await page.goForward();
  await expect(page.getByRole('status').first()).toHaveText('Marked as applied');
});
