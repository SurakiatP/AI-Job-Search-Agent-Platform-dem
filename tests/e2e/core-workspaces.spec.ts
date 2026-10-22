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

test('CV summary uses named primary CV rather than highest unrelated revision', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ json: [
    { id: 'primary', name: 'Product CV', is_primary: true, latest_revision: { id: 'p3', revision: 3, original_filename: 'product.pdf', skill_profile_ready: true, created_at: '2026-10-15T00:00:00Z' } },
    { id: 'other', name: 'Other CV', is_primary: false, latest_revision: { id: 'o99', revision: 99, original_filename: 'other.pdf', created_at: '2026-10-16T00:00:00Z' } },
  ] }));
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('main').getByText('Product CV', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('other.pdf', { exact: true })).toHaveCount(0);
});

test('project creation makes one project request and no unpaired session request', async ({ page }) => {
  await useSyntheticApplication(page);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
  await page.goto('/app/projects/new');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Synthetic project');
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/overview$`));
  expect(writes.filter(path => path.endsWith('/projects'))).toHaveLength(1);
  expect(writes.filter(path => path.endsWith('/sessions'))).toHaveLength(0);
});

test('project switcher retains management and switches scope explicitly', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/overview`);
  await page.getByRole('button', { name: /Switch project/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Switch project', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Options for Synthetic analyst search', exact: true })).toBeVisible();
  await dialog.getByRole('link', { name: 'Second synthetic project', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${secondProjectId}/overview$`));
  await expect(dialog).not.toBeVisible();
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

test('uncertain project creation exposes recovery without an automatic second write', async ({ page }) => {
  await useSyntheticApplication(page);
  let writes = 0;
  await page.route('**/v1/projects', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    return route.fulfill({ status: 503, json: { code: 'unavailable' } });
  });
  await page.goto('/app/projects/new');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Synthetic project');
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The project may have been saved');
  await page.getByRole('alert').getByRole('link', { name: 'All projects', exact: true }).click();
  await expect(page).toHaveURL('/app/projects');
  expect(writes).toBe(1);
});

test('settings navigation carries explicit project scope through section changes', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${secondProjectId}/overview`);
  await page.getByRole('navigation', { name: 'Navigation', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`/app/settings?project=${secondProjectId}`);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('#settings-project')).toHaveValue(secondProjectId);
  expect(new URL(page.url()).searchParams.get('project')).toBe(secondProjectId);
  await page.getByRole('button', { name: 'Project sharing', exact: true }).click();
  await expect(page.locator('#settings-project')).toHaveValue(secondProjectId);
});


test('switcher keeps delete-current-session recovery available through route change', async ({ page }) => {
  await useSyntheticApplication(page);
  let hidden = false;
  let restores = 0;
  await page.route(`**/v1/projects/${projectId}/sessions`, route => hidden ? route.fulfill({ json: [] }) : route.fallback());
  await page.route(`**/v1/projects/${projectId}/sessions/${sessionId}`, route => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    hidden = true;
    return route.fulfill({ json: { mode: 'hidden' } });
  });
  await page.route(`**/v1/projects/${projectId}/sessions/${sessionId}/restore`, route => {
    restores++; hidden = false; return route.fulfill({ json: { id: sessionId } });
  });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('button', { name: /Switch project/ }).click();
  await page.getByRole('button', { name: 'Options for First synthetic session', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete session “First synthetic session”?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/overview`);
  const switcher = page.getByRole('dialog', { name: 'Switch project', exact: true });
  await expect(switcher.getByRole('status')).toContainText('Session deleted');
  await switcher.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(switcher.getByRole('link', { name: 'First synthetic session', exact: true })).toBeVisible();
  expect(restores).toBe(1);
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
  await expect(page.getByRole('main').locator('a.bg-primary, button.bg-primary')).toHaveCount(1);
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

test('projects list shows one row per project with Open and management, no repeated shortcuts', async ({ page }) => {
  await useSyntheticApplication(page);
  let renamed: unknown;
  await page.route(`**/v1/projects/${projectId}`, route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    renamed = route.request().postDataJSON();
    return route.fulfill({ json: { id: projectId, name: 'Renamed project', created_at: '2026-10-01T00:00:00Z' } });
  });
  await page.goto('/app/projects');
  const main = page.getByRole('main');
  await expect(main.getByRole('listitem')).toHaveCount(2);
  await expect(main.getByRole('link', { name: 'Open project Synthetic analyst search' })).toHaveAttribute('href', `/app/projects/${projectId}/overview`);
  await expect(main.getByText('Created 1 Oct 2026')).toBeVisible();
  await expect(main.getByRole('link', { name: /Profile and CV|Applications|Documents/ })).toHaveCount(0);
  await expect(main.getByText('Getting started')).toHaveCount(0);
  await main.getByRole('button', { name: 'Options for Synthetic analyst search' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Renamed project');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(renamed).toEqual({ name: 'Renamed project' });
  await main.getByRole('button', { name: 'Options for Second synthetic project' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete project “Second synthetic project”?', exact: true })).toBeVisible();
});

test('zero projects shows the getting-started guidance as the empty state', async ({ page }) => {
  await useSyntheticApplication(page, { emptyProjects: true });
  await page.goto('/app/projects');
  await expect(page.getByRole('heading', { name: 'No projects yet', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('main').getByRole('link', { name: 'Create a project', exact: true })).toHaveAttribute('href', '/app/projects/new');
});

test('new project validates inline, submits with Enter and explains what happens next', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto('/app/projects/new');
  await expect(page.getByRole('heading', { name: 'What happens next', exact: true })).toBeVisible();
  const name = page.getByRole('textbox', { name: 'Project name', exact: true });
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a project name.');
  await name.fill('x'.repeat(201));
  await expect(page.getByRole('alert')).toContainText('over 200 characters');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.fill('Synthetic project');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await name.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/overview$`));
});

test('new project reports a duplicate name rejected by the API', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route('**/v1/projects', route => route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { code: 'project_name_taken' } }) : route.fallback());
  await page.goto('/app/projects/new');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Synthetic analyst search');
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await expect(page).toHaveURL('/app/projects/new');
});

test('consent groups permissions, keeps Allow off until one is chosen and summarises the decision live', async ({ page }) => {
  await useSyntheticApplication(page);
  const view = { client_name: 'Synthetic Client', client_id_host: 'client.example.test', redirect_uri: 'http://127.0.0.1:33418/callback', requested_scopes: ['results:read', 'documents:draft'], projects: [{ id: projectId, name: 'Synthetic project' }], expires_at: '2099-01-01T00:00:00Z' };
  await page.route('**/v1/oauth/requests/**', route => route.fulfill({ json: view }));
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/oauth/consent?request=h');
  const allow = page.getByRole('button', { name: 'Allow', exact: true });
  const summary = page.getByText(/Synthetic Client can/);
  await expect(page.getByRole('heading', { name: 'Read', exact: true })).toBeVisible();
  await expect(page.getByText('Act for you', { exact: true })).toBeVisible();
  await expect(page.getByText('Can change your data').first()).toBeVisible();
  await expect(summary).toContainText('read results and draft documents in Synthetic project for 30 days');
  await expect(allow).toBeEnabled();
  await expect(allow).toBeInViewport();
  await expect(summary).toBeInViewport();
  await page.getByLabel(/Read generated results/).uncheck();
  await page.getByLabel(/Draft application documents/).uncheck();
  await expect(allow).toBeDisabled();
  await expect(page.getByText('Select at least one permission to continue.')).toBeVisible();
  await page.getByLabel(/Search job postings/).check();
  await page.getByLabel('Access lasts').selectOption('90');
  await expect(summary).toContainText('search jobs in Synthetic project for 90 days');
  await expect(allow).toBeEnabled();
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
