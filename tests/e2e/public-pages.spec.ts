import { expect, test } from '@playwright/test';
import { useAccessFixture } from '../fixtures/access-surfaces';
const routes = ['/', '/features/evaluate', '/features/connect', '/how-it-works', '/data', '/docs', '/docs/search-and-evaluate', '/login', '/signup', '/forgot-password', '/reset-password?token=x'];
for (const locale of ['th', 'en']) for (const w of [320, 390, 768, 1440]) test(`public pages ${locale} ${w}px: no sideways scroll and no tap target under 24px`, async ({ page }) => {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useAccessFixture(page, true);
  await page.setViewportSize({ width: w, height: 900 });
  for (const r of routes) { await page.goto(r); await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${r}`).toBe(true);
    const small = await page.evaluate(() => [...document.querySelectorAll('main a[href], main button')].filter(e => { const b = e.getBoundingClientRect(); const inline = (e.parentElement?.textContent ?? '').trim() !== (e.textContent ?? '').trim(); return b.width > 0 && b.height < 24 && !inline; }).map(e => e.textContent?.trim()).slice(0, 3));
    expect(small, `${r} tiny targets`).toEqual([]);
  }
});

test('login and sign up keep their button enabled and say what is missing instead of greying it out', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Enter your email and password first.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await page.goto('/signup');
  await page.getByLabel('Email').fill('someone@example.test');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByText('Use a password of 10 to 128 characters.')).toBeVisible();
});

test('feature page links straight to its manual topic; the header is the same on every public page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/features/evaluate');
  await expect(page.getByRole('main').getByRole('link', { name: 'See how in the manual' })).toHaveAttribute('href', '/docs/search-and-evaluate');
  for (const r of ['/', '/features/evaluate', '/how-it-works', '/data', '/docs', '/docs/getting-started']) {
    await page.goto(r);
    const banner = page.getByRole('banner');
    await expect(banner.getByRole('link', { name: 'Log in' }), r).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Get started' }), r).toHaveAttribute('href', '/signup');
  }
});
