import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const view = { client_name: 'Synthetic Client', client_id_host: 'client.example.test', redirect_uri: 'http://127.0.0.1:33418/callback',
  requested_scopes: ['jobs:evaluate'], projects: [{ id: projectId, name: 'Synthetic project' }], expires_at: '2099-01-01T00:00:00Z' };

async function consent(page: Page, status = 200, approveUrl = 'http://127.0.0.1:33418/callback?code=c&state=s') {
  const posts: { path: string; body: unknown }[] = [];
  await useSyntheticApplication(page);
  await page.route('**/api/v1/oauth/requests/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? view : { code: 'not_found', message_key: 'errors.not_found', retryable: false }) });
    posts.push({ path, body: req.postData() ? req.postDataJSON() : null });
    const url = path.endsWith('/approve') ? approveUrl : 'http://127.0.0.1:33418/callback?error=access_denied&state=s';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ redirect_url: url }) });
  });
  await page.route('http://127.0.0.1:33418/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>client callback</p>' }));
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  return posts;
}

test('approve sends chosen project, capabilities and expiry, then returns to the client', async ({ page }) => {
  const posts = await consent(page);
  await page.goto('/app/oauth/consent?request=handle-1');
  await expect(page.getByRole('heading', { name: /Synthetic Client/ })).toBeVisible();
  await expect(page.getByText('client.example.test')).toBeVisible();
  await expect(page.getByLabel(/Evaluate job postings/)).toBeChecked();
  await page.getByLabel(/Read generated results/).check();
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByText('client callback')).toBeVisible();
  expect(posts[0].path).toContain('/oauth/requests/handle-1/approve');
  const body = posts[0].body as { project_id: string; capabilities: string[]; expires_at: string };
  expect(body.project_id).toBe(projectId);
  expect(body.capabilities.sort()).toEqual(['jobs:evaluate', 'results:read']);
  const days = (Date.parse(body.expires_at) - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29); expect(days).toBeLessThan(31);
});

test('deny returns access_denied to the client', async ({ page }) => {
  const posts = await consent(page);
  await page.goto('/app/oauth/consent?request=handle-2');
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(page.getByText('client callback')).toBeVisible();
  expect(posts[0].path).toContain('/deny');
});

test('expired request explains what to do', async ({ page }) => {
  await consent(page, 404);
  await page.goto('/app/oauth/consent?request=gone');
  await expect(page.getByText('This request has expired')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow' })).toHaveCount(0);
});

test('refuses to follow a non-navigable redirect_url', async ({ page }) => {
  await consent(page, 200, 'javascript:alert(1)//');
  await page.goto('/app/oauth/consent?request=handle-3');
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow' })).toBeEnabled();
});

test('follows a native-app private-use scheme redirect', async ({ page }) => {
  await consent(page, 200, 'com.example.app:/cb?code=c&state=s');
  await page.goto('/app/oauth/consent?request=handle-4');
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
