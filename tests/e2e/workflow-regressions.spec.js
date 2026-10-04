const { test } = require('@playwright/test');
const assert = require('node:assert/strict');
const baseRun = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', session_id: 'ssss', project_id: 'pppp', job_revision_id: 'jjjj', operation: 'evaluate_job', status: 'running', output_language: 'en', result_file_ids: [], evaluation_result: null, retry_of_id: null };
const owner = { authenticated: true, csrf_token: 'synthetic-only', expires_at: '2030-01-01T00:00:00Z' };
const approval = id => ({ id, run_id: baseRun.id, action: 'promote_cv', revision_id: `revision-${id}`, expected_cv_revision_id: `base-${id}`, change_digest: `digest-${id}`, expires_at: '2030-01-01T00:00:00Z', consumed_at: null, decision: null });
async function setup(page, handler) {
  await page.route('**/api/v1/**', handler ?? (route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(owner) })));
  await page.goto('http://127.0.0.1:4175/tests/shell.html');
  await page.evaluate(async () => {
    const r = await import('/node_modules/.vite/deps/react.js'); const React = r.default ?? r;
    const d = await import('/node_modules/.vite/deps/react-dom_client.js'); const dom = d.default ?? d;
    const node = document.createElement('div'); node.id = 'probe'; document.body.append(node);
    window.probe = { React, root: dom.createRoot(node) };
  });
}
async function mountHook(page) {
  await page.evaluate(async () => {
    const { useRun } = await import('/src/features/chat/useRun.ts'); const p = window.probe;
    function Harness() { const hook = useRun('pppp', 'ssss'); window.hook = hook; return p.React.createElement('p', null, hook.run?.status ?? 'loading'); }
    p.root.render(p.React.createElement(Harness));
  });
  await page.waitForFunction(() => window.hook?.run?.id);
}
async function components(browser) {
  const page = await browser.newPage(); const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await setup(page);
  await page.evaluate(async () => {
    Object.assign(window.probe, await import('/src/features/chat/RunTimeline.tsx'), await import('/src/features/chat/RunResults.tsx'), await import('/src/features/chat/ApprovalCard.tsx'));
    const p = window.probe; p.root.render(p.React.createElement(p.RunTimeline, { locale: 'en', run: null, events: [] }));
  });
  await page.waitForTimeout(60);
  await page.evaluate(run => { const p = window.probe; p.root.render(p.React.createElement(p.RunTimeline, { locale: 'en', run, events: [] })); }, baseRun);
  await page.waitForTimeout(100);
  assert.deepEqual(errors, [], 'null -> run must preserve React hook ordering');
  await page.evaluate(run => {
    const p = window.probe;
    const documents = [{ id: 'synthetic-doc', source_run_id: run.id, title: 'Preserved synthetic partial document', partial: true, content_markdown: '<script>window.syntheticAttack=true</script>' }];
    p.root.render(p.React.createElement(p.RunResults, { projectId: 'pppp', locale: 'en', run: { ...run, status: 'interrupted', result_file_ids: ['synthetic-file'] }, documents }));
  }, baseRun);
  await page.waitForTimeout(60);
  assert.match(await page.locator('#probe').innerText(), /Preserved synthetic partial document/);
  assert.equal(await page.locator('#probe a').count(), 1);
  assert.equal(await page.evaluate(() => window.syntheticAttack), undefined, 'markdown remains escaped');
  await page.evaluate(a => { const p = window.probe; p.root.render(p.React.createElement(p.ApprovalCard, { approval: a, locale: 'en', busy: false, onDecision: () => {}, onRefresh: () => {} })); }, approval('A'));
  await page.locator('#probe input[type=checkbox]').check();
  await page.evaluate(a => { const p = window.probe; p.root.render(p.React.createElement(p.ApprovalCard, { approval: a, locale: 'en', busy: false, onDecision: () => {}, onRefresh: () => {} })); }, approval('B'));
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#probe input[type=checkbox]').isChecked(), false);
  assert.equal(await page.locator('#probe button').first().isEnabled(), false);
  await page.close(); console.log('PASS hook ordering, interrupted partial results, escaped content, exact approval acknowledgement');
}
async function cancellation(browser) {
  const page = await browser.newPage(); let mode = 'network'; let accepted = false;
  await setup(page, async route => {
    const path = new URL(route.request().url()).pathname; let value = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/cancel')) { accepted = true; if (mode === 'network') return route.abort('failed'); value = { ...baseRun, status: 'completed' }; }
    else if (path.endsWith('/events')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    else if (path.endsWith('/runs')) value = [baseRun];
    else if (path.includes('/runs/')) value = baseRun;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await mountHook(page); await page.evaluate(() => window.hook.cancel());
  assert.equal(accepted, true); assert.equal(await page.evaluate(() => window.hook.cancellationPending), true);
  assert.equal(await page.evaluate(() => window.hook.error), 'errors.network_error');
  mode = 'completed'; await page.evaluate(() => window.hook.cancel());
  await page.waitForFunction(() => window.hook.run.status === 'completed');
  assert.equal(await page.evaluate(() => window.hook.cancellationPending), false);
  await page.close(); console.log('PASS uncertain cancellation remains pending and terminal completion clears pending');
}
async function staleResponse(browser) {
  const page = await browser.newPage(); let reads = 0; const cursors = [];
  await setup(page, async route => {
    const path = new URL(route.request().url()).pathname; let value = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/events')) {
      const cursor = route.request().headers()['last-event-id']; cursors.push(cursor);
      const events = cursor === '0' ? [{ sequence: 1, event_type: 'run_progress', data: { step: 'Synthetic running', status: 'running' } }, { sequence: 2, event_type: 'run_completed', data: { step: 'Synthetic done', status: 'completed' } }] : [];
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(event => `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`).join('') });
    } else if (path.endsWith('/runs')) value = [baseRun];
    else if (path.includes('/runs/')) { reads++; const number = reads; await new Promise(resolve => setTimeout(resolve, number === 1 ? 180 : 10)); value = { ...baseRun, status: number === 1 ? 'running' : 'completed' }; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await mountHook(page); await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.hook.run.status), 'completed');
  assert.deepEqual(await page.evaluate(() => window.hook.events.map(event => event.sequence)), [1, 2]);
  assert.deepEqual(cursors, ['0'], 'terminal reconciliation must not reopen a stale running stream');
  await page.close(); console.log('PASS delayed running GET cannot overwrite newer completed GET');
}
async function approvalRecovery(browser) {
  const page = await browser.newPage(); let approvalReads = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await setup(page, async route => {
    const path = new URL(route.request().url()).pathname; let value = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/approvals')) { approvalReads++; if (approvalReads === 2) return route.abort('failed'); value = approvalReads === 1 ? [] : [approval('Recovered')]; }
    else if (path.endsWith('/events')) {
      const cursor = route.request().headers()['last-event-id']; const event = { sequence: 1, event_type: 'approval_requested', data: { approval_id: 'Recovered', status: 'waiting_approval' } };
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: cursor === '0' ? `id: 1\ndata: ${JSON.stringify(event)}\n\n` : '' });
    } else if (path.endsWith('/runs')) value = [baseRun];
    else if (path.includes('/runs/')) value = { ...baseRun, status: 'waiting_approval' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await mountHook(page); await page.waitForFunction(() => window.hook.error === 'errors.network_error');
  await page.waitForFunction(() => window.hook.pendingApproval?.id === 'Recovered', { timeout: 6000 });
  assert.deepEqual(errors, []); assert.ok(approvalReads >= 3);
  await page.close(); console.log('PASS approval transient fetch failure is surfaced and recovered without unhandled rejection');
}
async function idempotencyAndReload(browser) {
  const page = await browser.newPage(); let messages = 0; const submissions = []; let savedRun = null;
  await setup(page, async route => {
    const path = new URL(route.request().url()).pathname; let value = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/messages') && route.request().method() === 'POST') { messages++; value = { id: 'synthetic-message', content: 'Synthetic history only' }; }
    else if (path.endsWith('/runs') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); submissions.push(body);
      if (body.retry_of_id) savedRun = { ...baseRun, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'failed', retry_of_id: body.retry_of_id };
      else savedRun = { ...baseRun, status: 'failed' };
      if (submissions.length === 1) return route.abort('failed');
      value = savedRun;
    } else if (path.endsWith('/runs')) value = savedRun ? [savedRun] : [];
    else if (path.includes('/runs/')) value = savedRun;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await page.evaluate(async () => {
    const { useRun } = await import('/src/features/chat/useRun.ts'); const p = window.probe;
    function Harness() { const hook = useRun('pppp', 'ssss'); window.hook = hook; return p.React.createElement('p', null, hook.run?.status ?? 'loading'); }
    p.root.render(p.React.createElement(Harness));
  });
  await page.waitForFunction(() => !window.hook.loading);
  const input = { message: 'Synthetic history only', operation: 'evaluate_job', job: { id: 'jjjj', revision: 1, title: 'Synthetic job' }, outputLanguage: 'en' };
  await page.evaluate(input => window.hook.submit(input), input);
  assert.equal(await page.evaluate(() => window.hook.error), 'errors.network_error');
  await page.evaluate(input => window.hook.submit(input), input);
  await page.waitForFunction(() => window.hook.run?.status === 'failed');
  assert.equal(submissions.length, 2); assert.equal(submissions[0].idempotency_key, submissions[1].idempotency_key);
  assert.equal(messages, 1);
  await page.reload();
  await page.evaluate(async () => {
    const r = await import('/node_modules/.vite/deps/react.js'); const React = r.default ?? r;
    const d = await import('/node_modules/.vite/deps/react-dom_client.js'); const dom = d.default ?? d;
    const { useRun } = await import('/src/features/chat/useRun.ts'); const node = document.createElement('div'); document.body.append(node);
    function Harness() { const hook = useRun('pppp', 'ssss'); window.hook = hook; return React.createElement('p', null, hook.run?.status ?? 'loading'); }
    dom.createRoot(node).render(React.createElement(Harness));
  });
  await page.waitForFunction(() => window.hook.run?.status === 'failed');
  await page.evaluate(() => window.hook.retry());
  await page.waitForFunction(() => window.hook.run?.retry_of_id);
  assert.equal(submissions[2].retry_of_id, baseRun.id);
  assert.equal(submissions[2].job_revision_id, baseRun.job_revision_id);
  assert.notEqual(submissions[2].idempotency_key, submissions[1].idempotency_key);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.equal(stored.includes(input.message), false); assert.equal(stored.includes(submissions[0].idempotency_key), false);
  await page.close(); console.log('PASS uncertain submission preserves key and reload retry uses public persisted job metadata without private storage');
}
test('component identity, partial results and hook ordering', async ({ browser }) => { await components(browser); });
test('cancellation uncertainty remains pending until terminal confirmation', async ({ browser }) => { await cancellation(browser); });
test('late reconciliation cannot regress a terminal run', async ({ browser }) => { await staleResponse(browser); });
test('approval fetch recovers without unhandled rejection', async ({ browser }) => { await approvalRecovery(browser); });
test('submission ambiguity and reload retry preserve durable intent', async ({ browser }) => { await idempotencyAndReload(browser); });

test('restart interruption hides an unconsumed stale approval', async ({ browser }) => {
  const page = await browser.newPage();
  let status = 'waiting_approval';
  await setup(page, route => {
    const path = new URL(route.request().url()).pathname;
    let value = [];
    if (path.endsWith('/owner/session')) value = owner;
    else if (path.endsWith('/events')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    else if (path.endsWith('/approvals')) value = [approval('synthetic-pending')];
    else if (path.endsWith('/runs')) value = [{ ...baseRun, status }];
    else if (path.includes('/runs/')) value = { ...baseRun, status };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await mountHook(page);
  await page.waitForFunction(() => window.hook.pendingApproval?.id === 'synthetic-pending');
  status = 'interrupted';
  await page.evaluate(() => window.hook.reload());
  await page.waitForFunction(() => window.hook.run?.status === 'interrupted');
  assert.equal(await page.evaluate(() => window.hook.approvals.length), 1);
  assert.equal(await page.evaluate(() => window.hook.pendingApproval), null);
  await page.close();
});
