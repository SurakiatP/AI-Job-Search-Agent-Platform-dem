import { expect, test } from '@playwright/test';
import { projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }, info) => {
  const matrix = info.title.match(/(th|en) (light|dark)$/);
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale: matrix?.[1] ?? 'en', theme: matrix?.[2] ?? 'light' });
});

test('first-run overview offers one primary action and stable evaluation navigation', async ({ page }, info) => {
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('heading', { name: 'Synthetic analyst search', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('overview-desktop.png'), fullPage: true });
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Evaluations', exact: true })).toHaveAttribute('href', `/app/projects/${projectId}/sessions`);
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Add CV', exact: true }).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evaluations', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /First synthetic session/ })).toBeVisible();
});

test('one failed overview resource preserves jobs and sessionless required-input attention', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/documents`, route => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [{ id: 'input-run', project_id: projectId, session_id: null, operation: 'extract_experience', status: 'needs_input', created_at: '2026-10-16T00:00:00Z' }] }));
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('heading', { name: 'Synthetic analyst search', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Synthetic data analyst', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Experience extraction/ }).first()).toHaveAttribute('href', `/app/projects/${projectId}/console?tab=runs`);
  await expect(page.getByRole('main').getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByRole('main').locator('a[href*="/sessions/null"],a[href*="/sessions/undefined"]')).toHaveCount(0);
});

test('populated overview shows actual attention, active work, partial material and named sources', async ({ page }, info) => {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ json: [{ id: 'cv', name: 'Product CV', is_primary: true, latest_revision: { id: 'cv3', revision: 3, original_filename: 'synthetic-product-cv.pdf', skill_profile_ready: true, created_at: '2026-10-15T00:00:00Z' } }] }));
  await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [
    { id: 'input', operation: 'apply_prepare', status: 'needs_input', session_id: null },
    { id: 'active', operation: 'profile_cv', status: 'running', session_id: null },
    { id: 'approval', operation: 'tailor_cv', status: 'waiting_approval', session_id: null },
  ] }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('heading', { name: 'Needs your attention', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Product CV', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Partial result', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /CV profile/ })).toHaveAttribute('href', `/app/projects/${projectId}/console?tab=runs`);
  await expect(page.getByRole('main').getByRole('link', { name: /CV tailoring/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-populated-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('overview-populated-mobile.png'), fullPage: true });
});

for (const width of [390, 768, 1440]) for (const locale of ['th', 'en']) for (const theme of ['light', 'dark']) {
  test(`overview shell reflows ${width} ${locale} ${theme}`, async ({ page }, info) => {
    await useSyntheticApplication(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/app/projects/${projectId}/overview`);
    await expect(page.getByRole('heading', { name: 'Synthetic analyst search', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(async () => {
      await document.fonts.load('400 16px "Noto Sans Thai"', 'ภาษาไทย');
      await document.fonts.load('600 16px "Noto Sans Thai"', 'CV Job');
      return document.fonts.check('400 16px "Noto Sans Thai"', 'ภาษาไทย') && document.fonts.check('600 16px "Noto Sans Thai"', 'CV Job');
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) expect(await page.locator('aside').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true });
    await page.keyboard.press('Tab');
    await page.getByRole('link', { name: locale === 'th' ? 'ข้ามไปเนื้อหา' : 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    if (width < 1024) {
      const menu = page.getByRole('button', { name: locale === 'th' ? 'เปิดเมนู' : 'Open menu', exact: true });
      await menu.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
    }
  });
}

test('first-run overview marks done steps, says what is blocked and shows no count strip', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/overview`);
  const steps = page.getByRole('list').filter({ hasText: 'Add your first CV' });
  await expect(steps.getByRole('listitem')).toHaveCount(3);
  await expect(steps.getByRole('listitem').nth(1)).toContainText('Synthetic data analyst');
  await expect(steps.getByRole('listitem').nth(1)).toContainText('Done');
  await expect(steps.getByRole('listitem').nth(2)).toContainText('Needs a CV first.');
  await expect(page.getByRole('main').locator('a.bg-primary-fill, button.bg-primary-fill')).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('link', { name: 'Add CV', exact: true }).first()).toHaveClass(/bg-primary/);
  await expect(page.getByRole('heading', { name: 'Need a hand?' })).toBeVisible();
  await expect(page.getByRole('main').getByText(/^Saved\s*\d/)).toHaveCount(0);
});

test('returning overview puts items waiting for the user above everything else', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ json: [{ id: 'cv', name: 'Product CV', is_primary: true, latest_revision: { id: 'cv3', revision: 3, original_filename: 'synthetic-product-cv.pdf', skill_profile_ready: true, created_at: '2026-10-15T00:00:00Z' } }] }));
  await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [{ id: 'approval', operation: 'tailor_cv', status: 'waiting_approval', session_id: null, created_at: '2026-10-16T00:00:00Z' }] }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/projects/${projectId}/overview`);
  const needs = await page.getByRole('heading', { name: 'Needs your attention', exact: true }).boundingBox();
  const recent = await page.getByRole('heading', { name: 'Recent evaluations', exact: true }).boundingBox();
  expect(needs && recent && needs.y < recent.y).toBe(true);
  await expect(page.getByRole('heading', { name: 'Jobs and applications', exact: true })).toBeVisible();
});

test('overview hides evaluations in the trash and names the CV of each evaluation', async ({ page }) => {
  await useSyntheticApplication(page);
  const job = '33333333-3333-4333-8333-333333333333';
  const trashed = 'dddddddd-0000-4000-8000-000000000000';
  await page.route(`**/v1/projects/${projectId}/jobs`, route => route.fulfill({ json: [{ id: job, revision: 1, title: 'Live job', company: 'Example Co', created_at: '2026-10-01T00:00:00Z' }, { id: 'j2', revision: 1, title: 'Trashed job', company: 'Gone Co', created_at: '2026-10-01T00:00:00Z' }] }));
  await page.route(`**/v1/projects/${projectId}/sessions`, route => route.fulfill({ json: [{ id: sessionId, project_id: projectId, title: 'Live job', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: job, cv_name: 'Data CV', cv_revision: 4, job_title: 'Live job', job_company: 'Example Co' }] }));
  const run = (id: string, sid: string, jid: string) => ({ id, project_id: projectId, session_id: sid, operation: 'evaluate_job', status: 'completed', job_revision_id: jid, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: { score: 4, report_markdown: 'x' } });
  await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [run('r1', sessionId, job), run('r2', trashed, 'j2')] }));
  await page.goto(`/app/projects/${projectId}/overview`);
  const recent = page.getByRole('region', { name: 'Recent evaluations' });
  await expect(recent.getByRole('link', { name: /Live job/ })).toBeVisible();
  await expect(recent.getByRole('link', { name: /Trashed job/ })).toHaveCount(0);
  await expect(recent.getByRole('link', { name: /Live job/ })).toContainText('CV: Data CV · v4');
  await expect(page.getByRole('main').locator(`a[href$="/sessions/${trashed}"]`)).toHaveCount(0);
});
