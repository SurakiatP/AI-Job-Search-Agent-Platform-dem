import { expect, test, type Page } from '@playwright/test';
import { adminEmail, mockAdminAccount } from '../fixtures/admin';
import { mockOverview } from '../fixtures/admin-overview';

test.beforeEach(async ({ page }) => {
  await mockAdminAccount(page);
  await mockOverview(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('TC-ADM-AC-01: the account menu opens My account with the email, role and no workspace links or delete', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: new RegExp(`^Account: ${adminEmail}`) }).first().click();
  await page.getByRole('menuitem', { name: 'My account' }).click();
  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByText(adminEmail)).toBeVisible();
  await expect(main.getByText('Administrator')).toBeVisible();
  await expect(main.getByText('1 October 2026')).toBeVisible();
  await expect(main.locator('a[href^="/app"]')).toHaveCount(0);
  await expect(main.getByRole('button', { name: /delete/i })).toHaveCount(0);
  await page.goto('/app/account');
  await expect(page).toHaveURL(/\/admin$/); // the workspace account page stays closed to admins
});

const change = '**/v1/auth/password/change';
async function fill(page: Page, current: string, next: string, confirm = next) {
  await page.getByLabel('Current password', { exact: true }).fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password', { exact: true }).fill(confirm);
}

test('TC-ADM-AC-02: changing the password posts both passwords, clears the form and confirms', async ({ page }) => {
  let posted = '';
  await page.route(change, route => { posted = route.request().postData() ?? ''; return route.fulfill({ status: 204 }); });
  await page.goto('/admin/account');
  await fill(page, 'old-password-1', 'brand-new-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password changed. Other devices were signed out.')).toBeVisible();
  expect(JSON.parse(posted)).toEqual({ current_password: 'old-password-1', new_password: 'brand-new-password' });
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('link', { name: /reset/i })).toHaveCount(0);
});

test('TC-ADM-AC-03: a wrong current password shows the error on that field and keeps what was typed', async ({ page }) => {
  await page.route(change, route => route.fulfill({ status: 401, json: { code: 'invalid_credentials', message_key: 'errors.invalid_credentials', retryable: false } }));
  await page.goto('/admin/account');
  await fill(page, 'wrong-password-1', 'brand-new-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The current password is not correct.' })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('brand-new-password');
});

test('TC-ADM-AC-06: a short new password or a mismatch is caught before any request; show/hide toggles the field', async ({ page }) => {
  let calls = 0;
  await page.route(change, route => { calls += 1; return route.fulfill({ status: 204 }); });
  await page.goto('/admin/account');
  await fill(page, 'old-password-1', 'short');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText('10 to 128 characters');
  await fill(page, 'old-password-1', 'brand-new-password', 'brand-new-passwore');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  expect(calls).toBe(0);
  const field = page.getByLabel('New password', { exact: true });
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).nth(1).click();
  await expect(field).toHaveAttribute('type', 'text');
});

test('TC-ADM-AC-04: at 390 px the page does not scroll sideways and the menu link works from the phone header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('button', { name: new RegExp(`^Account: ${adminEmail}`) }).first().click();
  await page.getByRole('menuitem', { name: 'My account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('TC-ADM-AC-05: in Thai the menu item, title and role are Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await page.goto('/admin/account');
  await expect(page.getByRole('heading', { level: 1, name: 'บัญชีของฉัน' })).toBeVisible();
  await expect(page.getByRole('main').getByText('ผู้ดูแลระบบ')).toBeVisible();
  await page.getByRole('button', { name: /^บัญชี: / }).first().click();
  await expect(page.getByRole('menuitem', { name: 'บัญชีของฉัน' })).toBeVisible();
});
