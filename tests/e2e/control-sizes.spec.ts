import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

async function open(page: Page, width: number, height: number) {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/job-search**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/facets') ? { total: 0, categories: [], cities: [], work_modes: [] } : { items: [], total: 0, limit: 20, offset: 0 }) }));
  await page.setViewportSize({ width, height });
  await page.goto(`/app/projects/${projectId}/search`);
}
const height = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!.height;

for (const [width, expected] of [[1440, 40], [390, 44]] as const) {
  test(`search controls are ${expected}px high at ${width}px`, async ({ page }) => {
    await open(page, width, 900);
    await expect(page.locator('#job-search')).toBeVisible();
    expect(await height(page, '#job-search')).toBeGreaterThanOrEqual(expected - 1);
    expect(await height(page, '#job-search')).toBeLessThanOrEqual(expected + 1);
    await page.getByRole('button', { name: /^(More filters|ตัวกรองเพิ่มเติม)/ }).click(); // location sits in the filter dialog
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running')); // the dialog scales in
    expect(await height(page, '#job-city')).toBeGreaterThanOrEqual(expected - 1);
    expect(await height(page, '#job-city')).toBeLessThanOrEqual(expected + 1);
  });
}

test('header avatar is 40px at desktop width', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const box = await page.getByRole('banner').getByRole('link', { name: /synthetic@example\.test/ }).locator('span,img').first().boundingBox();
  expect(Math.abs(box!.width - 40)).toBeLessThanOrEqual(1);
});
