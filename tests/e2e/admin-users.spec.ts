import { expect, test, type Page } from '@playwright/test';
import { mockAdminAccount } from '../fixtures/admin';
import { ada, baseUsers, bo, manyUsers, mockAdminUsers, otherAdmin, selfUser } from '../fixtures/admin-users';

const open = async (page: Page, opts: Parameters<typeof mockAdminUsers>[1] = {}) => {
  await mockAdminAccount(page);
  const mock = await mockAdminUsers(page, opts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/users');
  return mock;
};
const sheet = (page: Page) => page.getByRole('dialog');
// The page behind an open sheet is inert (hidden from the accessibility tree), so find rows by tag.
const rowOf = (page: Page, email: string) => page.locator('tbody tr', { hasText: email });

test('TC-ADM-US-01: lists accounts with count, status labels, admin badge and the privacy note', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByText('5 accounts')).toBeVisible();
  const table = page.getByRole('table', { name: 'Accounts' });
  await expect(table.getByRole('columnheader')).toHaveText(['Email', 'Status', 'Verified', 'Created', 'Last seen', 'Runs in range']);
  const row = (email: string) => table.getByRole('row').filter({ hasText: email });
  await expect(row(ada.email)).toContainText('Active');
  await expect(row(bo.email)).toContainText('Suspended');
  await expect(row('cy@example.test')).toContainText('Deleting');
  await expect(row(bo.email)).toContainText('Not verified');
  await expect(row(bo.email)).toContainText('Never');
  await expect(row(otherAdmin.email).getByText('Admin', { exact: true })).toBeVisible();
  await expect(row(ada.email).getByText('Admin', { exact: true })).toHaveCount(0);
  await expect(row(ada.email)).toContainText('12');
  await expect(page.getByText('CVs, chats and documents are never shown here.')).toBeVisible();
});

test('TC-ADM-US-02: search is debounced, status and range filters go to the API', async ({ page }) => {
  const mock = await open(page);
  await expect(page.getByRole('row', { name: /ada@example\.test/ })).toBeVisible();
  expect(mock.requests.at(-1)!.searchParams.get('range')).toBe('7d');
  await page.getByRole('searchbox', { name: 'Search by email' }).pressSequentially('bo@');
  await expect(page.getByRole('row', { name: /bo@example\.test/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /ada@example\.test/ })).toHaveCount(0);
  const searches = mock.requests.filter(r => r.searchParams.has('q'));
  expect(searches).toHaveLength(1);
  expect(searches[0].searchParams.get('q')).toBe('bo@');
  await page.getByRole('searchbox', { name: 'Search by email' }).clear();
  await page.getByRole('button', { name: 'Suspended' }).click();
  await expect(page.getByRole('button', { name: 'Suspended' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => mock.requests.at(-1)!.searchParams.get('status')).toBe('suspended');
  await expect(page.getByRole('row', { name: /bo@example\.test/ })).toBeVisible();
  await page.getByRole('button', { name: /^Runs in range: Last 7 days/ }).click();
  await page.getByRole('menuitemradio', { name: 'Last 90 days' }).click();
  await expect.poll(() => mock.requests.at(-1)!.searchParams.get('range')).toBe('90d');
  await page.getByRole('button', { name: /^Runs in range/ }).click();
  await expect(page.getByRole('menuitemradio')).toHaveText(['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time']);
});

test('TC-ADM-US-03: 10 rows per page; Next and Previous page through, the page lives in the URL and filters reset it', async ({ page }) => {
  const mock = await open(page, { users: [...baseUsers, ...manyUsers(18)] }); // 23 accounts
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(10);
  await expect(page.getByText('23 accounts')).toBeVisible();
  await expect(page.getByText('Showing 1–10 of 23')).toBeVisible();
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(mock.requests[0].searchParams.get('page')).toBe('0');
  expect(mock.requests[0].searchParams.get('page_size')).toBe('10');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Showing 11–20 of 23')).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  expect(mock.requests.at(-1)!.searchParams.get('page')).toBe('1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Showing 21–23 of 23')).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
  // A reload keeps the page.
  await page.reload();
  await page.waitForTimeout(500); // longer than the search debounce, which must not reset the page
  await expect(page.getByText('Showing 11–20 of 23')).toBeVisible();
  // A filter change goes back to the first page.
  await page.getByRole('button', { name: 'Suspended' }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect.poll(() => mock.requests.at(-1)!.searchParams.get('page')).toBe('0');
});

test('TC-ADM-US-03b: a page beyond the end falls back to the last page; one page of rows shows no pager', async ({ page }) => {
  await open(page, { users: [...baseUsers, ...manyUsers(18)] });
  await page.goto('/admin/users?page=9');
  await expect(page.getByText('Showing 21–23 of 23')).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=3(&|$)/);
  await page.getByRole('button', { name: 'Suspended' }).click();
  await expect(page.getByRole('navigation', { name: 'Change page' })).toHaveCount(0);
});

test('TC-ADM-US-03c: at 390 px the pager fits and its buttons are reachable', async ({ page }) => {
  await open(page, { users: [...baseUsers, ...manyUsers(18)] });
  await page.setViewportSize({ width: 390, height: 844 });
  const next = page.getByRole('button', { name: 'Next' });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await next.click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
});

test('TC-ADM-US-04: a row opens the sheet with dates and counts, never content', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: ada.email }).click();
  await expect(sheet(page).getByRole('heading', { name: ada.email })).toBeVisible();
  const fact = (name: string) => sheet(page).locator('dl > div', { hasText: name });
  await expect(fact('Projects')).toContainText('3');
  await expect(fact('CVs')).toContainText('2');
  await expect(fact('Runs (all time)')).toContainText('41');
  await expect(sheet(page).getByText('Counts only. The content stays private.')).toBeVisible();
  await expect(sheet(page).getByText('Created', { exact: true })).toBeVisible();
  await expect(sheet(page).getByText('Last seen', { exact: true })).toBeVisible();
  await expect(sheet(page).getByText(/\.pdf|chat|transcript/i)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: ada.email })).toBeFocused();
});

test('TC-ADM-US-05: suspend changes the status, enable brings it back', async ({ page }) => {
  const mock = await open(page);
  await page.getByRole('button', { name: ada.email }).click();
  await sheet(page).getByRole('button', { name: 'Suspend account' }).click();
  await expect(sheet(page).getByText('Suspended. ada@example.test is signed out.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Enable account' })).toBeVisible();
  await expect(rowOf(page, 'ada@example.test').getByText('Suspended')).toBeVisible();
  expect(mock.posts.map(p => p.path)).toEqual(['suspend']);
  await sheet(page).getByRole('button', { name: 'Enable account' }).click();
  await expect(sheet(page).getByText('Enabled. ada@example.test can log in again.')).toBeVisible();
  await expect(rowOf(page, 'ada@example.test').getByText('Active')).toBeVisible();
});

test('TC-ADM-US-06: reset link says the user gets an email and confirms it was sent', async ({ page }) => {
  const mock = await open(page);
  await page.getByRole('button', { name: ada.email }).click();
  await expect(sheet(page).getByText(/You never see the password/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Send password reset link' }).click();
  await expect(sheet(page).getByText('Reset link sent to ada@example.test.')).toBeVisible();
  expect(mock.posts.map(p => p.path)).toEqual(['reset-password']);
});

test('TC-ADM-US-07: delete needs the exact email, then 204 and the row shows Deleting', async ({ page }) => {
  const mock = await open(page);
  await page.getByRole('button', { name: ada.email }).click();
  await sheet(page).getByRole('button', { name: 'Delete account' }).click();
  const confirm = sheet(page).getByRole('button', { name: 'Delete permanently' });
  await expect(confirm).toBeDisabled();
  const field = sheet(page).getByLabel('Type the email to confirm');
  await field.fill('ada@example.tes');
  await expect(confirm).toBeDisabled();
  await field.fill(ada.email);
  await expect(sheet(page).getByText('Matches')).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(sheet(page).getByText('Deletion started for ada@example.test. The account is closed now.')).toBeVisible();
  expect(mock.posts).toEqual([{ path: 'delete', body: { confirm_email: ada.email } }]);
  await expect(rowOf(page, 'ada@example.test').getByText('Deleting')).toBeVisible();
  await expect(sheet(page).getByText('Deletion is in progress.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});

test('TC-ADM-US-08: admin rows and the admin own row show no actions and say why', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: otherAdmin.email, exact: true }).click();
  await expect(sheet(page).getByText('Admin accounts cannot be suspended, reset or deleted here.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /Suspend|Enable|reset|Delete/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: selfUser.email, exact: true }).click();
  await expect(sheet(page).getByText('This is your account.', { exact: false })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /Suspend|Enable|reset|Delete/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'cy@example.test' }).click();
  await expect(sheet(page).getByText('Deletion is in progress.')).toBeVisible();
});

test('TC-ADM-US-09: action errors are written out in the sheet', async ({ page }) => {
  await open(page, { actionError: { suspend: 'admin_target_forbidden', 'reset-password': 'account_deleting', delete: 'confirmation_mismatch' } });
  await page.getByRole('button', { name: ada.email }).click();
  await sheet(page).getByRole('button', { name: 'Suspend account' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('Admin accounts cannot be changed here.');
  await sheet(page).getByRole('button', { name: 'Send password reset link' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('This account is being deleted, so it cannot be enabled.');
  await sheet(page).getByRole('button', { name: 'Delete account' }).click();
  await sheet(page).getByLabel('Type the email to confirm').fill(ada.email);
  await sheet(page).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('The email you typed does not match this account.');
  await expect(sheet(page).getByRole('button', { name: 'Delete permanently' })).toBeEnabled();
});

test('TC-ADM-US-10: empty state differs for filters and for no accounts', async ({ page }) => {
  await open(page, { users: [] });
  await expect(page.getByText('Accounts appear here once someone signs up.')).toBeVisible();
  await expect(page.getByText('0 accounts')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search by email' }).fill('zzz');
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
});

test('TC-ADM-US-11: a failed list shows what failed and Retry loads it', async ({ page }) => {
  const mock = await open(page, { failList: true });
  await expect(page.getByRole('alert')).toContainText('Could not load accounts.');
  mock.failList = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('row', { name: /ada@example\.test/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('TC-ADM-US-12: at 390 px nothing scrolls sideways and the sheet fits', async ({ page }) => {
  await mockAdminAccount(page);
  await mockAdminUsers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: ada.email })).toBeVisible();
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await fits()).toBe(true);
  await page.getByRole('button', { name: ada.email }).click();
  await expect(sheet(page).getByRole('button', { name: 'Suspend account' })).toBeVisible();
  expect(await fits()).toBe(true);
  const box = await sheet(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('TC-ADM-US-13: Thai renders labels, relative time and Buddhist-era dates', async ({ page }) => {
  await mockAdminAccount(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockAdminUsers(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'ผู้ใช้' })).toBeVisible();
  await expect(page.getByText('5 บัญชี')).toBeVisible();
  await expect(page.getByRole('row', { name: /bo@example\.test/ })).toContainText('ถูกระงับ');
  await expect(page.getByRole('row', { name: /ada@example\.test/ })).toContainText('2569');
  await expect(page.getByText('ไม่เห็น CV แชต หรือเอกสารของผู้ใช้')).toBeVisible();
  await page.getByRole('button', { name: ada.email }).click();
  await expect(sheet(page).getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' })).toBeVisible();
  await expect(sheet(page).getByText('คุณไม่เห็นรหัสผ่านและไม่เห็นลิงก์')).toBeVisible();
});

test('TC-ADM-US-14: Thai pager reads in Thai', async ({ page }) => {
  await mockAdminAccount(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockAdminUsers(page, { users: [...baseUsers, ...manyUsers(18)] });
  await page.goto('/admin/users');
  await expect(page.getByText('แสดง 1–10 จาก 23 รายการ')).toBeVisible();
  await expect(page.getByText('หน้า 1 จาก 3')).toBeVisible();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByText('หน้า 2 จาก 3')).toBeVisible();
});
