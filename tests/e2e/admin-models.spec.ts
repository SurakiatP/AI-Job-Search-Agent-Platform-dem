import { expect, test, type Page } from '@playwright/test';
import { mockAdminModels, type ModelsMock } from '../fixtures/admin-models';

test.setTimeout(45_000);
const PHRASE = 'ใช้โมเดลนี้';
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function open(page: Page, overrides: Partial<ModelsMock> = {}) {
  const mock = await mockAdminModels(page, overrides);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/models');
  return mock;
}
const sheet = (page: Page) => page.getByRole('dialog');
const writes = (m: ModelsMock) => m.calls.map(c => `${c.method} ${c.path}`);

/** Opens the change sheet of Job evaluation and picks the unregistered, priced mini model. */
async function pickMini(page: Page) {
  await page.getByRole('button', { name: 'Change the model for Job evaluation' }).click();
  await sheet(page).getByLabel('Search OpenRouter models').fill('luna');
  await sheet(page).getByRole('radio', { name: /openai\/gpt-6-luna-mini/ }).click();
}

test('TC-ADM-MD-01: the tasks tab lists each task with model, effort, score bar, cost and a Change button', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'AI models' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'How a change works' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: /^Task models/ })).toHaveAttribute('aria-selected', 'true');
  const evaluate = page.getByRole('listitem').filter({ hasText: 'Scores how well a CV fits a job.' });
  await expect(evaluate).toContainText('qwen/qwen3.7-flash');
  await expect(evaluate).toContainText('Manual price');
  await expect(evaluate).toContainText('effort: low');
  await expect(evaluate).toContainText('96.0');
  await expect(evaluate).toContainText('≈ $0.00041');
  await expect(page.getByRole('listitem').filter({ hasText: 'Checks and scores practice answers.' })).toContainText('Not tested');
  await expect(page.getByRole('button', { name: /^Change the model for/ })).toHaveCount(4);
});

test('TC-ADM-MD-02: change flow, green path: registers the model, tests it, polls, then applies with the benchmark id', async ({ page }) => {
  const m = await open(page);
  await pickMini(page);
  await expect(sheet(page).getByText('Will be registered in LiteLLM for you')).toBeVisible();
  await expect(sheet(page).getByText('20 cases, about 3 minutes')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Start test' }).click();
  await expect(sheet(page).getByText('Holdout v1 · 20 cases')).toBeVisible();
  await expect(sheet(page).getByText('You can close this window. The test keeps running and the result appears in Test history.')).toBeVisible();
  await expect(sheet(page).getByRole('img', { name: /cases done/ })).toBeVisible();
  await expect(sheet(page).getByText('Passed. Quality up by 0.6.')).toBeVisible({ timeout: 12_000 });
  await expect(sheet(page).getByText('Answer time (p50)')).toBeVisible();
  await expect(sheet(page).getByText(/^Cost per call/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Use for Job evaluation' }).click();
  await expect(sheet(page).getByText('Changed. New runs use it at once.')).toBeVisible();
  await expect(sheet(page).getByText(/Runs already in progress keep the old model/)).toBeVisible();
  expect(writes(m)).toEqual(['POST /models', 'POST /benchmarks', 'PUT /tasks/evaluate_job']);
  expect(m.calls[0].body).toEqual({ model: 'openai/gpt-6-luna-mini' });
  expect(m.calls[1].body).toEqual({ operation: 'evaluate_job', model: 'openai/gpt-6-luna-mini', effort: 'low' });
  expect(m.calls[2].body).toEqual({ model: 'openai/gpt-6-luna-mini', effort: 'low', benchmark_id: 'b-new' });
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'Scores how well a CV fits a job.' })).toContainText('openai/gpt-6-luna-mini');
});

test('TC-ADM-MD-03: change flow, red path: the apply button stays locked until the phrase is typed, then sends confirm', async ({ page }) => {
  const m = await open(page, { verdict: 'red' });
  await pickMini(page);
  await sheet(page).getByRole('button', { name: 'Start test' }).click();
  await expect(sheet(page).getByText('Quality fell by 4.8, more than the 2 points allowed.')).toBeVisible({ timeout: 12_000 });
  const apply = sheet(page).getByRole('button', { name: 'Use this model' });
  await expect(apply).toBeDisabled();
  await sheet(page).getByLabel('Type the phrase to confirm').fill('ใช้โมเดล');
  await expect(apply).toBeDisabled();
  await sheet(page).getByLabel('Type the phrase to confirm').fill(PHRASE);
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(sheet(page).getByText('Changed. New runs use it at once.')).toBeVisible();
  expect(m.calls.at(-1)).toEqual({ method: 'PUT', path: '/tasks/evaluate_job', body: { model: 'openai/gpt-6-luna-mini', effort: 'low', benchmark_id: 'b-new', confirm: PHRASE } });
});

test('TC-ADM-MD-04: a model with no price needs the manual price form; 0 needs the free box', async ({ page }) => {
  const m = await open(page);
  await page.getByRole('button', { name: 'Change the model for Job evaluation' }).click();
  await sheet(page).getByLabel('Search OpenRouter models').fill('thai');
  await sheet(page).getByRole('radio', { name: /lunaris\/luna-thai-7b/ }).click();
  await expect(sheet(page).getByText('No price found for this model')).toBeVisible();
  const start = sheet(page).getByRole('button', { name: 'Start test' });
  await expect(start).toBeDisabled();
  await expect(sheet(page).getByText('Enter the price before testing')).toBeVisible();
  await sheet(page).getByLabel('Input per 1M tokens').fill('0');
  await sheet(page).getByLabel('Output per 1M tokens').fill('0');
  await expect(sheet(page).getByText('A price of 0 needs the free box ticked.')).toBeVisible();
  await expect(start).toBeDisabled();
  await sheet(page).getByLabel(/This model is really free/).check();
  await expect(start).toBeEnabled();
  await sheet(page).getByLabel(/This model is really free/).uncheck();
  await sheet(page).getByLabel('Input per 1M tokens').fill('0.10');
  await sheet(page).getByLabel('Output per 1M tokens').fill('abc');
  await expect(start).toBeDisabled();
  await sheet(page).getByLabel('Output per 1M tokens').fill('0.20');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(sheet(page).getByText('Holdout v1 · 20 cases')).toBeVisible();
  expect(m.calls[0]).toEqual({ method: 'POST', path: '/models', body: { model: 'lunaris/luna-thai-7b', price_in: 0.1, price_out: 0.2, price_cache: null, is_free: false } });
});

test('TC-ADM-MD-05: the add-model sheet adds a priced model at once and asks for a price when there is none', async ({ page }) => {
  const m = await open(page);
  await page.getByRole('tab', { name: /^Model library and prices/ }).click();
  await page.getByRole('button', { name: 'Add model from OpenRouter' }).click();
  await sheet(page).getByLabel('Search OpenRouter models').fill('luna');
  await expect(sheet(page).getByText('No price — enter it')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Add openai/gpt-6-luna-mini' }).click();
  await expect(sheet(page).getByText('Added', { exact: true })).toHaveCount(2); // the registered gpt-6-luna row plus the one just added
  expect(m.calls).toEqual([{ method: 'POST', path: '/models', body: { model: 'openai/gpt-6-luna-mini' } }]);
  await sheet(page).getByRole('button', { name: 'Add lunaris/luna-thai-7b' }).click();
  const confirm = sheet(page).getByRole('button', { name: 'Add with this price' });
  await expect(confirm).toBeDisabled();
  await sheet(page).getByLabel('Input per 1M tokens').fill('0.10');
  await sheet(page).getByLabel('Output per 1M tokens').fill('0.10');
  await sheet(page).getByLabel('Cache per 1M tokens').fill('0.01');
  await confirm.click();
  await expect(sheet(page).getByText('Added', { exact: true })).toHaveCount(3);
  expect(m.calls[1]).toEqual({ method: 'POST', path: '/models', body: { model: 'lunaris/luna-thai-7b', price_in: 0.1, price_out: 0.1, price_cache: 0.01, is_free: false } });
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add model from OpenRouter' })).toBeFocused();
});

test('TC-ADM-MD-06: the library shows source badges and the = input tip, and Use official price switches a manual model', async ({ page }) => {
  const m = await open(page);
  await page.getByRole('tab', { name: /^Model library and prices/ }).click();
  const qwen = page.getByRole('listitem').filter({ hasText: 'qwen/qwen3.7-flash' });
  await expect(qwen).toContainText('Manual price');
  await expect(qwen).toContainText('= input');
  await expect(qwen).toContainText('3 tasks');
  await expect(page.getByRole('listitem').filter({ hasText: 'openai/gpt-6-luna' }).first()).toContainText('OpenRouter');
  await expect(page.getByText(/OpenRouter now has an official price for qwen\/qwen3\.7-flash/)).toBeVisible();
  await page.getByRole('button', { name: 'Use the official price for qwen/qwen3.7-flash' }).click();
  await expect(page.getByText(/OpenRouter now has an official price/)).toHaveCount(0);
  expect(m.calls).toEqual([{ method: 'POST', path: '/models/use-official-price', body: { model: 'qwen/qwen3.7-flash' } }]);
  await expect(page.getByRole('listitem').filter({ hasText: 'qwen/qwen3.7-flash' })).toContainText('$0.06');
});

test('TC-ADM-MD-07: the test history lists every test with verdict, pair, quality against baseline and who', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: /^Test history/ }).click();
  const rows = page.getByRole('listitem').filter({ hasText: 'ops@example.test' });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Below the bar');
  await expect(rows.nth(0)).toContainText('openai/gpt-6-luna / low');
  await expect(rows.nth(0)).toContainText('93.1');
  await expect(rows.nth(0)).toContainText('was 96.0');
  await expect(rows.nth(1)).toContainText('Passed · in use');
  await expect(rows.nth(2)).toContainText('Passed · not used');
});

test('TC-ADM-MD-08: a test that cannot start because another is running says so and keeps the choice', async ({ page }) => {
  await open(page, { busy: true });
  await pickMini(page);
  await sheet(page).getByRole('button', { name: 'Start test' }).click();
  await expect(sheet(page).getByText('Another test is still running. Wait for it to finish, then start this one.')).toBeVisible();
  await expect(sheet(page).getByRole('radio', { name: /openai\/gpt-6-luna-mini/ })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet(page).getByRole('button', { name: 'Start test' })).toBeEnabled();
});

test('TC-ADM-MD-09: answer grading has a test set now, so a change starts a benchmark instead of asking for the phrase', async ({ page }) => {
  const m = await open(page);
  await page.getByRole('button', { name: 'Change the model for Answer grading' }).click();
  await sheet(page).getByRole('radio', { name: /openai\/gpt-6-luna/ }).click();
  await expect(sheet(page).getByText('This task has no test set. You will confirm by typing a phrase.')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Start test' }).click();
  await expect(sheet(page).getByText('Holdout v1 · 20 cases')).toBeVisible();
  expect(writes(m)).toEqual(['POST /benchmarks']);
  expect(m.calls[0].body).toMatchObject({ operation: 'interview_grade', model: 'openai/gpt-6-luna' });
});

test('TC-ADM-MD-10: a rejected apply (benchmark_required) shows its message in the sheet', async ({ page }) => {
  await open(page, { putError: 'benchmark_required' });
  await pickMini(page);
  await sheet(page).getByRole('button', { name: 'Start test' }).click();
  await sheet(page).getByRole('button', { name: 'Use for Job evaluation' }).click({ timeout: 12_000 });
  await expect(sheet(page).getByText('This pair has no passing test. Run the test first, or type the phrase to confirm.')).toBeVisible();
});

test('TC-ADM-MD-11: Use one model for every task: choose the pair once, then test and apply task by task', async ({ page }) => {
  const m = await open(page);
  await page.getByRole('button', { name: 'Use one model for every task' }).click();
  await sheet(page).getByRole('radio', { name: /openai\/gpt-6-luna/ }).first().click();
  await sheet(page).getByRole('button', { name: 'Continue' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Test openai/gpt-6-luna on Job evaluation' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Test openai/gpt-6-luna on Job evaluation' }).click();
  await sheet(page).getByRole('button', { name: 'Use for Job evaluation' }).click({ timeout: 12_000 });
  await expect(sheet(page).getByText('Changed', { exact: true })).toBeVisible();
  expect(writes(m)).toEqual(['POST /benchmarks', 'PUT /tasks/evaluate_job']);
});

test('TC-ADM-MD-12: loading failure shows what failed with Try again; an empty install says what will appear', async ({ page }) => {
  const m = await open(page, { failTasks: true });
  await expect(page.getByText('Could not load the AI model settings.')).toBeVisible();
  m.failTasks = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /^Change the model for/ })).toHaveCount(4);
  m.tasks.length = 0; m.models.length = 0; m.history.length = 0;
  await page.reload();
  await expect(page.getByText('No tasks yet')).toBeVisible();
  await page.getByRole('tab', { name: /^Test history/ }).click();
  await expect(page.getByText('No tests yet')).toBeVisible();
});

test('TC-ADM-MD-13: at 390 px the page and the open sheet do not scroll sideways', async ({ page }) => {
  await mockAdminModels(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/models');
  await expect(page.getByRole('button', { name: 'Change the model for Job evaluation' })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('tab', { name: /^Model library and prices/ }).click();
  await expect(page.getByRole('button', { name: 'Add model from OpenRouter' })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('tab', { name: /^Test history/ }).click();
  await expect(page.getByText('Below the bar')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('tab', { name: /^Task models/ }).click();
  await page.getByRole('button', { name: 'Change the model for Job evaluation' }).click();
  await sheet(page).getByLabel('Search OpenRouter models').fill('thai');
  await sheet(page).getByRole('radio', { name: /lunaris\/luna-thai-7b/ }).click();
  await expect(sheet(page).getByLabel('Input per 1M tokens')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  const box = await sheet(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('TC-ADM-MD-14: the page renders in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await mockAdminModels(page);
  await page.goto('/admin/models');
  await expect(page.getByRole('heading', { level: 1, name: 'โมเดล AI' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^งานและโมเดลที่ใช้/ })).toBeVisible();
  const evaluate = page.getByRole('listitem').filter({ hasText: 'ให้คะแนนว่า CV เหมาะกับงานแค่ไหน' });
  await expect(evaluate).toContainText('ประเมินงาน');
  await expect(evaluate).toContainText('ราคากรอกเอง');
  await page.getByRole('button', { name: 'เปลี่ยนโมเดลของประเมินงาน' }).click();
  await expect(sheet(page).getByText('ระดับการคิด (effort)').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /^ประวัติการทดสอบ/ }).click();
  await expect(page.getByText('ไม่ผ่านเกณฑ์')).toBeVisible();
  await expect(page.getByText('ผ่าน · ใช้แล้ว')).toBeVisible();
});
