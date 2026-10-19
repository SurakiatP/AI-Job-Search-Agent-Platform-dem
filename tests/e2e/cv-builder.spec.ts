import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const cvId = '77777777-7777-4777-8777-777777777777';
const empty = () => ({
  basics: { name: '', headline: '', email: '', phone: '', location: '', profiles: [] }, summary: { content: '' }, summary_hidden: false,
  sections: Object.fromEntries(['experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'publications', 'volunteer', 'references', 'interests']
    .map(name => [name, { hidden: false, items: [] }])),
  order: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'publications', 'volunteer', 'references', 'interests'],
  references_on_request: false,
});

type State = { draft: any; puts: any[]; previews: number; publishes: number; failPut: boolean; created: boolean };

async function builderApi(page: Page, start: Partial<State> = {}) {
  const state: State = { draft: { id: 'd1', cv_id: cvId, document_id: null, resume_data: empty(), template_id: 'onyx', accent: 'indigo', document_language: 'th', ats_safe: true, updated_at: '2026-10-19T00:00:00.000Z' },
    puts: [], previews: 0, publishes: 0, failPut: false, created: false, ...start };
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/projects/${projectId}/cvs/builder` && request.method() === 'POST') { state.created = true; return json(201, { id: cvId, name: 'CV ของฉัน', is_primary: true, created_at: '2026-10-19T00:00:00Z', latest_revision: null, revision_count: 0, in_use: false, has_builder_draft: true }); }
    if (path === `/projects/${projectId}/cvs/${cvId}/draft`) {
      if (request.method() === 'GET') return json(200, state.draft);
      if (state.failPut) return route.abort('internetdisconnected');
      const body = request.postDataJSON();
      state.puts.push(body);
      state.draft = { ...state.draft, ...body, updated_at: `2026-10-19T00:00:${String(state.puts.length).padStart(2, '0')}.000Z` };
      return json(200, state.draft);
    }
    if (path.endsWith('/draft/preview')) { state.previews += 1; return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); }
    if (path.endsWith('/draft/publish')) { state.publishes += 1; return json(201, { id: 'r1', revision: 1, created_at: '2026-10-19T00:00:00Z', original_filename: 'cv.pdf', mime_type: 'application/pdf', size_bytes: 10 }); }
    return route.fallback();
  });
  return state;
}

test('TC-CVB-01 build a CV from nothing and save version 1', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/overview`);
  await page.getByRole('button', { name: 'Build a CV' }).first().click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(new RegExp(`/cvs/${cvId}/builder$`));
  await expect(page.getByRole('heading', { name: 'Build a CV', level: 1 })).toBeVisible();
  await page.getByLabel('Full name').fill('Somchai Example');
  await page.getByRole('button', { name: 'Add experience' }).click();
  await page.getByLabel('Position').fill('Data Analyst');
  await page.getByLabel('Details (one per line)').fill('Built a sales dashboard\nCut reporting time');
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 5000 });
  const saved = state.draft.resume_data;
  expect(saved.basics.name).toBe('Somchai Example');
  expect(saved.sections.experience.items[0].highlights).toEqual(['Built a sales dashboard', 'Cut reporting time']);
  await expect.poll(() => state.previews).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save as new version' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save as new version' }).click();
  await expect(page.getByText('CV version 1 saved.')).toBeVisible();
  expect(state.publishes).toBe(1);
});

test('TC-CVB-02 autosave sends one save after typing stops', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByLabel('Headline').pressSequentially('Data Analyst', { delay: 30 });
  await page.waitForTimeout(1600);
  expect(state.puts).toHaveLength(1);
  expect(state.puts[0].resume_data.basics.headline).toBe('Data Analyst');
  await page.reload();
  await expect(page.getByLabel('Headline')).toHaveValue('Data Analyst');
});

test('TC-CVB-02 a failed save keeps the typing in this browser and offers restore', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page, { failPut: true });
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByLabel('Full name').fill('Offline Name');
  await expect(page.getByRole('alert').filter({ hasText: 'Saving failed' })).toBeVisible({ timeout: 5000 });
  state.failPut = false;
  await page.reload();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Offline Name');
  await expect.poll(() => state.draft.resume_data.basics.name).toBe('Offline Name');
});

test('TC-CVB-04 template and accent choices are saved; ditgar warns about ATS', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByRole('button', { name: 'Ditgar' }).click();
  await page.getByRole('button', { name: 'Teal' }).click();
  await expect(page.getByText(/Two columns: some applicant tracking systems/)).toBeVisible();
  await expect.poll(() => state.puts.at(-1)?.template_id).toBe('ditgar');
  expect(state.puts.at(-1).accent).toBe('teal');
});

test('sections can be hidden and moved with the keyboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByRole('button', { name: 'Move Skills up' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Hide Interests from the CV' }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => state.puts.at(-1)?.resume_data.order.slice(0, 4)).toEqual(['summary', 'experience', 'skills', 'education']);
  expect(state.puts.at(-1).resume_data.sections.interests.hidden).toBe(true);
});

test('TC-CVB-07 pages that need a CV offer Build a CV', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await builderApi(page);
  await page.goto(`/app/projects/${projectId}/overview`);
  await expect(page.getByRole('button', { name: 'Build a CV' }).first()).toBeVisible();
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('button', { name: 'Build a CV' }).first()).toBeVisible();
  await page.goto(`/app/projects/${projectId}/search?mode=match`);
  await expect(page.getByRole('button', { name: 'Build a CV' })).toBeVisible();
});

test('builder fits a phone in Thai with edit and preview tabs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await builderApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await expect(page.getByRole('heading', { name: 'สร้าง CV', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'พรีวิว' }).click();
  await expect(page.getByTitle('พรีวิว')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('TC-CVB-11 a tailored builder CV shows its PDF and opens in the builder', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const docId = '88888888-8888-4888-8888-888888888888', fileId = '99999999-8888-4888-8888-888888888888';
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/projects/${projectId}/documents`) return json([{ id: docId, document_type: 'cv', title: 'CV — Data Analyst', has_builder_draft: true, partial: false, output_language: 'en', latest_revision: { id: 'rv1', revision: 1, created_at: '2026-10-19T00:00:00Z' } }]);
    if (path === `/projects/${projectId}/documents/${docId}/revisions`) return json([{ id: 'rv1', revision: 1, created_at: '2026-10-19T00:00:00Z', document_id: docId, file_id: fileId, content_markdown: 'Alex Example', origin: 'agent' }]);
    if (path === `/projects/${projectId}/files/${fileId}/download`) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '%PDF-1.4\n%%EOF' });
    return route.fallback();
  });
  await page.goto(`/app/projects/${projectId}/documents/${docId}`);
  await expect(page.getByTitle('PDF preview of this version')).toBeVisible();
  const edit = page.getByRole('link', { name: 'Edit in builder' });
  await expect(edit).toHaveAttribute('href', `/app/projects/${projectId}/documents/${docId}/builder`);
});
