import { expect, test, type Page } from '@playwright/test';
import { documentId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

// Owner rule 2026-10-20: every place that shows AI output says so in words ("Made by AI").
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const runId = 'cccccccc-0000-4000-8000-000000000001';
const job = '33333333-3333-4333-8333-333333333333';
const report = { verdict: 'Worth applying', summary: 'Fits well.', requirements: [{ requirement: 'SQL', importance: 'high', match: 'strong', evidence: 'PostgreSQL' }],
  strengths: ['RAG'], risks: ['No GCP'], interview_prep: ['Explain RAG'], cv_changes: ['Name function calling'] };
const evalRun = { id: runId, project_id: projectId, session_id: sessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: job, output_language: 'en',
  result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: '2026-10-10T00:01:00Z', retry_of_id: null,
  evaluation_result: { score: 4.2, report, report_markdown: 'x', skill_coverage: { matched: ['SQL'], missing: [], required: ['SQL'], ratio: 1, method: 'k' } } };
const label = 'Made by AI';

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill(json([evalRun])));
}

test('AI label: evaluation report, CV changes and interview questions; not on keyword coverage', async ({ page }) => {
  await setup(page);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByTestId('ai-report').getByText(label)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Skills found in your CV' }).getByText(label)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Prepare documents' }).click();
  await expect(page.getByRole('region', { name: 'Fix your CV before applying' }).getByText(label)).toBeVisible();
  await page.getByRole('tab', { name: 'Interview practice' }).click();  // CR-IVP-01 moved the prep list here
  await expect(page.getByRole('region', { name: 'Prepare before the interview' }).getByText(label)).toBeVisible();
});

test('AI label: agent documents say made by AI and check before use; owner documents do not', async ({ page }) => {
  await setup(page);
  const doc = (id: string, title: string, source: string | null) => ({ id, document_type: 'cover_letter', title, output_language: 'en', partial: false, source_run_id: source,
    content_markdown: 'Dear team', latest_revision: { id: `${id.slice(0, 8)}-7777-4777-8777-777777777777`, revision: 1, created_at: '2026-10-01T00:00:00Z' }, trashed_at: null });
  await page.route(`**/api/v1/projects/${projectId}/documents`, route => route.fulfill(json([doc(documentId, 'Agent letter', runId), doc('55555555-5555-4555-8555-555555555555', 'My own letter', null)])));
  await page.goto(`/app/projects/${projectId}/documents`);
  const row = (t: string) => page.getByRole('listitem').filter({ hasText: t });
  await expect(row('Agent letter').getByText(label)).toBeVisible();
  await expect(row('Agent letter').getByText('Check before use')).toBeVisible();
  await expect(row('My own letter').getByText(label)).toHaveCount(0);
  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agent letter' })).toBeVisible();
  await expect(page.getByTestId('ai-document').getByText(label)).toBeVisible();
});

test('AI label: facts extracted from a CV say extracted by AI; facts you added do not', async ({ page }) => {
  await setup(page);
  const item = (id: string, text: string, source: 'cv' | 'owner') => ({ id, kind: 'skill', text, role: null, organization: null, period: null, source, source_cv_id: source === 'cv' ? 'c1' : null, source_cv_name: source === 'cv' ? 'Data CV' : null, created_at: '2026-10-01T00:00:00Z' });
  await page.route(`**/api/v1/projects/${projectId}/experience**`, route => route.fulfill(json({ items: [item('e1', 'SQL from CV', 'cv'), item('e2', 'Python I added', 'owner')], extraction: null, provider_configured: true })));
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  const fact = (t: string) => page.getByRole('listitem').filter({ hasText: t });
  await expect(fact('SQL from CV').getByText('Extracted by AI')).toBeVisible();
  await expect(fact('Python I added').getByText('Extracted by AI')).toHaveCount(0);
});
