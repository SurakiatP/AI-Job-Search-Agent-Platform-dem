import { expect, test } from '@playwright/test';
import { projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }, info) => {
  const matrix = info.title.match(/(th|en) (light|dark)$/);
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale: matrix?.[1] ?? 'en', theme: matrix?.[2] ?? 'light' });
});

test('CV summary uses named primary CV rather than highest unrelated revision', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ json: [
    { id: 'primary', name: 'Product CV', is_primary: true, latest_revision: { id: 'p3', revision: 3, original_filename: 'product.pdf', skill_profile_ready: true, created_at: '2026-10-15T00:00:00Z' } },
    { id: 'other', name: 'Other CV', is_primary: false, latest_revision: { id: 'o99', revision: 99, original_filename: 'other.pdf', created_at: '2026-10-16T00:00:00Z' } },
  ] }));
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('main').getByText('Product CV', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('other.pdf', { exact: true })).toHaveCount(0);
});
