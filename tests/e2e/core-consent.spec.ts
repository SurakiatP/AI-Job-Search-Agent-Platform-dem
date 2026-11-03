import { expect, test } from '@playwright/test';
import { useAccessFixture } from '../fixtures/access-surfaces';
import { projectId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }, info) => {
  const matrix = info.title.match(/(th|en) (light|dark)$/);
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale: matrix?.[1] ?? 'en', theme: matrix?.[2] ?? 'light' });
});

test('consent groups permissions, keeps Allow off until one is chosen and summarises the decision live', async ({ page }) => {
  await useSyntheticApplication(page);
  const view = { client_name: 'Synthetic Client', client_id_host: 'client.example.test', redirect_uri: 'http://127.0.0.1:33418/callback', requested_scopes: ['results:read', 'documents:draft'], projects: [{ id: projectId, name: 'Synthetic project' }], expires_at: '2099-01-01T00:00:00Z' };
  await page.route('**/v1/oauth/requests/**', route => route.fulfill({ json: view }));
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/oauth/consent?request=h');
  const allow = page.getByRole('button', { name: 'Allow', exact: true });
  const summary = page.getByText(/Synthetic Client can/);
  await expect(page.getByRole('heading', { name: 'Read', exact: true })).toBeVisible();
  await expect(page.getByText('Act for you', { exact: true })).toBeVisible();
  await expect(page.getByText('Can change your data').first()).toBeVisible();
  await expect(summary).toContainText('read results and draft documents in Synthetic project for 30 days');
  await expect(allow).toBeEnabled();
  await expect(allow).toBeInViewport();
  await expect(summary).toBeInViewport();
  await page.getByLabel(/Read generated results/).uncheck();
  await page.getByLabel(/Draft application documents/).uncheck();
  await expect(allow).toBeDisabled();
  await expect(page.getByText('Select at least one permission to continue.')).toBeVisible();
  await page.getByLabel(/Search job postings/).check();
  await page.getByLabel('Access lasts').selectOption('90');
  await expect(summary).toContainText('search jobs in Synthetic project for 90 days');
  await expect(allow).toBeEnabled();
});

test('expired consent preserves a page heading and a safe next step', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto('/app/oauth/consent');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('link', { name: 'All projects', exact: true })).toHaveAttribute('href', '/app/projects');
});
