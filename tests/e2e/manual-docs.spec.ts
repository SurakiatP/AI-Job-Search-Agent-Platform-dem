import { expect, test } from '@playwright/test';
import { useSyntheticApplication } from '../fixtures/application';

const topics = ['getting-started', 'cv-and-experience', 'search-and-evaluate', 'tailor-and-draft',
  'interview-practice', 'track-applications', 'job-alerts', 'safety-and-data'];

test('docs: every topic card opens its own manual page, none says coming soon', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs');
  await expect(page.getByText('เร็ว ๆ นี้')).toHaveCount(0);
  for (const topic of topics) await expect(page.locator(`main a[href="/docs/${topic}"]`)).toHaveCount(1);
});

for (const topic of topics) {
  test(`docs: /docs/${topic} shows a rendered page`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
    await useSyntheticApplication(page);
    await page.goto(`/docs/${topic}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('{{');
    expect(text).not.toContain('[[');
    expect(page.url()).toContain(`/docs/${topic}`);
  });
}

test('docs: an unknown topic says so and links back to the guide', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/no-such-topic');
  await expect(page.getByRole('link', { name: 'กลับไปคู่มือ' })).toHaveAttribute('href', '/docs');
});

test('docs: English UI tells the reader the detailed guide is Thai only', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto('/docs/getting-started');
  await expect(page.getByText(/available in Thai only/i)).toBeVisible();
});
