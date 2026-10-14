import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

type Saved = { id: string; name: string; filters: Record<string, unknown>; frequency: 'daily' | 'weekly'; digest_enabled: boolean; push_enabled: boolean; next_run_at: string; last_sent_at: string | null; created_at: string };

async function searchWithSaved(page: Page, status = { email_verified: true, notifications_enabled: true }, webhooks: unknown[] = []) {
  const items: Saved[] = [];
  const posts: unknown[] = [];
  let previews = 0;
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('/facets') ? { total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 0, thai_postings: 0 } : { items: [], total: 0, limit: 20, offset: 0 }) }));
  await page.route(`**/api/v1/projects/${projectId}/webhooks`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(webhooks) }));
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split('/saved-searches/')[1]?.split('/')[0];
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, status }) });
    if (request.method() === 'POST' && url.pathname.endsWith('/preview')) { previews += 1; return route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"sent"}' }); }
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); posts.push(body);
      const row: Saved = { id: `00000000-0000-4000-8000-00000000000${items.length}`, name: body.name, filters: body.filters, frequency: body.frequency, digest_enabled: true, push_enabled: false, next_run_at: '2026-10-15T01:00:00Z', last_sent_at: null, created_at: '2026-10-14T00:00:00Z' };
      items.push(row); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) });
    }
    const row = items.find(item => item.id === id)!;
    if (request.method() === 'PATCH') { Object.assign(row, request.postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) }); }
    items.splice(items.indexOf(row), 1); return route.fulfill({ status: 204, body: '' });
  });
  return { posts, previews: () => previews };
}

test('save, apply, change frequency, toggle email, preview and delete a saved search', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const state = await searchWithSaved(page);
  await page.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote&skills=sql,python`);
  await page.getByRole('button', { name: 'Save this search' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Name').fill('Remote data');
  await page.getByLabel('Weekly').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(state.posts[0]).toEqual({ name: 'Remote data', frequency: 'weekly', filters: { q: 'data', cities: [], work_mode: 'remote', skills: ['sql', 'python'] } });

  await page.goto(`/app/projects/${projectId}/search`);
  await page.getByRole('button', { name: 'Remote data', exact: true }).click();
  await expect(page).toHaveURL(/q=data/);
  await expect(page).toHaveURL(/work_mode=remote/);
  await expect(page).toHaveURL(/skills=sql%2Cpython|skills=sql,python/);

  await page.getByLabel('Digest frequency for Remote data').selectOption('daily');
  const email = page.getByRole('button', { name: 'Email digest for Remote data' });
  await expect(email).toHaveAttribute('aria-pressed', 'true');
  await email.click();
  await expect(email).toHaveAttribute('aria-pressed', 'false');
  await email.click();
  await page.getByRole('button', { name: 'Send a preview of Remote data' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preview sent' })).toBeVisible();
  expect(state.previews()).toBe(1);

  await page.getByRole('button', { name: 'Delete Remote data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByRole('button', { name: 'Remote data', exact: true })).toHaveCount(0);
});

test('gate banners explain why no digest is sent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await searchWithSaved(page, { email_verified: false, notifications_enabled: true });
  await page.goto(`/app/projects/${projectId}/search`);
  await expect(page.getByText('Verify your email to receive digests')).toBeVisible();
});

test('unsubscribe page: success and expired link', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route('**/api/v1/digest/unsubscribe', async route => {
    const ok = route.request().postDataJSON().token === 'good-token-0000000000000000';
    await route.fulfill(ok ? { status: 204, body: '' } : { status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_token', message_key: 'errors.invalid_token', retryable: false }) });
  });
  await page.goto('/digest/unsubscribe?token=good-token-0000000000000000');
  await page.getByRole('button', { name: 'Stop this digest' }).click();
  await expect(page.getByText('You will no longer get this digest.')).toBeVisible();
  await page.goto('/digest/unsubscribe?token=bad');
  await page.getByRole('button', { name: 'Stop this digest' }).click();
  await expect(page.getByText('This link has expired.')).toBeVisible();
});

test('search with panel and the unsubscribe page fit 320px in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await searchWithSaved(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/search?q=${encodeURIComponent('วิศวกรข้อมูลอาวุโสสำหรับทีมแพลตฟอร์มวิเคราะห์ข้อมูล')}`);
  await page.getByRole('button', { name: 'บันทึกการค้นหานี้' }).click();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'การค้นหาที่บันทึกไว้' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/digest/unsubscribe?token=x');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('posted_within_days alone cannot be saved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await searchWithSaved(page);
  await page.goto(`/app/projects/${projectId}/search?posted_within_days=7`);
  await expect(page.getByRole('button', { name: 'Save this search' })).toBeDisabled();
});

async function saveOne(page: Page) {
  await page.goto(`/app/projects/${projectId}/search?q=data`);
  await page.getByRole('button', { name: 'Save this search' }).click();
  await page.getByLabel('Name').fill('Push me');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('push toggle is enabled only with a digest.ready webhook', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await searchWithSaved(page, undefined, [{ id: 'h1', url: 'https://hooks.example.test/jsp', events: ['digest.ready'], enabled: true, created_at: '2026-10-14T00:00:00Z' }]);
  await saveOne(page);
  const push = page.getByRole('button', { name: 'Push digest for Push me' });
  await expect(push).toBeEnabled();
  await expect(push).toHaveAttribute('aria-pressed', 'false');
  await push.click();
  await expect(push).toHaveAttribute('aria-pressed', 'true');
});

test('push toggle is disabled without a digest.ready webhook', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await searchWithSaved(page);
  await saveOne(page);
  await expect(page.getByRole('button', { name: 'Push digest for Push me' })).toBeDisabled();
});
