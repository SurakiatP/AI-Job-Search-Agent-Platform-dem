import { expect, test } from '@playwright/test';
import { mockAdminAccount, mockNormalAccount } from '../fixtures/admin';
import type { Page } from '@playwright/test';
import { mockOverview } from '../fixtures/admin-overview';
import { mockAdminUsers } from '../fixtures/admin-users';
import { mockAdminRuns } from '../fixtures/admin-runs';
import { mockAdminUsage } from '../fixtures/admin-usage';
import { mockAdminModels } from '../fixtures/admin-models';
import { mockAudit, mockSystem } from '../fixtures/admin-system';

// Each page's own mock goes in just before the page opens: a later route wins over earlier catch-alls.
const pageMocks: Record<string, (page: Page) => Promise<unknown>> = {
  '/admin': p => mockOverview(p), '/admin/users': p => mockAdminUsers(p), '/admin/runs': p => mockAdminRuns(p),
  '/admin/usage': p => mockAdminUsage(p), '/admin/models': p => mockAdminModels(p), '/admin/system': p => mockSystem(p), '/admin/audit': p => mockAudit(p),
};

const pages = [['Overview', '/admin'], ['Users', '/admin/users'], ['AI runs', '/admin/runs'], ['Usage and cost', '/admin/usage'], ['AI models', '/admin/models'], ['System', '/admin/system'], ['Audit log', '/admin/audit']] as const;

test('TC-ADM-SH-01: an admin lands on /admin and sees the seven pages in order', async ({ page }) => {
  await mockAdminAccount(page);
  await mockOverview(page);
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
  await mockOverview(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Admin navigation' });
  for (const [name, path] of pages) {
    await pageMocks[path](page);
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
  await mockOverview(page);
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
  await mockOverview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(0);
  await mockAdminUsers(page);
  await page.getByRole('button', { name: 'Admin menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('TC-ADM-SH-05: the sidebar collapses to an icon rail, keeps names and the current page, and remembers the choice', async ({ page }) => {
  await mockAdminAccount(page);
  await mockOverview(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Admin navigation' });
  const aside = page.locator('aside');
  const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(248);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(64);
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByText('Users and runs')).toHaveCount(0);
  await nav.getByRole('link', { name: 'Users' }).hover();
  await expect(page.getByRole('tooltip', { name: 'Users' })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(64);
  await page.keyboard.press('ControlOrMeta+Shift+S');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(248);
  await expect(page.getByRole('button', { name: /^Account: ops@example\.test/ }).first()).toBeVisible();
});
