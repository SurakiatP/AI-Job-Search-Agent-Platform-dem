import { expect, test } from '@playwright/test';
import { useApplicationsWorkspaceFixture } from '../fixtures/applications-workspace';

test('applications open as a list and keep the board as a URL-backed view', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/applications`);

  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Applications list' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Senior Data Analyst' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Senior Data Analyst' })).toContainText('Northstar Health');

  // Stage is a visible, labelled control on every row; rows carry no recruiter details and link to the detail page.
  const row = page.getByRole('listitem').filter({ hasText: 'Senior Data Analyst' });
  await expect(row.getByRole('combobox', { name: 'Stage: Senior Data Analyst' })).toHaveValue('applied');
  await expect(row).not.toContainText('northstar.example');
  await expect(row).not.toContainText('Sirin');
  await expect(row.getByRole('link', { name: 'Senior Data Analyst' })).toHaveAttribute('href', new RegExp(`/jobs/${fixture.jobId}$`));
  await expect(row).toContainText('Log a reply when you get one');
  await expect(page.getByText(/\d+ tracked · \d+ active · \d+ closed/)).toBeVisible();

  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page).toHaveURL(/\?view=board$/);
  await expect(page.getByRole('region', { name: /^Saved/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Closed \(2\)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: /^Saved/ })).toBeVisible();
});

test('stage changes from the row announce the move and can be undone; search and filters narrow the list', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/applications`);
  const stage = page.getByRole('combobox', { name: 'Stage: Senior Data Analyst' });
  await stage.selectOption('interview');
  await expect(page.getByRole('status').filter({ hasText: 'Moved “Senior Data Analyst” to Interview.' })).toBeVisible();
  expect(fixture.writes.at(-1)?.body).toEqual({ application_status: 'interview' });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stage).toHaveValue('applied');
  expect(fixture.writes.at(-1)?.body).toEqual({ application_status: 'applied' });

  await page.getByLabel('Search applications').fill('lumen');
  await expect(page.getByRole('link', { name: 'Product Analyst' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Senior Data Analyst' })).toHaveCount(0);
  await page.getByLabel('Search applications').fill('no such posting');
  await expect(page.getByText('No applications match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Filter by stage').selectOption('rejected');
  await expect(page.getByRole('list', { name: 'Applications list' }).getByRole('listitem')).toHaveCount(1);
});

test('untrusted posting titles stay text in the applications list', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/applications`);
  await expect(page.getByRole('link', { name: '<img src=x onerror=alert(1)> Data Operations Lead' })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Board' }).click();
  await page.getByRole('button', { name: /^Closed/ }).click();
  await expect(page.getByRole('link', { name: '<img src=x onerror=alert(1)> Data Operations Lead' })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test('add-posting draft validates source and saves an application record', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/applications`);
  await page.getByRole('button', { name: 'Add posting' }).click();
  await page.getByLabel('Job title').fill('  Analytics Lead  ');
  await page.getByLabel('Company').fill('  Cedar Labs  ');
  await page.getByLabel('Source URL').fill('javascript:alert(1)');
  await page.getByLabel('Job description').fill('A synthetic role description with useful context.');
  await page.getByRole('button', { name: 'Save posting' }).click();
  await expect(page.getByRole('alert')).toContainText('valid http or https');
  expect(fixture.writes).toHaveLength(0);

  await page.getByLabel('Source URL').fill('https://jobs.example.test/cedar-analytics');
  await page.getByRole('button', { name: 'Save posting' }).click();
  await expect(page.getByRole('link', { name: 'Analytics Lead' })).toBeVisible();
  expect(fixture.writes[0]).toEqual({
    method: 'POST',
    path: `/v1/projects/${fixture.projectId}/jobs`,
    body: { title: 'Analytics Lead', company: 'Cedar Labs', description: 'A synthetic role description with useful context.', source_url: 'https://jobs.example.test/cedar-analytics' },
  });
});

test('job detail presents source, evaluation, and documents before tracking and treats content as text', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/jobs/${fixture.jobId}`);

  const title = page.getByRole('heading', { level: 1, name: 'Senior Data Analyst' });
  const source = page.getByRole('link', { name: /original posting/i });
  const report = page.getByTestId('evaluation-report');
  const related = page.getByRole('heading', { name: 'Related documents' });
  const tracking = page.getByRole('heading', { name: 'Application tracking' });
  await expect(title).toBeVisible();
  await expect(source).toHaveAttribute('href', 'https://jobs.example.test/northstar-analyst');
  await expect(page.getByText('3.7')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Northstar cover letter' })).toBeVisible();
  await expect(page.getByText('Stage changes record your tracking. They do not send an application.')).toBeVisible();
  const box = (locator: typeof source) => locator.evaluate(element => { const { top, left } = element.getBoundingClientRect(); return { top, left }; });
  // Desktop: decision (evaluation, documents) on the left, tracking on the right.
  const [sourceBox, reportBox, docsBox, trackingBox] = await Promise.all([source, report, related, tracking].map(box));
  expect(sourceBox.top).toBeLessThan(reportBox.top);
  expect(reportBox.top).toBeLessThan(docsBox.top);
  expect(trackingBox.left).toBeGreaterThan(reportBox.left + 200);
  await expect(page.getByRole('link', { name: 'Continue preparation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Skills found' })).toContainText('2 / 3');
  await expect(page.getByText('Possible fit')).toBeVisible();
  // Mobile: single column, tracking directly after the evaluation.
  await page.setViewportSize({ width: 390, height: 900 });
  const [mobileReport, mobileTracking, mobileDocs] = await Promise.all([report, tracking, related].map(box));
  expect(mobileReport.top).toBeLessThan(mobileTracking.top);
  expect(mobileTracking.top).toBeLessThan(mobileDocs.top);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('img[src="x"][onerror]')).toHaveCount(0);

  await page.getByLabel('Recruiter name').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('img[src="x"][onerror]')).toHaveCount(0);
  expect(fixture.writes.some(write => write.method === 'PUT' && JSON.stringify(write.body).includes('<img src=x onerror=alert(1)>'))).toBe(true);
});

test('job evaluation names its exact source pair and labels document versions correctly', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.goto(`/app/projects/${fixture.projectId}/jobs/${fixture.jobId}`);
  const source = page.getByTestId('evaluation-provenance');
  await expect(source).toContainText('Healthcare Analytics · CV version 3');
  await expect(source).toContainText('Job posting · version 1');
  await expect(page.getByText('Document revision 2', { exact: true })).toBeVisible();
  await page.goto(`/app/projects/${fixture.projectId}/applications`);
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'ขั้นตอน: Senior Data Analyst', exact: true })).toBeVisible();
});

test('unavailable CV details preserve the report and offer recovery without guessing', async ({ page }) => {
  const fixture = await useApplicationsWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.route(`**/v1/projects/${fixture.projectId}/sessions/${fixture.evaluationSessionId}`, route => route.fulfill({ status: 503, json: { code: 'unavailable', message_key: 'errors.request_failed', retryable: true } }));
  await page.goto(`/app/projects/${fixture.projectId}/jobs/${fixture.jobId}`);
  await expect(page.getByTestId('evaluation-report')).toBeVisible();
  await expect(page.getByTestId('evaluation-provenance')).toContainText('Source CV details unavailable');
  await expect(page.getByTestId('evaluation-provenance').getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByTestId('evaluation-provenance')).not.toContainText('Healthcare Analytics');
});
