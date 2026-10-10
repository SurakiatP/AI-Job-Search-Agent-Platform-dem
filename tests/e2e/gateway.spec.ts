import { expect, test, type Page } from '@playwright/test';
import { useSyntheticApplication } from '../fixtures/application';

const view = { configured: true, reachable: true, base_url: 'http://127.0.0.1:4000', analyze_model: 'ai-analyze', decision_model: 'typesafe/jev-1.13', models: ['ai-analyze', 'ai-extra'] };

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
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4000/ui');
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
