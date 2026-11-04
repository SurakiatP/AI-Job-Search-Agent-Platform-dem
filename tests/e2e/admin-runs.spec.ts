import { expect, test, type Page } from '@playwright/test';
import { mockAdminAccount } from '../fixtures/admin';
import { baseRuns, ids, manyRuns, mockAdminRuns, run } from '../fixtures/admin-runs';

async function open(page: Page, path = '/admin/runs', options: Parameters<typeof mockAdminRuns>[1] = {}) {
  await mockAdminAccount(page);
  const log = await mockAdminRuns(page, options);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  return log;
}
const table = (page: Page) => page.getByRole('table', { name: 'AI runs' });
const sheet = (page: Page) => page.getByRole('dialog');

test('TC-ADM-RN-01: the table shows task, status, model and effort, user, started, duration, tokens and cost', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'AI runs' })).toBeVisible();
  await expect(table(page).getByRole('row')).toHaveCount(baseRuns.length + 1);
  const failed = table(page).getByRole('row').filter({ hasText: 'CV tailoring' });
  await expect(failed).toContainText('Failed');
  await expect(failed).toContainText('google/gemini-3-flash');
  await expect(failed).toContainText('effort medium');
  await expect(failed).toContainText('u_8f3a…c21');
  await expect(failed).toContainText('48 s');
  await expect(failed).toContainText('12.4k in');
  await expect(failed).toContainText('3.1k out');
  await expect(failed).toContainText('4k cached');
  await expect(failed).toContainText('$0.01');
  await expect(table(page).getByRole('row').filter({ hasText: 'Job evaluation' }).filter({ hasText: 'Running' })).toBeVisible();
});

test('TC-ADM-RN-02: filters are read from the URL, so ?status=failed from Overview works as a deep link', async ({ page }) => {
  const log = await open(page, '/admin/runs?status=failed&operation=tailor_cv&range=7d');
  await expect(page.getByLabel('Status')).toHaveValue('failed');
  await expect(page.getByLabel('Task')).toHaveValue('tailor_cv');
  await expect(page.getByRole('button', { name: /^Time range: Last 7 days/ })).toBeVisible();
  await expect(table(page).getByRole('row')).toHaveCount(2);
  const q = log.lists[0].searchParams;
  expect(q.get('status')).toBe('failed');
  expect(q.get('operation')).toBe('tailor_cv');
  const since = Date.parse(q.get('since') ?? '');
  expect(Date.now() - since).toBeGreaterThan(6.9 * 86_400_000);
  expect(Date.now() - since).toBeLessThan(7.1 * 86_400_000);
});

test('TC-ADM-RN-03: changing a filter writes it to the URL and reloads the list', async ({ page }) => {
  const log = await open(page);
  await page.getByLabel('Status').selectOption('completed');
  await expect(page).toHaveURL(/status=completed/);
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await page.getByLabel('Task').selectOption('draft_documents');
  await expect(page).toHaveURL(/operation=draft_documents/);
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await page.getByLabel('Model').fill('acme/own-priced');
  await expect(page).toHaveURL(/model=acme%2Fown-priced/);
  await page.getByRole('button', { name: /^Time range/ }).click();
  await page.getByRole('menuitemradio', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect.poll(() => log.lists.at(-1)!.searchParams.get('since')).toBeTruthy();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/status=|operation=|model=|range=/);
  await expect(table(page).getByRole('row')).toHaveCount(baseRuns.length + 1);
});

test('TC-ADM-RN-04: a row opens the sheet with summary, timeline of events and model calls; the failure shows as text', async ({ page }) => {
  await open(page);
  await table(page).getByRole('button', { name: 'CV tailoring' }).click();
  await expect(page).toHaveURL(new RegExp(`run=${ids.failed}`));
  const s = sheet(page);
  await expect(s.getByRole('heading', { name: 'CV tailoring' })).toBeVisible();
  await expect(s.getByRole('alert')).toContainText('The agent stopped before it finished.');
  await expect(s.getByText(ids.failed)).toBeVisible();
  const events = s.getByRole('region', { name: 'Timeline' }).getByRole('listitem');
  await expect(events).toHaveCount(4);
  await expect(events.nth(0)).toContainText('Queued');
  await expect(events.nth(2)).toContainText('Progress');
  await expect(events.nth(2)).toContainText('llm_round');
  await expect(events.nth(2)).toContainText('2.4 s');
  await expect(events.nth(3)).toContainText('Failed');
  await expect(events.nth(3)).toContainText('The agent stopped before it finished.');
  const calls = s.getByRole('region', { name: 'Model calls' }).getByRole('row');
  await expect(calls).toHaveCount(3);
  await expect(calls.nth(1)).toContainText('Manual price');
  await expect(calls.nth(1)).toContainText('$0.0042');
  await expect(calls.nth(2)).toContainText('OpenRouter');
  await expect(calls.nth(2)).toContainText('2 API calls');
  await page.keyboard.press('Escape');
  await expect(s).toBeHidden();
  await expect(page).not.toHaveURL(/run=/);
  await expect(table(page).getByRole('button', { name: 'CV tailoring' })).toBeFocused();
});

test('TC-ADM-RN-05: a run id in the URL opens its sheet', async ({ page }) => {
  await open(page, `/admin/runs?run=${ids.manual}`);
  await expect(sheet(page).getByRole('heading', { name: 'Document drafting' })).toBeVisible();
  await expect(sheet(page).getByText('No model calls recorded for this run.')).toBeVisible();
});

test('TC-ADM-RN-06: cancelling a running run asks first, then shows it as cancelled', async ({ page }) => {
  const log = await open(page, `/admin/runs?run=${ids.running}`);
  await expect(sheet(page).getByRole('button', { name: 'Retry run' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Cancel run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this run?' });
  await expect(dialog).toContainText('The run stops');
  await dialog.getByRole('button', { name: 'Keep running' }).click();
  expect(log.posts).toEqual([]);
  await sheet(page).getByRole('button', { name: 'Cancel run' }).click();
  await page.getByRole('dialog', { name: 'Cancel this run?' }).getByRole('button', { name: 'Cancel run' }).click();
  await expect.poll(() => log.posts).toEqual([`cancel:${ids.running}`]);
  await expect(sheet(page).getByText('Cancelled').first()).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Retry run' })).toBeVisible();
  // the open sheet hides the table from assistive tech, so look at the DOM
  await expect(page.locator('tbody tr').filter({ hasText: 'Job evaluation' }).filter({ hasText: 'Cancelled' })).toHaveCount(1);
});

test('TC-ADM-RN-07: cancelling a run that already finished says so and reloads its state', async ({ page }) => {
  await open(page, `/admin/runs?run=${ids.running}`, { cancelError: 'run_finished' });
  await sheet(page).getByRole('button', { name: 'Cancel run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this run?' });
  await dialog.getByRole('button', { name: 'Cancel run' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('This run already finished, so it cannot be cancelled.');
  await expect(dialog.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Go back' }).click();
  await expect(dialog).toBeHidden();
});

test('TC-ADM-RN-08: retry explains what happens, starts a new run for the same user and opens it', async ({ page }) => {
  const log = await open(page, `/admin/runs?run=${ids.failed}`);
  await expect(sheet(page).getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Retry run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Retry this run?' });
  await expect(dialog).toContainText('same person with the same inputs');
  await expect(dialog).toContainText('You cannot see those inputs');
  await dialog.getByRole('button', { name: 'Retry run' }).click();
  await expect.poll(() => log.posts).toEqual([`retry:${ids.failed}`]);
  await expect(page).toHaveURL(/run=11111111-0000-4000-8000-0000000000ff/);
  await expect(sheet(page).getByRole('button', { name: `Open run ${ids.failed.slice(0, 8)}` })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(baseRuns.length + 1);
  await sheet(page).getByRole('button', { name: `Open run ${ids.failed.slice(0, 8)}` }).click();
  await expect(sheet(page).getByRole('heading', { name: 'CV tailoring' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`run=${ids.failed}`));
});

test('TC-ADM-RN-09: retry refused shows the reason and keeps the sheet', async ({ page }) => {
  await open(page, `/admin/runs?run=${ids.failed}`, { retryError: 'retry_not_allowed' });
  await sheet(page).getByRole('button', { name: 'Retry run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Retry this run?' });
  await dialog.getByRole('button', { name: 'Retry run' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('This run cannot be retried.');
  await dialog.getByRole('button', { name: 'Go back' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'CV tailoring' })).toBeVisible();
});

test('TC-ADM-RN-10: cost shows ≈ for a hand-entered price and a dash when no price is known', async ({ page }) => {
  await open(page);
  await expect(table(page).getByRole('row').filter({ hasText: 'Document drafting' })).toContainText('≈ $0.0042');
  const free = table(page).getByRole('row').filter({ hasText: 'Practice questions' }).or(table(page).getByRole('row').filter({ hasText: 'Write practice questions' }));
  await expect(free.getByRole('cell').last()).toContainText('—');
  await expect(free.getByRole('cell').last()).not.toContainText('$');
});

test('TC-ADM-RN-11: 10 rows per page; Next and Previous page through and the page lives in the URL', async ({ page }) => {
  const log = await open(page, '/admin/runs', { runs: [...baseRuns, ...manyRuns(17)] }); // 23 runs
  await expect(table(page).getByRole('row')).toHaveCount(11);
  await expect(page.getByText('Showing 1–10 of 23')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(log.lists[0].searchParams.get('page')).toBe('0');
  expect(log.lists[0].searchParams.get('page_size')).toBe('10');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Showing 11–20 of 23')).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  expect(log.lists.at(-1)!.searchParams.get('page')).toBe('1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.reload();
  await expect(page.getByText('Showing 21–23 of 23')).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
});

test('TC-ADM-RN-11b: a filter change goes back to the first page; a page beyond the end shows the last page', async ({ page }) => {
  const log = await open(page, '/admin/runs?page=3', { runs: [...baseRuns, ...manyRuns(17)] });
  await expect(page.getByText('Showing 21–23 of 23')).toBeVisible();
  await page.getByLabel('Status').selectOption('completed');
  await expect(page).not.toHaveURL(/page=/);
  await expect.poll(() => log.lists.at(-1)!.searchParams.get('page')).toBe('0');
  await page.goto('/admin/runs?page=99');
  await expect(page.getByText('Showing 21–23 of 23')).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=3(&|$)/);
});

test('TC-ADM-RN-11c: no pager when the runs fit on one page; at 390 px the pager fits', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('navigation', { name: 'Change page' })).toHaveCount(0);
  await open(page, '/admin/runs', { runs: [...baseRuns, ...manyRuns(17)] });
  await page.setViewportSize({ width: 390, height: 844 });
  const next = page.getByRole('button', { name: 'Next' });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('TC-ADM-RN-12: the list refreshes every 10 seconds while a visible run is queued or running', async ({ page }) => {
  await page.clock.install();
  const log = await open(page);
  await expect(page.getByText('Refreshes every 10 seconds')).toBeVisible();
  const before = log.lists.length;
  await page.clock.runFor(10_500);
  await expect.poll(() => log.lists.length).toBeGreaterThan(before);
});

test('TC-ADM-RN-13: no refresh timer runs when nothing is queued or running', async ({ page }) => {
  await page.clock.install();
  const log = await open(page, '/admin/runs?status=failed');
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await expect(page.getByText('Refreshes every 10 seconds')).toHaveCount(0);
  const before = log.lists.length;
  await page.clock.runFor(35_000);
  expect(log.lists.length).toBe(before);
});

test('TC-ADM-RN-14: empty list says why, and a filter with no match offers to clear it', async ({ page }) => {
  await open(page, '/admin/runs', { runs: [] });
  await expect(page.getByRole('heading', { name: 'No runs yet' })).toBeVisible();
  await expect(page.getByText('Runs appear here when someone starts an AI task.')).toBeVisible();
  await page.goto('/admin/runs?status=interrupted');
  await expect(page.getByRole('heading', { name: 'No runs match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'No runs yet' })).toBeVisible();
});

test('TC-ADM-RN-15: a failed load says what failed and Try again loads the list', async ({ page }) => {
  const log = await open(page, '/admin/runs', { failList: true });
  const alert = page.getByRole('alert').filter({ hasText: 'Could not load runs' });
  await expect(alert).toContainText('The runs list did not load. Nothing was changed.');
  log.failing = false;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(baseRuns.length + 1);
});

test('TC-ADM-RN-16: at 390 px rows become cards, nothing scrolls sideways, and the sheet works', async ({ page }) => {
  await mockAdminAccount(page);
  await mockAdminRuns(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/runs');
  const failed = table(page).getByRole('row').filter({ hasText: 'CV tailoring' });
  await expect(failed).toContainText('Failed');
  await expect(failed).toContainText('google/gemini-3-flash');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await failed.getByRole('button', { name: 'CV tailoring' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'CV tailoring' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Retry run' })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  const box = await sheet(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('TC-ADM-RN-17: in Thai the page, statuses, task names, dates (Buddhist year) and the retry text are Thai', async ({ page }) => {
  await mockAdminAccount(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockAdminRuns(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/runs?status=failed`);
  await expect(page.getByRole('heading', { level: 1, name: 'งาน AI' })).toBeVisible();
  const row = page.getByRole('table', { name: 'งาน AI' }).getByRole('row').nth(1);
  await expect(row).toContainText('ปรับ CV');
  await expect(row).toContainText('ล้มเหลว');
  await expect(row).toContainText('2569');
  await row.getByRole('button', { name: 'ปรับ CV' }).click();
  await expect(sheet(page).getByRole('alert')).toContainText('เอเจนต์หยุดก่อนทำงานเสร็จ');
  await expect(sheet(page).getByText('ราคากรอกเอง')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'ลองงานนี้ใหม่' }).click();
  await expect(page.getByRole('dialog', { name: 'ลองงานนี้ใหม่?' })).toContainText('คุณมองไม่เห็นข้อมูลนั้น');
});
