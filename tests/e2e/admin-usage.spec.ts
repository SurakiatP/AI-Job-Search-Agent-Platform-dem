import { expect, test, type Page } from '@playwright/test';
import { mockAdminAccount } from '../fixtures/admin';
import { mockAdminUsage, type UsageOptions } from '../fixtures/admin-usage';

async function open(page: Page, opts: UsageOptions = {}, path = '/admin/usage', locale: 'en' | 'th' = 'en') {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await mockAdminAccount(page);
  const mock = await mockAdminUsage(page, opts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  return mock;
}
const names = (page: Page) => page.locator('tbody tr').locator('th');

test('TC-ADM-UG-01: the page lists totals and one row per task, with the range in the request', async ({ page }) => {
  const mock = await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Usage and cost' })).toBeVisible();
  const totals = page.getByRole('term').filter({ hasText: 'Requests' });
  await expect(totals).toBeVisible();
  await expect(page.getByLabel('Totals for this range')).toContainText('172');
  await expect(page.getByLabel('Totals for this range')).toContainText('370,000');
  await expect(names(page)).toHaveCount(3);
  await expect(names(page).nth(0)).toContainText('CV tailoring');
  await expect(names(page).nth(1)).toContainText('Job evaluation');
  await expect(names(page).nth(2)).toContainText('document_ocr');
  expect(mock.requests[0]).toBe('/v1/admin/usage?range=7d&group_by=task');
  await expect(page.locator('tbody tr').nth(0)).toContainText('75%');
});

test('TC-ADM-UG-02: switching Group by sends a new request and renders model, day and user keys', async ({ page }) => {
  const mock = await open(page);
  await expect(names(page)).toHaveCount(3);
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Model' }).click();
  await expect(names(page).nth(0)).toContainText('openai/gpt-6-luna');
  expect(mock.requests.at(-1)).toBe('/v1/admin/usage?range=7d&group_by=model');
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Day' }).click();
  await expect(names(page).nth(0)).toContainText('1 Oct 2026');
  expect(mock.requests.at(-1)).toContain('group_by=day');
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'User' }).click();
  await expect(names(page).nth(0)).toContainText('a1b2c3d4');
  expect(mock.requests.at(-1)).toContain('group_by=user');
});

test('TC-ADM-UG-03: the range lives in the URL and is sent to the API', async ({ page }) => {
  const mock = await open(page, {}, '/admin/usage?range=1h');
  await expect(page.getByRole('button', { name: /Time range: Last 1 hour/ })).toBeVisible();
  expect(mock.requests[0]).toContain('range=1h');
  await page.getByRole('button', { name: /Time range/ }).click();
  await page.getByRole('menuitemradio', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect.poll(() => mock.requests.at(-1)).toContain('range=30d');
});

test('TC-ADM-UG-04: the live rate converts every amount to THB', async ({ page }) => {
  await open(page, { rate: 40 });
  await expect(page.getByLabel('Totals for this range')).toContainText('$4.80');
  await page.getByRole('group', { name: 'Currency' }).getByRole('button', { name: 'THB' }).click();
  await expect(page.getByLabel('Totals for this range')).toContainText('฿192.00');
  await expect(page.locator('tbody tr').nth(0)).toContainText('฿144.00');
  await expect(page.getByLabel('Totals for this range')).not.toContainText('$');
});

test('TC-ADM-UG-05: the rate shows its source and date, and there is no input or save button', async ({ page }) => {
  const mock = await open(page, { rate: 35.12 });
  await expect(page.getByTestId('usage-rate')).toHaveText('1 USD = 35.12 THB');
  await expect(page.getByRole('link', { name: 'Frankfurter (European Central Bank reference rates)' })).toHaveAttribute('href', 'https://frankfurter.dev/');
  await expect(page.getByText(/3 Nov 2026\. Daily reference rate, not live/)).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save rate' })).toHaveCount(0);
  expect(mock.prefsCalls).toEqual([]);
});

test('TC-ADM-UG-06: ≈ and a "Manual price" badge show when a manual price is involved, and the tip says why', async ({ page }) => {
  await open(page);
  const cost = page.getByLabel('Totals for this range').locator('dd').nth(4);
  await expect(cost).toContainText('≈');
  await expect(page.getByLabel('Totals for this range').locator('dd').nth(5)).toContainText('≈');
  await expect(page.locator('tbody tr').nth(0)).toContainText('Manual price');
  await expect(page.locator('tbody tr').nth(1)).not.toContainText('Manual price');
  await expect(page.locator('tbody tr').nth(1)).not.toContainText('≈');
  await cost.getByText('≈').focus();
  await expect(page.getByRole('tooltip')).toContainText('price entered by hand');
});

test('TC-ADM-UG-07: Cost and Requests sort on the client; rows without a cost stay last', async ({ page }) => {
  const mock = await open(page);
  await expect(names(page)).toHaveCount(3);
  const before = mock.requests.length;
  await page.getByRole('button', { name: 'Sort by Requests' }).click();
  await expect(names(page).nth(0)).toContainText('Job evaluation');
  await expect(page.getByRole('columnheader', { name: /Requests/ })).toHaveAttribute('aria-sort', 'descending');
  await page.getByRole('button', { name: 'Sort by Cost' }).click();
  await page.getByRole('button', { name: 'Sort by Cost' }).click();
  await expect(names(page).nth(0)).toContainText('Job evaluation');
  await expect(names(page).nth(2)).toContainText('document_ocr');
  await expect(page.getByRole('columnheader', { name: /Cost/ }).first()).toHaveAttribute('aria-sort', 'ascending');
  expect(mock.requests.length).toBe(before);
});

test('TC-ADM-UG-08: calls without a price show "—" and a note says they are not counted', async ({ page }) => {
  await open(page);
  await expect(page.locator('tbody tr').nth(2)).toContainText('—');
  await expect(page.getByText(/Calls without a price are not counted in cost/)).toContainText('12');
});

test('TC-ADM-UG-09: an empty range says what will appear', async ({ page }) => {
  await open(page, { empty: true });
  await expect(page.getByRole('heading', { name: 'No AI calls in this range' })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
});

test('TC-ADM-UG-10: a failed load shows an error and Retry loads the data', async ({ page }) => {
  const mock = await open(page, { failFirst: true });
  await expect(page.getByRole('alert')).toContainText('Could not load usage');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(names(page)).toHaveCount(3);
  expect(mock.requests).toHaveLength(2);
});

test('TC-ADM-UG-11: if the rate cannot load, THB is hidden and a message says costs are in USD', async ({ page }) => {
  await open(page, { fxFail: true });
  await expect(page.getByText('Could not load the exchange rate, so costs are shown in USD only.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Currency' }).getByRole('button')).toHaveText(['USD']);
  await expect(names(page)).toHaveCount(3);
});

test('TC-ADM-UG-14: a stale rate shows a warning', async ({ page }) => {
  await open(page, { stale: true });
  await expect(page.getByText('Could not refresh the rate. Showing the last one fetched.')).toBeVisible();
  await expect(page.getByTestId('usage-rate')).toBeVisible();
});

test('TC-ADM-UG-12: at 390 px nothing overflows the page and cost stays in view', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(names(page)).toHaveCount(3);
  for (const group of ['Model', 'Day', 'User']) {
    await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: group }).click();
    await expect(names(page)).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Task' }).click();
  await expect(page.getByTestId('usage-rate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sort by Cost' })).toBeInViewport();
  await expect(page.getByRole('columnheader', { name: 'Per request' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('TC-ADM-UG-13: Thai renders labels, the badge and Buddhist-era days', async ({ page }) => {
  await open(page, {}, '/admin/usage', 'th');
  await expect(page.getByRole('heading', { level: 1, name: 'การใช้งานและค่าใช้จ่าย' })).toBeVisible();
  await expect(page.getByText('ราคากรอกเอง').first()).toBeVisible();
  await expect(page.getByTestId('usage-rate')).toContainText('บาท');
  await expect(page.getByRole('button', { name: /ช่วงเวลา: 7 วันที่ผ่านมา/ })).toBeVisible();
  await page.getByRole('group', { name: 'แยกตาม' }).getByRole('button', { name: 'วัน' }).click();
  await expect(names(page).nth(0)).toContainText('2569');
  await expect(page.getByText(/อัตราของวันที่ 3 พ\.ย\. 2569/)).toBeVisible();
});
