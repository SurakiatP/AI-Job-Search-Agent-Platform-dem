import { expect, test } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

const running = { id: 'cccccccc-0000-4000-8000-000000000009', project_id: projectId, session_id: sessionId, operation: 'draft_documents', status: 'running', job_revision_id: '33333333-3333-4333-8333-333333333333', output_language: 'en', result_file_ids: [], created_at: '2026-10-10T00:00:00Z', finished_at: null, retry_of_id: null, evaluation_result: null };

test('a running run shows a turning ring, what it is doing, and a moving bar; nothing is announced twice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([running]) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, () => new Promise(() => undefined)); // stays open: work never finishes in this test
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  const note = page.getByText(/^Working on:/);
  await expect(note).toBeVisible();
  await expect(page.getByText('This page updates by itself as work progresses, no need to refresh')).toBeVisible();
  await expect(page.locator('.busy-bar:visible')).toHaveCount(1); // the small-screen banner is hidden on desktop
  await expect(page.locator('svg.animate-spin:visible').first()).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveText('Running');
});

test('queued CV experience extraction shows the working row with its elapsed wait', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  const cv = { id: '77777777-7777-4777-8777-777777777777', name: 'Data CV', is_primary: true, in_use: false, revision_count: 1, latest_revision: null };
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cv]) }));
  await page.route(`**/api/v1/projects/${projectId}/experience**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], provider_configured: true, extraction: { run_id: 'r1', status: 'queued', cv_id: cv.id, summary: null } }) }));
  await page.goto(`/app/projects/${projectId}/profile?tab=experience`);
  await expect(page.getByText('รอคิวดึงประสบการณ์จาก CV').first()).toBeVisible();
  await expect(page.locator('.busy-bar').first()).toBeVisible();
  await expect(page.getByText(/รอมา \d+ วินาที/)).toBeVisible({ timeout: 8000 });
});

test('reduced motion keeps the label and stills the ring and bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([running]) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, () => new Promise(() => undefined));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await expect(page.getByText(/^Working on:/)).toBeVisible();
  const names = await page.locator('svg.animate-spin:visible').first().evaluate(el => getComputedStyle(el).animationName);
  expect(names).toBe('none');
  expect(await page.locator('.busy-bar:visible').evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none');
});

const ev = (sequence: number, event_type: string, data: Record<string, unknown>) => ({ sequence, event_type, created_at: `2026-10-10T00:0${sequence}:00Z`, data: { approval_id: null, step: null, status: null, artifact_ids: [], message_key: null, progress_percent: null, ...data } });
const tailoringEvents = [
  ev(1, 'run_queued', {}), ev(2, 'run_started', {}), ev(3, 'run_progress', { step: 'agent_running' }),
  ev(4, 'run_progress', { step: 'llm_round', model: 'x', latency_ms: 900 }), ev(5, 'run_progress', { step: 'llm_round', model: 'x', latency_ms: 800 }),
  ev(6, 'run_progress', { step: 'tailor_round', round: 1, coverage: 0.72 }), ev(7, 'run_progress', { step: 'agent_running' }),
];

test('run progress reads as plain sentences, merges repeated AI rounds and shows no internal step names', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/runs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...running, operation: 'tailor_cv' }]) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/${running.id}/events`, route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: tailoringEvents.map(e => `id: ${e.sequence}\nevent: ${e.event_type}\ndata: ${JSON.stringify(e)}\n\n`).join('') }));
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  const list = page.getByRole('list', { name: 'ความคืบหน้า' });
  await expect(list.getByText('เข้าคิวแล้ว', { exact: true })).toBeVisible();
  await expect(list.getByText('เริ่มทำงานแล้ว', { exact: true })).toBeVisible();
  await expect(list.getByText('AI กำลังคิดและเขียน', { exact: true })).toBeVisible();
  await expect(list.getByText('คิดไปแล้ว 2 รอบ', { exact: true })).toBeVisible();
  await expect(list.getByText('ปรับ CV รอบที่ 1', { exact: true })).toBeVisible();
  await expect(list.getByText('ทักษะที่ตรงกับประกาศ 72%', { exact: true })).toBeVisible();
  await expect(list.getByText('เอเจนต์กำลังอ่านข้อมูลและวางแผน')).toHaveCount(2);
  await expect(page.getByText(/run_queued|run_started|agent_running|tailor_round|llm_round/)).toHaveCount(0);
});
