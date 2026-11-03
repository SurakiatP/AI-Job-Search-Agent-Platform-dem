import { expect, test } from '@playwright/test';
import { projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }, info) => {
  const matrix = info.title.match(/(th|en) (light|dark)$/);
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale: matrix?.[1] ?? 'en', theme: matrix?.[2] ?? 'light' });
});

test('settings navigation carries explicit project scope through section changes', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${secondProjectId}/overview`);
  await page.getByRole('navigation', { name: 'Navigation', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`/app/settings?project=${secondProjectId}`);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('#settings-project')).toHaveValue(secondProjectId);
  expect(new URL(page.url()).searchParams.get('project')).toBe(secondProjectId);
  await page.getByRole('button', { name: 'Project sharing', exact: true }).click();
  await expect(page.locator('#settings-project')).toHaveValue(secondProjectId);
});
