import { expect, test } from '@playwright/test';
import { documentId, jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const routes = [
  '/',
  '/app/projects',
  '/app/projects/new',
  `/app/projects/${projectId}/profile`,
  `/app/projects/${projectId}/sessions/${sessionId}`,
  `/app/projects/${projectId}/jobs`,
  `/app/projects/${projectId}/jobs/${jobId}`,
  `/app/projects/${projectId}/documents`,
  `/app/projects/${projectId}/documents/${documentId}`,
  '/app/settings',
];

test('approved routes fit 320px, tablet, and desktop and keep the language control available', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('button', { name: 'EN', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px overflow at ${route}`).toBe(true);
      expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), `running animation at ${route}`).toBe(0);
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

test('mobile drawer opens and closes by keyboard with focus returned to its trigger', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/profile`);

  const trigger = page.getByRole('button', { name: 'Open menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Main menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer).toContainText('Projects');
  await expect(drawer.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('document language stays English after the UI changes to Thai and partial status is announced', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByRole('status')).toHaveText('Partial document');
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await expect(page.getByRole('status')).toHaveText('Partial document');
});
