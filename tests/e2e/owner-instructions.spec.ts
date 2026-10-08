import { test } from '@playwright/test';
import assert from 'node:assert/strict';

const runView = (id: string, status = 'failed', retryOf: string | null = null) => ({
  id,
  session_id: 'ssss',
  project_id: 'pppp',
  job_revision_id: 'jjjj',
  operation: 'evaluate_job',
  status,
  output_language: 'en',
  result_file_ids: [],
  evaluation_result: null,
  retry_of_id: retryOf,
});

test('submission ambiguity keeps the instruction and reload retries from the immutable source run', async ({ page }) => {
  const owner = { authenticated: true, csrf_token: 'synthetic-only', expires_at: '2030-01-01T00:00:00Z' };
  const sourceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const retryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const instruction = 'OWNER-INSTRUCTION-SENTINEL: emphasize retention experience.';
  let messageWrites = 0;
  let accepted: ReturnType<typeof runView> | null = null;
  const submissions: Array<{ body: Record<string, unknown>; key: string | undefined }> = [];

  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let value: unknown = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/messages') && request.method() === 'POST') {
      messageWrites += 1;
      value = { id: 'synthetic-message', content: instruction };
    } else if (path.endsWith('/runs') && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      submissions.push({ body, key: request.headers()['idempotency-key'] });
      if (!accepted) {
        accepted = runView(sourceId);
        return route.abort('failed');
      }
      if (body.retry_of_id) accepted = runView(retryId, 'failed', String(body.retry_of_id));
      value = accepted;
    } else if (path.endsWith('/runs')) value = accepted ? [accepted] : [];
    else if (path.includes('/runs/')) value = accepted;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });

  await page.goto('http://127.0.0.1:4175/tests/shell.html');
  await page.evaluate(async () => {
    const r = await import('/node_modules/.vite/deps/react.js');
    const React = r.default ?? r;
    const d = await import('/node_modules/.vite/deps/react-dom_client.js');
    const dom = d.default ?? d;
    const { useRun } = await import('/src/features/chat/useRun.ts');
    const node = document.createElement('div');
    document.body.append(node);
    function Harness() {
      const hook = useRun('pppp', 'ssss');
      (window as unknown as { hook: typeof hook }).hook = hook;
      return React.createElement('p', null, hook.run?.status ?? 'loading');
    }
    dom.createRoot(node).render(React.createElement(Harness));
  });

  await page.waitForFunction(() => (window as unknown as { hook?: { loading: boolean } }).hook?.loading === false);
  const input = {
    message: instruction,
    operation: 'evaluate_job',
    job: { id: 'jjjj', revision: 1, title: 'Synthetic job' },
    outputLanguage: 'en',
  };
  await page.evaluate(input => (window as unknown as { hook: { submit: (value: typeof input) => Promise<unknown> } }).hook.submit(input), input);
  assert.equal(await page.evaluate(() => (window as unknown as { hook: { error: string } }).hook.error), 'errors.network_error');
  await page.evaluate(input => (window as unknown as { hook: { submit: (value: typeof input) => Promise<unknown> } }).hook.submit(input), input);
  await page.waitForFunction(() => (window as unknown as { hook: { run?: { status: string } } }).hook.run?.status === 'failed');
  assert.equal(messageWrites, 1, 'ambiguous run submission must not duplicate the transcript message');
  assert.equal(submissions[0].body.owner_instructions, instruction);
  assert.equal(submissions[1].body.owner_instructions, instruction);
  assert.equal(submissions[0].key, submissions[1].key, 'ambiguous submission must replay the same idempotency key');

  await page.evaluate(() => (window as unknown as { hook: { retry: () => Promise<unknown> } }).hook.retry());
  await page.waitForFunction(() => (window as unknown as { hook: { run?: { retry_of_id?: string } } }).hook.run?.retry_of_id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(submissions[2].body.owner_instructions, instruction, 'in-session retry must retain its immutable instruction');
  assert.notEqual(submissions[2].key, submissions[1].key, 'a retry is a new run with a new idempotency key');

  await page.reload();
  await page.evaluate(async () => {
    const r = await import('/node_modules/.vite/deps/react.js');
    const React = r.default ?? r;
    const d = await import('/node_modules/.vite/deps/react-dom_client.js');
    const dom = d.default ?? d;
    const { useRun } = await import('/src/features/chat/useRun.ts');
    const node = document.createElement('div');
    document.body.append(node);
    function Harness() {
      const hook = useRun('pppp', 'ssss');
      (window as unknown as { hook: typeof hook }).hook = hook;
      return React.createElement('p', null, hook.run?.status ?? 'loading');
    }
    dom.createRoot(node).render(React.createElement(Harness));
  });
  await page.waitForFunction(() => (window as unknown as { hook: { run?: { id: string } } }).hook.run?.id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await page.evaluate(() => (window as unknown as { hook: { retry: () => Promise<unknown> } }).hook.retry());
  await page.waitForFunction(() => (window as unknown as { hook: { run?: { retry_of_id?: string } } }).hook.run?.retry_of_id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal('owner_instructions' in submissions[3].body, false, 'reload retry references the source run so the server restores its immutable instruction');
  assert.equal(submissions[3].body.retry_of_id, retryId);
  const browserStorage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.equal(browserStorage.includes(instruction), false, 'owner instructions remain out of browser storage');
  await page.close();
});
