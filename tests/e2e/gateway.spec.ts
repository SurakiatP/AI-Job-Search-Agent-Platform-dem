import { expect, test } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

test('409 gateway_unconfigured on a run shows tells a user to contact the administrator', async ({ page }) => {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), 'en');
  await useSyntheticApplication(page);
  const api = `**/v1/projects/${projectId}`;
  const asyncApi = `**/v1/async/projects/${projectId}`;
  await page.route(`${api}/sessions/${sessionId}`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z', cv_revision_id: 'c1', job_revision_id: jobId, cv_name: 'Data CV', cv_revision: 1, job_title: 'Synthetic data analyst', job_company: 'Example Co' }) }));
  for (const url of [`${api}/runs`, `${asyncApi}/agent-runs`]) await page.route(url, r => r.request().method() === 'POST'
    ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'gateway_unconfigured', message_key: 'errors.gateway_unconfigured', retryable: false }) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${api}/runs/*/events`, r => r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Prepare documents', exact: true }).click();
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect(page.getByText('AI is not available right now. Please contact your administrator.').first()).toBeVisible();
  await expect(page.getByText('OPENROUTER_API_KEY')).toHaveCount(0);
});
