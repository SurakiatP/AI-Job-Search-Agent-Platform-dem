import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

// CH-11 (ask once for a main CV), CH-12 (upload errors with recovery), CH-06 (CV reading steps), CH-08 (My facts naming).
const rev = (id: string, n: number, file: string, mime: string) => ({ id, revision: n, created_at: '2026-10-10T00:00:00Z', original_filename: file, mime_type: mime, size_bytes: 2048, file_id: null, skill_profile_ready: true });
const cv = (id: string, name: string, primary: boolean, file: string, mime: string) => ({ id, name, is_primary: primary, in_use: false, revision_count: 1, created_at: '2026-10-10T00:00:00Z', latest_revision: rev(`${id}-r1`, 1, file, mime) });
const A = cv('77777777-7777-4777-8777-777777777771', 'Data CV', false, 'data.pdf', 'application/pdf');
const B = cv('77777777-7777-4777-8777-777777777772', 'Product CV', false, 'product.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

async function setup(page: Page, locale: 'en' | 'th', cvs: unknown[]) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.request().method() === 'GET' ? route.fulfill({ json: cvs }) : route.fallback());
}

test('several CVs and no main CV: the dialog asks once and saves the pick as main', async ({ page }) => {
  await setup(page, 'en', [A, B]);
  const patches: unknown[] = [];
  await page.route(`**/v1/projects/${projectId}/cvs/${B.id}`, route => { patches.push(route.request().postDataJSON()); return route.fulfill({ json: { ...B, is_primary: true } }); });
  await page.goto(`/app/projects/${projectId}/sessions`);
  await page.getByRole('button', { name: 'New evaluation' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Which CV should be your main one?')).toBeVisible();
  const box = dialog.getByRole('checkbox', { name: /Use this one as my main CV/ });
  await expect(box).toBeChecked();
  const options = await dialog.getByRole('combobox').first().locator('option').allTextContents();
  expect(options[0]).toMatch(/Data CV · version 1 · PDF · /);
  expect(options[1]).toMatch(/Product CV · version 1 · Word · /);
  await dialog.getByRole('combobox').first().selectOption(B.id);
  await dialog.getByRole('button', { name: 'Start session' }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ is_primary: true });
});

test('a main CV exists: the dialog does not ask again', async ({ page }) => {
  await setup(page, 'en', [{ ...A, is_primary: true }, B]);
  await page.goto(`/app/projects/${projectId}/sessions`);
  await page.getByRole('button', { name: 'New evaluation' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible();
  await expect(page.getByText('Which CV should be your main one?')).toHaveCount(0);
});

for (const [locale, t] of [['en', { many: /more than 10 pages.*\.txt/, ocr: /right now.*\.txt/, retry: 'Try again' }], ['th', { many: /เกิน 10 หน้า.*\.txt/, ocr: /อ่านไฟล์นี้ไม่ได้.*\.txt|ตอนนี้อ่านไฟล์นี้ไม่ได้.*\.txt/, retry: 'ลองใหม่' }]] as const) {
  test(`upload errors name the limit and offer a way forward, with retry for temporary ones (${locale})`, async ({ page }) => {
    await setup(page, locale, [{ ...A, is_primary: true }]);
    let posts = 0;
    await page.route(`**/v1/projects/${projectId}/cvs`, route => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts += 1;
      const code = posts === 1 ? 'document_too_many_pages' : 'ocr_unavailable';
      return route.fulfill({ status: posts === 1 ? 400 : 503, contentType: 'application/json', body: JSON.stringify({ code, message_key: code, retryable: posts > 1 }) });
    });
    await page.goto(`/app/projects/${projectId}/profile`);
    const file = { name: 'long.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') };
    await page.getByLabel(locale === 'en' ? 'Add CV' : 'เพิ่ม CV', { exact: true }).setInputFiles(file);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText(t.many);
    await expect(alert.getByRole('button', { name: t.retry })).toHaveCount(0);
    await page.getByLabel(locale === 'en' ? 'Add CV' : 'เพิ่ม CV', { exact: true }).setInputFiles(file);
    await expect(alert).toContainText(t.ocr);
    await alert.getByRole('button', { name: t.retry }).click();
    await expect.poll(() => posts).toBe(3);
  });
}

test('reading a CV shows steps, the usual time and no invented page count', async ({ page }) => {
  await setup(page, 'en', [{ ...A, is_primary: true }]);
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/v1/projects/${projectId}/cvs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await gate;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(B) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByLabel('Add CV', { exact: true }).setInputFiles({ name: 'new.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  const reading = page.getByTestId('cv-reading');
  await expect(reading.getByRole('status')).toContainText('Reading your CV');
  await expect(reading).toContainText('Usually under 30 seconds for 1–3 pages');
  await expect(reading.getByRole('list', { name: 'CV reading steps' }).getByRole('listitem')).toHaveText(['Upload the file', 'Read the pages', 'Ready to use']);
  await expect(reading).not.toContainText(/page \d+ of/i);
  release();
  await expect(reading).toHaveCount(0);
});
