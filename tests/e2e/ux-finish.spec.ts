import { expect, test, type Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
});

test('project switcher Escape returns keyboard focus to its trigger', async ({ page }) => {
  await page.goto(`/app/projects/${projectId}/overview`);
  const trigger = page.getByRole('button', { name: /Switch project: Synthetic analyst search/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Switch project', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('session current-run names distinguish preparation, recording and tailoring', async ({ page }) => {
  for (const [operation, name] of [['apply_prepare', 'Application answers'], ['apply_submit', 'Record as applied'], ['tailor_cv', 'CV tailoring'], ['draft_follow_up', 'Follow-up drafting']]) {
    await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => route.fulfill({ json: [{
      id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId,
      operation, status: 'completed', output_language: 'en', result_file_ids: [],
      created_at: '2026-10-10T00:00:00Z', evaluation_result: null,
    }] }));
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
});

test('answer output language is visible and used without visiting document preparation', async ({ page }) => {
  let posted: Record<string, unknown> | undefined;
  await page.route(new RegExp(`(?:\/v1\/projects\/${projectId}\/runs|\/v1\/async\/projects\/${projectId}\/agent\-runs)(?:\\?.*)?$`), route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { id: 'cccccccc-0000-4000-8000-000000000001' } });
  });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Application answers', exact: true }).click();
  await page.getByLabel('Language of generated documents', { exact: true }).selectOption('th');
  await page.getByLabel('Question', { exact: true }).fill('What have you shipped?');
  await page.getByRole('button', { name: 'Prepare application', exact: true }).click();
  await expect.poll(() => posted).toMatchObject({ operation: 'apply_prepare', output_language: 'th' });
});

test('mobile Overview shows the chosen CV before recent documents', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/projects/${projectId}/overview`);
  // First-run fixture has no CV: the CV step of Getting started must come before recent documents.
  const cv = await page.getByText('Add your first CV').first().boundingBox();
  const documents = await page.locator('#documents-heading').boundingBox();
  expect(cv).not.toBeNull(); expect(documents).not.toBeNull();
  expect(cv!.y).toBeLessThan(documents!.y);
});

async function searchFixture(page: Page) {
  await page.route(`**/v1/projects/${projectId}/job-search**`, route => route.fulfill({ json:
    new URL(route.request().url()).pathname.endsWith('/facets')
      ? { total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 1, thai_postings: 1 }
      : { items: [{ slug: 'synthetic-review', title: 'Synthetic analyst opportunity', company: 'Example Co', skills: ['SQL'], source_url: 'https://jobs.example.test/1', description_markdown: 'Synthetic role for interface verification.' }], total: 1, limit: 20, offset: 0 }
  }));
  await page.route(`**/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ json: { items: [], status: { email_verified: true, notifications_enabled: true } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote`);
}

test('mobile Search reaches the first opportunity within the initial viewport', async ({ page }) => {
  await searchFixture(page);
  const result = page.getByRole('button', { name: /Synthetic analyst opportunity/ });
  await expect(result).toBeVisible();
  const box = await result.boundingBox();
  expect(box!.y).toBeLessThan(844);
});

test('mobile Search moves focus into detail and returns it to the selected result', async ({ page }) => {
  await searchFixture(page);
  const result = page.getByRole('button', { name: /Synthetic analyst opportunity/ });
  await result.focus();
  await page.keyboard.press('Enter');
  const back = page.getByRole('button', { name: 'Back to results', exact: true });
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(result).toBeFocused();
});
