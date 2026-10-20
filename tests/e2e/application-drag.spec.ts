import { expect, test, type Page } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from '../fixtures/application';

const title = 'Synthetic data engineer';

// One card whose stage lives on the "server"; `patches` records what the board saved.
async function board(page: Page, locale: 'en' | 'th' = 'en') {
  const server = { stage: 'saved', gets: 0, patches: [] as string[] };
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/applications`, route => { server.gets += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ job_revision_id: jobId, title, company: 'Example Co', created_at: '2026-10-01T00:00:00Z', stage: server.stage, has_contact: false, last_activity_at: '2026-10-02T00:00:00Z' }]) }); });
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    server.stage = route.request().postDataJSON().application_status;
    server.patches.push(server.stage);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: jobId, application_status: server.stage }) });
  });
  return server;
}

test('dragging a card to another column saves the new stage right away and offers Undo', async ({ page }) => {
  const server = await board(page);
  await page.goto(`/app/projects/${projectId}/applications?view=board`);
  const card = page.locator('[data-card]').first();
  await expect(page.getByText(/Drag a card to another column/)).toBeVisible();
  await card.dragTo(page.locator('[data-drop-stage="interview"]'));
  await expect(page.locator('[data-drop-stage="interview"]').getByRole('link', { name: title })).toBeVisible();
  expect(server.patches).toEqual(['interview']);
  await expect(page.getByText('Moved “Synthetic data engineer” to Interview.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-drop-stage="saved"]').getByRole('link', { name: title })).toBeVisible();
  expect(server.patches).toEqual(['interview', 'saved']);
});

test('dropping on the same column does nothing; closed stages become drop targets only while dragging', async ({ page }) => {
  const server = await board(page, 'th');
  await page.goto(`/app/projects/${projectId}/applications?view=board`);
  const card = page.locator('[data-card]').first();
  await card.dragTo(page.locator('[data-drop-stage="saved"]'));
  expect(server.patches).toEqual([]);
  await expect(page.locator('[data-drop-stage="rejected"]')).toHaveCount(0);
  // A real pointer drag: the closed-stage targets appear, and dropping on one saves that stage.
  const from = (await card.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  const target = page.locator('[data-drop-stage="rejected"]');
  await expect(target).toBeVisible();
  await expect(target).toContainText('วางเพื่อย้ายไป');
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => server.patches).toEqual(['rejected']);
});

test('the board picks up a stage changed elsewhere without a reload', async ({ page }) => {
  await page.clock.install();
  const server = await board(page);
  await page.goto(`/app/projects/${projectId}/applications?view=board`);
  await expect(page.locator('[data-drop-stage="saved"]').getByRole('link', { name: title })).toBeVisible();
  server.stage = 'offer'; // another tab or a connected assistant moved it
  await page.clock.runFor(16000);
  await expect(page.locator('[data-drop-stage="offer"]').getByRole('link', { name: title })).toBeVisible();
  expect(server.gets).toBeGreaterThan(1);
});
