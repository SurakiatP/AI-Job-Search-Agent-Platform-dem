import { expect, test } from '@playwright/test';
import { useAccessFixture } from '../fixtures/access-surfaces';
import { projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }, info) => {
  const matrix = info.title.match(/(th|en) (light|dark)$/);
  await page.addInitScript(({ locale, theme }) => { localStorage.setItem('ui.locale', locale); localStorage.setItem('ui.theme', theme); }, { locale: matrix?.[1] ?? 'en', theme: matrix?.[2] ?? 'light' });
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

test('force delete erases a project only after its exact name is typed, and explains a busy project', async ({ page }) => {
  await useSyntheticApplication(page);
  const name = 'Second synthetic project';
  const calls: unknown[] = [];
  let busy = true;
  await page.route(`**/v1/projects/${secondProjectId}/force-delete`, route => {
    calls.push(route.request().postDataJSON());
    if (busy) return route.fulfill({ status: 409, json: { code: 'project_runs_active', message_key: 'errors.project_runs_active', retryable: false, correlation_id: 'c' } });
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/app/projects');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: `Options for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Delete everything permanently…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Delete project “${name}” and everything in it?`, exact: true });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Delete everything permanently', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill('second synthetic project');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill(name);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('Stop it first');
  expect(calls).toEqual([{ confirm_name: name }]);
  busy = false;
  await dialog.getByRole('button', { name: 'Delete everything permanently', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(calls).toHaveLength(2);
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

test('projects offer an explicit workspace continuation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto('/app/projects');
  await page.getByRole('link', { name: 'Synthetic analyst search', exact: true }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/overview`);
});
