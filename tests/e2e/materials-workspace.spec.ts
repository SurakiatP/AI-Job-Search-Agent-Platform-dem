import { expect, test } from '@playwright/test';
import { documentId, projectId, useMaterialsFixture } from '../fixtures/materials';

test('CV workspace keeps named identity, primary selection, rename and preferences linked to the right records', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const fixture = await useMaterialsFixture(page);
  await page.goto(`/app/projects/${projectId}/profile`);

  await expect(page.getByRole('heading', { name: 'Senior Data Analyst', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Product Analytics', exact: true })).toBeVisible();
  await expect(page.getByText('Primary', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Product Analytics' }).click();
  await expect(page.getByRole('menuitem', { name: /Make primary/ })).toContainText('Existing evaluations keep the CV they started with');
  await page.getByRole('menuitem', { name: /Make primary/ }).click();
  await expect(page.getByRole('heading', { name: 'Product Analytics', exact: true }).locator('..')).toContainText('Primary');
  expect(fixture.mutations).toContainEqual({ method: 'PATCH', path: `/projects/${projectId}/cvs/${fixture.cvIds.product}`, body: { is_primary: true } });

  await page.getByRole('button', { name: 'Options for Product Analytics' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('CV name').fill('Product Insights');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Product Insights' })).toBeVisible();
  expect(fixture.mutations).toContainEqual({ method: 'PATCH', path: `/projects/${projectId}/cvs/${fixture.cvIds.product}`, body: { name: 'Product Insights' } });

  await expect(page.getByLabel('Document language')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Document language & notifications are in Settings' })).toHaveAttribute('href', `/app/settings?project=${projectId}&section=preferences`);
  await expect(page.getByText('existing evaluations keep their original CV version')).toBeVisible();
});

test('document revision selector shows that revision and its own source CV revision', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useMaterialsFixture(page);
  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);

  await expect(page.getByTestId('document-content')).toContainText('Current revision: led the migration to dbt.');
  await expect(page.getByRole('heading', { level: 1 }).locator('..').locator('p')).toHaveCount(0);
  await page.getByLabel('Version').selectOption('33333333-aaaa-4333-8333-333333333333');
  await expect(page.getByTestId('document-content')).toContainText('Earlier revision: prepared weekly product reports.');
  await expect(page.getByTestId('historical-banner')).toContainText('version 3');
  await expect(page.getByTestId('source-cv-revision-3')).toContainText('4');
  await expect(page.getByTestId('source-cv-revision-8')).toContainText('9');
  await expect(page.getByRole('link', { name: 'Job posting' })).toHaveAttribute('href', `/app/projects/${projectId}/jobs/88888888-aaaa-4888-8888-888888888888`);
  await expect(page.getByRole('link', { name: 'Download document' })).toHaveCount(1);
});

test('first CV upload is the clear next action and creates a named CV', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const fixture = await useMaterialsFixture(page, { emptyCvs: true });
  await page.goto(`/app/projects/${projectId}/profile`);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload your first CV' }).click();
  await (await chooser).setFiles({ name: 'research-cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic CV evidence') });
  await expect(page.getByRole('heading', { name: 'research-cv', exact: true })).toBeVisible();
  expect(fixture.mutations).toContainEqual({ method: 'POST', path: `/projects/${projectId}/cvs` });
});
