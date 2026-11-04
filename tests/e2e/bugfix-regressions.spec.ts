import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';
import { builderApi, cvId } from '../fixtures/builder';

test('builder keeps a space typed before the autosave, though the server trims it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page, { trimPut: true });
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  const headline = page.getByLabel('Headline');
  await headline.pressSequentially('Data ', { delay: 20 });
  await expect.poll(() => state.puts.length).toBe(1); // the save ran while the trailing space was there
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
  await headline.pressSequentially('Analyst', { delay: 20 });
  await expect(headline).toHaveValue('Data Analyst');
  await expect.poll(() => state.draft.resume_data.basics.headline).toBe('Data Analyst');
});

test('signing out sends the next login to the start page, not the last page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route('**/v1/auth/logout', route => route.fulfill({ status: 204, body: '' }));
  await page.goto(`/app/account`);
  await page.getByRole('main').getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a CV with no builder draft explains it and links back instead of offering a retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs/${cvId}/draft`, route => route.fulfill({ status: 404, json: { code: 'not_found', message_key: 'errors.not_found', retryable: false } }));
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await expect(page.getByRole('heading', { name: 'This CV has no builder draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'CV & experience' })).toHaveAttribute('href', `/app/projects/${projectId}/profile`);
});
