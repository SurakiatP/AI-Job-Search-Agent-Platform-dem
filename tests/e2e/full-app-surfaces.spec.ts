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
  await expect(page.getByText('Compared: Data Analyst CV (v4) with this job')).toBeVisible();
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
