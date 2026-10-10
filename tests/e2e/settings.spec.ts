import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const grantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test.beforeEach(async ({ page }) => {
  await useSyntheticApplication(page);
  let provider: { provider: string; model: string; configured: boolean; revision: number; masked_secret: string } | null = null;
  let grant: { id: string; project_id: string; capabilities: string[]; expires_at: string; revoked_at: string | null } | null = null;
  let toolEnabled = true;
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === `/settings/provider` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(provider ?? { configured: false, provider: null, model: null, revision: null, masked_secret: null }) });
      return;
    }
    if (path === `/settings/provider` && request.method() === 'PUT') {
      const body = request.postDataJSON() as { provider: string; model: string; credential: string };
      expect(request.headers()['x-csrf-token']).toBe('synthetic-test-csrf');
      expect(body.credential).toBe('synthetic-secret-sentinel');
      provider = { provider: body.provider, model: body.model, configured: true, revision: 1, masked_secret: '••••••••' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(provider) });
      return;
    }
    if (path === `/settings/provider/test` && request.method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'succeeded', message_key: 'settings.connection_succeeded', checked_at: '2026-10-04T00:00:00Z', duration_ms: 20 }) });
      return;
    }
    if (path === `/projects/${projectId}/settings/tools` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connectors: [{ adapter: 'career_ops', enabled: toolEnabled, revision: 1, updated_at: '2026-10-04T00:00:00Z' }] }) });
      return;
    }
    if (path === `/projects/${projectId}/settings/tools/career_ops` && request.method() === 'PUT') {
      toolEnabled = (request.postDataJSON() as { enabled: boolean }).enabled;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adapter: 'career_ops', enabled: toolEnabled, revision: 2, updated_at: '2026-10-04T00:00:00Z' }) });
      return;
    }
    if (path === `/projects/${projectId}/grants` && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(grant ? [grant] : []) });
      return;
    }
    if (path === `/projects/${projectId}/grants` && request.method() === 'POST') {
      const body = request.postDataJSON() as { capabilities: string[]; expires_at: string };
      expect(request.headers()['x-csrf-token']).toBe('synthetic-test-csrf');
      grant = { id: grantId, project_id: projectId, capabilities: body.capabilities, expires_at: body.expires_at, revoked_at: null };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...grant, token: 'jspg_SYNTHETIC_ONE_TIME_TOKEN' }) });
      return;
    }
    if (path === `/projects/${projectId}/grants/${grantId}` && request.method() === 'DELETE') {
      if (grant) grant = { ...grant, revoked_at: '2026-10-04T00:00:00Z' };
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fallback();
  });
});

async function openSettings(page: import('@playwright/test').Page, tab: 'Providers and tools' | 'Project sharing') {
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'EN' }).click();
  await page.getByRole('tab', { name: tab }).click();
  await expect(page.getByLabel('Project', { exact: true })).toBeVisible();
}


test('project sharing shows a token once, lists metadata only, and revokes the grant', async ({ page }) => {
  await openSettings(page, 'Project sharing');
  await page.getByRole('checkbox', { name: /Read generated results/ }).check();
  await page.getByRole('checkbox', { name: 'Evaluate supplied job postings' }).check();
  await page.getByRole('button', { name: 'Create project token' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Project access token')).toHaveValue('jspg_SYNTHETIC_ONE_TIME_TOKEN');
  const stores = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
  expect(stores.join('')).not.toContain('jspg_SYNTHETIC_ONE_TIME_TOKEN');
  await page.getByRole('button', { name: 'Done and hide token' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('jspg_SYNTHETIC_ONE_TIME_TOKEN')).toHaveCount(0);
  await expect(page.getByText('Evaluate supplied job postings', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoked')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Project sharing' }).click();
  await expect(page.getByText('jspg_SYNTHETIC_ONE_TIME_TOKEN')).toHaveCount(0);
  await expect(page.getByText('Revoked')).toBeVisible();
});



