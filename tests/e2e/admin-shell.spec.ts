import { expect, test } from '@playwright/test';
import { mockAdminAccount, mockNormalAccount } from '../fixtures/admin';

const pages = [['Overview', '/admin'], ['Users', '/admin/users'], ['AI runs', '/admin/runs'], ['Usage and cost', '/admin/usage'], ['AI models', '/admin/models'], ['System', '/admin/system'], ['Audit log', '/admin/audit']] as const;

test('TC-ADM-SH-01: an admin lands on /admin and sees the seven pages in order', async ({ page }) => {
  await mockAdminAccount(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app');
  await expect(page).toHaveURL(/\/admin$/);
  const nav = page.getByRole('navigation', { name: 'Admin navigation' });
  await expect(nav.getByRole('link')).toHaveText(pages.map(([name]) => name));
  await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('TC-ADM-SH-02: each sidebar link opens its page and marks it current; the account menu signs out', async ({ page }) => {
  await mockAdminAccount(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Admin navigation' });
  for (const [name, path] of pages) {
    await nav.getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('button', { name: /^Account: ops@example\.test/ }).first().click();
  await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
});

test('TC-ADM-SH-03: an admin opening a workspace URL is sent to /admin', async ({ page }) => {
  await mockAdminAccount(page);
  await page.goto('/app/projects');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('TC-ADM-SH-04: a normal user opening /admin is sent to the workspace', async ({ page }) => {
  await mockNormalAccount(page);
  await page.goto('/admin/users');
  await expect(page).not.toHaveURL(/\/admin/);
  await expect(page).toHaveURL(/\/app\/projects\//);
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(0);
});

test('on a phone the menu opens a drawer, closes after a choice, and the page does not scroll sideways', async ({ page }) => {
  await mockAdminAccount(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Admin menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
