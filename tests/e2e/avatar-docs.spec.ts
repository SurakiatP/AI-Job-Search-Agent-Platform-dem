import { expect, test } from '@playwright/test';
import { useSyntheticApplication } from '../fixtures/application';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('landing: Docs link sits left of Open app and the account picture sits right of it, linking to Account', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto('/');
  const banner = page.getByRole('banner');
  const docs = banner.getByRole('link', { name: 'Docs', exact: true }), open = banner.getByRole('link', { name: 'Open app', exact: true });
  const account = banner.getByRole('link', { name: /^Account: synthetic@example\.test/ });
  const [d, o, a] = await Promise.all([docs.boundingBox(), open.boundingBox(), account.boundingBox()]);
  expect(d!.x).toBeLessThan(o!.x);
  expect(a!.x).toBeGreaterThan(o!.x);
  await expect(docs).toHaveAttribute('href', '/docs');
  await expect(account.getByText('S', { exact: true })).toBeVisible(); // first letter of the email until a picture is chosen
  await account.click();
  await expect(page).toHaveURL(/\/app\/account$/);
});

test('docs outline page opens from the landing page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'คู่มือ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'คู่มือการใช้งาน', level: 1 })).toBeVisible();
  await expect(page.getByText('เร็ว ๆ นี้')).toHaveCount(6);
});

test('account: upload, choose a built-in picture, remove; bad type and size are refused before any request', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = { preset: null as string | null, image: false, version: null as string | null, puts: 0 };
  const user = () => ({ id: '99999999-0000-4000-8000-000000000001', email: 'synthetic@example.test', locale: 'en', email_verified: true, avatar_preset: state.preset, has_avatar_image: state.image, avatar_version: state.version, created_at: '2026-10-01T00:00:00Z' });
  await page.route('**/api/v1/auth/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrf_token: 'c', expires_at: '2030-01-01T00:00:00Z', user: user() }) }));
  await page.route('**/api/v1/account/agents', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/account/avatar', r => {
    const m = r.request().method();
    if (m === 'PUT') { state.puts += 1; state.image = true; state.preset = null; state.version = 'v' + state.puts; return r.fulfill({ status: 204 }); }
    if (m === 'DELETE') { state.image = false; return r.fulfill({ status: 204 }); }
    return r.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
  await page.route('**/api/v1/account/avatar-preset', r => { state.preset = r.request().postDataJSON().preset; state.image = false; return r.fulfill({ status: 204 }); });
  await page.goto('/app/account');
  const picture = page.getByRole('heading', { name: 'Profile picture' });
  await expect(picture).toBeVisible();
  const input = page.getByLabel('Upload a picture');
  await input.setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByRole('alert')).toHaveText('Only PNG, JPEG or WebP can be used.');
  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(262_145) });
  await expect(page.getByRole('alert')).toHaveText('That file is over 256 KB. Make it smaller first.');
  expect(state.puts).toBe(0);
  await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('status').filter({ hasText: 'Picture saved' })).toBeVisible();
  expect(state.puts).toBe(1);
  await expect(page.getByRole('link', { name: 'Account', exact: true }).locator('img, svg').first()).toBeVisible();
  await page.getByText('Spark', { exact: true }).click();
  await expect.poll(() => state.preset).toBe('spark');
  await expect(page.getByLabel('Spark')).toBeChecked();
  await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Remove uploaded picture' }).click();
  await expect.poll(() => state.image).toBe(false);
});

test('landing menu: Features picks its tour tab, other links reach their sections and Docs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  await nav.getByRole('button', { name: 'Features' }).click();
  await page.getByRole('menuitem', { name: /Evaluate/ }).or(page.getByRole('menuitem').nth(2)).first().click();
  await expect(page.getByRole('tab', { name: /^(Evaluate|ประเมิน)/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#how')).toBeInViewport();
  await nav.getByRole('link', { name: 'Data & connections' }).click();
  await expect(page.locator('#data')).toBeInViewport();
  await nav.getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { name: 'User guide', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start in 3 steps' })).toBeVisible();
});

test('landing menu collapses into one Menu button on a phone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
