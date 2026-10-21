import { expect, test } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

type Cv = { id: string; name: string; is_primary: boolean; in_use: boolean; revision_count: number; latest_revision: Record<string, unknown> | null };
const cv: Cv = { id: '77777777-7777-4777-8777-777777777777', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: null };
const revision = (id: string, n: number) => ({ id, revision: n, created_at: '2026-10-10T00:00:00Z', original_filename: 'cv.txt', mime_type: 'text/plain', size_bytes: 2048, file_id: null });
type Item = { id: string; kind: string; text: string; role: string | null; organization: string | null; period: string | null; source: 'cv' | 'owner'; source_cv_id: string | null; source_cv_name: string | null; created_at: string };

async function bank(page: import('@playwright/test').Page, state: { items: Item[]; extraction: unknown; provider_configured: boolean }, cvs: Cv[] = [cv]) {
  await page.route(`**/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cvs) }));
  await page.route(`**/v1/projects/${projectId}/experience**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      const item: Item = { id: `i${state.items.length + 1}`, role: null, organization: null, period: null, ...body, source: 'owner', source_cv_id: null, source_cv_name: null, created_at: '2026-10-10T00:00:00Z' };
      state.items.push(item);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(item) });
    }
    if (request.method() === 'DELETE') {
      state.items = state.items.filter(item => !url.pathname.endsWith(item.id));
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
}

const fact = (id: string, text: string): Item => ({ id, kind: 'experience', text, role: 'Data Engineer', organization: 'SCB', period: '2022–2024', source: 'cv', source_cv_id: cv.id, source_cv_name: 'Data CV', created_at: '2026-10-10T00:00:00Z' });

test('experience bank groups facts, adds and removes, and shows extraction results', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [fact('a', 'Built Airflow pipelines'), fact('b', 'Ran BigQuery')], provider_configured: true,
    extraction: { run_id: 'r1', status: 'completed', cv_id: cv.id, summary: { added: 2, duplicates: 1, rejected: 1 } } });
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('heading', { name: 'Data Engineer · SCB' })).toBeVisible();
  await expect(section.getByText('From CV: Data CV').first()).toBeVisible();
  await expect(section.getByRole('status')).toContainText('Added 2, duplicates 1, dropped 1');
  await section.getByLabel('Fact').fill('Python');
  await section.getByLabel('Type').selectOption('skill');
  await section.getByRole('button', { name: 'Add fact' }).click();
  await expect(section.getByText('Python')).toBeVisible();
  await section.getByRole('button', { name: 'Remove: Ran BigQuery' }).click();
  await expect(section.getByText('Ran BigQuery')).toHaveCount(0);
});

test('experience bank empty states and Thai at 320px', async ({ page }) => {
  await useSyntheticApplication(page);
  await bank(page, { items: [], extraction: null, provider_configured: false });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'คลังประสบการณ์' });
  await expect(section.getByText('ยังไม่ได้ตั้งค่า AI gateway')).toBeVisible();
  await expect(section.getByRole('link', { name: 'ไปที่การตั้งค่า' })).toHaveAttribute('href', '/app/settings?section=gateway');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a new CV version refreshes the bank to the queued extraction', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const current: Cv = { ...cv, latest_revision: revision('r1', 1) };
  const state = { items: [] as Item[], extraction: null as unknown, provider_configured: true };
  await bank(page, state, [current]);
  await page.route(`**/v1/projects/${projectId}/cvs/${cv.id}/revisions`, route => {
    current.latest_revision = revision('r2', 2);
    current.revision_count = 2;
    state.extraction = { run_id: 'r-upload', status: 'queued', cv_id: cv.id, summary: null };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(current.latest_revision) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  await page.getByRole('tab', { name: 'Experience bank' }).click();
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('button', { name: 'Extract experience from CV with AI', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'CV library' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('button', { hasText: 'Upload new version' }).click();
  await (await chooser).setFiles({ name: 'cv.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic CV') });
  await expect(page.getByRole('status').filter({ hasText: 'extracting experience' })).toBeVisible();
  await page.getByRole('tab', { name: 'Experience bank' }).click();
  await expect(section.getByRole('status')).toContainText('The agent is queued to extract experience from your CV');
});

test('each CV card can start an extraction for that CV', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const other: Cv = { id: '88888888-8888-4888-8888-888888888888', name: 'Older CV', is_primary: false, in_use: false, revision_count: 1, latest_revision: revision('r9', 1) };
  const state = { items: [] as Item[], extraction: { run_id: 'r0', status: 'completed', cv_id: cv.id, summary: { added: 0, duplicates: 0, rejected: 0 } } as unknown, provider_configured: true };
  await bank(page, state, [{ ...cv, latest_revision: revision('r1', 1) }, other]);
  await page.route(`**/v1/async/projects/${projectId}/cvs/*/experience-extractions`, route => {
    state.extraction = { run_id: 'r-other', status: 'queued', cv_id: other.id, summary: null };
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'r-other', status: 'queued' }) });
  });
  await page.goto(`/app/projects/${projectId}/profile`);
  await expect(page.getByRole('button', { name: 'Extract experience with AI: Older CV' })).toBeVisible();
  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith(`/cvs/${other.id}/experience-extractions`));
  await page.getByRole('button', { name: 'Extract experience with AI: Older CV' }).click();
  await request;
  await page.getByRole('tab', { name: 'Experience bank' }).click();
  await expect(page.getByRole('region', { name: 'Experience bank' }).getByRole('status')).toContainText('The agent is queued to extract experience from your CV');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a failed bank load offers a retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [fact('a', 'Ran BigQuery')], extraction: null, provider_configured: true });
  let failures = 1;
  await page.route(`**/v1/projects/${projectId}/experience`, route => failures-- > 0
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error' } }) })
    : route.fallback());
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByRole('alert')).toContainText('Could not load the experience bank');
  await section.getByRole('button', { name: 'Retry' }).click();
  await expect(section.getByText('Ran BigQuery')).toBeVisible();
});

test('experience bank files facts under categories, shows years and sends the new fields', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const state = { items: [{ ...fact('a', 'Built Airflow pipelines'), start_date: '2022-03', end_date: '2024-01', is_current: false, employment_type: 'full_time', location: 'Bangkok' },
    { ...fact('b', 'Python'), kind: 'skill', role: null, organization: null, period: null }, { ...fact('c', 'BSc Computer Science'), kind: 'education', role: null, organization: null, period: null }] as Item[],
    extraction: null, provider_configured: true, years_of_experience: 1.9 };
  await bank(page, state);
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByText('1.9 years of work experience in total')).toBeVisible();
  for (const name of ['Work experience', 'Education', 'Skill']) await expect(section.getByRole('heading', { name })).toBeVisible();
  await expect(section.getByText('Mar 2022 – Jan 2024 · Full time · Bangkok')).toBeVisible();
  await section.getByLabel('Fact').fill('Led a migration');
  await section.getByText('More details').click();
  await section.getByLabel('I still work here').check();
  await expect(section.getByLabel('End')).toBeDisabled();
  const sent = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/experience'));
  await section.getByRole('button', { name: 'Add fact' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ text: 'Led a migration', is_current: true, end_date: null, employment_type: null });
});

test('skill group select appears only for skills and is sent in the request', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [], extraction: null, provider_configured: true });
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByLabel('Skill group')).toHaveCount(0);
  await section.getByLabel('Fact').fill('Airflow');
  await section.getByLabel('Type').selectOption('skill');
  await expect(section.getByLabel('Skill group')).toContainText('Not set');
  await section.getByLabel('Skill group').selectOption('tools');
  let sent = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/experience'));
  await section.getByRole('button', { name: 'Add fact' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ kind: 'skill', skill_group: 'tools' });
  await expect(section.getByRole('button', { name: 'Remove: Airflow' })).toBeVisible();
  await section.getByLabel('Fact').fill('Led a team');
  await section.getByLabel('Type').selectOption('skill');
  await section.getByLabel('Skill group').selectOption('soft');
  await section.getByLabel('Type').selectOption('experience');
  await expect(section.getByLabel('Skill group')).toHaveCount(0);
  sent = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/experience'));
  await section.getByRole('button', { name: 'Add fact' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ kind: 'experience', skill_group: null });
});

test('skills are grouped under sub-headings with counts and ungrouped last', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const skill = (id: string, text: string, skill_group: string | null) => ({ ...fact(id, text), kind: 'skill', role: null, organization: null, period: null, skill_group });
  await bank(page, { items: [skill('a', 'Python', 'technical'), skill('b', 'SQL', 'technical'), skill('c', 'Airflow', 'tools'), skill('d', 'Leadership', 'soft'),
    skill('e', 'Thai', 'language'), skill('f', 'Banking', 'domain'), skill('g', 'Misc', null)] as Item[], extraction: null, provider_configured: true });
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  const names = ['Technical skills', 'Tools & technology', 'Soft skills', 'Languages', 'Domain knowledge', 'Ungrouped'];
  await expect(section.getByRole('heading', { level: 4 })).toHaveText(names.map((n, i) => new RegExp(`^${n.replace('&', '\\&')}\\s*${[2, 1, 1, 1, 1, 1][i]} ${i === 0 ? 'facts' : 'fact'}$`)));
  await expect(section.getByRole('heading', { name: /^Technical skills/ }).locator('xpath=following-sibling::ul[1]').getByRole('listitem')).toHaveCount(2);
});

test('education uses degree and institution labels in the form and list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await bank(page, { items: [{ ...fact('a', 'BSc Computer Science'), kind: 'education', role: 'Computer Science', organization: 'Chulalongkorn University' }] as Item[], extraction: null, provider_configured: true });
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const section = page.getByRole('region', { name: 'Experience bank' });
  await expect(section.getByLabel('Role', { exact: false })).toBeVisible();
  await expect(section.getByLabel('Degree / major')).toHaveCount(0);
  await section.getByLabel('Type').selectOption('education');
  await expect(section.getByLabel('Degree / major')).toBeVisible();
  await expect(section.getByLabel('Institution')).toBeVisible();
  await expect(section.getByLabel('Role')).toHaveCount(0);
  await expect(section.getByLabel('Organization')).toHaveCount(0);
  await expect(section.getByText('Degree / major: Computer Science')).toBeVisible();
  await expect(section.getByText('Institution: Chulalongkorn University')).toBeVisible();
});
