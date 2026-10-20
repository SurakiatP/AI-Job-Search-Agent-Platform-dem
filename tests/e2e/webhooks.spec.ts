import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

type Hook = { id: string; url: string; events: string[]; enabled: boolean; created_at: string };
type Delivery = { id: string; endpoint_id: string; event_type: string; status: 'pending' | 'delivered' | 'dead'; attempts: number; last_status_code: number | null; last_error: string | null; created_at: string; delivered_at: string | null };

async function hooks(page: Page) {
  const list: Hook[] = [];
  const deliveries: Delivery[] = [{ id: 'd1', endpoint_id: 'h0', event_type: 'run.completed', status: 'dead', attempts: 8, last_status_code: 503, last_error: null, created_at: '2026-10-14T00:00:00Z', delivered_at: null },
    { id: 'd0', endpoint_id: null, event_type: 'a2a.working', status: 'delivered', attempts: 1, last_status_code: 200, last_error: null, created_at: '2026-10-14T00:00:00Z', delivered_at: '2026-10-14T00:00:01Z' }];
  let redelivered = 0;
  await useSyntheticApplication(page);
  for (const url of [`**/v1/projects/${projectId}/webhooks**`, `**/v1/async/projects/${projectId}/webhooks**`]) await page.route(url, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/webhooks/deliveries')) return json(200, deliveries);
    if (path.endsWith('/redeliveries')) { redelivered += 1; deliveries[0].status = 'pending'; deliveries[0].attempts = 0; return json(202, { status: 'queued' }); }
    if (path.endsWith('/test-deliveries')) { deliveries.unshift({ ...deliveries[0], id: 'd2', event_type: 'ping', status: 'pending', attempts: 0 }); return json(202, { status: 'queued' }); }
    if (request.method() === 'GET') return json(200, list);
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      if (!String(body.url).startsWith('https://')) return json(422, { code: 'invalid_webhook_url', message_key: 'errors.invalid_webhook_url', retryable: false });
      const row = { id: `h${list.length + 1}`, url: body.url, events: [...body.events].sort(), enabled: true, created_at: '2026-10-14T00:00:00Z' };
      list.push(row); return json(201, { ...row, secret: 'synthetic-secret-shown-once-0000000000000' });
    }
    const id = path.split('/webhooks/')[1];
    const row = list.find(h => h.id === id)!;
    if (request.method() === 'PATCH') { Object.assign(row, request.postDataJSON()); return json(200, row); }
    list.splice(list.indexOf(row), 1); return route.fulfill({ status: 204, body: '' });
  });
  return { redelivered: () => redelivered };
}

test('add a webhook, see the secret once, test, toggle, redeliver and delete', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.addInitScript(() => { (window as unknown as { copied: string[] }).copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (v: string) => { (window as unknown as { copied: string[] }).copied.push(v); } } }); });
  const state = await hooks(page);
  await page.goto('/app/settings?section=webhooks');
  await expect(page.getByRole('cell', { name: 'a2a.working' })).toBeVisible();
  await page.getByLabel('Endpoint URL').fill('http://insecure.example.test/hook');
  await page.getByLabel('Run completed').check();
  await page.getByRole('button', { name: 'Add webhook' }).click();
  await expect(page.getByRole('alert')).toContainText('https');
  await page.getByLabel('Endpoint URL').fill('https://hooks.example.test/jsp');
  await page.getByLabel('Digest ready').check();
  await page.getByRole('button', { name: 'Add webhook' }).click();
  await expect(page.getByText('synthetic-secret-shown-once-0000000000000')).toBeVisible();
  await expect(page.getByText('This secret is shown only once')).toBeVisible();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(['synthetic-secret-shown-once-0000000000000']);
  await page.getByRole('button', { name: 'Done, I saved it' }).click();
  await expect(page.getByText('synthetic-secret-shown-once-0000000000000')).toHaveCount(0);
  await expect(page.getByText('https://hooks.example.test/jsp')).toBeVisible();

  await page.getByRole('button', { name: 'Send test to https://hooks.example.test/jsp' }).click();
  await expect(page.getByRole('cell', { name: 'ping' })).toBeVisible();
  const enabled = page.getByRole('button', { name: 'Enabled: https://hooks.example.test/jsp' });
  await expect(enabled).toHaveAttribute('aria-pressed', 'true');
  await enabled.click();
  await expect(enabled).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Redeliver run.completed' }).click();
  expect(state.redelivered()).toBe(1);
  await page.getByRole('button', { name: 'Delete https://hooks.example.test/jsp' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByText('https://hooks.example.test/jsp')).toHaveCount(0);
});

test('webhooks section fits 320px in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await hooks(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/app/settings?section=webhooks');
  await expect(page.getByRole('heading', { name: 'Webhook' })).toBeVisible();
  await page.getByLabel('URL ปลายทาง').fill('https://hooks.example.test/a-very-long-path/that-keeps-going/and-going/for-a-while');
  await page.getByLabel('สรุปงานใหม่พร้อม').check();
  await page.getByLabel('รออนุมัติ').check();
  await page.getByRole('button', { name: 'เพิ่ม webhook' }).click();
  await page.getByRole('button', { name: 'บันทึกแล้ว' }).click();
  await expect(page.getByText('https://hooks.example.test/a-very-long-path', { exact: false })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'a2a.working' })).toBeVisible();
  const overflow = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main,section,div,form,fieldset,ul,table')].filter(el => el.getBoundingClientRect().width > innerWidth - 16 || el.scrollWidth > el.clientWidth + 2).slice(-35).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, scroll: el.scrollWidth, client: el.clientWidth })) }));
  await page.screenshot({ path: '/tmp/jsp-webhook-overflow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
});
