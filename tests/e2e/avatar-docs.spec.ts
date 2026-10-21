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
  expect(Math.abs(a!.y + a!.height / 2 - (o!.y + o!.height / 2))).toBeLessThan(2); // the picture sits on the same line as the button, not floating above it
  await expect(docs).toHaveAttribute('href', '/docs');
  await expect(account.getByText('S', { exact: true })).toBeVisible(); // first letter of the email until a picture is chosen
  await account.click();
  await expect(page).toHaveURL(/\/app\/account$/);
});

test('docs page opens from the landing page and every topic is a link', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'คู่มือ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'คู่มือการใช้งาน', level: 1 })).toBeVisible();
  await expect(page.getByText('เร็ว ๆ นี้')).toHaveCount(0);
  await expect(page.locator('main ul a[href^="/docs/"]')).toHaveCount(9);
});

test('account: upload, choose a built-in picture, remove; bad type and size are refused before any request', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = { preset: null as string | null, image: false, version: null as string | null, puts: 0 };
  const user = () => ({ id: '99999999-0000-4000-8000-000000000001', email: 'synthetic@example.test', locale: 'en', email_verified: true, avatar_preset: state.preset, has_avatar_image: state.image, avatar_version: state.version, created_at: '2026-10-01T00:00:00Z' });
  await page.route('**/v1/auth/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrf_token: 'c', expires_at: '2030-01-01T00:00:00Z', user: user() }) }));
  await page.route('**/v1/account/agents', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/v1/account/avatar', r => {
    const m = r.request().method();
    if (m === 'PUT') { state.puts += 1; state.image = true; state.preset = null; state.version = 'v' + state.puts; return r.fulfill({ status: 204 }); }
    if (m === 'DELETE') { state.image = false; return r.fulfill({ status: 204 }); }
    return r.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
  await page.route('**/v1/account/avatar-preset', r => { state.preset = r.request().postDataJSON().preset; state.image = false; return r.fulfill({ status: 204 }); });
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

test('landing menu: each feature has its own page; other links reach their sections and Docs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  await nav.getByRole('button', { name: 'Features' }).click();
  await page.getByRole('menuitem', { name: /Evaluate/ }).click();
  await expect(page).toHaveURL(/\/features\/evaluate$/);
  await expect(page.getByRole('heading', { name: 'A score with reasons you can check', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it works', level: 2 })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'AI reads and scores' })).toBeVisible();
  await page.getByRole('link', { name: /^Next: / }).click();
  await expect(page).toHaveURL(/\/features\/practice$/);
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Data & connections' }).click();
  await expect(page).toHaveURL(/\/data$/);
  await expect(page.getByRole('heading', { name: 'Your data and connecting an agent', level: 1 })).toBeVisible();
  await nav.getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole('heading', { name: 'The flow', level: 2 })).toBeVisible();
  await nav.getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { name: 'User guide', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start in 3 steps' })).toBeVisible();
});

test('the two explainer pages exist in both languages and show every section', async ({ page }) => {
  for (const locale of ['th', 'en']) {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    for (const path of ['/how-it-works', '/data']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);
      await expect(page.getByRole('heading', { level: 3 })).toHaveCount(path === '/data' ? 8 : 8);
    }
  }
});

test('every feature page exists in both languages and an unknown one goes home', async ({ page }) => {
  for (const locale of ['th', 'en']) {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    for (const slug of ['add-cv', 'search', 'evaluate', 'draft', 'connect']) {
      await page.goto(`/features/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(4);
    }
  }
  await page.goto('/features/nope');
  await expect(page).toHaveURL(/\/$/);
});

test('landing menu collapses into one Menu button on a phone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/features\/search$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
