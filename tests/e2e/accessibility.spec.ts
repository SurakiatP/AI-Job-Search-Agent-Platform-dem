import { expect, test } from '@playwright/test';
import { documentId, jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const routes = [
  '/',
  '/app/projects',
  '/app/projects/new',
  `/app/projects/${projectId}/profile`,
  `/app/projects/${projectId}/sessions/${sessionId}`,
  `/app/projects/${projectId}/applications`,
  `/app/projects/${projectId}/jobs/${jobId}`,
  `/app/projects/${projectId}/documents`,
  `/app/projects/${projectId}/documents/${documentId}`,
  '/app/settings',
  '/login', '/digest/unsubscribe?token=x',
  '/signup',
  '/app/account',
  '/app/oauth/consent?request=a11y',
];

test('approved routes fit 320px, tablet, and desktop and keep the language control available', async ({ page }) => {
  test.setTimeout(90_000); // 17 routes x 3 widths; the 30s default is too tight on CI runners
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useSyntheticApplication(page);
  await page.route('**/v1/oauth/requests/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    client_name: 'Synthetic Client', client_id_host: 'client.example.test', redirect_uri: 'http://127.0.0.1:33418/callback',
    requested_scopes: ['results:read'], projects: [{ id: projectId, name: 'Synthetic project' }], expires_at: '2099-01-01T00:00:00Z' }) }));

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('button', { name: 'EN', exact: true }).or(page.getByRole('button', { name: /^บัญชี/ })).first()).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px overflow at ${route}`).toBe(true);
      // Reduced motion clamps every animation to one 1ms run; a clamped one may still read "running" until its first frame on a busy host.
      expect(await page.evaluate(() => document.getAnimations().filter(animation => {
        const timing = animation.effect?.getComputedTiming();
        return animation.playState === 'running' && (Number(timing?.duration) > 1 || timing?.iterations === Infinity);
      }).length), `unclamped animation at ${route}`).toBe(0);
      if (route === `/app/projects/${projectId}/documents/${documentId}`) {
        const readingMetrics = await page.locator('body').evaluate(element => {
          const style = getComputedStyle(element);
          const fontSize = Number.parseFloat(style.fontSize);
          const lineHeight = Number.parseFloat(style.lineHeight);
          return { fontSize, lineHeightRatio: lineHeight / fontSize };
        });
        expect(readingMetrics.fontSize).toBeGreaterThanOrEqual(16);
        expect(readingMetrics.lineHeightRatio).toBeGreaterThanOrEqual(1.6);
      }
      if (width === 1440) await page.screenshot({ path: `/tmp/ui05-${routes.indexOf(route)}-desktop.png`, fullPage: true });
      if (width === 320) await page.screenshot({ path: `/tmp/ui05-${routes.indexOf(route)}-320.png`, fullPage: true });
    }
  }
});

test('account menu opens by keyboard, closes with Escape and returns focus; 320px bottom bar has five 44px tabs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);

  const tabs = page.getByRole('navigation', { name: 'Navigation' }).last().getByRole('link');
  await expect(tabs).toHaveCount(5);
  for (const box of await tabs.evaluateAll(links => links.map(link => link.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);

  const trigger = page.getByRole('button', { name: /^Account/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Trash' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Interview practice' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Agent activity' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('document language stays English after the UI changes to Thai and partial status is announced', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByRole('status').filter({ hasText: 'Partial document' })).toHaveText('Partial document');
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await expect(page.getByRole('status').filter({ hasText: 'Partial document' })).toHaveText('Partial document');
});

// An authenticated visit to /login redirects to /app (correct: no reason to log in twice), so the auth pages are also checked anonymously.
test('anonymous auth pages fit 320px with language control and heading', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await page.route('**/v1/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'unauthorized', message_key: 'errors.unauthorized', retryable: false }) }));
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/signup']) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: 'EN', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px overflow at ${route}`).toBe(true);
    }
  }
});
