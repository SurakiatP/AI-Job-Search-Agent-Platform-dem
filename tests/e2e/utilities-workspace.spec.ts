import { expect, test } from '@playwright/test';
import { projectId, useUtilitiesFixture } from '../fixtures/utilities';

test('project sharing token is issued in a focus-managed dialog and discarded on dismissal', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.goto(`/app/settings?section=sharing&project=${projectId}`);
  await page.getByRole('checkbox', { name: /Read generated results/ }).check();
  await page.getByRole('button', { name: 'Create project token' }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy this token now' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Project access token')).toHaveCount(0);
});
test('a directly linked mobile settings section is visible in its navigation', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/app/settings?section=webhooks&project=${projectId}`);
  await expect(page.getByRole('main').locator('button[aria-current="page"]')).toBeInViewport();
});

test('console activity groups runs by what needs you and each row links to its real destination', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.goto(`/app/projects/${projectId}/console?tab=timeline`);
  const decision = page.getByRole('region', { name: /Needs your decision/ });
  await expect(decision.getByText('Synthetic research agent')).toBeVisible();
  await expect(decision.getByRole('link', { name: 'Review request' })).toHaveAttribute('href', `/app/projects/${projectId}/console?tab=approvals`);
  const finished = page.getByRole('region', { name: /Finished/ });
  await expect(finished.getByText('Synthetic data analyst')).toBeVisible();
  await expect(finished.getByRole('link', { name: 'Open evaluation' })).toHaveAttribute('href', /\/sessions\//);
  await finished.getByRole('button', { name: 'Run details' }).click();
  await expect(page.getByText(/AI round/)).toBeVisible();
});

test('settings groups sections by who is affected and links account security to Account', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.goto(`/app/settings?section=sharing&project=${projectId}`);
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  for (const group of ['You', 'This project', 'Admin']) await expect(nav.getByRole('group', { name: group })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'AI gateway' })).toContainText('Whole app (admin)');
  await expect(nav.getByRole('button', { name: 'Appearance' })).toContainText('This browser');
  await expect(nav.getByRole('link', { name: /Account security/ })).toHaveAttribute('href', '/app/account');
});

test('ordinary accounts do not see operator settings and never call the gateway endpoint', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.route('**/v1/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrf_token: 'synthetic-test-csrf', expires_at: '2030-01-01T00:00:00Z', user: { id: '99999999-0000-4000-8000-000000000001', email: 'synthetic@example.test', locale: 'en', email_verified: true, is_admin: false, created_at: '2026-10-01T00:00:00Z' } }) }));
  const gatewayCalls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/v1/gateway') gatewayCalls.push(request.url()); });
  await page.goto(`/app/settings?section=gateway&project=${projectId}`);
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('button', { name: 'AI gateway' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Tools' })).toHaveCount(0);
  await expect(nav.getByRole('group', { name: 'Admin' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Project sharing' })).toBeVisible();
  expect(gatewayCalls).toEqual([]);
});

test('account asks for confirmation naming the app and project before revoking, and folds away expired access', async ({ page }) => {
  await useUtilitiesFixture(page);
  const agent = (id: string, label: string, expires: string) => ({ id, project_id: projectId, project_name: 'Synthetic project', label, client_id_host: null, capabilities: ['results:read'], created_at: '2026-10-01T00:00:00Z', expires_at: expires, revoked_at: null });
  const grantA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await page.route('**/v1/account/agents', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([agent(grantA, 'Research assistant', '2099-01-01T00:00:00Z'), agent('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Old helper', '2020-01-01T00:00:00Z')]) }));
  let deleted = '';
  await page.route(`**/v1/projects/${projectId}/grants/${grantA}`, route => { deleted = route.request().method(); return route.fulfill({ status: 204 }); });
  await page.goto('/app/account');
  await expect(page.getByText('Old helper')).toBeHidden();
  await page.getByText('Show expired (1)').click();
  await expect(page.getByText('Old helper')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Research assistant');
  await expect(dialog).toContainText('Synthetic project');
  expect(deleted).toBe('');
  await dialog.getByRole('button', { name: 'Revoke access' }).click();
  await expect.poll(() => deleted).toBe('DELETE');
});

test('settings keeps an invalid explicit project scope empty instead of falling back', async ({ page }) => {
  await useUtilitiesFixture(page);
  await page.goto('/app/settings?section=sharing&project=ffffffff-ffff-4fff-8fff-ffffffffffff');
  await expect(page.getByLabel('Project settings for')).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Create a project' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create project token' })).toHaveCount(0);
});
