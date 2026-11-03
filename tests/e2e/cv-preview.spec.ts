import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const fileId = '55555555-5555-4555-8555-555555555555';

async function openProfile(page: Page, locale: 'th' | 'en', file: { name: string; mime: string }, preview: { status: number; body?: string; type?: string }) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await useSyntheticApplication(page);
  const requested: string[] = [];
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ json: [{
    id: 'cv-1', name: 'Synthetic CV', is_primary: true, revision_count: 1, in_use: false, has_builder_draft: false, created_at: '2026-10-15T00:00:00Z',
    latest_revision: { id: 'r1', revision: 1, original_filename: file.name, mime_type: file.mime, size_bytes: 2048, file_id: fileId, created_at: '2026-10-15T00:00:00Z' },
  }] }));
  await page.route(`**/v1/projects/${projectId}/files/${fileId}/*`, route => {
    requested.push(new URL(route.request().url()).pathname.split('/').pop()!);
    return preview.status === 200
      ? route.fulfill({ status: 200, contentType: preview.type ?? 'application/pdf', body: preview.body ?? '%PDF-1.4\n%%EOF' })
      : route.fulfill({ status: preview.status, contentType: 'application/json', body: JSON.stringify({ code: 'preview_unavailable', message_key: 'errors.preview_unavailable', retryable: false, correlation_id: 'x' }) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  return requested;
}

for (const locale of ['th', 'en'] as const) {
  const open = locale === 'th' ? 'ดูตัวอย่าง' : 'Preview';
  const close = locale === 'th' ? 'ปิด' : 'Close';

  test(`DOCX preview shows the rendered file in a viewer, not extracted facts ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const requested = await openProfile(page, locale, { name: 'cv.docx', mime: DOCX }, { status: 200 });
    const trigger = page.getByRole('button', { name: open }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    const frame = dialog.locator('iframe');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('src', /^blob:/);
    expect(requested).toContain('preview');
    await expect(dialog).not.toContainText(/What AI read|AI อ่านได้/);
    const box = await frame.boundingBox();
    expect(box!.height).toBeGreaterThan(300);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(dialog.getByRole('button', { name: close })).toHaveCount(0);
  });

  test(`DOCX without a stored preview says so and offers the download ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    const requested = await openProfile(page, locale, { name: 'old.docx', mime: DOCX }, { status: 404 });
    await page.getByRole('button', { name: open }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('alert')).toContainText(locale === 'th' ? 'ไม่มีตัวอย่างของไฟล์นี้' : 'No preview was saved');
    await expect(dialog.getByRole('link', { name: locale === 'th' ? 'ดาวน์โหลด' : 'Download' })).toBeVisible();
    await expect(dialog.locator('iframe')).toHaveCount(0);
    await expect(dialog).not.toContainText(/What AI read|AI อ่านได้/);
  });

  test(`PDF preview still opens the PDF viewer ${locale}`, async ({ page }) => {
    await openProfile(page, locale, { name: 'cv.pdf', mime: 'application/pdf' }, { status: 200 });
    await page.getByRole('button', { name: open }).first().click();
    await expect(page.getByRole('dialog').locator('iframe')).toHaveAttribute('src', /^blob:.*#view=FitH/);
  });

  test(`TXT preview shows the text ${locale}`, async ({ page }) => {
    await openProfile(page, locale, { name: 'cv.txt', mime: 'text/plain' }, { status: 200, type: 'text/plain; charset=utf-8', body: 'Synthetic plain text' });
    await page.getByRole('button', { name: open }).first().click();
    await expect(page.getByRole('dialog').locator('pre')).toHaveText('Synthetic plain text');
  });
}
