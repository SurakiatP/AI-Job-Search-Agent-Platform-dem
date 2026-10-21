import { expect, test } from '@playwright/test';
import { projectId, sessionId } from '../fixtures/application';
import { boot, practiceApi, setId } from '../fixtures/practice';

// CR-IVP-01 interview practice, PR 1 (docs/superpowers/specs/2026-10-20-interview-practice-design.md). Synthetic data.

test('AC-IVP-01 create a set from the session tab and land on its page', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page, { sets: [] });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Interview practice' }).click();
  await expect(page.getByRole('region', { name: 'Prepare before the interview' })).toContainText('Prepare the RAG cost story');
  await page.getByRole('button', { name: 'New practice set' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New practice set' });
  await dialog.getByLabel('Name').fill('Technical round');
  await dialog.getByRole('radio', { name: 'Senior' }).check();
  await dialog.getByRole('checkbox', { name: /Technical knowledge/ }).check();
  await dialog.getByLabel('Questions in Technical knowledge').fill('5');
  await expect(dialog.getByText(/questions in total/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Create set' }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/practice/${setId}$`));
  const body = state.created[0];
  expect(body.name).toBe('Technical round');
  expect(body.level).toBe('senior');
  expect(body.sections).toContainEqual({ id: 'technical', count: 5 });
});

test('AC-IVP-01b the question language is chosen per set: defaults to the app language, can be switched', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page, { sets: [] });
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Interview practice' }).click();
  await page.getByRole('button', { name: 'New practice set' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New practice set' });
  const group = dialog.getByRole('group', { name: 'Question language' });
  await expect(group.getByRole('radio', { name: 'English' })).toBeChecked();
  await group.getByRole('radio', { name: 'ไทย' }).check();
  await dialog.getByRole('button', { name: 'Create set' }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/practice/${setId}$`));
  expect(state.created[0].output_language).toBe('th');
});

test('AC-IVP-05 rename, delete with undo from the session tab', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}?tab=practice`);
  const row = page.getByRole('listitem').filter({ hasText: 'Set 1' });
  await expect(row.getByText('0 of 4 ready')).toBeVisible();
  await row.getByRole('button', { name: 'Options for Set 1' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Second round');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Second round' })).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Second round' }).getByRole('button', { name: 'Options for Second round' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const notice = page.getByRole('status').filter({ hasText: '“Second round” deleted.' });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('link', { name: 'Second round' })).toHaveCount(0);
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: 'Second round' })).toBeVisible();
  expect(state.deleted).toBe(false);
});

test('AC-IVP-07 answer a written question, keep attempts and mark it ready', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Set 1' })).toBeVisible();
  const sheet = page.getByRole('navigation', { name: 'Rounds' });
  await expect(sheet.getByRole('button', { name: /Past experience \(STAR\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Tell me about a time you pushed back on a model choice' })).toBeVisible();
  await expect(page.getByText('Why we ask: Job asks for behavioral')).toBeVisible();
  await page.getByRole('button', { name: 'Built a 500-question test set for RAG answers' }).click();
  const answer = page.getByLabel('Your answer');
  await expect(answer).toHaveValue(/500-question test set/);
  await answer.fill('First try');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await answer.fill('Second try with a result');
  await page.getByRole('button', { name: 'Save answer' }).click();
  const saved = page.getByRole('list', { name: 'Saved answers' }).getByRole('listitem');
  await expect(saved).toHaveCount(2);
  await expect(saved.first()).toContainText('Second try with a result');
  await page.getByRole('button', { name: 'Example answer' }).click();
  await expect(page.getByText('I built a 500-question test set to compare models.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByRole('button', { name: 'Ready', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet).toContainText('1 of 4 ready');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tell me about a failed project' })).toBeVisible();
  await expect(page.getByText('No facts in your experience bank are enough for an example answer yet.')).toBeVisible();
  expect(state.attempts.map(a => a.answer)).toEqual(['First try', 'Second try with a result']);
  expect(state.patches).toContainEqual({ ready: true });
});

test('AC-IVP-06 flashcards flip with Space, rate with keys, end with a review of the learning pile', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`);
  await page.getByRole('navigation', { name: 'Rounds' }).getByRole('button', { name: /Technical knowledge/ }).click();
  const card = page.getByRole('group', { name: /Card 1 of 2/ });
  await expect(card).toContainText('How does HNSW differ from IVF?');
  await page.keyboard.press('Space');
  await expect(card).toContainText('HNSW is a graph index');
  await page.keyboard.press('2');
  await expect(page.getByRole('group', { name: /Card 2 of 2/ })).toContainText('What is a window function?');
  await page.keyboard.press('1');
  await expect(page.getByRole('heading', { name: 'Round done' })).toBeVisible();
  await expect(page.getByText('Know it').first()).toBeVisible();
  await page.getByRole('button', { name: 'Review the 1 card still learning' }).click();
  await expect(page.getByRole('group', { name: /Card 1 of 1/ })).toContainText('What is a window function?');
  expect(state.patches).toEqual([{ card_rating: 'know' }, { card_rating: 'learning' }]);
  await page.reload();
  await page.getByRole('navigation', { name: 'Rounds' }).getByRole('button', { name: /Technical knowledge/ }).click();
  await expect(page.getByRole('navigation', { name: 'Rounds' })).toContainText('1 of 2 known');
});

test('a set still generating says so and the question area waits', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page, { status: 'generating' });
  state.questions = [];
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`);
  await expect(page.getByText('Writing questions for this job')).toBeVisible();
});

test('practice set page has no horizontal scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await practiceApi(page);
  await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Tell me about a time you pushed back on a model choice' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
