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
