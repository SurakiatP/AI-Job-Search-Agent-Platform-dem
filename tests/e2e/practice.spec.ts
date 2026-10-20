import { expect, test, type Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from '../fixtures/application';

// CR-IVP-01 interview practice, PR 1 (docs/superpowers/specs/2026-10-20-interview-practice-design.md). Synthetic data.
const job = '33333333-3333-4333-8333-333333333333';
const setId = 'aaaaaaaa-1111-4111-8111-111111111111';
const fact = 'ffffffff-0000-4000-8000-000000000001';
const at = '2026-10-20T00:00:00Z';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

const question = (n: number, section: string, prompt: string, extra: object = {}) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${n}`, section, position: n, prompt, why: `Job asks for ${section}`,
  key_points: [`Point for ${prompt}`], model_answer: null, evidence_ids: [], ready: false, card_rating: null, attempts: [], ...extra });

function freshQuestions() {
  return [
    question(0, 'behavioral', 'Tell me about a time you pushed back on a model choice',
      { model_answer: 'I built a 500-question test set to compare models.', evidence_ids: [fact] }),
    question(1, 'behavioral', 'Tell me about a failed project'),
    question(2, 'technical', 'How does HNSW differ from IVF?', { key_points: ['HNSW is a graph index', 'IVF clusters vectors first'] }),
    question(3, 'technical', 'What is a window function?'),
  ];
}

async function practiceApi(page: Page, start: { sets?: object[]; status?: string } = {}) {
  const state = {
    questions: freshQuestions(), name: 'Set 1', deleted: false, status: start.status ?? 'ready',
    created: [] as any[], attempts: [] as any[], patches: [] as any[],
  };
  const view = () => ({ id: setId, session_id: sessionId, name: state.name, level: 'mid', status: state.status,
    sections: [{ id: 'behavioral', count: 2 }, { id: 'technical', count: 2 }], run_id: 'r1', created_at: at,
    question_count: state.questions.length, ready_count: state.questions.filter(q => q.ready).length,
    known_count: state.questions.filter(q => q.card_rating === 'know').length });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === `/projects/${projectId}/sessions/${sessionId}`) return route.fulfill(json({
      id: sessionId, project_id: projectId, title: 'Session', created_at: at, cv_revision_id: 'c1', job_revision_id: job,
      cv_name: 'Data CV', cv_revision: 3, job_title: 'AI Engineer', job_company: 'Example Co' }));
    if (path === `/projects/${projectId}/runs`) return route.fulfill(json([{
      id: 'cccccccc-0000-4000-8000-000000000001', project_id: projectId, session_id: sessionId, operation: 'evaluate_job',
      status: 'completed', job_revision_id: job, output_language: 'en', result_file_ids: [], created_at: at, finished_at: at,
      retry_of_id: null, evaluation_result: { score: 4, report_markdown: 'x', report: { verdict: 'Apply', summary: 'Fits',
        requirements: [], strengths: [], risks: [], interview_prep: ['Prepare the RAG cost story'], cv_changes: [] } } }]));
    if (path === `/projects/${projectId}/experience`) return route.fulfill(json({ items: [
      { id: fact, kind: 'project', text: 'Built a 500-question test set for RAG answers', source: 'owner', created_at: at }],
      extraction: null, provider_configured: true }));
    if (path === `/projects/${projectId}/sessions/${sessionId}/practice-sets`) {
      if (method === 'POST') { state.created.push(request.postDataJSON()); return route.fulfill(json({ ...view(), status: 'generating' }, 201)); }
      return route.fulfill(json(state.deleted ? [] : start.sets ?? [view()]));
    }
    if (path === `/projects/${projectId}/practice-sets/${setId}`) {
      if (method === 'PATCH') { state.name = request.postDataJSON().name; return route.fulfill(json(view())); }
      if (method === 'DELETE') { state.deleted = true; return route.fulfill({ status: 204 }); }
      return route.fulfill(json({ ...view(), reverse_questions: ['How is the AI team organised?'], questions: state.questions }));
    }
    if (path === `/projects/${projectId}/practice-sets/${setId}/restore`) { state.deleted = false; return route.fulfill(json(view())); }
    const q = state.questions.find(item => path === `/projects/${projectId}/practice-questions/${item.id}`
      || path === `/projects/${projectId}/practice-questions/${item.id}/attempts`);
    if (q && path.endsWith('/attempts')) {
      const attempt = { id: `a${state.attempts.length}`, answer: request.postDataJSON().answer, feedback: null, created_at: at };
      state.attempts.push(attempt); q.attempts = [attempt, ...q.attempts];
      return route.fulfill(json(attempt, 201));
    }
    if (q && method === 'PATCH') { const body = request.postDataJSON(); state.patches.push(body); Object.assign(q, body); return route.fulfill(json(q)); }
    return route.fallback();
  });
  return state;
}

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
}

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
