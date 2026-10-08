import { expect, test } from '@playwright/test';

test('locale/theme/navigation retain distinct project and session drafts only in memory', async ({ page }) => {
  await page.goto('/tests/shell.html');
  await page.getByRole('textbox', { name: 'ข้อความ', exact: true }).fill('สนใจงานนี้');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('สนใจงานนี้');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: 'โปรเจกต์สังเคราะห์', exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'โปรเจกต์', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects$/);
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
  await page.getByRole('link', { name: 'บทสนทนาสังเคราะห์', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/session$/);
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
  await page.getByRole('link', { name: 'การตั้งค่า', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  expect(documentRequests).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'ข้อความ', exact: true })).toHaveValue('draft before navigation');
});

test('320px shell keeps the language control visible and drawer returns keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/tests/shell.html');
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toBeInViewport();
  const menu = page.getByRole('button', { name: 'เปิดเมนู', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'เมนูหลัก' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shell verification' })).toBeVisible();
  const motion = await page.locator('body *').evaluateAll(elements => elements.some(el => {
    const css = getComputedStyle(el);
    return css.animationName !== 'none' || css.transitionDuration.split(',').some(value => parseFloat(value) > 0);
  }));
  expect(motion).toBe(false);
});
