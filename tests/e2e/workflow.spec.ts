import { expect, test } from '@playwright/test';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const csrf = 'synthetic-csrf-token-never-valid-outside-this-test';

test('typed API bootstraps owner CSRF and resumes deduplicated run events', async ({ page }) => {
  const eventCursors: string[] = [];
  let bootstrapCalls = 0;
  let hashAtExchange = 'not-observed';
  let contentType = '';
  let writeCsrf = '';

  await page.route('**/api/v1/owner/bootstrap', async route => {
    bootstrapCalls += 1;
    hashAtExchange = await page.evaluate(() => window.location.hash);
    expect(route.request().postDataJSON()).toEqual({ nonce: 'synthetic-one-use-launch-nonce-0001' });
    await route.fulfill({
      status: 200,
      headers: { 'set-cookie': 'jsp_owner_session=synthetic-cookie; Path=/; HttpOnly; SameSite=Strict' },
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, csrf_token: csrf, expires_at: '2026-10-05T00:00:00Z' }),
    });
  });
  await page.route('**/api/v1/projects/upload', async route => {
    contentType = route.request().headers()['content-type'] ?? '';
    writeCsrf = route.request().headers()['x-csrf-token'] ?? '';
    await route.fulfill({ status: 204 });
  });
  await page.route(`**/api/v1/projects/${projectId}/runs/${runId}/events`, async route => {
    const cursor = route.request().headers()['last-event-id'] ?? '';
    eventCursors.push(cursor);
    const first = { sequence: 1, event_type: 'run_progress', data: { approval_id: null, step: 'Reading supplied posting', status: 'running', artifact_ids: [], message_key: null, progress_percent: 25 }, created_at: '2026-10-04T00:00:00Z' };
    const done = { sequence: 2, event_type: 'run_completed', data: { approval_id: null, step: 'Completed', status: 'completed', artifact_ids: [], message_key: null, progress_percent: 100 }, created_at: '2026-10-04T00:01:00Z' };
    const data = cursor === '0' ? [first] : [first, done];
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: data.map(event => `id: ${event.sequence}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`).join('') });
  });

  await page.goto('/tests/shell.html#owner-nonce=synthetic-one-use-launch-nonce-0001');
  const state = await page.evaluate(async () => {
    const api = await import('/src/lib/api.ts');
    const session = await api.initializeOwnerSession();
    const form = new FormData();
    form.append('file', new Blob(['synthetic only']), 'synthetic.txt');
    const empty = await api.apiRequest<undefined>('/projects/upload', { method: 'POST', body: form });
    const runEvents = await import('/src/lib/run-events.ts');
    const events: number[] = [];
    await new Promise<void>((resolve, reject) => {
      let unsubscribe: () => void = () => {};
      const timer = window.setTimeout(() => { unsubscribe(); reject(new Error('stream_timeout')); }, 3000);
      unsubscribe = runEvents.watchRun('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, event => {
        events.push(event.sequence);
        if (event.sequence === 2) {
          window.clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
    await api.initializeOwnerSession();
    return { session, empty, events, hash: window.location.hash };
  });

  expect(state.session).toMatchObject({ status: 'ready' });
  expect(state.empty).toBeUndefined();
  expect(state.events).toEqual([1, 2]);
  expect(state.hash).toBe('');
  expect(hashAtExchange).toBe('');
  expect(bootstrapCalls).toBe(1);
  expect(eventCursors).toEqual(['0', '1']);
  expect(writeCsrf).toBe(csrf);
  expect(contentType).toContain('multipart/form-data; boundary=');
});
