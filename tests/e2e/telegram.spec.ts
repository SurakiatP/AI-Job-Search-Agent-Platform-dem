import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const saved = { id: '00000000-0000-4000-8000-000000000000', name: 'Remote data', filters: { q: 'data' }, frequency: 'daily', digest_enabled: true, push_enabled: false, telegram_enabled: false, next_run_at: '2026-10-15T01:00:00Z', last_sent_at: null, created_at: '2026-10-14T00:00:00Z' };

async function telegram(page: Page, initial: { enabled: boolean; linked: boolean }) {
  const status = { ...initial, bot_username: initial.enabled ? 'jsp_bot' : null, linked_at: null as string | null };
  const calls = { link: 0, del: 0, patches: [] as unknown[] };
  await useSyntheticApplication(page);
  await page.addInitScript(() => { localStorage.setItem('ui.locale', 'en'); (window as unknown as { opened: unknown[] }).opened = []; window.open = ((url: string, target: string, features: string) => { (window as unknown as { opened: unknown[] }).opened.push([url, target, features]); return null; }) as typeof window.open; });
  await page.route('**/api/v1/account/telegram/link', route => { calls.link += 1; return route.fulfill(json(200, { url: 'https://t.me/jsp_bot?start=abc', expires_at: '2026-10-15T01:10:00Z' })); });
  await page.route('**/api/v1/account/telegram', route => {
    if (route.request().method() === 'DELETE') { calls.del += 1; status.linked = false; return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill(json(200, status));
  });
  await page.route(`**/api/v1/projects/${projectId}/webhooks**`, route => route.fulfill(json(200, [])));
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => route.fulfill(json(200, route.request().url().includes('/facets') ? { total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 0, thai_postings: 0 } : { items: [], total: 0, limit: 20, offset: 0 })));
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => {
    if (route.request().method() === 'PATCH') { calls.patches.push(route.request().postDataJSON()); return route.fulfill(json(409, { code: 'telegram_not_linked', message_key: 'errors.telegram_not_linked', retryable: false })); }
    return route.fulfill(json(200, { items: [saved], status: { email_verified: true, notifications_enabled: true } }));
  });
  return { status, calls };
}

test('telegram card is hidden when the bot is not configured', async ({ page }) => {
  await telegram(page, { enabled: false, linked: false });
  await page.goto('/app/settings?section=webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Telegram' })).toHaveCount(0);
});

test('connect opens the bot link then flips to connected after polling; disconnect unlinks', async ({ page }) => {
  const state = await telegram(page, { enabled: true, linked: false });
  await page.goto('/app/settings?section=webhooks');
  await page.getByRole('button', { name: 'Connect Telegram' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Waiting for you' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { opened: unknown[] }).opened)).toEqual([['https://t.me/jsp_bot?start=abc', '_blank', 'noopener,noreferrer']]);
  state.status.linked = true;
  await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Connect Telegram' })).toBeVisible();
  expect(state.calls.del).toBe(1);
});

test('telegram switch is disabled with a hint until Telegram is linked', async ({ page }) => {
  await telegram(page, { enabled: true, linked: false });
  await page.goto(`/app/projects/${projectId}/search`);
  const toggle = page.getByRole('button', { name: 'Telegram digest for Remote data' });
  await expect(toggle).toBeDisabled();
  await expect(page.getByText('Connect Telegram in Settings first.')).toBeVisible();
});

test('telegram_not_linked conflict shows an error', async ({ page }) => {
  const state = await telegram(page, { enabled: true, linked: true });
  await page.goto(`/app/projects/${projectId}/search`);
  await page.getByRole('button', { name: 'Telegram digest for Remote data' }).click();
  await expect(page.getByRole('alert')).toContainText('Connect Telegram in Settings first.');
  expect(state.calls.patches).toEqual([{ telegram_enabled: true }]);
});
