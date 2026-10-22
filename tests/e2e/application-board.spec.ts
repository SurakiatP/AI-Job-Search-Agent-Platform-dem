import { expect, test } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from '../fixtures/application';

const longTitle = 'ตำแหน่งวิศวกรข้อมูลอาวุโสสำหรับทีมแพลตฟอร์มวิเคราะห์ข้อมูลขนาดใหญ่ระดับภูมิภาคเอเชียตะวันออกเฉียงใต้';

async function boardWithState(page: import('@playwright/test').Page) {
  let stage = 'saved';
  let failNext = true;
  await useSyntheticApplication(page);
  await page.route(`**/v1/projects/${projectId}/applications`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ job_revision_id: jobId, title: longTitle, company: 'บริษัท ตัวอย่าง จำกัด (มหาชน)', created_at: '2026-10-01T00:00:00Z', stage, has_contact: true, last_activity_at: '2026-10-02T00:00:00Z' }]),
  }));
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
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
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/applications$`)); await page.getByRole("button", { name: "Board" }).click();
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
  const closed = page.getByRole("button", { name: /^Closed \(1\)/ });
  await expect(closed).toBeVisible();
  await closed.click();
  await expect(page.getByRole('link', { name: longTitle })).toBeVisible();
  await expect(page.getByLabel('Applications board').getByText('Rejected', { exact: true })).toBeVisible();
  // Moving a closed card must not remount the board: Closed stays open.
  await page.getByRole('button', { name: `Move to: ${longTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Withdrawn' }).click();
  await expect(page.getByLabel('Applications board').getByText('Withdrawn', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Closed/ })).toHaveAttribute('aria-expanded', 'true');
});

test('board fits 320px in Thai with long titles', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await boardWithState(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/applications`); await page.getByRole("button", { name: "บอร์ด" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ใบสมัคร' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^บันทึกไว้/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('job page edits stage and contact, offers mailto, logs correspondence and notes, newest first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const detail = { job_revision_id: jobId, title: 'Synthetic data analyst', company: 'Example Co', stage: 'saved', contact: { name: null as string | null, email: null as string | null, role: null as string | null }, events: [] as Record<string, unknown>[] };
  let n = 0;
  const push = (kind: string, payload: Record<string, unknown>) => detail.events.unshift({ id: `00000000-0000-4000-8000-00000000000${n++}`, kind, actor: 'user', payload, created_at: `2026-10-14T00:0${n}:00Z` });
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }));
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const to = route.request().postDataJSON().application_status;
    push('stage_changed', { from: detail.stage, to }); detail.stage = to;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: jobId, application_status: to }) });
  });
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application/contact`, async route => {
    detail.contact = route.request().postDataJSON(); push('contact_updated', detail.contact);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });
  await page.route(`**/v1/projects/${projectId}/jobs/${jobId}/application/events`, async route => {
    const { kind, ...payload } = route.request().postDataJSON(); push(kind, { note: null, ...payload });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(detail.events[0]) });
  });

  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await page.getByLabel('Stage').selectOption('interview');
  await expect(page.getByRole('list', { name: 'Activity' }).getByRole('listitem').first()).toContainText('Saved → Interview');

  await expect(page.getByRole('link', { name: 'Write email' })).toHaveCount(0);
  await page.getByLabel('Recruiter name').fill('สมหญิง ใจดี');
  await page.getByLabel('Recruiter email').fill('a+jobs@example.co.th');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('link', { name: 'Write email' })).toHaveAttribute('href', 'mailto:a%2Bjobs@example.co.th?subject=Re%3A%20Synthetic%20data%20analyst');

  await page.getByRole('button', { name: 'Log email' }).click();
  await page.getByLabel('Direction').selectOption('received');
  await page.getByLabel('Subject').fill('Interview invite');
  await page.getByRole('button', { name: 'Save email' }).click();
  await expect(page.getByLabel('Subject')).toHaveCount(0);
  await page.getByLabel('Recruiter role').fill('Unsaved draft');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Prepare portfolio');
  await page.getByRole('button', { name: 'Save note' }).click();
  const items = page.getByRole('list', { name: 'Activity' }).getByRole('listitem');
  await expect(items.nth(0)).toContainText('Prepare portfolio');
  await expect(items.nth(1)).toContainText('Received email: Interview invite');
  await expect(items.nth(2)).toContainText('Contact updated');
  await expect(page.getByLabel('Recruiter role')).toHaveValue('Unsaved draft');
});

test('job page fits 320px in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByLabel('ขั้นตอน')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
