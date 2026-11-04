import { expect, test, type Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const base = `/app/projects/${projectId}`;
const make = (n: number, kind: string, data: Record<string, unknown>, read = false) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`, project_id: projectId, kind, run_id: `bbbbbbbb-0000-4000-8000-00000000000${n}`,
  data, created_at: new Date(Date.now() - n * 5 * 60_000).toISOString(), read_at: read ? '2026-11-04T10:00:00Z' : null,
});
const sample = () => [
  make(1, 'run_completed', { operation: 'evaluate_job', session_id: sessionId, job_title: 'Data Analyst', job_company: 'Example Co' }),
  make(2, 'run_needs_input', { operation: 'apply_prepare', session_id: sessionId, job_title: 'Data Analyst' }),
  make(3, 'run_failed', { operation: 'tailor_cv', session_id: sessionId }),
  make(4, 'digest_ready', { saved_search_name: 'Analyst Bangkok', count: 3 }, true),
];
const bell = (page: Page) => page.getByRole('button', { name: /^(Notifications|การแจ้งเตือน)/ }).filter({ visible: true });

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

test('TC-NTF-05 the bell counts unread, the panel lists sentences, a row marks read and opens its page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { notifications: sample() });
  await page.goto(`${base}/overview`);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
  await bell(page).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(5); // mark all + 4 rows
  await expect(menu).toContainText('Fit score ready for Data Analyst · Example Co');
  await expect(menu).toContainText('Application answers waiting for your answer');
  await expect(menu).toContainText('5 minutes ago');
  await expect(menu).toContainText('3 new jobs for “Analyst Bangkok”');
  const row = menu.getByRole('menuitem', { name: /Fit score ready/ });
  await expect(row).toContainText('unread');
  const read = page.waitForRequest(r => r.url().endsWith('/v1/notifications/read') && r.method() === 'POST');
  await row.click();
  expect((await read).postDataJSON()).toEqual({ ids: ['aaaaaaaa-0000-4000-8000-000000000001'] });
  await expect(page).toHaveURL(new RegExp(`${base}/sessions/${sessionId}$`));
  await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread');
});

test('TC-NTF-06 Mark all as read sets the count to 0', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { notifications: sample() });
  await page.goto(`${base}/overview`);
  await bell(page).click();
  await page.getByRole('menuitem', { name: 'Mark all as read' }).click();
  await page.keyboard.press('Escape'); // the open menu hides the page behind it from the accessibility tree
  await expect(bell(page)).toHaveAccessibleName('Notifications');
});

test('TC-NTF-07 a new notification shows the snackbar with Open, unless already on its page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  const items = sample();
  await useSyntheticApplication(page, { notifications: items });
  await page.goto(`${base}/overview`);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
  items.unshift(make(5, 'run_completed', { operation: 'draft_documents', session_id: sessionId, job_title: 'Writer' }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const snack = page.getByRole('status').filter({ hasText: 'Documents drafted for Writer' });
  await expect(snack).toBeVisible();
  await snack.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/sessions/${sessionId}$`));
  // Already on the page: the next one for the same page raises the badge but no snackbar.
  items.unshift(make(6, 'run_completed', { operation: 'evaluate_job', session_id: sessionId, job_title: 'Another' }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(bell(page)).toHaveAccessibleName('Notifications, 4 unread');
  await expect(page.getByRole('status').filter({ hasText: 'Another' })).toHaveCount(0);
});

for (const locale of ['th', 'en'] as const) {
  test(`TC-NTF-08 empty state, keyboard and 390 px layout (${locale})`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useSyntheticApplication(page, { notifications: [] });
    await page.goto(`${base}/overview`);
    await bell(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toContainText(locale === 'th' ? 'ยังไม่มีการแจ้งเตือน' : 'No notifications yet');
    await page.keyboard.press('Escape');
    await expect(bell(page)).toBeFocused();

    const filled = sample();
    await page.unroute('**/v1/**');
    await useSyntheticApplication(page, { notifications: filled });
    await page.goto(`${base}/overview`);
    await bell(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(bell(page)).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await bell(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.getByRole('menu').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
}
