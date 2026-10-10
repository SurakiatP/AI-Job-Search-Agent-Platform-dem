import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

type Cv = { id: string; name: string; is_primary: boolean; in_use: boolean; revision_count: number; latest_revision: Record<string, unknown> | null };
const cv: Cv = { id: '77777777-7777-4777-8777-777777777777', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: null };
const revision = (id: string, n: number) => ({ id, revision: n, created_at: '2026-10-10T00:00:00Z', original_filename: 'cv.txt', mime_type: 'text/plain', size_bytes: 2048, file_id: null });
type Item = { id: string; kind: string; text: string; role: string | null; organization: string | null; period: string | null; source: 'cv' | 'owner'; source_cv_id: string | null; source_cv_name: string | null; created_at: string };

async function bank(page: import('@playwright/test').Page, state: { items: Item[]; extraction: unknown; provider_configured: boolean }, cvs: Cv[] = [cv]) {
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cvs) }));
  await page.route(`**/api/v1/projects/${projectId}/experience**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      const item: Item = { id: `i${state.items.length + 1}`, role: null, organization: null, period: null, ...body, source: 'owner', source_cv_id: null, source_cv_name: null, created_at: '2026-10-10T00:00:00Z' };
      state.items.push(item);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(item) });
    }
    if (request.method() === 'DELETE') {
      state.items = state.items.filter(item => !url.pathname.endsWith(item.id));
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
}

const fact = (id: string, text: string): Item => ({ id, kind: 'experience', text, role: 'Data Engineer', organization: 'SCB', period: '2022–2024', source: 'cv', source_cv_id: cv.id, source_cv_name: 'Data CV', created_at: '2026-10-10T00:00:00Z' });

test('experience bank groups facts, adds and removes, and shows extraction results', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [fact('a', 'Built Airflow pipelines'), fact('b', 'Ran BigQuery')], provider_configured: true,
    extraction: { run_id: 'r1', status: 'completed', cv_id: cv.id, summary: { added: 2, duplicates: 1, rejected: 1 } } });
  await page.goto(`/app/projects/${projectId}/profile`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('heading', { name: 'Data Engineer · SCB · 2022–2024' })).toBeVisible();
  await expect(section.getByText('From CV: Data CV').first()).toBeVisible();
  await expect(section.getByRole('status')).toContainText('Added 2, duplicates 1, dropped 1');
  await section.getByLabel('Fact').fill('Python');
  await section.getByLabel('Type').selectOption('skill');
  await section.getByRole('button', { name: 'Add fact' }).click();
  await expect(section.getByText('Python')).toBeVisible();
  await section.getByRole('button', { name: 'Remove: Ran BigQuery' }).click();
  await expect(section.getByText('Ran BigQuery')).toHaveCount(0);
});

test('experience bank empty states and Thai at 320px', async ({ page }) => {
  await useSyntheticApplication(page);
  await bank(page, { items: [], extraction: null, provider_configured: false });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/profile`);
  const section = page.getByRole('region', { name: 'คลังประสบการณ์' });
  await expect(section.getByRole('link', { name: 'ไปที่การตั้งค่า' })).toHaveAttribute('href', '/app/settings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a new CV version refreshes the bank to the queued extraction', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const current: Cv = { ...cv, latest_revision: revision('r1', 1) };
  const state = { items: [] as Item[], extraction: null as unknown, provider_configured: true };
  await bank(page, state, [current]);
  await page.route(`**/api/v1/projects/${projectId}/cvs/${cv.id}/revisions`, route => {
    current.latest_revision = revision('r2', 2);
    current.revision_count = 2;
    state.extraction = { run_id: 'r-upload', status: 'queued', cv_id: cv.id, summary: null };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(current.latest_revision) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('button', { name: 'Extract experience', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('button', { hasText: 'Upload new version' }).click();
  await (await chooser).setFiles({ name: 'cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic CV') });
  await expect(section.getByRole('status')).toContainText('Waiting to extract experience from your CV');
});

test('each CV card can start an extraction for that CV', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const other: Cv = { id: '88888888-8888-4888-8888-888888888888', name: 'Older CV', is_primary: false, in_use: false, revision_count: 1, latest_revision: revision('r9', 1) };
  const state = { items: [] as Item[], extraction: { run_id: 'r0', status: 'completed', cv_id: cv.id, summary: { added: 0, duplicates: 0, rejected: 0 } } as unknown, provider_configured: true };
  await bank(page, state, [{ ...cv, latest_revision: revision('r1', 1) }, other]);
  await page.route(`**/api/v1/projects/${projectId}/cvs/*/experience-runs`, route => {
    state.extraction = { run_id: 'r-other', status: 'queued', cv_id: other.id, summary: null };
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'r-other', status: 'queued' }) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('button', { name: 'Extract from CV again' })).toBeVisible();
  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith(`/cvs/${other.id}/experience-runs`));
  await page.getByRole('button', { name: 'Extract experience: Older CV' }).click();
  await request;
  await expect(section.getByRole('status')).toContainText('Waiting to extract experience from your CV');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a failed bank load offers a retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [fact('a', 'Ran BigQuery')], extraction: null, provider_configured: true });
  let failures = 1;
  await page.route(`**/api/v1/projects/${projectId}/experience`, route => failures-- > 0
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error' } }) })
    : route.fallback());
  await page.goto(`/app/projects/${projectId}/profile`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('alert')).toContainText('Could not load the experience bank');
  await section.getByRole('button', { name: 'Retry' }).click();
  await expect(section.getByText('Ran BigQuery')).toBeVisible();
});
