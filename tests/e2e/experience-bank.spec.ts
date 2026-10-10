import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const cv = { id: '77777777-7777-4777-8777-777777777777', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: null };
type Item = { id: string; kind: string; text: string; role: string | null; organization: string | null; period: string | null; source: 'cv' | 'owner'; source_cv_id: string | null; source_cv_name: string | null; created_at: string };

async function bank(page: import('@playwright/test').Page, state: { items: Item[]; extraction: unknown; provider_configured: boolean }) {
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cv]) }));
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
