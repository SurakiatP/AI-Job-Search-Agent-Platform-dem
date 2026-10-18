import { expect, test } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const running = { id: 'cccccccc-0000-4000-8000-000000000009', project_id: projectId, session_id: sessionId, operation: 'draft_documents', status: 'running', job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null };

test('a running run shows a turning ring, what it is doing, and a moving bar; nothing is announced twice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([running]) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, () => new Promise(() => undefined)); // stays open: work never finishes in this test
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  const note = page.getByText(/^Working on:/);
  await expect(note).toBeVisible();
  await expect(page.getByText('This page updates by itself as work progresses, no need to refresh')).toBeVisible();
  await expect(page.locator('.busy-bar:visible')).toHaveCount(1); // the small-screen banner is hidden on desktop
  await expect(page.locator('svg.animate-spin:visible').first()).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveText('Running');
});

test('queued CV experience extraction shows the working row with its elapsed wait', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  const cv = { id: '77777777-7777-4777-8777-777777777777', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: null };
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cv]) }));
  await page.route(`**/api/v1/projects/${projectId}/experience**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], provider_configured: true, extraction: { run_id: 'r1', status: 'queued', cv_id: cv.id, summary: null } }) }));
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  await expect(page.getByText('รอคิวดึงประสบการณ์จาก CV').first()).toBeVisible();
  await expect(page.locator('.busy-bar').first()).toBeVisible();
  await expect(page.getByText(/รอมา \d+ วินาที/)).toBeVisible({ timeout: 8000 });
});

test('reduced motion keeps the label and stills the ring and bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([running]) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, () => new Promise(() => undefined));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByText(/^Working on:/)).toBeVisible();
  const names = await page.locator('svg.animate-spin:visible').first().evaluate(el => getComputedStyle(el).animationName);
  expect(names).toBe('none');
  expect(await page.locator('.busy-bar:visible').evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none');
});
