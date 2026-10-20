import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

// One trash for the project, reached from the sidebar (owner decision 2026-10-20).
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const at = '2026-10-19T00:00:00Z';

test('sidebar trash shows the count and holds evaluations and documents in tabs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const sid = 'a1a1a1a1-0000-4000-8000-000000000000';
  let sessionsTrash = [{ id: sid, project_id: projectId, title: 'Old job', job_title: 'Old job', job_company: 'Example Co', created_at: at, trashed_at: at }];
  const doc = (id: string, title: string) => ({ id, document_type: 'cover_letter', title, trashed_at: at });
  await page.route(`**/v1/projects/${projectId}/sessions?view=trash`, route => route.fulfill(json(sessionsTrash)));
  await page.route(`**/v1/projects/${projectId}/documents/trash`, route => route.fulfill(json([doc('d1d1d1d1-0000-4000-8000-000000000000', 'Old letter'), doc('d2d2d2d2-0000-4000-8000-000000000000', 'Old message')])));
  await page.route(`**/v1/projects/${projectId}/sessions/${sid}/restore`, route => { sessionsTrash = []; return route.fulfill(json({ id: sid })); });

  await page.goto(`/app/projects/${projectId}/overview`);
  const nav = page.getByRole('navigation', { name: 'Navigation' });
  await expect(nav.getByRole('link', { name: 'Trash 3' })).toBeVisible();
  await nav.getByRole('link', { name: 'Trash 3' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/trash$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Evaluations 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Old job')).toBeVisible();

  await page.getByRole('tab', { name: 'Documents 2' }).click();
  await expect(page).toHaveURL(/tab=documents/);
  await expect(page.getByText('Old letter')).toBeVisible();
  await expect(page.getByText('Old message')).toBeVisible();

  await page.getByRole('tab', { name: 'Evaluations 1' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Old job' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('tab', { name: 'Evaluations 0' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Trash 2' })).toBeVisible();
});

test('empty trash: sidebar item has no count and the page says what lands here', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/sessions?view=trash`, route => route.fulfill(json([])));
  await page.goto(`/app/projects/${projectId}/trash`);
  await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Trash', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Trash is empty. Evaluations you delete land here and can be restored.')).toBeVisible();
});

test('evaluation and document pages have no trash buttons; old trash addresses open the project trash', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const sid = 'a1a1a1a1-0000-4000-8000-000000000000';
  await page.route(`**/v1/projects/${projectId}/sessions?view=trash`, route => route.fulfill(json([{ id: sid, project_id: projectId, title: 'Old job', job_title: 'Old job', created_at: at, trashed_at: at }])));
  await page.route(`**/v1/projects/${projectId}/documents/trash`, route => route.fulfill(json([{ id: 'd1d1d1d1-0000-4000-8000-000000000000', document_type: 'cover_letter', title: 'Old letter', trashed_at: at }])));
  await page.goto(`/app/projects/${projectId}/documents`);
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /Trash/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/app/projects/${projectId}/sessions`);
  await expect(page.getByRole('main').getByRole('link', { name: /Trash/ })).toHaveCount(0);

  await page.goto(`/app/projects/${projectId}/documents?view=trash`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/trash\\?tab=documents$`));
  await expect(page.getByText('Old letter')).toBeVisible();
  await page.goto(`/app/projects/${projectId}/sessions?view=trash`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/trash$`));
  await expect(page.getByText('Old job')).toBeVisible();
});
