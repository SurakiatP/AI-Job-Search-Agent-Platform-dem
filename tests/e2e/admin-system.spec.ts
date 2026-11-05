import { expect, test, type Page } from '@playwright/test';
import { mockNormalAccount } from '../fixtures/admin';
import { dead, mockSystem } from '../fixtures/admin-system';

const card = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); });

const chart = (page: Page, name: string, range = 'Last hour') => page.getByRole('group', { name: new RegExp(`^${name}, ${range}: `) });

test('TC-ADM-SY-01: health shows each component in words, one bar chart per component and the 30 second check', async ({ page }) => {
  await mockSystem(page);
  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { level: 1, name: 'System' })).toBeVisible();
  await expect(page.getByText('All four components are working.')).toBeVisible();
  const health = card(page, 'Health');
  await expect(health.getByText('Checked every 30 seconds')).toBeVisible();
  await expect(health.getByRole('button', { name: 'Time range: Last hour' })).toBeVisible();
  for (const name of ['Database', 'File storage', 'AI gateway', 'Sandbox']) await expect(health.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(health.getByText('Working', { exact: true })).toHaveCount(4);
  const gateway = chart(page, 'AI gateway');
  await expect(gateway).toHaveAccessibleName('AI gateway, Last hour: 116 of 117 checks passed');
  await expect(gateway.locator('[data-status]')).toHaveCount(120); // 1 h in 30 s buckets
  await expect(gateway.locator('[data-status="none"]')).toHaveCount(3);
  await expect(health.getByText('99.1% up · last 150 ms')).toBeVisible();
  await expect(health.getByText('99.1% up · last 150 ms')).toHaveCount(1);
  await gateway.locator('[data-status]').nth(60).hover();
  await expect(page.getByRole('tooltip')).toHaveText(/^\d\d:\d\d:\d\d–\d\d:\d\d:\d\d · Working · 150 ms$/);
  await gateway.locator('[data-status]').nth(1).hover();
  await expect(page.getByRole('tooltip')).toHaveText(/ · No check$/);
  await page.screenshot({ path: 'test-results/admin-system-desktop.png', fullPage: true });
});

test('TC-ADM-SY-14: choosing a range refetches with ?range=, keeps it in the URL and draws that many bars', async ({ page }) => {
  const { ranges } = await mockSystem(page);
  await page.goto('/admin/system');
  await expect(chart(page, 'Database').locator('[data-status]')).toHaveCount(120);
  expect(ranges).toContain('1h');
  const health = card(page, 'Health');
  await health.getByRole('button', { name: 'Time range: Last hour' }).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(12); // the same 12 options as the Overview
  await page.getByRole('menuitemradio', { name: 'Last 7 days' }).click();
  await expect(page).toHaveURL(/\/admin\/system\?range=7d/);
  await expect(chart(page, 'Database', 'Last 7 days').locator('[data-status]')).toHaveCount(168);
  expect(ranges).toContain('7d');
  await expect(page.getByRole('heading', { level: 2, name: 'Job ingest' })).toBeVisible(); // the rest of the page stayed
  await page.reload();
  await expect(health.getByRole('button', { name: 'Time range: Last 7 days' })).toBeVisible();
  await expect(chart(page, 'Database', 'Last 7 days').locator('[data-status]')).toHaveCount(168);
});

test('TC-ADM-SY-15: a down bar is red and full height with a tooltip, a slow one is amber, keyboard reads each bar', async ({ page }) => {
  await mockSystem(page);
  await page.goto('/admin/system');
  const gateway = chart(page, 'AI gateway');
  const bad = gateway.locator('[data-status="down"]');
  await expect(bad).toHaveCount(1);
  const [barBox, rowBox] = await Promise.all([bad.locator('i').boundingBox(), gateway.locator('[data-status]').first().boundingBox()]);
  expect(Math.abs(barBox!.height - rowBox!.height)).toBeLessThan(2); // full height
  const colour = (loc: ReturnType<Page['locator']>) => loc.locator('i').evaluate(el => getComputedStyle(el).backgroundColor);
  const red = await colour(bad);
  const green = await colour(gateway.locator('[data-status="ok"]').first());
  expect(red).not.toBe(green);
  await expect(bad.locator('i')).toHaveClass(/bg-destructive-fill/);
  await bad.hover();
  await expect(page.getByRole('tooltip')).toHaveText('13:50:30–13:51:00 · Not responding (1 of 1 checks failed)');
  const sandbox = chart(page, 'Sandbox');
  await expect(sandbox.locator('[data-status="slow"] i')).toHaveClass(/bg-warning/);
  await sandbox.locator('[data-status="slow"]').hover();
  await expect(page.getByRole('tooltip')).toHaveText(/Working, but slow · 2\.5 s$/);
  await page.mouse.move(0, 0);
  await gateway.getByRole('slider').focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tooltip')).toHaveText(/14:00:00–14:00:30 · Working · 150 ms$/);
  await page.keyboard.press('ArrowLeft');
  await expect(gateway.getByRole('slider')).toHaveAttribute('aria-valuenow', '119');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('TC-ADM-SY-16: the charts refresh every 30 seconds without replaying the draw-in', async ({ page }) => {
  await page.clock.install();
  const { ranges } = await mockSystem(page);
  await page.goto('/admin/system');
  await expect(chart(page, 'Database').locator('[data-status]')).toHaveCount(120);
  const before = ranges.length;
  const bar = chart(page, 'Database').locator('[data-bar="ok"]').first();
  await page.clock.fastForward(1000);
  await bar.evaluate(el => { el.setAttribute('data-seen', '1'); });
  await page.clock.fastForward(30_000);
  await expect.poll(() => ranges.length).toBeGreaterThan(before);
  await expect(chart(page, 'Database').locator('[data-status]')).toHaveCount(120);
  expect(await bar.evaluate(el => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/); // still fully drawn, not restarted from scaleY(0)
});

test('TC-ADM-SY-02: a component that is down is named and marked in words, not colour alone', async ({ page }) => {
  await mockSystem(page, { components: { sandbox: 'down' } });
  await page.goto('/admin/system');
  await expect(page.getByRole('alert').filter({ hasText: '1 component is not responding: Sandbox.' })).toBeVisible();
  await expect(page.getByText('Not responding', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Working', { exact: true })).toHaveCount(3);
});

test('TC-ADM-SY-03: ingest table shows the latest run per board and a history sheet', async ({ page }) => {
  await mockSystem(page);
  await page.goto('/admin/system');
  const table = page.getByRole('table', { name: 'Job ingest' });
  await expect(table.getByRole('row')).toHaveCount(3); // header + 2 boards
  const lever = table.getByRole('row', { name: /lever/ });
  await expect(lever).toContainText('Partial');
  await expect(lever).toContainText('timeout');
  const greenhouse = table.getByRole('row', { name: /greenhouse/ });
  await expect(greenhouse).toContainText('Complete');
  await expect(greenhouse).toContainText('120');
  await expect(greenhouse).not.toContainText('http_503'); // the older failed run is history only
  await greenhouse.click();
  const sheet = page.getByRole('dialog', { name: 'greenhouse history' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('row')).toHaveCount(3);
  await expect(sheet).toContainText('Failed');
  await expect(sheet).toContainText('http_503');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show history of greenhouse' })).toBeFocused();
});

test('TC-ADM-SY-04: webhook counts, the dead and pending filters, and only the endpoint host', async ({ page }) => {
  await mockSystem(page);
  await page.goto('/admin/system');
  await expect(card(page, 'Webhooks').getByText('Delivered', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('40');
  const table = page.getByRole('table', { name: 'Webhooks' });
  await expect(table.getByRole('row')).toHaveCount(2); // default filter: failed
  await expect(table).toContainText('job.saved');
  await expect(table).toContainText('hooks.example.test');
  await expect(table).toContainText('5 attempts · HTTP 500');
  await expect(table).not.toContainText('https://');
  await page.getByRole('group', { name: 'Show deliveries' }).getByRole('button', { name: 'Pending' }).click();
  await expect(table).toContainText('run.completed');
  await expect(table).not.toContainText('job.saved');
  await expect(table.getByRole('button', { name: /Resend/ })).toHaveCount(0); // only failed ones can be resent
  await page.getByRole('group', { name: 'Show deliveries' }).getByRole('button', { name: 'All' }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
});

test('TC-ADM-SY-05: resend shows busy, sends once, then confirms', async ({ page }) => {
  const { resends } = await mockSystem(page);
  await page.goto('/admin/system');
  const button = page.getByRole('button', { name: 'Resend job.saved to hooks.example.test' });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('Sending…');
  await expect(page.getByRole('status').filter({ hasText: 'Queued to send again.' })).toBeVisible();
  expect(resends).toEqual([dead.id]);
  await expect(page.getByRole('table', { name: 'Webhooks' }).getByText('Pending', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resend/ })).toHaveCount(0);
});

test('TC-ADM-SY-06: resending a delivery that is no longer failed explains why', async ({ page }) => {
  const { resends } = await mockSystem(page, { resend: 'not_dead' });
  await page.goto('/admin/system');
  await page.getByRole('button', { name: /^Resend job.saved/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Only failed deliveries can be sent again. Refresh the list.' })).toBeVisible();
  expect(resends).toHaveLength(1);
  await expect(page.getByRole('button', { name: /^Resend job.saved/ })).toBeEnabled();
});

test('TC-ADM-SY-07: the AI gateway and Tools sections work on the System page, with no LiteLLM link', async ({ page }) => {
  await mockSystem(page);
  const providerCalls: string[] = [];
  page.on('request', r => { const p = new URL(r.url()).pathname; if (/^\/api\/v1\/(providers|settings\/provider)/.test(p)) providerCalls.push(p); });
  await page.goto('/admin/system');
  await expect(page.getByText('The AI gateway is configured and reachable.')).toBeVisible();
  await expect(page.getByText('typesafe/jev-1.13')).toBeVisible();
  await expect(page.getByText('ai-extra')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage models in LiteLLM' })).toHaveCount(0);
  await expect(page.locator('a[href$="/ui"]')).toHaveCount(0);
  await expect(page.getByLabel('API key')).toHaveCount(0);
  const tools = card(page, 'Tools');
  await expect(tools).toContainText('evaluate_job');
  await expect(tools).toContainText('jobs:evaluate');
  expect(providerCalls).toEqual([]);
});

test('TC-ADM-SY-08: an unconfigured gateway shows the key hint (Thai)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockSystem(page, { gateway: { configured: false, reachable: false, base_url: null, analyze_model: 'openai/gpt-6-luna', decision_model: 'ai-decide', models: [] } });
  await page.goto('/admin/system');
  await expect(page.getByText('ยังไม่ได้ตั้งค่า AI gateway')).toBeVisible();
  await expect(page.getByText('OPENROUTER_API_KEY')).toBeVisible();
  await expect(page.locator('a[href$="/ui"]')).toHaveCount(0);
});

test('TC-ADM-SY-09: the connection channel command is here and can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockSystem(page);
  await page.goto('/admin/system');
  await expect(page.locator('pre[aria-label="Open the connection channel"]')).toContainText('--enable-sharing');
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('--enable-sharing');
});

test('TC-ADM-SY-10: user Settings no longer shows the gateway or tools, and the Connect tab has no server command', async ({ page }) => {
  await mockNormalAccount(page);
  const gateway: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname === '/v1/gateway') gateway.push(r.url()); });
  await page.goto('/app/settings?section=gateway');
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
  for (const name of ['AI gateway', 'Tools']) await expect(nav.getByRole('button', { name })).toHaveCount(0);
  await expect(nav.getByRole('group', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/app/settings?section=tools');
  await expect(nav.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
  expect(gateway).toEqual([]);
});

test('TC-ADM-SY-11: loading failure offers Retry, and empty boards and probes say what will appear', async ({ page }) => {
  const { heal } = await mockSystem(page, { down: true, ingest: [], probes: [], deliveries: [] });
  await page.goto('/admin/system');
  await expect(page.getByRole('alert').filter({ hasText: 'We could not load the system status.' })).toBeVisible();
  heal();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No ingest run has finished yet.')).toBeVisible();
  await expect(page.getByText('No failed deliveries.')).toBeVisible();
  await expect(page.getByText('No checks yet')).toHaveCount(8); // each component: its summary and its empty chart
  await expect(page.getByText('No checks in this range yet. Bars appear here after the first check.')).toBeVisible();
});

test('TC-ADM-SY-12: the page fits a 390 px phone without sideways scroll, in English and Thai', async ({ page }) => {
  await mockSystem(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['en', 'th']) {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await page.goto('/admin/system');
    await expect(page.getByRole('heading', { level: 1, name: locale === 'en' ? 'System' : 'ระบบ' })).toBeVisible();
    await expect(page.getByRole('button', { name: locale === 'en' ? /^Resend/ : /^ส่ง .* ใหม่$/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => localStorage.setItem('ui.locale', 'en'));
  }
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await page.goto('/admin/system?range=7d');
  await expect(page.getByText('ทั้ง 4 ส่วนทำงานปกติ')).toBeVisible();
  await expect(page.getByText('ตรวจทุก 30 วินาที')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ช่วงเวลา: 7 วันล่าสุด' })).toBeVisible();
  const bars = page.getByRole('group', { name: /^เกตเวย์ AI 7 วันล่าสุด: / }).locator('[data-status]');
  await expect(bars).toHaveCount(168);
  await bars.nth(100).dispatchEvent('pointerdown'); // a tap
  await expect(page.getByRole('tooltip')).toContainText('ทำงานปกติ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('heading', { name: 'การดึงงาน' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-system-mobile-th.png', fullPage: true });
});

test('TC-ADM-SY-13: the ingest table shows 10 boards per page and pages with next and previous', async ({ page }) => {
  const boards = Array.from({ length: 23 }, (_, i) => ({ board: `lever:b${String(i).padStart(2, '0')}`, at: `2026-11-04T06:${String(59 - i).padStart(2, '0')}:00Z`, status: 'complete', jobs_total: i, jobs_new: 0, error_code: null }));
  await mockSystem(page, { ingest: boards });
  await page.goto('/admin/system');
  const table = page.getByRole('table', { name: 'Job ingest' });
  await expect(table.getByRole('row')).toHaveCount(11); // header + 10
  await expect(page.getByText('Showing 1–10 of 23')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Showing 11–20 of 23')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(table.getByRole('row')).toHaveCount(4); // header + 3
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(page.getByText('Page 3 of 3')).toBeVisible();
});
