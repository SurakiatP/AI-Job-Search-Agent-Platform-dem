import { expect, test } from '@playwright/test';
import { projectId, sessionId } from '../fixtures/application';
import { at, boot, fact, practiceApi, setId } from '../fixtures/practice';

// CR-IVP-01 PR 2: AI feedback, flashcard check, end-of-set report, project-wide page. Synthetic data.
const ANSWER = 'The team wanted the largest model. I built a 500-question test set and compared three models.';
const done = (scores: object) => ({
  status: 'done', kind: 'answer', scores, summary: 'Clear story; the result needs a number.',
  star: [{ part: 'S', start: 0, end: 34 }, { part: 'A', start: 35, end: ANSWER.length }],
  add: ['Close with the cost you saved'], unused_facts: [{ id: fact, text: 'Built a 500-question test set for RAG answers' }],
});
const page1 = `/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`;

test('AC-IVP-09 ask for feedback, see five scores, STAR marks and what to add; a second answer compares', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  state.questions[0].attempts = [
    { id: 'a-new', answer: ANSWER, feedback: null, created_at: at },
    { id: 'a-old', answer: 'Old answer', feedback: done({ structure: 2, relevance: 4, evidence: 2, clarity: 3, company_fit: 3 }), created_at: at },
  ];
  await page.goto(page1);
  await page.getByRole('button', { name: 'Get AI feedback' }).click();
  await expect(page.getByText('Reading your answer')).toBeVisible();
  expect(state.feedbackAsks).toEqual(['a-new']);
  state.questions[0].attempts[0].feedback = done({ structure: 4, relevance: 5, evidence: 3, clarity: 4, company_fit: 3 });
  const feedback = page.getByRole('region', { name: 'AI feedback' });
  await expect(feedback).toBeVisible({ timeout: 8000 });
  await expect(feedback.getByText('Made by AI')).toBeVisible();
  const structure = feedback.getByRole('listitem').filter({ hasText: 'Structure' });
  await expect(structure).toContainText('4 of 5');
  await expect(structure).toContainText('up from 2');
  await expect(feedback.getByText('situation, task, action and result are all there')).toBeVisible();
  await expect(feedback.locator('mark').filter({ hasText: 'The team wanted the largest model.' })).toHaveAttribute('data-part', 'S');
  await expect(feedback.getByText('Situation', { exact: true })).toBeVisible();
  await expect(feedback.getByText('Result', { exact: true })).toBeVisible();  // legend says which part is missing
  await expect(feedback.getByText('Close with the cost you saved')).toBeVisible();
  await expect(feedback.getByRole('button', { name: 'Built a 500-question test set for RAG answers' })).toBeVisible();
});

test('AC-IVP-15 type a flashcard answer and get a correctness check', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  state.feedbackReply = { status: 'done', kind: 'card', verdict: 'partial', missing: ['Memory cost of HNSW', 'Re-ranking'], note: 'Half right.' };
  await page.goto(page1);
  await page.getByRole('navigation', { name: 'Rounds' }).getByRole('button', { name: /Technical knowledge/ }).click();
  await page.getByRole('button', { name: 'Answer before flipping' }).click();
  await page.getByLabel('Your answer to this card').fill('HNSW is a graph');
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.getByText('Partly right')).toBeVisible();
  const missing = page.getByRole('list', { name: 'Missing' }).getByRole('listitem');
  await expect(missing).toHaveText(['Memory cost of HNSW', 'Re-ranking']);
  expect(state.attempts.map(a => a.answer)).toEqual(['HNSW is a graph']);
});

test('AC-IVP-11 the summary round asks for the report and shows plan and readiness in words', async ({ page }) => {
  await boot(page);
  const state = await practiceApi(page);
  await page.goto(page1);
  await page.getByRole('navigation', { name: 'Rounds' }).getByRole('button', { name: /Summary and plan/ }).click();
  await page.getByRole('button', { name: 'Write my summary' }).click();
  await expect(page.getByText('Writing your summary')).toBeVisible();
  state.report = { status: 'done', strengths: ['Clear STAR stories'], skills_to_build: ['Vector index tuning'],
    plan: ['Review HNSW and IVF trade-offs'], readiness: [{ section: 'behavioral', level: 'almost', note: 'Add results' }] };
  const report = page.getByRole('region', { name: 'Summary and plan' });
  await expect(report.getByText('Vector index tuning')).toBeVisible({ timeout: 8000 });
  await expect(report.getByText('Clear STAR stories')).toBeVisible();
  await expect(report.getByText('Review HNSW and IVF trade-offs')).toBeVisible();
  await expect(report.getByRole('listitem').filter({ hasText: 'Past experience (STAR)' })).toContainText('Almost ready');
  await expect(report.getByText('Made by AI')).toBeVisible();
  await expect(report.getByRole('button', { name: 'Write it again' })).toBeVisible();
});

test('FR-IVP-19 sidebar practice page lists every set by job', async ({ page }) => {
  await boot(page);
  await practiceApi(page);
  await page.goto(`/app/projects/${projectId}/overview`);
  await page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: 'Interview practice' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/practice$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Interview practice' })).toBeVisible();
  const group = page.getByRole('region', { name: 'AI Engineer · Example Co' });
  await group.getByRole('link', { name: 'Set 1' }).click();
  await expect(page).toHaveURL(new RegExp(`/practice/${setId}$`));
});

test('FR-IVP-19 empty practice page says where sets come from', async ({ page }) => {
  await boot(page);
  await practiceApi(page, { projectSets: [] });
  await page.goto(`/app/projects/${projectId}/practice`);
  await expect(page.getByText('Practice sets are made from an evaluation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to evaluations' })).toBeVisible();
});
