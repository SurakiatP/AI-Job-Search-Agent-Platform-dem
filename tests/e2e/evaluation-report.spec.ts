import { expect, test, type Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

// CR-EVR-01 structured evaluation report (docs/superpowers/specs/2026-10-20-structured-evaluation-report-design.md)
const job = '33333333-3333-4333-8333-333333333333';
const report = {
  verdict: 'Worth applying: most core skills match',
  summary: 'Your production RAG work fits this role.',
  requirements: [
    { requirement: 'LLM pipelines / RAG', importance: 'critical', match: 'strong', evidence: 'Thai RAG chatbot' },
    { requirement: 'Python + FastAPI', importance: 'high', match: 'strong', evidence: 'Classifier on FastAPI' },
    { requirement: 'SQL', importance: 'high', match: 'strong', evidence: 'PostgreSQL' },
    { requirement: 'Function calling', importance: 'high', match: 'partial', evidence: 'LangChain only' },
    { requirement: 'Fine-tuning / LoRA', importance: 'meaningful', match: 'partial', evidence: '' },
    { requirement: 'GKE / Cloud Run', importance: 'preferred', match: 'missing', evidence: '' },
  ],
  strengths: ['Production RAG in Thai'],
  risks: ['No Google Cloud evidence'],
  interview_prep: ['Explain how you cut LLM cost by 35%'],
  cv_changes: ['Name function calling in your AI Engineer role'],
};

async function open(page: Page, evaluation: object) {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/sessions/${sessionId}`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      id: sessionId, project_id: projectId, title: 'Session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1',
      job_revision_id: job, cv_name: 'Data CV', cv_revision: 4, job_title: 'AI Engineer', job_company: 'Example Co' }),
  }));
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId, operation: 'evaluate_job',
      status: 'completed', job_revision_id: job, output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z',
      finished_at: '2026-10-10T00:01:00Z', retry_of_id: null, evaluation_result: evaluation }]),
  }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
}

test('TC-EVR-04 structured report shows fields, counts and a working filter', async ({ page }) => {
  await open(page, { score: 4.2, report, report_markdown: '**Worth applying**' });
  await expect(page.getByText(report.verdict)).toBeVisible();
  await expect(page.getByText(report.summary)).toBeVisible();
  const reqs = page.getByRole('region', { name: 'Job requirements' });
  await expect(reqs.getByRole('radio', { name: 'All 6' })).toBeChecked();
  await expect(reqs.getByRole('radio', { name: 'Match 3' })).toBeVisible();
  await expect(reqs.getByRole('radio', { name: 'Partial 2' })).toBeVisible();
  await expect(reqs.getByRole('listitem')).toHaveCount(6);
  await expect(reqs.getByRole('listitem').filter({ hasText: 'LLM pipelines / RAG' })).toContainText('Match');
  await expect(reqs.getByRole('listitem').filter({ hasText: 'LLM pipelines / RAG' })).toContainText('Key requirement');
  await reqs.getByRole('radio', { name: 'Not found 1' }).click();
  await expect(reqs.getByRole('listitem')).toHaveCount(1);
  await expect(reqs.getByRole('listitem')).toContainText('GKE / Cloud Run');
  await expect(reqs.getByRole('listitem')).toContainText('Not found');
  for (const text of [...report.strengths, ...report.risks]) await expect(page.getByText(text)).toBeVisible();
  // Owner change 2026-10-20: interview prep lives in the answers tab, CV changes in the documents tab.
  await expect(page.getByText(report.interview_prep[0])).toBeHidden();
  await expect(page.getByText(report.cv_changes[0])).toBeHidden();
  await expect(page.getByTestId('evaluation-report')).toBeHidden();
  await page.getByText('Full report').click();
  await expect(page.getByTestId('evaluation-report')).toContainText('Worth applying');
});

test('TC-EVR-07 / AC-IVP-08 interview prep shows in the practice tab and CV changes in the documents tab', async ({ page }) => {
  await open(page, { score: 4.2, report, report_markdown: 'x' });
  await page.getByRole('tab', { name: 'Application answers' }).click();
  await expect(page.getByText(report.interview_prep[0])).toBeHidden();
  await page.getByRole('tab', { name: 'Interview practice' }).click();
  const interview = page.getByRole('region', { name: 'Prepare before the interview' });
  await expect(interview).toContainText(report.interview_prep[0]);
  await page.getByRole('tab', { name: 'Prepare documents' }).click();
  const cv = page.getByRole('region', { name: 'Fix your CV before applying' });
  await expect(cv).toContainText(report.cv_changes[0]);
});

test('TC-EVR-05 a report made before CR-EVR-01 still shows as Markdown', async ({ page }) => {
  await open(page, { score: 3.6, report_markdown: 'Strong analytical foundation.\n\n**Next step:** strengthen dbt.' });
  await expect(page.getByTestId('evaluation-report')).toContainText('Strong analytical foundation.');
  await expect(page.getByRole('region', { name: 'Job requirements' })).toHaveCount(0);
});

test('TC-EVR-04 mobile has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { score: 4.2, report, report_markdown: 'x' });
  await expect(page.getByText(report.verdict)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
