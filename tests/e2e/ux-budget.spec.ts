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

type Row = { screen: string; width: number; locale: string; current: number; target: number | string };
const rows: Row[] = [];
const base = `/app/projects/${projectId}`;

const screens: Array<{ name: string; route: string; target: number; setup?: (p: Page) => Promise<unknown> }> = [
  { name: 'Today', route: `${base}/overview`, target: 6 },
  { name: 'Find jobs', route: `${base}/search?q=data`, target: 10, setup: stubSearch },
  { name: 'My jobs', route: `${base}/applications`, target: 11, setup: useApplicationsWorkspaceFixture },
  { name: 'Job detail', route: `${base}/jobs/${jobId}`, target: 8, setup: useApplicationsWorkspaceFixture },
  { name: 'Session', route: `${base}/sessions/${sessionId}`, target: 8 },
  { name: 'CV (empty)', route: `${base}/profile`, target: 3, setup: p => useMaterialsFixture(p, { emptyCvs: true }) },
  { name: 'Documents', route: `${base}/documents`, target: 7, setup: useMaterialsFixture },
];

async function stubSearch(page: Page) {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/job-search**`, route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/facets')
    ? { total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 1, thai_postings: 1 }
    : { items: [{ slug: 'synthetic-review', title: 'Synthetic analyst opportunity', company: 'Example Co', skills: ['SQL'], source_url: 'https://jobs.example.test/1', description_markdown: 'Synthetic role.' }], total: 1, limit: 20, offset: 0 } }));
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
      const main = await count(page, 'main');
      rows.push({ screen: s.name, width: 1440, locale, current: main, target: `<= ${s.target}` });
      expect.soft(main, `${s.name} main controls above the fold`).toBeLessThanOrEqual(s.target);
    }
    await useSyntheticApplication(page);
    await page.goto(`${base}/overview`);
    await page.locator('aside').first().waitFor();
    const sidebar = await count(page, 'aside');
    rows.push({ screen: 'Sidebar', width: 1440, locale, current: sidebar, target: '<= 9' });
    expect.soft(sidebar, 'sidebar controls').toBeLessThanOrEqual(9);
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

    await useSyntheticApplication(page);
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
