import type { Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from './application';

// Synthetic interview practice API (CR-IVP-01) shared by the practice e2e specs.
export const job = '33333333-3333-4333-8333-333333333333';
export const setId = 'aaaaaaaa-1111-4111-8111-111111111111';
export const fact = 'ffffffff-0000-4000-8000-000000000001';
export const at = '2026-10-20T00:00:00Z';
export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

export const question = (n: number, section: string, prompt: string, extra: object = {}) => ({
  id: `bbbbbbbb-0000-4000-8000-00000000000${n}`, section, position: n, prompt, why: `Job asks for ${section}`,
  key_points: [`Point for ${prompt}`], model_answer: null, evidence_ids: [], ready: false, card_rating: null, attempts: [], ...extra });

export function freshQuestions() {
  return [
    question(0, 'behavioral', 'Tell me about a time you pushed back on a model choice',
      { model_answer: 'I built a 500-question test set to compare models.', evidence_ids: [fact] }),
    question(1, 'behavioral', 'Tell me about a failed project'),
    question(2, 'technical', 'How does HNSW differ from IVF?', { key_points: ['HNSW is a graph index', 'IVF clusters vectors first'] }),
    question(3, 'technical', 'What is a window function?'),
  ];
}

export async function practiceApi(page: Page, start: { sets?: object[]; status?: string; projectSets?: object[] } = {}) {
  const state = {
    questions: freshQuestions(), name: 'Set 1', deleted: false, status: start.status ?? 'ready',
    created: [] as any[], attempts: [] as any[], patches: [] as any[], feedbackAsks: [] as string[],
    report: null as any, feedbackReply: null as any, reportReply: null as any,
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
      return route.fulfill(json({ ...view(), reverse_questions: ['How is the AI team organised?'], report: state.report, questions: state.questions }));
    }
    if (path === `/projects/${projectId}/practice-sets`) return route.fulfill(json(start.projectSets ?? [{ ...view(), job_title: 'AI Engineer', job_company: 'Example Co' }]));
    if (path === `/projects/${projectId}/practice-sets/${setId}/report`) {
      state.report = state.reportReply ?? { status: 'pending', run_id: 'rr' };
      return route.fulfill(json({ ...view(), report: state.report }, 202));
    }
    const asked = path.match(/\/practice-attempts\/([^/]+)\/feedback$/);
    if (asked) {
      state.feedbackAsks.push(asked[1]);
      const attempt = state.questions.flatMap(item => item.attempts).find((item: any) => item.id === asked[1]) as any;
      attempt.feedback = state.feedbackReply ?? { status: 'pending', run_id: 'rg' };
      return route.fulfill(json(attempt, 202));
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

export async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
}
