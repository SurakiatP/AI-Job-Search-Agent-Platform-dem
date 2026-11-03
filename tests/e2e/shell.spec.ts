import { toggleLanguage } from '../fixtures/shell';
import { expect, test } from '@playwright/test';

test('locale/theme/navigation retain distinct project and session drafts only in memory', async ({ page }) => {
  await page.goto('/tests/shell.html');
  await page.getByRole('textbox', { name: 'ข้อความ', exact: true }).fill('สนใจงานนี้');
  await toggleLanguage(page);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('สนใจงานนี้');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch project: โปรเจกต์สังเคราะห์', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Other page' }).click();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('สนใจงานนี้');
  await page.getByRole('button', { name: 'Next session' }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('อีกบทสนทนา');
  await page.getByRole('button', { name: 'Next project' }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'First project and session' }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('สนใจงานนี้');
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ 'ui.locale': 'en', 'ui.theme': 'dark' });
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('invalid preferences fall back and System tracks OS while an explicit theme stays fixed', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('ui.locale', 'invalid');
    localStorage.setItem('ui.theme', 'invalid');
  });
  await page.goto('/tests/shell.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'สว่าง', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'ตามระบบ', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('actual sidebar navigation keeps the application document and unsent draft', async ({ page }) => {
  await page.goto('/tests/shell.html');
  await page.getByRole('textbox', { name: 'ข้อความ', exact: true }).fill('draft before navigation');
  const documentRequests: string[] = [];
  page.on('request', request => { if (request.isNavigationRequest()) documentRequests.push(request.url()); });
  await page.getByRole('button', { name: /สลับโปรเจกต์/ }).click();
  await page.getByRole('link', { name: 'โปรเจกต์ใหม่', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects\/new$/);
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
  await page.getByRole('button', { name: /สลับโปรเจกต์/ }).click();
  await page.getByRole('link', { name: 'บทสนทนาสังเคราะห์', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/session$/);
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
  await page.getByRole('button', { name: /^บัญชี/ }).click();
  await page.getByRole('menuitem', { name: 'การตั้งค่า', exact: true }).click();
  await expect(page).toHaveURL('/app/settings?project=project-a');
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
});

test('320px shell keeps the account menu reachable and returns keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/tests/shell.html');
  const menu = page.getByRole('button', { name: /^บัญชี/ });
  await expect(menu).toBeInViewport();
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: /ตั้งค่า|Settings/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  // Language is not in the menu any more: the owner asked for it to stay visible in the header (checked once the menu is closed,
  // because an open modal menu hides the rest of the page from the accessibility tree).
  await expect(page.getByRole('button', { name: /^ภาษาของหน้าจอ:/ }).filter({ visible: true }).first()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toggleLanguage(page);
  await expect(page.getByRole('heading', { name: 'Shell verification' })).toBeVisible();
  const motion = await page.locator('body *').evaluateAll(elements => elements.some(el => {
    const css = getComputedStyle(el);
    return (css.animationName !== 'none' && parseFloat(css.animationDuration) > 0.001) || css.transitionDuration.split(',').some(value => parseFloat(value) > 0.001);
  }));
  expect(motion).toBe(false);
});
