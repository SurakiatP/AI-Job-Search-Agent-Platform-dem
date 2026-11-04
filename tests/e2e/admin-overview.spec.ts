import { expect, test } from '@playwright/test';
import { emptyOverview, healthyComponents, mockOverview, overviewBody } from '../fixtures/admin-overview';

const ranges = ['Last 1 minute', 'Last 5 minutes', 'Last 10 minutes', 'Last 15 minutes', 'Last 30 minutes', 'Last hour', 'Last 4 hours', 'Last 10 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Since the start'];

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

test('TC-ADM-OV-01: the four KPI cards show their values and change chips', async ({ page }) => {
  await mockOverview(page);
  await page.goto('/admin');
  const tabs = page.getByRole('tablist', { name: 'Choose the number shown in the chart' });
  await expect(tabs.getByRole('tab')).toHaveCount(4);
  const runs = tabs.getByRole('tab', { name: /AI runs/ });
  await expect(runs).toContainText('1,204');
  await expect(runs).toContainText('+20%');
  await expect(tabs.getByRole('tab', { name: /Failure rate/ })).toContainText('5.0%');
  await expect(tabs.getByRole('tab', { name: /Failure rate/ })).toContainText('−50%');
  await expect(tabs.getByRole('tab', { name: /AI cost/ })).toContainText('฿437.50');
  await expect(runs).toHaveAttribute('aria-selected', 'true');
});

test('TC-ADM-OV-01b: if the exchange rate cannot load, cost shows in USD with a note', async ({ page }) => {
  await mockOverview(page, { fxFail: true });
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: /AI cost/ })).toContainText('$12.50');
  await expect(page.getByText('Cost is shown in US dollars because the exchange rate could not be loaded.')).toBeVisible();
});

test('TC-ADM-OV-02: compare=false hides the change chips and the previous-period line', async ({ page }) => {
  await mockOverview(page, { overview: overviewBody({ compare: false, previous_series: [], kpis: {
    runs: { value: 1204, previous: null }, active_users: { value: 96, previous: null }, failure_rate: { value: 0.05, previous: null }, cost_usd: { value: 12.5, previous: null }, cost_has_manual: false } }) });
  await page.goto('/admin?range=all');
  const runs = page.getByRole('tab', { name: /AI runs/ });
  await expect(runs).toContainText('1,204');
  await expect(runs).not.toContainText('%');
  await expect(page.getByText('Previous period')).toHaveCount(0);
});

test('TC-ADM-OV-03: choosing a KPI card switches the trend question', async ({ page }) => {
  await mockOverview(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'How many AI runs happened over time?' })).toBeVisible();
  await page.getByRole('tab', { name: /Failure rate/ }).click();
  await expect(page.getByRole('heading', { name: 'How many AI runs failed over time?' })).toBeVisible();
  await page.getByRole('tab', { name: /AI cost/ }).click();
  await expect(page.getByRole('heading', { name: 'How much did AI cost over time?' })).toBeVisible();
});

test('TC-ADM-OV-04: the range menu has 12 options, changes the request and the URL', async ({ page }) => {
  const seen = await mockOverview(page);
  await page.goto('/admin');
  await expect.poll(() => seen.ranges).toContain('7d');
  await page.getByRole('button', { name: /^Time range: Last 7 days/ }).click();
  await expect(page.getByRole('menuitemradio')).toHaveText(ranges);
  await page.getByRole('menuitemradio', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect.poll(() => seen.ranges).toContain('30d');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Time range: Last 30 days/ })).toBeVisible();
});

test('TC-ADM-OV-05: clicking a chart bucket opens the breakdown sheet', async ({ page }) => {
  const seen = await mockOverview(page);
  await page.goto('/admin');
  const slider = page.getByRole('slider', { name: /Move between points/ });
  await slider.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'By task' })).toBeVisible();
  await expect(sheet).toContainText('Evaluate job');
  await expect(sheet).toContainText('Draft documents');
  expect(seen.bucketUrls[0]).toMatch(/metric=runs/);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('TC-ADM-OV-06: hiding a widget from its menu saves the choice; Customize adds it back', async ({ page }) => {
  const seen = await mockOverview(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Busiest weekdays' })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Busiest weekdays' }).click();
  await page.getByRole('menuitem', { name: 'Hide this widget' }).click();
  await expect(page.getByRole('heading', { name: 'Busiest weekdays' })).toHaveCount(0);
  await expect.poll(() => seen.prefsPut.at(-1)).toMatchObject({ widgets: ['trend', 'attention', 'speed', 'tasks'] });
  await page.getByRole('button', { name: 'Customize' }).click();
  const sheet = page.getByRole('dialog', { name: 'Customize the overview' });
  await expect(sheet.getByRole('button')).toHaveCount(9);
  await sheet.getByRole('button', { name: /Activity|Admin activity: Add/ }).click();
  await expect.poll(() => seen.prefsPut.at(-1)).toMatchObject({ widgets: ['trend', 'attention', 'speed', 'tasks', 'activity'] });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Latest admin actions' })).toBeVisible();
  await expect(page.getByText('Suspended user 31d09a00')).toBeVisible();
});

test('TC-ADM-OV-07: a refused save puts the widget back and says so', async ({ page }) => {
  await mockOverview(page, { failPrefs: true });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Options for Top tasks' }).click();
  await page.getByRole('menuitem', { name: 'Hide this widget' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'could not be saved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tasks that use AI the most' })).toBeVisible();
});

test('TC-ADM-OV-08: Export CSV requests the chosen range, shows busy, then a status message', async ({ page }) => {
  const seen = await mockOverview(page);
  await page.goto('/admin?range=30d');
  await expect(page.getByRole('tab', { name: /AI runs/ })).toContainText('1,204');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('overview-30d.csv');
  expect(seen.csvUrls[0]).toMatch(/\/v1\/admin\/overview\.csv\?range=30d$/);
  await expect(page.getByRole('status').filter({ hasText: 'Downloaded overview-30d.csv' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
});

const cells = (c: Record<string, string>) => Object.fromEntries(Object.entries(c).map(([k, status]) => [k, { status, ms: 40, failed: status === 'ok' ? 0 : 1, checks: 1 }]));

test('TC-ADM-OV-09: a down component shows the red strip and the fix sheet with since-when from probes', async ({ page }) => {
  const down = { ...healthyComponents, sandbox: 'down' };
  await mockOverview(page, {
    overview: overviewBody({ health: { components: down }, attention: [{ kind: 'health_down', severity: 'bad', title_key: 'attention.health_down', params: { component: 'sandbox' }, target: '/admin/system' }] }),
    probes: [
      { checked_at: '2026-11-04T06:50:00Z', components: cells(healthyComponents) },
      { checked_at: '2026-11-04T07:00:00Z', components: cells(down) },
      { checked_at: '2026-11-04T07:25:00Z', components: cells(down) },
    ],
  });
  await page.goto('/admin');
  const strip = page.getByRole('alert').filter({ hasText: 'The AI run environment is down' });
  await expect(strip).toBeVisible();
  await strip.getByRole('button', { name: 'How to fix' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'The AI run environment is down' })).toBeVisible();
  await expect(sheet).toContainText('Run the test-ai job in GitLab');
  await expect(sheet.getByText('14:00')).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Open the System page' })).toHaveAttribute('href', '/admin/system');
});

test('TC-ADM-OV-10: needs attention lists items with links to the right admin page', async ({ page }) => {
  await mockOverview(page);
  await page.goto('/admin');
  const w = page.locator('[data-widget="attention"]');
  await expect(w).toContainText('4 Evaluate job runs failed in the last 24 hours');
  await expect(w.getByRole('link', { name: 'View failed runs' })).toHaveAttribute('href', '/admin/runs?status=failed&operation=evaluate_job');
  await expect(w).toContainText('2 webhook deliveries gave up');
});

test('TC-ADM-OV-11: other widgets show weekday, speed gauge and top tasks', async ({ page }) => {
  await mockOverview(page);
  await page.goto('/admin');
  await expect(page.getByRole('img', { name: /Sunday: 412 runs a day/ })).toBeVisible();
  await expect(page.getByText('Sunday is the quietest day')).toBeVisible();
  await expect(page.getByRole('img', { name: /86% of completed runs finished within 30 seconds. The target is 90%/ })).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table).toContainText('Read documents (OCR)');
  await expect(table).toContainText('92.0%');
});

test('TC-ADM-OV-12: empty data shows zero states, not blank boxes', async ({ page }) => {
  await mockOverview(page, { overview: emptyOverview(), widgets: ['trend', 'attention', 'weekday', 'speed', 'tasks', 'models'] });
  await page.goto('/admin');
  await expect(page.getByText('Nothing has happened in this period yet')).toBeVisible();
  await expect(page.getByText('Nothing needs attention')).toBeVisible();
  await expect(page.getByText('There is no run in the last 90 days yet.')).toBeVisible();
  await expect(page.getByText('No run has finished in this period yet.')).toBeVisible();
  await expect(page.getByText('No runs in this period.')).toBeVisible();
  await expect(page.getByText('No priced model calls in this period.')).toBeVisible();
  await expect(page.getByRole('tab', { name: /AI runs/ })).toContainText('0');
});

test('TC-ADM-OV-13: a failed load shows an error with Try again', async ({ page }) => {
  await mockOverview(page);
  let fail = true;
  await page.route('**/v1/admin/overview?**', route => fail ? route.fulfill({ status: 500, json: { code: 'internal_error', message_key: 'errors.internal_error', retryable: true } }) : route.fallback());
  await page.goto('/admin');
  await expect(page.getByText('The overview could not be loaded')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('tab', { name: /AI runs/ })).toContainText('1,204');
});

test('TC-ADM-OV-14: the page refreshes in the background and keeps the chosen KPI', async ({ page }) => {
  await page.clock.install();
  const seen = await mockOverview(page);
  await page.goto('/admin');
  await page.getByRole('tab', { name: /AI cost/ }).click();
  const before = seen.ranges.length;
  await page.clock.fastForward(31_000);
  await expect.poll(() => seen.ranges.length).toBeGreaterThan(before);
  await expect(page.getByRole('tab', { name: /AI cost/ })).toHaveAttribute('aria-selected', 'true');
});

test('TC-ADM-OV-15: at 390 px nothing scrolls sideways and the KPIs sit two by two', async ({ page }) => {
  await mockOverview(page, { widgets: ['trend', 'attention', 'weekday', 'speed', 'tasks', 'activity', 'models'] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: /AI runs/ })).toContainText('1,204');
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const [a, b, c] = await Promise.all(['AI runs', 'Active users', 'Failure rate'].map(n => page.getByRole('tab', { name: new RegExp(n) }).boundingBox()));
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(c!.y).toBeGreaterThan(a!.y + 20);
});

test('TC-ADM-OV-16: Thai renders in the headings, range menu and KPIs', async ({ page }) => {
  await mockOverview(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวม' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ช่วงเวลา: 7 วันล่าสุด/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /งาน AI/ })).toContainText('1,204');
  await expect(page.getByRole('heading', { name: 'ต้องจัดการ' })).toBeVisible();
  await expect(page.getByText('อัปเดตทุก 30 วินาที')).toBeVisible();
});
