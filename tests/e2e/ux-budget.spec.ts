// UX click budget (docs/ux-redesign/UX_SIMPLIFY_PLAN.md sections 4 and 5).
// Expected to FAIL until waves W1-W6 land. Every check uses expect.soft, and the last test prints
// a table of current vs target, so the report shows the gap instead of stopping at the first miss.
import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';
import { useApplicationsWorkspaceFixture } from '../fixtures/applications-workspace';
import { useMaterialsFixture } from '../fixtures/materials';

const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=menuitem], [role=switch], [role=radio], [role=checkbox], [tabindex]:not([tabindex="-1"])';

/** Visible interactive elements inside `scope` whose top edge is above the fold. */
async function count(page: Page, scope: string) {
  return page.evaluate(({ scope, selector }) => {
    const root = document.querySelector(scope);
    if (!root) return -1;
    return [...root.querySelectorAll<HTMLElement>(selector)].filter(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.top < innerHeight && r.bottom > 0;
    }).length;
  }, { scope, selector: INTERACTIVE });
}

/**
 * Controls of one list row (top edge above the fold). A split button (`role=group` inside the row) is one control:
 * it reads as one button with a menu edge.
 */
async function rowCounts(page: Page, row: string) {
  return page.evaluate(({ row, selector }) => [...document.querySelectorAll(row)].filter(r => r.getBoundingClientRect().top < innerHeight).map(r => new Set(
    [...r.querySelectorAll<HTMLElement>(selector)].filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map(el => el.closest('[role=group]') ?? el),
  ).size), { row, selector: INTERACTIVE });
}

/** Controls above the fold in `scope` that are not inside a list row. */
async function pageCount(page: Page, scope: string, row: string) {
  return page.evaluate(({ scope, row, selector }) => [...(document.querySelector(scope)?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(el => {
    const r = el.getBoundingClientRect();
    return !el.closest(row) && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.top < innerHeight && r.bottom > 0;
  }).length, { scope, row, selector: INTERACTIVE });
}

type Row = { screen: string; width: number; locale: string; current: number; target: number | string };
const rows: Row[] = [];
const base = `/app/projects/${projectId}`;

// My jobs grows with the user's data, so a whole-page count would measure the fixture, not the design.
// It is budgeted as page-level controls (<= 11) plus controls per row (<= 2: the row link and the split next-step button).
const ROW = 'main ul[aria-label] > li';
const screens: Array<{ name: string; route: string; target: number; perRow?: number; setup?: (p: Page) => Promise<unknown> }> = [
  { name: 'Today', route: `${base}/overview`, target: 6 },
  { name: 'Find jobs', route: `${base}/search?q=data`, target: 11, // 10 -> 11 (CH-04): one "Paste a posting" link beside the search tools
     setup: stubSearch },
  { name: 'My jobs', route: `${base}/applications`, target: 11, perRow: 2, setup: useApplicationsWorkspaceFixture },
  { name: 'Job detail', route: `${base}/jobs/${jobId}`, target: 8, setup: useApplicationsWorkspaceFixture },
  { name: 'Session', route: `${base}/sessions/${sessionId}`, target: 8 },
  { name: 'CV (empty)', route: `${base}/profile`, target: 3, setup: p => useMaterialsFixture(p, { emptyCvs: true }) },
  { name: 'Documents', route: `${base}/documents`, target: 7, setup: useMaterialsFixture },
];

/** Session whose evaluation finished, so its next step is "Draft cover letter". */
async function evaluatedSession(page: Page) {
  await useSyntheticApplication(page);
  const run = { id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: { score: 4.2, report_markdown: 'Strong SQL.', skill_coverage: { matched: ['SQL'], missing: ['dbt'], required: ['SQL', 'dbt'], ratio: 0.5 } } };
  await page.route(new RegExp(`(?:/v1/projects/${projectId}/runs|/v1/async/projects/${projectId}/agent-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [run] }));
  await page.route(`**/v1/projects/${projectId}/runs/*/events`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
}

async function stubSearch(page: Page) {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/job-search**`, route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/facets')
    ? { total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 1, thai_postings: 1 }
    : { items: [{ slug: 'synthetic-review', title: 'Synthetic analyst opportunity', company: 'Example Co', skills: ['SQL'], source_url: 'https://jobs.example.test/1', description_markdown: 'Synthetic role.' }], total: 1, limit: 20, offset: 0 } }));
  // One usable CV, so a result offers "Get fit score" instead of "Add a CV".
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.request().method() === 'GET' ? route.fulfill({ json: [{ id: '77777777-7777-4777-8777-777777777771', project_id: projectId, name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', latest_revision: { id: '77777777-7777-4777-8777-777777777772', revision: 1, original_filename: 'data-cv.pdf', skill_profile_ready: true, created_at: '2026-10-01T00:00:00Z' } }] }) : route.fallback());
  await page.route(`**/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ json: { items: [], status: { email_verified: true, notifications_enabled: true } } }));
}

for (const locale of ['th', 'en']) {
  test(`button budget, 1440 ${locale}`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const s of screens) {
      await (s.setup ?? useSyntheticApplication)(page);
      await page.goto(s.route);
      await page.waitForLoadState('networkidle');
      if (s.perRow) {
        await page.locator(ROW).first().waitFor();
        const pageLevel = await pageCount(page, 'main', ROW);
        const widest = Math.max(0, ...await rowCounts(page, ROW));
        rows.push({ screen: s.name, width: 1440, locale, current: pageLevel, target: `<= ${s.target}` });
        rows.push({ screen: `${s.name} per row`, width: 1440, locale, current: widest, target: `<= ${s.perRow}` });
        expect.soft(pageLevel, `${s.name} page-level controls above the fold`).toBeLessThanOrEqual(s.target);
        expect.soft(widest, `${s.name} controls in one row`).toBeLessThanOrEqual(s.perRow);
        continue;
      }
      const main = await count(page, 'main');
      rows.push({ screen: s.name, width: 1440, locale, current: main, target: `<= ${s.target}` });
      expect.soft(main, `${s.name} main controls above the fold`).toBeLessThanOrEqual(s.target);
    }
    await useSyntheticApplication(page);
    await page.goto(`${base}/overview`);
    await page.locator('aside').first().waitFor();
    const sidebar = await count(page, 'aside');
    // 9 nav/menu controls + the visible language toggle the owner asked to keep (2026-11-04).
    rows.push({ screen: 'Sidebar', width: 1440, locale, current: sidebar, target: '<= 10' });
    expect.soft(sidebar, 'sidebar controls').toBeLessThanOrEqual(10);
  });

  test(`primary action inside first viewport, 390 ${locale}`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const s of screens) {
      await (s.setup ?? useSyntheticApplication)(page);
      await page.goto(s.route);
      await page.waitForLoadState('networkidle');
      const main = await count(page, 'main');
      rows.push({ screen: `${s.name} (mobile)`, width: 390, locale, current: main, target: '>= 1' });
      expect.soft(main, `${s.name} has a control in the first mobile viewport`).toBeGreaterThanOrEqual(1);
    }
    await useSyntheticApplication(page);
    await page.goto(`${base}/overview`);
    await page.waitForLoadState('networkidle');
    // Plan 2.1: bottom tab bar with 5 items replaces the hamburger drawer.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('nav')].map(n => n.querySelectorAll('a[href]').length));
    expect.soft(Math.max(0, ...tabs), 'mobile bottom nav has 5 items').toBe(5);
    expect.soft(await page.getByRole('button', { name: locale === 'th' ? 'เปิดเมนู' : 'Open menu', exact: true }).count(), 'hamburger is gone').toBe(0);
  });

  // Section 5: each job should be reachable in the target click count. Presence of the one-click control is the proxy.
  test(`click paths (section 5), ${locale}`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await page.setViewportSize({ width: 1440, height: 900 });
    const score = locale === 'th' ? /ดูคะแนนความเหมาะสม/ : /Get fit score/;
    const applied = locale === 'th' ? /ฉันสมัครแล้ว/ : /I applied/;
    const draft = locale === 'th' ? /ร่างจดหมายสมัครงาน/ : /Draft cover letter/;

    await useSyntheticApplication(page);
    await page.goto('/app/projects/new');
    await page.waitForLoadState('networkidle');
    await page.locator('main form').first().waitFor();
    expect.soft(await page.locator('main input[type=file]').count(), 'job 1 (3 clicks): new project form takes a CV file').toBeGreaterThan(0);

    await stubSearch(page);
    await page.goto(`${base}/search?q=data`);
    await page.waitForLoadState('networkidle');
    expect.soft(await page.getByRole('main').getByRole('button', { name: score }).count(), 'job 2 (2 clicks): result card has Get fit score').toBeGreaterThan(0);

    await useApplicationsWorkspaceFixture(page);
    await page.goto(`${base}/applications`);
    await page.waitForLoadState('networkidle');
    const main = page.getByRole('main');
    expect.soft(await main.getByRole('button', { name: score }).count(), 'job 3 (2 clicks): My jobs row has Get fit score').toBeGreaterThan(0);
    expect.soft(await main.getByRole('button', { name: applied }).count(), 'job 5 (1 click): row offers I applied').toBeGreaterThan(0);

    await evaluatedSession(page);
    await page.goto(`${base}/sessions/${sessionId}`);
    await page.waitForLoadState('networkidle');
    expect.soft(await page.getByRole('main').getByRole('button', { name: draft }).count(), 'job 4 (2 clicks): session offers Draft cover letter at once').toBeGreaterThan(0);
  });
}

test.afterAll(() => {
  if (!rows.length) return;
  const pad = (v: unknown, n: number) => String(v).padEnd(n);
  const lines = ['', 'UX BUDGET (current vs target)', `${pad('screen', 22)}${pad('width', 6)}${pad('lang', 5)}${pad('current', 8)}target`];
  for (const r of rows) lines.push(`${pad(r.screen, 22)}${pad(r.width, 6)}${pad(r.locale, 5)}${pad(r.current, 8)}${r.target}`);
  console.log(lines.join('\n'));
});
