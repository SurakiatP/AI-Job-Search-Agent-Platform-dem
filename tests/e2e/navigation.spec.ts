import { expect, test } from '@playwright/test';
import { documentId, jobId, projectId, secondProjectId, sessionId, useSyntheticApplication } from '../fixtures/application';

async function contrastRatio(locator: ReturnType<import('@playwright/test').Page['getByRole']>) {
  return locator.evaluate(element => {
    const luminance = (color: string) => {
      // Computed colors may be oklch(); rasterize one pixel so the canvas converts any CSS color to sRGB.
      const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
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

test('signed-in visitors get one Open app action in the landing header, at desktop and 320px in both languages', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const banner = page.getByRole('banner');
  const thaiOpen = banner.getByRole('link', { name: 'เปิดแอป', exact: true });
  await expect(thaiOpen).toBeVisible();
  await expect(banner.getByRole('link', { name: 'เข้าสู่ระบบ', exact: true })).toHaveCount(0);
  await expect(banner.getByRole('link', { name: 'เริ่มใช้งาน', exact: true })).toHaveCount(0);
  await expect(thaiOpen).toHaveAttribute('href', '/app/projects');
  await expect(thaiOpen).toBeInViewport();
  expect((await thaiOpen.boundingBox())?.x ?? 0).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  const englishOpen = banner.getByRole('link', { name: 'Open app', exact: true });
  await expect(englishOpen).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Log in', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(banner.getByRole('link', { name: 'Open app', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await banner.getByRole('link', { name: 'Open app', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
});

test('anonymous visitors still see sign-up and log-in on the landing header', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route('**/v1/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'unauthorized', message_key: 'errors.unauthorized', retryable: false }) }));
  await page.goto('/');
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('link', { name: 'เริ่มใช้งาน', exact: true })).toHaveAttribute('href', '/signup');
  await expect(banner.getByRole('link', { name: 'เข้าสู่ระบบ', exact: true })).toHaveAttribute('href', '/login');
  await expect(banner.getByRole('link', { name: 'เปิดแอป', exact: true })).toHaveCount(0);
});

test('every page supports direct links, back/forward, locale changes and responsive navigation', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'สมัครงานให้ตรงจุด', level: 1 })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-landing-desktop.png', fullPage: true });
  await expect(page.getByRole('banner').getByRole('link', { name: 'เปิดแอป', exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'เปิดแอป', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
  await page.goBack();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Apply with precision', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to start' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Open app', exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Open app' }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
  await page.goto('/app/projects');
  await expect(page).toHaveURL('/app/projects');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'All projects', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('main').getByRole('link', { name: 'New project' }).click();
  const name = page.getByRole('textbox', { name: 'Project name' });
  await name.fill('Synthetic project draft');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ชื่อโปรเจกต์' })).toHaveValue('Synthetic project draft');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('link', { name: 'Back to projects' }).click();
  await page.goBack();
  await expect(name).toHaveValue('Synthetic project draft');
  await page.getByRole('button', { name: 'Create a project' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/overview$`));
  await expect(page.getByRole('heading', { name: 'Synthetic analyst search', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /Switch project/ }).click();
  await page.getByRole('dialog', { name: 'Switch project' }).getByRole('link', { name: 'First synthetic session' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic data analyst', level: 1 })).toBeVisible();
  let uploaded = false;
  let savedLanguage = '';
  page.on('request', request => {
    if (request.url().endsWith(`/v1/projects/${projectId}/cvs`) && request.method() === 'POST') uploaded = true;
    if (request.url().endsWith(`/v1/projects/${projectId}/preferences`) && request.method() === 'PATCH') savedLanguage = JSON.parse(request.postData() ?? '{}').output_language;
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('heading', { name: 'CV & experience', level: 1 })).toBeVisible();
  const projectNavigation = page.getByRole('navigation', { name: 'Navigation' }).first();
  await expect(projectNavigation.getByRole('link', { name: 'CV & experience', exact: true })).toBeVisible();
  await expect(projectNavigation.getByRole('link', { name: 'Applications', exact: true })).toBeVisible();
  await expect(projectNavigation.getByRole('link', { name: 'Documents', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-profile-desktop.png', fullPage: true });
  await expect(page.getByRole('heading', { name: "Add your first CV" })).toBeVisible();
  await page.getByLabel('Add CV', { exact: true }).setInputFiles({ name: 'synthetic-cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic CV text only') });
  await expect.poll(() => uploaded).toBe(true);
  await page.goto(`/app/settings?project=${projectId}&section=preferences`);
  await page.getByLabel('Document language').selectOption('en');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect.poll(() => savedLanguage).toBe('en');
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic data analyst', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Evaluation', selected: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-chat-desktop.png', fullPage: true });
  await page.goto(`/app/projects/${projectId}/applications`);
  await page.getByRole('link', { name: 'Synthetic data analyst' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/jobs/${jobId}`);
  await page.getByRole('link', { name: 'View all documents' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents`);
  await page.getByRole('link', { name: 'Synthetic cover letter' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByTestId('document-language')).toContainText('ไทย');
  await expect(page.getByText('Partial document', { exact: true })).toBeVisible();
  await expect(page.getByTestId('document-content')).toHaveText('Synthetic Thai experience <img src=x onerror=alert(1)> Draft is incomplete.');
  await expect(page.getByTestId('document-content').locator('img')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download document' })).toBeVisible();
  await page.screenshot({ path: '/tmp/ui02-document-detail-desktop.png', fullPage: true });
  await page.goBack();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents`);
  await page.goForward();
  await expect(page).toHaveURL(`/app/projects/${projectId}/documents/${documentId}`);
  await page.goto('/app/settings');
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(sections.getByRole('button', { name: 'Tools' })).toBeVisible();
  await sections.getByRole('button', { name: 'Tools' }).click();
  await expect(sections.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'หมวดการตั้งค่า' }).getByRole('button', { name: 'เครื่องมือ' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Open app', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/ui02-landing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('banner').getByRole('link', { name: 'Open app', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
  await page.goto('/');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'เปิดแอป', exact: true })).toBeInViewport();
  await page.getByRole('banner').getByRole('link', { name: 'เปิดแอป', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
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
  await expect(page.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/app/projects/new');
  await page.unrouteAll();
  await useSyntheticApplication(page, { missingJob: true });
  await page.goto(`/app/projects/${projectId}/jobs/${jobId}`);
  await expect(page.getByRole('heading', { name: 'ประกาศงานนี้ไม่อยู่ในโปรเจกต์แล้ว' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'กลับไปที่ใบสมัคร' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/applications`);
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
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}/overview`));
});

test('empty documents links to a route that exists', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { emptyDocuments: true });
  await page.goto(`/app/projects/${projectId}/documents`);
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible();
  await page.locator('#main-content').getByRole('link', { name: 'Go to Evaluate' }).click();
  await expect(page).toHaveURL(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic data analyst', level: 1 })).toBeVisible();
});

test('project server failures show a retry action instead of a missing-resource page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { projectErrorOnce: true });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('alert')).toContainText('We could not load this information.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'CV & experience', level: 1 })).toBeVisible();
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

test('unsaved preference fields survive route changes and remain project scoped', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const prefs = (id: string) => `/app/settings?project=${id}&section=preferences`;
  await page.goto(prefs(projectId));
  const navigation = page.getByRole('navigation', { name: 'Navigation' }).first();
  await page.getByLabel('Document language').selectOption('th');
  await page.getByRole('checkbox', { name: /^Notifications/ }).uncheck();
  await navigation.getByRole('link', { name: 'Account' }).click();
  await page.goBack();
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByRole('checkbox', { name: /^Notifications/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByRole('checkbox', { name: /^Notifications/ })).not.toBeChecked();
  await navigation.getByRole('link', { name: 'Account' }).click();
  await page.goBack();
  await expect(page.getByLabel('Document language')).toHaveValue('th');
  await expect(page.getByRole('checkbox', { name: /^Notifications/ })).not.toBeChecked();
  await page.getByLabel('Project settings for').selectOption({ label: 'Second synthetic project' });
  await expect(page).toHaveURL(prefs(secondProjectId));
  await expect(page.getByLabel('Document language')).toHaveValue('en');
  await expect(page.getByRole('checkbox', { name: /^Notifications/ })).toBeChecked();
});

test('enabled primary actions meet normal-text contrast requirements', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  for (const theme of ['Light', 'Dark']) {
    await page.goto('/app/settings');
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await page.goto(`/app/projects/${projectId}/profile`);
    const addCv = page.locator('button', { hasText: 'Add CV' });
    await expect(addCv).toBeEnabled();
    expect(await contrastRatio(addCv)).toBeGreaterThanOrEqual(4.5);
    await page.goto(`/app/settings?project=${projectId}&section=preferences`);
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
  let uploadRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith(`/v1/projects/${projectId}/cvs`) && request.method() === 'POST') uploadRequests++;
  });
  await page.getByLabel('Add CV', { exact: true }).setInputFiles({ name: 'legacy-cv.doc', mimeType: 'application/msword', buffer: Buffer.from('Synthetic legacy CV') });
  await expect(page.getByRole('alert')).toHaveText('Choose a text PDF, DOCX or text file.');
  expect(uploadRequests).toBe(0);
});
