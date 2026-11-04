import { expect, test } from '@playwright/test';
import { entry, mockAudit } from '../fixtures/admin-system';

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });

test('TC-ADM-AU-01: the log lists actions newest first in plain words, with short ids and no personal content', async ({ page }) => {
  await mockAudit(page);
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  const rows = page.getByRole('table', { name: 'Admin actions' }).getByRole('row');
  await expect(rows).toHaveCount(4); // header + 3
  await expect(rows.nth(1)).toContainText('Changed a model price');
  await expect(rows.nth(1)).toContainText('openai/gpt-5');
  await expect(rows.nth(1)).toContainText('price_in: 1.25, price_out: 10, source: manual'); // null values left out
  await expect(rows.nth(2)).toContainText('Retried a run');
  await expect(rows.nth(2)).toContainText('5d1c2b3a'); // UUID target shows its short id
  await expect(rows.nth(2)).not.toContainText('5d1c2b3a-2222');
  await expect(rows.nth(3)).toContainText('Suspended a user');
  await expect(rows.nth(3)).toContainText('ops@example.test');
  await expect(rows.nth(3)).toContainText('3fa9b2c1');
  await page.screenshot({ path: 'test-results/admin-audit-desktop.png', fullPage: true });
});

test('TC-ADM-AU-02: Load more appends the next page and then goes away; an unknown action keeps its code', async ({ page }) => {
  const { queries } = await mockAudit(page);
  await page.goto('/admin/audit');
  const rows = page.getByRole('table', { name: 'Admin actions' }).getByRole('row');
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(rows).toHaveCount(6);
  expect(queries.at(-1)).toContain('cursor=c2');
  await expect(rows.nth(4)).toContainText('Resent a webhook delivery');
  await expect(rows.nth(5)).toContainText('legacy.unknown');
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('TC-ADM-AU-03: filtering by action and by date asks the server and can be cleared', async ({ page }) => {
  const { queries } = await mockAudit(page);
  await page.goto('/admin/audit');
  await page.getByLabel('Action', { exact: true }).selectOption('run.retry');
  const rows = page.getByRole('table', { name: 'Admin actions' }).getByRole('row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('Retried a run');
  expect(queries.at(-1)).toContain('action=run.retry');
  await page.getByLabel('Since', { exact: true }).fill('2026-11-01');
  await expect.poll(() => queries.at(-1)).toContain('since=2026-10-31T17%3A00%3A00.000Z'); // midnight Bangkok
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByLabel('Action', { exact: true })).toHaveValue('');
});

test('TC-ADM-AU-04: an empty log and an empty filter result say what will appear', async ({ page }) => {
  await mockAudit(page, { items: [] });
  await page.goto('/admin/audit');
  await expect(page.getByText('No admin actions yet.')).toBeVisible();
  await expect(page.getByText(/Suspending a user, retrying a run or changing a model price/)).toBeVisible();
  await page.getByLabel('Action', { exact: true }).selectOption('user.delete');
  await expect(page.getByText('No entries match these filters.')).toBeVisible();
});

test('TC-ADM-AU-05: a load failure offers Retry', async ({ page }) => {
  const { heal } = await mockAudit(page, { down: true });
  await page.goto('/admin/audit');
  await expect(page.getByRole('alert').filter({ hasText: 'We could not load the audit log.' })).toBeVisible();
  heal();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('table', { name: 'Admin actions' }).getByRole('row')).toHaveCount(4);
});

test('TC-ADM-AU-06: 390 px phone has no sideways scroll; Thai renders actions and Buddhist-era dates', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockAudit(page, { items: [entry(1, { detail: { reason: 'x'.repeat(190) } }), entry(2, { actor_email: 'a-very-long-operator-address-for-wrapping@example.test' })] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'บันทึกการทำงาน' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'การดำเนินการของผู้ดูแล' }).getByText('ระงับผู้ใช้').first()).toBeVisible();
  await expect(page.getByText(/2569/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-audit-mobile-th.png', fullPage: true });
});
