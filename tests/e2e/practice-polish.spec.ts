import { expect, test } from '@playwright/test';
import { projectId, sessionId } from '../fixtures/application';
import { boot, practiceApi, setId } from '../fixtures/practice';

const url = `/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`;
const first = 'Tell me about a time you pushed back on a model choice';

test('progress ring follows the ready button', async ({ page }) => {
  await boot(page); await practiceApi(page); await page.goto(url);
  const ring = page.getByTestId('practice-progress');
  await expect(ring).toHaveAttribute('data-ready', '0');
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(ring).toHaveAttribute('data-ready', '1');
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(ring).toHaveAttribute('data-ready', '0');
});

test('typed text is kept per question when moving between questions', async ({ page }) => {
  await boot(page); await practiceApi(page); await page.goto(url);
  await page.getByLabel('Your answer').fill('draft one');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tell me about a failed project' })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toHaveValue('');
  await page.getByLabel('Your answer').fill('draft two');
  await page.getByRole('button', { name: 'Previous question' }).click();
  await expect(page.getByRole('heading', { level: 2, name: first })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toHaveValue('draft one');
});

test('timer shows the last-15-seconds state and stops on a second press', async ({ page }) => {
  await page.clock.install();
  await boot(page); await practiceApi(page); await page.goto(url);
  const timer = page.getByRole('button', { name: /Time 2 minutes/ });
  await timer.click();
  const running = page.getByRole('button', { name: /2:00/ });
  await expect(running).not.toHaveAttribute('data-urgent', 'true');
  for (let i = 0; i < 106; i++) await page.clock.runFor(1000); // one tick per render: the timer re-arms after each state change
  await expect(page.getByRole('button', { name: /0:14/ })).toHaveAttribute('data-urgent', 'true');
  await page.getByRole('button', { name: /Stop timer/ }).click();
  await expect(page.getByRole('button', { name: /Time 2 minutes/ })).toHaveAttribute('aria-pressed', 'false');
});

test('STAR chips add their label and keep what was typed', async ({ page }) => {
  await boot(page); await practiceApi(page); await page.goto(url);
  const answer = page.getByLabel('Your answer');
  await answer.fill('My own words');
  await page.getByRole('button', { name: 'Situation' }).click();
  await page.getByRole('button', { name: 'Result' }).click();
  await expect(answer).toHaveValue('My own words\nSituation:\nResult: ');
  await expect(answer).toBeFocused();
});

test('reduced motion: questions still switch and the page works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page); await practiceApi(page); await page.goto(url);
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tell me about a failed project' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByTestId('practice-progress')).toHaveAttribute('data-ready', '1');
});

test('phone shows the rounds as a pill row without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page); await practiceApi(page); await page.goto(url);
  const pills = page.getByRole('navigation', { name: 'Rounds' }).getByRole('button', { name: /Technical knowledge/ });
  await expect(pills).toBeVisible();
  expect((await pills.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await pills.click();
  await expect(page.getByRole('group', { name: /Card 1 of 2/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
