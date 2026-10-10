import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const view = { configured: true, reachable: true, base_url: 'http://127.0.0.1:54000', analyze_model: 'ai-analyze', decision_model: 'typesafe/jev-1.13', models: ['ai-analyze', 'ai-extra'] };

async function open(page: Page, locale: 'en' | 'th', body: unknown, calls: string[] = []) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  await page.route('**/api/v1/gateway', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
  page.on('request', r => { const p = new URL(r.url()).pathname; if (/^\/api\/v1\/(providers|settings\/provider)/.test(p)) calls.push(p); });
  await page.goto('/app/settings?section=gateway');
}

test('gateway card shows status, models and a safe LiteLLM link; no provider calls', async ({ page }) => {
  const calls: string[] = [];
  await open(page, 'en', view, calls);
  await expect(page.getByText('The AI gateway is configured and reachable.')).toBeVisible();
  await expect(page.getByText('typesafe/jev-1.13')).toBeVisible();
  await expect(page.getByText('ai-extra')).toBeVisible();
  const link = page.getByRole('link', { name: 'Manage models in LiteLLM' });
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:54000/ui');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByLabel('API key')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('unconfigured gateway shows the OPENROUTER_API_KEY hint (Thai)', async ({ page }) => {
  await open(page, 'th', { ...view, configured: false, reachable: false, base_url: null, models: [] });
  await expect(page.getByText('ยังไม่ได้ตั้งค่า AI gateway')).toBeVisible();
  await expect(page.getByText('OPENROUTER_API_KEY')).toBeVisible();
  await expect(page.locator('a[href$="/ui"]')).toHaveCount(0);
});

test('409 gateway_unconfigured on a run shows guidance pointing to Settings > AI gateway', async ({ page }) => {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), 'en');
  await useSyntheticApplication(page);
  const api = `**/api/v1/projects/${projectId}`;
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId, cv_name: 'Data CV', cv_revision: 1, job_title: 'Synthetic data analyst', job_company: 'Example Co' }) }));
  await page.route(`${api}/runs`, r => r.request().method() === 'POST'
    ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'gateway_unconfigured', message_key: 'errors.gateway_unconfigured', retryable: false }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${api}/runs/*/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect(page.getByText(/AI gateway is not configured/).first()).toBeVisible();
});
