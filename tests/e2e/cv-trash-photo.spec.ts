import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

// CR-CVT-01 (docs/superpowers/specs/2026-10-20-cv-trash-and-photo-templates-design.md).
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const at = '2026-10-19T00:00:00Z';
const cvId = '66666666-6666-4666-8666-666666666666';
const cv = (extra: Record<string, unknown> = {}) => ({ id: cvId, name: 'Data CV', is_primary: true, created_at: at, revision_count: 1, in_use: false,
  latest_revision: { id: 'r1', revision: 1, created_at: at, original_filename: 'data-cv.pdf', mime_type: 'application/pdf', size_bytes: 2048, file_id: 'f1' }, ...extra });

async function cvApi(page: Page, start: { live: unknown[]; trash: unknown[] }) {
  const state = { ...start, calls: [] as string[] };
  await page.route(`**/api/v1/projects/${projectId}/cvs**`, route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(`/api/v1/projects/${projectId}/cvs`, '');
    const method = route.request().method();
    if (method !== 'GET') state.calls.push(`${method} ${path}`);
    if (path === '' && method === 'GET') return route.fulfill(json(url.searchParams.get('view') === 'trash' ? state.trash : state.live));
    if (path === `/${cvId}` && method === 'DELETE') { state.trash = [cv({ is_primary: false, trashed_at: at })]; state.live = []; return route.fulfill({ status: 204 }); }
    if (path === `/${cvId}/restore`) { state.live = [cv()]; state.trash = []; return route.fulfill(json(cv())); }
    if (path === `/${cvId}/permanent`) { state.trash = []; return route.fulfill({ status: 204 }); }
    return route.fallback();
  });
  return state;
}

test('AC-CVT-01 deleting a CV moves it to the trash and undo brings it back', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await cvApi(page, { live: [cv()], trash: [] });
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByRole('button', { name: 'Options for Data CV' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Move CV “Data CV” to the trash?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Move to trash' }).click();
  const notice = page.getByRole('status').filter({ hasText: '“Data CV” moved to the trash.' });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data CV', level: 3 })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Trash 1' })).toBeVisible();
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Data CV', level: 3 })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(state.calls).toEqual([`DELETE /${cvId}`, `POST /${cvId}/restore`]);
});

test('AC-CVT-04 the trash has a CV tab to restore or delete a CV for good', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = await cvApi(page, { live: [], trash: [cv({ is_primary: false, trashed_at: at }), cv({ id: 'c2c2c2c2-0000-4000-8000-000000000000', name: 'Old CV', is_primary: false, trashed_at: at })] });
  await page.route(`**/api/v1/projects/${projectId}/cvs/c2c2c2c2-0000-4000-8000-000000000000/permanent`, route => route.fulfill(json({ code: 'cv_in_use', message_key: 'errors.cv_in_use', retryable: false }, 409)));
  await page.goto(`/app/projects/${projectId}/trash?tab=cvs`);
  const nav = page.getByRole('navigation', { name: 'Navigation' });
  await expect(nav.getByRole('link', { name: 'Trash 2' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'CVs 2' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Deleting for good removes the CV’s files, text and builder data.', { exact: false })).toBeVisible();

  const busy = page.getByRole('listitem').filter({ hasText: 'Old CV' });
  await busy.getByRole('button', { name: 'Delete for good' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByRole('dialog').getByText('An AI task is still using this CV. Try again when it finishes.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Data CV' });
  await expect(row.getByText('data-cv.pdf · v1')).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('tab', { name: 'CVs 0' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Trash', exact: true })).toBeVisible();
  expect(state.calls).toContain(`POST /${cvId}/restore`);
});

test('AC-CVT-04 empty CV trash says what lands there', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await cvApi(page, { live: [], trash: [] });
  await page.goto(`/app/projects/${projectId}/trash?tab=cvs`);
  await expect(page.getByText('Trash is empty. CVs you delete land here and can be restored.')).toBeVisible();
});

const SECTIONS = ['experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'awards', 'publications', 'volunteer', 'references', 'interests'];
const resume = (photo = '') => ({
  basics: { name: 'Somchai', headline: '', email: '', phone: '', location: '', profiles: [], photo }, summary: { content: '' }, summary_hidden: false,
  sections: Object.fromEntries(SECTIONS.map(name => [name, { hidden: false, items: [] }])), order: ['summary', ...SECTIONS], references_on_request: false,
});
const builderCv = '77777777-7777-4777-8777-777777777777';
const photoId = 'aaaaaaaa-0000-4000-8000-000000000001';
// 1x1 PNG; the page crops it to 3:4 before upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('AC-CVP-04 add a photo, see which templates print it, then remove it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  let draft = { id: 'd1', cv_id: builderCv, document_id: null, name: 'CV', resume_data: resume(), template_id: 'onyx', accent: 'indigo', document_language: 'en', ats_safe: true, updated_at: at };
  const puts: any[] = [];
  const uploads: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/resume-templates') return route.fulfill(json({ templates: [], accents: [], provinces: [] }));
    if (path === `/projects/${projectId}/cvs/${builderCv}/draft`) {
      if (request.method() === 'GET') return route.fulfill(json(draft));
      const body = request.postDataJSON();
      puts.push(body);
      draft = { ...draft, ...body, updated_at: `2026-10-19T00:00:${String(puts.length).padStart(2, '0')}.000Z` };
      return route.fulfill(json(draft));
    }
    if (path.endsWith('/draft/preview')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    if (path === `/projects/${projectId}/resume-photos` && request.method() === 'POST') {
      uploads.push(request.headers()['content-type'] ?? '');
      return route.fulfill(json({ id: photoId, mime_type: 'image/jpeg', size_bytes: 100 }, 201));
    }
    if (path === `/projects/${projectId}/resume-photos/${photoId}`) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fallback();
  });
  await page.goto(`/app/projects/${projectId}/cvs/${builderCv}/builder`);
  for (const name of ['Lotus', 'Teak', 'Saffron']) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(page.getByText('JPG or PNG, up to 2 MB. Shown by the Lotus, Teak and Saffron templates.')).toBeVisible();

  await page.getByLabel('Add photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: 'Your CV photo' })).toBeVisible();
  await expect.poll(() => puts.at(-1)?.resume_data.basics.photo).toBe(photoId);
  expect(uploads[0]).toContain('multipart/form-data');
  await expect(page.getByText('This template does not show a photo. Pick Lotus, Teak or Saffron to include it.')).toBeVisible();

  await page.getByRole('button', { name: /^Lotus/ }).click();
  await expect.poll(() => puts.at(-1)?.template_id).toBe('lotus');
  await expect(page.getByText('This template does not show a photo.', { exact: false })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect.poll(() => puts.at(-1)?.resume_data.basics.photo).toBe('');
  await expect(page.getByRole('img', { name: 'Your CV photo' })).toHaveCount(0);
});

test('AC-CVP-02 a photo that is too large or not an image is refused before upload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const draft = { id: 'd1', cv_id: builderCv, document_id: null, name: 'CV', resume_data: resume(), template_id: 'lotus', accent: 'indigo', document_language: 'en', ats_safe: true, updated_at: at };
  let uploads = 0;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/resume-templates') return route.fulfill(json({ templates: [], accents: [], provinces: [] }));
    if (path === `/projects/${projectId}/cvs/${builderCv}/draft`) return route.fulfill(json(draft));
    if (path.endsWith('/draft/preview')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    if (path.endsWith('/resume-photos')) { uploads += 1; return route.fulfill(json({ id: photoId }, 201)); }
    return route.fallback();
  });
  await page.goto(`/app/projects/${projectId}/cvs/${builderCv}/builder`);
  await page.getByLabel('Add photo').setInputFiles({ name: 'me.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByRole('alert').filter({ hasText: 'Use a JPG or PNG photo.' })).toBeVisible();
  await page.getByLabel('Add photo').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert').filter({ hasText: 'The photo is larger than 2 MB.' })).toBeVisible();
  expect(uploads).toBe(0);
});
