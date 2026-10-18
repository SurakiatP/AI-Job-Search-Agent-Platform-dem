import { expect, test, type Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const evalRun = (missing: string[]) => ({
  id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed',
  job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null,
  evaluation_result: { score: 3.6, report_markdown: 'ok', skill_coverage: { matched: ['Python'], missing, required: ['Python', ...missing], ratio: 0.5 } },
});
const item = (id: string, text: string) => ({ id, kind: 'skill', text, role: null, organization: null, period: null, source: 'owner', source_cv_id: null, source_cv_name: null, created_at: '2026-10-10T00:00:00Z' });

async function open(page: Page, locale: 'en' | 'th', missing: string[], bank: unknown[]) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([evalRun(missing)]) }));
  await page.route(`**/api/v1/projects/${projectId}/experience`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: bank, extraction: null, provider_configured: true }) }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
}

test('advice splits missing skills into what the bank backs and what the user does not have, with learning links', async ({ page }) => {
  await open(page, 'en', ['dbt', 'Docker', 'rapid prototyping'], [item('1', 'Built dbt models for the finance team'), item('2', 'Prototyped rapidly with Figma')]);
  const add = page.getByTestId('advice-can-add'), cannot = page.getByTestId('advice-cannot-add');
  await expect(add.getByText('dbt')).toBeVisible();
  await expect(add).toContainText('1 entry backs it');
  await expect(cannot.getByText('Docker', { exact: true })).toBeVisible();
  await expect(cannot.getByText('rapid prototyping')).toBeVisible(); // "rapidly" must not count as a match
  await expect(add.getByText('Docker')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Agent advice' })).toBeVisible();
  const link = cannot.getByRole('link', { name: /Find ways to learn/ }).first();
  await expect(link).toHaveAttribute('href', /learn%20Docker/);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('with an empty experience bank nothing can be added (Thai)', async ({ page }) => {
  await open(page, 'th', ['Docker'], []);
  await expect(page.getByTestId('advice-can-add')).toHaveCount(0);
  await expect(page.getByTestId('advice-cannot-add').getByText('Docker', { exact: true })).toBeVisible();
  await expect(page.getByText('เพิ่มไม่ได้ เพราะไม่มีใน CV และประสบการณ์ของคุณ')).toBeVisible();
  await expect(page.getByText(/ยังไม่มีคลังประสบการณ์ให้เทียบ/)).toBeVisible();
});

test('manual tailoring sends the user request; autopilot sends none', async ({ page }) => {
  await open(page, 'en', ['dbt'], []);
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/projects/${projectId}/runs`, async r => { if (r.request().method() === 'POST') { bodies.push(r.request().postDataJSON()); return r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify(evalRun([])) }); } return r.fallback(); });
  await page.getByRole('tab').nth(1).click();
  await expect(page.getByLabel('What should change, and by how much?')).toHaveCount(0); // autopilot: no free text
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await page.getByLabel('Interactive').check();
  await page.getByLabel('What should change, and by how much?').fill('Focus on dbt, at most 2 changes');
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  expect(bodies[0]).not.toHaveProperty('owner_instructions');
  expect(bodies[1]).toMatchObject({ tailor_mode: 'interactive', owner_instructions: 'Focus on dbt, at most 2 changes' });
});
