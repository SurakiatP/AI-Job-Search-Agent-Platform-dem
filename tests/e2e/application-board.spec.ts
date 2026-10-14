import { expect, test } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from '../fixtures/application';

const longTitle = 'ตำแหน่งวิศวกรข้อมูลอาวุโสสำหรับทีมแพลตฟอร์มวิเคราะห์ข้อมูลขนาดใหญ่ระดับภูมิภาคเอเชียตะวันออกเฉียงใต้';

async function boardWithState(page: import('@playwright/test').Page) {
  let stage = 'saved';
  let failNext = true;
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/applications`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ job_revision_id: jobId, title: longTitle, company: 'บริษัท ตัวอย่าง จำกัด (มหาชน)', created_at: '2026-10-01T00:00:00Z', stage, has_contact: true, last_activity_at: '2026-10-02T00:00:00Z' }]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    if (failNext) { failNext = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return; }
    stage = route.request().postDataJSON().application_status;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: jobId, application_status: stage }) });
  });
}

test('board shows stage columns and moves a card by keyboard, surviving an error and a reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await boardWithState(page);
  await page.goto(`/app/projects/${projectId}/jobs`);
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/applications$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
  for (const name of ['Saved', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })).toBeVisible();
  }
  const saved = page.getByRole('region', { name: /^Saved/ });
  await expect(saved.getByRole('link', { name: longTitle })).toBeVisible();

  const menu = page.getByRole('button', { name: `Move to: ${longTitle}` });
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Applied' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Applied' }).click();
  await expect(page.getByRole('region', { name: /^Applied/ }).getByRole('link', { name: longTitle })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: /^Applied/ }).getByRole('link', { name: longTitle })).toBeVisible();

  await page.getByRole('button', { name: `Move to: ${longTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Rejected' }).click();
  const closed = page.getByText(/^Closed \(1\)$/);
  await expect(closed).toBeVisible();
  await closed.click();
  await expect(page.getByRole('link', { name: longTitle })).toBeVisible();
});

test('board fits 320px in Thai with long titles', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await boardWithState(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/applications`);
  await expect(page.getByRole('heading', { level: 1, name: 'ใบสมัคร' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^บันทึกไว้/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
