import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('actual owner API persists project, CV, posting and an evaluation session through reload', async ({ page }) => {
  test.setTimeout(120000);
  test.skip(!process.env.JSP_E2E_SESSION_FILE, 'requires isolated real backend launcher fixture');
  const launch = JSON.parse(await readFile(process.env.JSP_E2E_SESSION_FILE!, 'utf8'));
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  // The launcher hands over a real owner session; the app restores it through POST /auth/session.
  await page.context().addCookies([{ name: 'jsp_owner_session', value: launch.cookie, url: process.env.JSP_E2E_BASE_URL! }]);
  await page.goto('/app/projects/new');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Synthetic actual browser project');
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects\/[^/]+\/overview$/);
  const projectId = new URL(page.url()).pathname.split('/')[3];
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByLabel('Add CV', { exact: true }).setInputFiles({ name: 'synthetic-cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Candidate\nData analyst. SQL and Python, three years. Bangkok.') });
  await expect(page.getByRole('main')).toContainText('synthetic-cv', { timeout: 60000 });
  await page.goto(`/app/projects/${projectId}/applications`);
  await page.getByRole('button', { name: 'Add posting' }).click();
  await page.getByLabel('Job title').fill('Synthetic Bangkok analyst');
  await page.getByLabel('Job description').fill('Synthetic role: Python, SQL and analysis in Bangkok.');
  await page.getByRole('button', { name: 'Save posting' }).click();
  await page.getByRole('link', { name: 'Synthetic Bangkok analyst', exact: true }).click();
  await expect(page.getByTestId('job-description')).toContainText('Python, SQL and analysis in Bangkok.');
  await page.goto(`/app/projects/${projectId}/sessions`);
  await page.getByRole('button', { name: 'New evaluation' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/[^/]+$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Bangkok analyst');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Bangkok analyst');
  expect(new URL(page.url()).hash).toBe('');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain('Synthetic Candidate');
  expect(stored).not.toContain(launch.cookie);
  expect(stored).not.toContain(launch.csrf);
  expect(page.url()).not.toContain(launch.cookie);
});
