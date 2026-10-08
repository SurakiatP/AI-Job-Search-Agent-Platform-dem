import { expect, test } from '@playwright/test';
import { documentId, jobId, projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

async function contrastRatio(locator: ReturnType<import('@playwright/test').Page['getByRole']>) {
  return locator.evaluate(element => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`);
      const [r, g, b] = channels.map(value => {
        const srgb = value / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test('landing start action stays in the header and works at desktop and 320px in both languages', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const banner = page.getByRole('banner');
  const thaiStart = banner.getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true });
  await expect(thaiStart).toBeVisible();
  await expect(thaiStart).toBeInViewport();
  const desktopBox = await thaiStart.boundingBox();
  expect(desktopBox?.x ?? 0).toBeGreaterThan(800);
  await thaiStart.click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goto('/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  const englishStart = page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true });
  await expect(englishStart).toBeVisible();
  await englishStart.click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/ui02-landing-320.png', fullPage: true });
  await page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goto('/');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true })).toBeInViewport();
  await page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
});

test('every page supports direct links, back/forward, locale changes and responsive navigation', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'หางานที่ใช่ได้อย่างชัดเจน' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-landing-desktop.png', fullPage: true });
  await expect(page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goBack();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find your next role with clarity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL('/app/projects');
  await page.getByRole('link', { name: 'New project' }).click();
  const name = page.getByRole('textbox', { name: 'Project name' });
  await name.fill('Synthetic project draft');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ชื่อโปรเจกต์' })).toHaveValue('Synthetic project draft');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('link', { name: 'Back to projects' }).click();
  await page.goBack();
  await expect(name).toHaveValue('Synthetic project draft');
  await page.getByRole('textbox', { name: 'What are you looking for?' }).fill('Data analyst roles');
  await page.getByRole('button', { name: 'Create a project' }).click();
  await expect(page.getByRole('heading', { name: 'Profile and CV' })).toBeVisible();
  await expect(page.getByText('Goal: Data analyst roles')).toBeVisible();
  await page.getByRole('link', { name: /Sessions: First synthetic session/ }).click();
  await expect(page.getByRole('textbox', { name: 'Instructions for this task (used for evaluation or drafting)' })).toHaveValue('Data analyst roles');
  let uploaded = false;
  let savedLanguage = '';
  page.on('request', request => {
    if (request.url().endsWith(`/api/v1/projects/${projectId}/cv`) && request.method() === 'POST') uploaded = true;
    if (request.url().endsWith(`/api/v1/projects/${projectId}/preferences`) && request.method() === 'PATCH') savedLanguage = JSON.parse(request.postData() ?? '{}').output_language;
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('heading', { name: 'Profile and CV' })).toBeVisible();
  const projectNavigation = page.getByRole('navigation', { name: 'Navigation' });
  await expect(projectNavigation.getByRole('link', { name: 'Profile and CV', exact: true })).toBeVisible();
  await expect(projectNavigation.getByRole('link', { name: 'Saved jobs', exact: true })).toBeVisible();
  await expect(projectNavigation.getByRole('link', { name: 'Documents', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-profile-desktop.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'No CV added yet' })).toBeVisible();
  await page.getByRole('textbox', { name: 'CV text' }).fill('Synthetic CV text only');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => uploaded).toBe(true);
  await page.getByLabel('Document language').selectOption('en');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect.poll(() => savedLanguage).toBe('en');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('textbox', { name: 'Instructions for this task (used for evaluation or drafting)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provider not configured' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-chat-desktop.png', fullPage: true });
  await page.goto(`/app/projects/${projectId}/jobs`);
  await page.getByRole('link', { name: 'Synthetic data analyst' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/jobs/${jobId}`);
  await page.getByRole('link', { name: 'View documents' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents`);
  await page.getByRole('link', { name: 'Synthetic cover letter' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await expect(page.getByText('Partial document', { exact: true })).toBeVisible();
  await expect(page.getByTestId('document-content')).toHaveText('**Synthetic Thai experience** <img src=x onerror=alert(1)> Draft is incomplete.');
  await expect(page.getByTestId('document-content').locator('img')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download document' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-document-detail-desktop.png', fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents`);
  await page.goForward();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents/${documentId}`);
  await page.goto('/app/settings');
  await expect(page.getByRole('tab', { name: 'Providers and tools' })).toBeVisible();
  await page.getByRole('tab', { name: 'Providers and tools' }).click();
  await expect(page.getByRole('heading', { name: 'Providers and tools' })).toBeVisible();
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'ผู้ให้บริการและเครื่องมือ' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/ui02-landing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goto('/');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true })).toBeInViewport();
  await page.getByRole('banner').getByRole('link', { name: 'เริ่มต้นใช้งาน', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
  await page.goto('/app/settings');
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/ui02-settings-mobile.png', fullPage: true });
});

test('missing resources and empty project state offer a usable route forward', async ({ page }) => {
  await useSyntheticApplication(page, { emptyProjects: true });
  await page.goto('/app/projects');
  await expect(page.getByRole('heading', { name: 'ยังไม่มีโปรเจกต์' })).toBeVisible();
  await page.getByRole('link', { name: 'สร้างโปรเจกต์' }).click();
  await expect(page).toHaveURL('/app/projects/new');
  await page.getByRole('button', { name: 'สร้างโปรเจกต์' }).click();
  await expect(page.getByText('กรุณาระบุชื่อโปรเจกต์')).toBeVisible();
  await expect(page.getByText('อธิบายตำแหน่งหรือเป้าหมายที่ต้องการ')).toBeVisible();
  await page.unrouteAll();
  await useSyntheticApplication(page, { missingJob: true });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByRole('heading', { name: 'ไม่พบรายการนี้' })).toBeVisible();
  await page.getByRole('link', { name: 'กลับไปที่โปรเจกต์' }).click();
  await expect(page).toHaveURL('/app/projects');
});

test('job text renders safely and rejects a javascript source URL', async ({ page }) => {
  await useSyntheticApplication(page, { unsafeJobSource: true });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByTestId('job-description')).toHaveText('Synthetic posting description.');
  await expect(page.getByRole('link', { name: 'Open source posting' })).toHaveCount(0);
});

test('new-project redirect can retry after the session list fails', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { sessionErrorOnce: true });
  await page.goto('/app');
  await expect(page.getByRole('alert')).toContainText('We could not load this information.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/sessions/${sessionId}`));
});

test('empty documents links to a route that exists', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { emptyDocuments: true });
  await page.goto(`/app/projects/${projectId}/documents`);
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible();
  await page.locator('#main-content').getByRole('link', { name: 'Profile and CV' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('heading', { name: 'Profile and CV' })).toBeVisible();
});

test('project server failures show a retry action instead of a missing-resource page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { projectErrorOnce: true });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('alert')).toContainText('We could not load this information.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Profile and CV' })).toBeVisible();
});

test('unknown project with a 404 response remains a missing-resource page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto('/app/projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/profile');
  await expect(page.getByRole('heading', { name: 'We could not find that item.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to projects' })).toBeVisible();
});

test('unknown document with a 404 revisions response shows a missing-resource route', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/documents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
  await expect(page.getByRole('heading', { name: 'We could not find that item.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to projects' }).click();
  await expect(page).toHaveURL('/app/projects');
});

test('document revision server failures remain retryable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { revisionErrorOnce: true });
  const revisionResponses: number[] = [];
  page.on('response', response => { if (response.url().includes(`/documents/${documentId}/revisions`)) revisionResponses.push(response.status()); });
  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await expect.poll(() => revisionResponses).toContain(500);
  await expect(page.getByRole('alert')).toContainText('We could not load this information.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic cover letter' })).toBeVisible();
});

test('unsaved CV and preference fields survive route changes and remain project scoped', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByRole('textbox', { name: 'CV text' }).fill('Unsubmitted synthetic CV draft');
  await page.getByLabel('Upload a CV file').setInputFiles({ name: 'selected-cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic selected file') });
  await page.getByLabel('Document language').selectOption('th');
  await page.getByLabel('Notifications').uncheck();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Saved jobs' }).click();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Profile and CV' }).click();
  await expect(page.getByRole('textbox', { name: 'CV text' })).toHaveValue('Unsubmitted synthetic CV draft');
  await expect(page.getByRole('status')).toContainText('selected-cv.txt');
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByLabel('Notifications')).not.toBeChecked();
  let uploadedFilename = '';
  page.on('request', request => {
    if (request.url().endsWith(`/api/v1/projects/${projectId}/cv`) && request.method() === 'POST') {
      uploadedFilename = request.postData() ?? '';
    }
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => uploadedFilename).toContain('filename="selected-cv.txt"');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByLabel('Notifications')).not.toBeChecked();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Saved jobs', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Profile and CV', exact: true }).click();
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByLabel('Notifications')).not.toBeChecked();
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Projects', exact: true }).click();
  await page.locator('.surface-card').filter({ hasText: 'Second synthetic project' }).getByRole('link', { name: 'Profile and CV' }).click();
  await expect(page.getByRole('textbox', { name: 'CV text' })).toHaveValue('');
  await expect(page.getByLabel('Upload a CV file')).toHaveValue('');
  await expect(page.getByLabel('Document language')).toHaveValue('en');
  await expect(page.getByLabel('Notifications')).toBeChecked();
});

test('enabled primary actions meet normal-text contrast requirements', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  for (const theme of ['Light', 'Dark']) {
    await page.goto('/app/settings');
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await page.goto(`/app/projects/${projectId}/profile`);
    await page.getByRole('textbox', { name: 'CV text' }).fill('Synthetic text enables CV save');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    expect(await contrastRatio(save)).toBeGreaterThanOrEqual(4.5);
    const savePreferences = page.getByRole('button', { name: 'Save preferences', exact: true });
    await expect(savePreferences).toBeEnabled();
    expect(await contrastRatio(savePreferences)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `/tmp/ui02-profile-primary-${theme.toLowerCase()}.png`, fullPage: true });
  }
});

test('legacy DOC files are rejected before upload with a localized error', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByLabel('Upload a CV file').setInputFiles({ name: 'legacy-cv.doc', mimeType: 'application/msword', buffer: Buffer.from('Synthetic legacy CV') });
  let uploadRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith(`/api/v1/projects/${projectId}/cv`) && request.method() === 'POST') uploadRequests++;
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose a text PDF, DOCX or text file.');
  expect(uploadRequests).toBe(0);
});
