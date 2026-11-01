import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';
import { mergeResume } from '../../frontend/src/features/builder/sections';
import { builderApi, cvId, empty } from '../fixtures/builder';

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
  await page.getByRole('button', { name: /^Ditgar/ }).click();
  await page.getByRole('button', { name: 'Teal' }).click();
  await expect(page.getByText(/This theme does not read in order/)).toBeVisible();
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
  // CR-02 added 'personal' after the summary
  await expect.poll(() => state.puts.at(-1)?.resume_data.order.slice(0, 5)).toEqual(['summary', 'personal', 'experience', 'skills', 'education']);
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
  await page.getByRole('button', { name: 'พรีวิว' }).click();
  await expect(page.getByTitle('พรีวิว')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('TC-CVB-11 a tailored builder CV shows its PDF and opens in the builder', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const docId = '88888888-8888-4888-8888-888888888888', fileId = '99999999-8888-4888-8888-888888888888';
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/v1', '');
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

test('CR-02 the CV name shows under the title and can be renamed; Esc cancels', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  const name = page.getByLabel('CV name');
  await expect(name).toHaveValue('CV ของฉัน');
  await name.fill('CV for AI roles');
  await name.press('Escape');
  await expect(name).toHaveValue('CV ของฉัน');
  expect(state.renames).toEqual([]);
  await name.fill('CV for AI roles');
  await name.press('Enter');
  await expect.poll(() => state.renames).toEqual([{ name: 'CV for AI roles' }]);
  await name.fill('   ');
  await name.blur();
  await expect(name).toHaveValue('CV for AI roles'); // an empty name is never sent
  expect(state.renames).toHaveLength(1);
});

test('CR-02 an edit is saved and previewed within about a second', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await expect.poll(() => state.previews).toBe(1); // first preview on open
  await page.waitForTimeout(3100); // outside the preview throttle window
  await page.getByLabel('Headline').fill('AI Engineer');
  const typed = Date.now();
  await expect.poll(() => state.times.preview.length, { timeout: 3000 }).toBe(2);
  expect(state.times.put[0] - typed).toBeLessThan(900);
  expect(state.times.preview[1] - typed).toBeLessThan(1500);
});

test('CR-02 Thai address fields and personal details, hidden until shown', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByLabel('เขต/อำเภอ').fill('บางนา');
  await page.getByLabel('จังหวัด').selectOption({ label: 'กรุงเทพมหานคร' });
  await page.getByLabel('รหัสไปรษณีย์').fill('10a260');
  await expect(page.getByLabel('รหัสไปรษณีย์')).toHaveValue('10260');
  await expect.poll(() => state.puts.at(-1)?.resume_data.basics.address).toMatchObject({ district: 'บางนา', province: 'TH-10', postcode: '10260' });
  expect(state.puts.at(-1).resume_data.basics.address_full).toBe(false);
  expect(state.puts.at(-1).resume_data.personal_hidden).toBe(true);
  await page.getByRole('button', { name: /^ข้อมูลส่วนตัว/ }).click();
  await expect(page.getByText(/ไม่ถูกส่งให้ AI/)).toBeVisible();
  await page.getByLabel('สัญชาติ').fill('ไทย');
  await page.getByRole('button', { name: 'แสดงข้อมูลส่วนตัวใน CV' }).click();
  await expect.poll(() => state.puts.at(-1)?.resume_data.personal_hidden).toBe(false);
  expect(state.puts.at(-1).resume_data.personal.nationality).toBe('ไทย');
  expect(state.puts.at(-1).resume_data.order[1]).toBe('personal');
});

test('CR-02 the preview shows the page count and warns past two pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await builderApi(page, { pdf: '%PDF-1.4\n<< /Type /Pages >>\n<< /Type /Page >>\n<< /Type /Page >>\n<< /Type /Page >>\n%%EOF' });
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await expect(page.getByText('· 3 pages')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Most CVs work best at 1–2 pages' })).toBeVisible();
});

test('F7 two draft CVs with the same name show different created times in the profile list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const draft = (id: string, created_at: string) => ({ id, name: 'My CV', is_primary: false, created_at, latest_revision: null, revision_count: 0, in_use: false, has_builder_draft: true });
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
    draft('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-19T09:00:00Z'), draft('aaaaaaaa-0000-4000-8000-000000000002', '2026-10-19T15:30:00Z')]) }));
  await page.goto(`/app/projects/${projectId}/profile`);
  const rows = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'My CV' }) });
  await expect(rows).toHaveCount(2);
  const first = await rows.nth(0).getByText(/^Created /).textContent();
  const second = await rows.nth(1).getByText(/^Created /).textContent();
  expect(first).not.toBe(second);
});

test('P2-2 a comma in the keywords field can be deleted', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByRole('button', { name: /^Skills/ }).first().click();
  await page.getByRole('button', { name: 'Add skills' }).click();
  const field = page.getByLabel('Keywords (comma separated)');
  await field.pressSequentially('a, b');
  await field.press('Backspace'); await field.press('Backspace');
  await expect(field).toHaveValue('a,');
  await field.press('Backspace');
  await expect(field).toHaveValue('a');
  await expect.poll(() => state.draft.resume_data.sections.skills.items[0]?.keywords).toEqual(['a']);
});

test('P3-5 a failed save stops the publish and shows why', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page, { failPut: true });
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByLabel('Full name').fill('Unsaved Name');
  await page.getByRole('button', { name: 'Save as new version' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save as new version' }).click();
  await expect(page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Could not save' })).toBeVisible();
  expect(state.publishes).toBe(0);
});

test('P3-6 a corrupt stash does not lock the builder', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('ui.locale', 'en'); localStorage.setItem('cvb-draft:cv:77777777-7777-4777-8777-777777777777', '{not json'); });
  await useSyntheticApplication(page);
  await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await expect(page.getByLabel('Full name')).toBeVisible();
});

test('F3 saving a theme without a name focuses the field and links the error to it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  await page.getByRole('button', { name: 'Customise this theme' }).click();
  await page.getByRole('button', { name: 'Save as my theme' }).click();
  const name = page.locator('#theme-name');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  const described = await name.getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  await expect(page.locator(`#${described}`)).toHaveText('Name the theme before saving');
  expect(state.themePosts).toBe(0);
  await name.fill('Mine');
  await expect(name).toHaveAttribute('aria-invalid', 'false');
});

test('F5 customising a theme hides the older accent row; cancel brings it back', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await builderApi(page);
  await page.goto(`/app/projects/${projectId}/cvs/${cvId}/builder`);
  const oldRow = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Accent colour' }) });
  await expect(oldRow).toHaveCount(1);
  await page.getByRole('button', { name: 'Customise this theme' }).click();
  await expect(oldRow).toHaveCount(0);
  await expect(page.locator('#theme-hex')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(oldRow).toHaveCount(1);
});

test('F9 mergeResume skips an item already in the draft even with keys in another order', () => {
  const draft: any = empty();
  draft.sections.experience.items = [{ id: 'a', title: 'Analyst', company: 'Acme', start: '2024-01' }];
  const add: any = empty();
  add.sections.experience.items = [{ start: '2024-01', company: 'Acme', title: 'Analyst', id: 'b' }];
  expect(mergeResume(draft, add).sections.experience.items).toHaveLength(1);
  add.sections.experience.items.push({ id: 'c', title: 'Lead', company: 'Acme', start: '2025-01' });
  expect(mergeResume(draft, add).sections.experience.items.map((i: any) => i.title)).toEqual(['Analyst', 'Lead']);
});
