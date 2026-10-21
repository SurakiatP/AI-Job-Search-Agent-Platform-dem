import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { accessSurfaces, useAccessFixture } from '../fixtures/access-surfaces';
import { projectId } from '../fixtures/application';
import { documentId, jobId, useSyntheticApplication } from '../fixtures/application';
import { useMaterialsFixture } from '../fixtures/materials';
import { useApplicationsWorkspaceFixture } from '../fixtures/applications-workspace';
import { useUtilitiesFixture } from '../fixtures/utilities';

const allSurfaces = [
  ...accessSurfaces.map(surface => ({ ...surface, bundle: 'access' })),
  { id: 'profile', route: `/app/projects/${projectId}/profile`, bundle: 'materials' },
  { id: 'documents', route: `/app/projects/${projectId}/documents`, bundle: 'materials' },
  { id: 'document-trash', route: `/app/projects/${projectId}/trash?tab=documents`, bundle: 'materials' },
  { id: 'document-detail', route: `/app/projects/${projectId}/documents/${documentId}`, bundle: 'materials' },
  { id: 'applications', route: `/app/projects/${projectId}/applications`, bundle: 'applications' },
  { id: 'application-board', route: `/app/projects/${projectId}/applications?view=board`, bundle: 'applications' },
  { id: 'job-detail', route: `/app/projects/${projectId}/jobs/${jobId}`, bundle: 'applications' },
  ...['timeline', 'approvals', 'agents', 'connect'].map(tab => ({ id: `activity-${tab}`, route: `/app/projects/${projectId}/console?tab=${tab}`, bundle: 'utilities' })),
  ...['appearance', 'gateway', 'tools', 'sharing', 'webhooks'].map(section => ({ id: `settings-${section}`, route: `/app/settings?project=${projectId}&section=${section}`, bundle: 'utilities' })),
  { id: 'search', route: `/app/projects/${projectId}/search?q=data`, bundle: 'search' },
];

async function installSurface(page: import('@playwright/test').Page, surface: typeof allSurfaces[number], variant: { locale: string; theme: string }) {
  if (surface.bundle === 'materials') await useMaterialsFixture(page);
  else if (surface.bundle === 'applications') await useApplicationsWorkspaceFixture(page);
  else if (surface.bundle === 'utilities') await useUtilitiesFixture(page, { preferences: { locale: variant.locale as 'en' | 'th', theme: variant.theme as 'light' | 'dark' } });
  else if (surface.bundle === 'search') {
    await useSyntheticApplication(page);
    await page.route(`**/v1/projects/${projectId}/job-search**`, route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/facets')
      ? { total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 1, thai_postings: 1 }
      : { items: [{ slug: 'synthetic-review', title: 'Synthetic analyst opportunity', company: 'Example Co', skills: ['SQL'], source_url: 'https://jobs.example.test/1', description_markdown: 'Synthetic role for interface verification.' }], total: 1, limit: 20, offset: 0 } }));
    await page.route(`**/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ json: { items: [], status: { email_verified: true, notifications_enabled: true } } }));
  } else await useAccessFixture(page, 'anonymous' in surface && surface.anonymous === true);
}

test('all application surfaces have real bilingual themed screenshots and responsive structure', async ({ browser }) => {
  test.setTimeout(600_000);
  const stage = process.env.JSP_E2E_EVIDENCE_STAGE === 'before' ? 'before' : 'after';
  const full = process.env.JSP_E2E_CAPTURE_FULL === '1';
  const directory = `/tmp/jsp-ux-all/access/${stage === 'before' ? 'before' : full ? 'after' : 'smoke'}`;
  mkdirSync(directory, { recursive: true });
  const selectedIds = process.env.JSP_E2E_CAPTURE_SURFACES?.split(',');
  const manifest = `${directory}/manifest.json`;
  const evidence: Record<string, unknown>[] = selectedIds && existsSync(manifest)
    ? JSON.parse(readFileSync(manifest, 'utf8')).filter((row: { surface: string }) => !selectedIds.includes(row.surface)) : [];
  const variants = stage === 'before' || !full
    ? [{ locale: 'en', theme: 'light', width: 1440 }, { locale: 'th', theme: 'dark', width: 390 }]
    : ['en', 'th'].flatMap(locale => ['light', 'dark'].flatMap(theme => [1440, 820, 390].map(width => ({ locale, theme, width }))));
  const surfaces = (stage === 'before' ? accessSurfaces.map(surface => ({ ...surface, bundle: 'access' })) : allSurfaces).filter(surface => !selectedIds || selectedIds.includes(surface.id));
  for (const surface of surfaces) for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width: variant.width, height: 1000 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, variant);
    await installSurface(page, surface, variant);
    await page.goto(surface.route);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await page.evaluate(async () => {
      await Promise.all([document.fonts.load('400 16px "Noto Sans Thai"', 'ภาษาไทย Job'), document.fonts.load('600 16px "Noto Sans Thai"', 'ภาษาไทย Job')]);
      await document.fonts.ready;
      return document.fonts.check('400 16px "Noto Sans Thai"', 'ภาษาไทย Job') && document.fonts.check('600 16px "Noto Sans Thai"', 'ภาษาไทย Job');
    })).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', variant.locale);
    await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (stage === 'after') expect(overflow, surface.id).toBe(false);
    expect(errors, surface.id).toEqual([]);
    const file = `${surface.id}-${variant.width}-${variant.locale}-${variant.theme}.png`;
    await page.screenshot({ path: `${directory}/${file}`, fullPage: true });
    evidence.push({ surface: surface.id, route: surface.route, ...variant, file, overflow });
    await page.close();
  }
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(evidence, null, 2));
});

test('projects offer an explicit workspace continuation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto('/app/projects');
  await page.getByRole('link', { name: 'Synthetic analyst search', exact: true }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/overview`);
});

test('landing tour is compact and remains keyboard navigable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const tour = page.locator('#how');
  expect((await tour.boundingBox())!.height).toBeLessThan(1200);
  const first = tour.getByRole('tab').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tour.getByRole('tab').nth(1)).toBeFocused();
  await expect(tour.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
});
test('landing data section: two readable cards with ticks and a three-part approval flow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const mine = page.getByRole('region', { name: 'Your workspace and AI' });
  await expect(mine.locator('svg.landing-tick')).toHaveCount(4);
  const flow = page.getByRole('list', { name: 'How an outside agent asks' });
  await expect(flow.getByRole('listitem')).toHaveCount(3);
  await expect(flow.getByRole('listitem').nth(2)).toContainText('Approve');
  await expect(flow.getByRole('listitem').nth(2)).toContainText('Reject');
});
const featureTabs = {
  en: ['Add CV', 'Build CV', 'Search', 'Evaluate', 'Interview practice', 'Draft', 'Track', 'Job alerts', 'Connect'],
  th: ['ใส่ CV', 'สร้าง CV', 'ค้นหางาน', 'ประเมิน', 'ซ้อมสัมภาษณ์', 'ร่างเอกสาร', 'ติดตามสมัคร', 'แจ้งเตือนงาน', 'เชื่อม agent'],
};
const featureSlugs = ['add-cv', 'build-cv', 'search', 'evaluate', 'practice', 'draft', 'track', 'alerts', 'connect'];

for (const locale of ['en', 'th'] as const) {
  test(`landing tour lists every feature and each feature page renders (${locale})`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useAccessFixture(page, true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const tabs = page.locator('#how').getByRole('tab');
    await expect(tabs).toHaveText(featureTabs[locale]);
    await tabs.nth(4).click();
    await expect(page.locator('#how').getByRole('tabpanel')).toContainText(locale === 'en' ? 'Practise for the interview' : 'ซ้อมสัมภาษณ์');
    for (const slug of featureSlugs) {
      await page.goto(`/features/${slug}`);
      await expect(page).toHaveURL(`/features/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toContainText(featureTabs[locale][featureSlugs.indexOf(slug)]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('landing demo is labelled illustrative and states what the app will not do', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  await expect(page.getByText('Illustrative demo · Sample data').first()).toBeVisible();
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  await expect(demo.getByRole('heading', { name: 'Senior Data Analyst' })).toBeVisible();
  await expect(demo.getByText('Step 3 of 5')).toBeVisible();
  const steps = demo.getByRole('list', { name: 'Journey of this job' }).getByRole('listitem');
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(2)).toContainText('Fit evaluation');
  await expect(steps.nth(2).getByText('AI', { exact: true })).toBeVisible();
  await expect(steps.nth(2)).toContainText('4.2 / 5');
  await expect(steps.nth(2)).toContainText('Skills found: 8 of 11, counted from keywords, no AI');
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(3)).toContainText('Waiting for you to review the CV changes');
  await expect(steps.nth(4)).toContainText('You apply yourself');
  await expect(page.getByText('You need a CV file (PDF, DOCX or text).')).toBeVisible();
  await expect(page.getByText('AI features need a configured AI provider.')).toBeVisible();
  await expect(page.getByText('No automatic submission.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Create account', exact: true }).first()).toHaveAttribute('href', '/signup');
});

test('landing Thai headline stays within three lines at 390px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useAccessFixture(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const lines = await page.getByRole('heading', { level: 1 }).evaluate(h => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
  expect(lines).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('landing explains AI use without naming internal infrastructure, protocols or data sources', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('AI that runs on your machine');
  await expect(page.getByText(/Keychain/)).toHaveCount(0);
  await expect(page.getByText(/supported AI providers/)).toHaveCount(0);
  await expect(page.getByText('AI helps evaluate and draft documents', { exact: true })).toBeVisible();
  await expect(page.getByText(/LiteLLM|gateway|\bMCP\b|\bA2A\b|open-source|\(MIT\)/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('AI ที่ทำงานบนเครื่องคุณ');
  await expect(page.getByText('ใช้ AI ช่วยประเมินและร่างเอกสาร', { exact: true })).toBeVisible();
  await expect(page.getByText(/LiteLLM|gateway|\bMCP\b|\bA2A\b|โอเพนซอร์ส|\(MIT\)/i)).toHaveCount(0);
});

test('expired consent preserves a page heading and a safe next step', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto('/app/oauth/consent');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('link', { name: 'All projects', exact: true })).toHaveAttribute('href', '/app/projects');
});

test('evaluation dialog returns keyboard focus to its launch action', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto(`/app/projects/${projectId}/sessions`);
  const trigger = page.getByRole('button', { name: 'New evaluation', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('landing hero puts AI first and lists what stays in the visitor\'s control with ticks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toContainText('AI');
  await expect(h1.locator('.landing-ai')).toHaveText('AI');
  const promises = page.getByRole('list', { name: 'What stays in your control' }).first();
  await expect(promises.getByRole('listitem')).toHaveText(['You review everything before it is used', 'You apply yourself; the app never submits', 'Each project keeps its own data']);
  await expect(promises.locator('svg.landing-tick')).toHaveCount(3);
  const closing = page.getByRole('region', { name: 'Ready to apply with precision?' });
  await expect(closing.getByRole('list', { name: 'What stays in your control' }).getByRole('listitem')).toHaveCount(3);
});

test('landing demo plays a short sequence: ticks draw in and the last step settles; reduced motion shows the end state at once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  const last = demo.getByRole('listitem').last();
  await expect(demo).toHaveAttribute('data-play', 'true');
  await expect.poll(() => last.evaluate(el => getComputedStyle(el).opacity), { timeout: 5000 }).toBe('1');
  const tick = demo.locator('.landing-tick-draw').first();
  await expect.poll(() => tick.evaluate(el => getComputedStyle(el).strokeDashoffset), { timeout: 5000 }).toBe('0px');
});

test('landing demo with reduced motion has no animation or transition on its steps', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  for (const li of await demo.getByRole('listitem').all()) {
    expect(await li.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await li.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  }
  expect(await demo.locator('.landing-tick-draw').first().evaluate(el => getComputedStyle(el).strokeDashoffset)).toBe('0px');
  await context.close();
});

for (const locale of ['th', 'en'] as const) {
  test(`landing page carries no exclamation or info marks (${locale})`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useAccessFixture(page, true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const marks = page.locator('main svg.lucide-info, main svg.lucide-triangle-alert, main svg.lucide-circle-alert, main svg.lucide-octagon-alert');
    await expect(page.locator('#how').getByRole('tab')).toHaveCount(9);
    await expect(marks, 'warning or info icon on the landing page').toHaveCount(0);
    for (const tab of await page.locator('#how').getByRole('tab').all()) {
      await tab.click();
      await expect(marks, 'warning or info icon on the landing page').toHaveCount(0);
    }
    expect(await page.locator('main').innerText(), 'an exclamation mark in the landing text').not.toContain('!');
  });
}
