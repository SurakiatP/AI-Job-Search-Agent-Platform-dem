import type { Page } from '@playwright/test';
import { jobId, projectId, useSyntheticApplication } from './application';

const secondJobId = '33333333-3333-4333-8333-333333333334';
const hostileJobId = '33333333-3333-4333-8333-333333333335';
const stageJobIds = [
  '33333333-3333-4333-8333-333333333336', '33333333-3333-4333-8333-333333333337',
  '33333333-3333-4333-8333-333333333338', '33333333-3333-4333-8333-333333333339',
  '33333333-3333-4333-8333-333333333340',
];
const runId = '55555555-5555-4555-8555-555555555551';
const documentId = '44444444-4444-4444-8444-444444444445';
const evaluationSessionId = '22222222-2222-4222-8222-222222222223';
const evaluationCvRevisionId = '77777777-7777-4777-8777-777777777773';

const jobRows = [
  { id: jobId, revision: 1, title: 'Senior Data Analyst', company: 'Northstar Health', source_url: 'https://jobs.example.test/northstar-analyst', created_at: '2026-10-01T00:00:00Z', description: 'Own analysis for a regional care team. Work with SQL, dashboards, and product partners.' },
  { id: secondJobId, revision: 3, title: 'Product Analyst', company: 'Lumen Market', source_url: 'https://jobs.example.test/lumen-product-analyst', created_at: '2026-10-02T00:00:00Z', description: 'Translate product questions into clear experiments and useful metrics.' },
  { id: hostileJobId, revision: 1, title: '<img src=x onerror=alert(1)> Data Operations Lead', company: 'Kite Systems & Partners', source_url: 'https://jobs.example.test/kite-ops', created_at: '2026-10-03T00:00:00Z', description: 'Build dependable reporting across multiple teams. <script>alert("untrusted posting")</script>' },
  ...stageJobIds.map((id, index) => ({ id, revision: index + 1, title: ['Growth Analyst', 'Research Analyst', 'Insights Lead', 'Operations Analyst', 'Customer Data Analyst'][index], company: ['Fern Labs', 'Maple Studio', 'Harbor Analytics', 'Orbit Retail', 'Daybreak Finance'][index], source_url: `https://jobs.example.test/stage-${index + 1}`, created_at: `2026-10-0${4 + index}T00:00:00Z`, description: 'Synthetic role used to verify every tracking stage.' })),
];

const events = [
  { id: '66666666-6666-4666-8666-666666666661', kind: 'stage_changed', actor: 'user', payload: { from: 'saved', to: 'applied' }, created_at: '2026-10-14T09:00:00Z' },
  { id: '66666666-6666-4666-8666-666666666662', kind: 'contact_updated', actor: 'user', payload: { name: 'Sirin Rattanakosin', email: 'sirin@northstar.example', role: 'Talent Partner' }, created_at: '2026-10-14T10:00:00Z' },
  { id: '66666666-6666-4666-8666-666666666663', kind: 'email_logged', actor: 'user', payload: { direction: 'received', subject: 'Interview availability', occurred_on: '2026-10-15', note: 'The hiring team would like to schedule a conversation.' }, created_at: '2026-10-15T04:00:00Z' },
  { id: '66666666-6666-4666-8666-666666666664', kind: 'note', actor: 'user', payload: { text: 'Bring the retention analysis example. <script>alert("untrusted note")</script>' }, created_at: '2026-10-15T05:00:00Z' },
];

const statusByJob = new Map([[jobId, 'applied'], [secondJobId, 'interview'], [hostileJobId, 'rejected'], ...stageJobIds.map((id, index) => [id, (['saved', 'responded', 'offer', 'hired', 'withdrawn'] as const)[index]] as const)]);

/** Full synthetic application-tracking fixture. It installs no tests and captures contract-shaped writes. */
export async function useApplicationsWorkspaceFixture(page: Page) {
  await useSyntheticApplication(page);
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const applications = jobRows.map(job => ({
    job_revision_id: job.id,
    title: job.title,
    company: job.company,
    created_at: job.created_at,
    stage: statusByJob.get(job.id) ?? 'saved',
    has_contact: job.id === jobId,
    last_activity_at: job.id === jobId ? '2026-10-15T05:00:00Z' : job.created_at,
  }));
  const detail = {
    job_revision_id: jobId,
    title: jobRows[0].title,
    company: jobRows[0].company,
    stage: 'applied' as string,
    contact: { name: 'Sirin Rattanakosin', email: 'sirin@northstar.example', role: 'Talent Partner' },
    events: [...events],
  };
  const applicationFor = (id: string) => ({
    job_revision_id: id,
    title: jobRows.find(job => job.id === id)?.title ?? 'Unknown opportunity',
    company: jobRows.find(job => job.id === id)?.company ?? null,
    stage: statusByJob.get(id) ?? 'saved',
    contact: id === jobId ? detail.contact : { name: null, email: null, role: null },
    events: id === jobId ? detail.events : [],
  });

  await page.route(`**/api/v1/projects/${projectId}/applications`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(applications) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs`, async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { title: string; description: string; company: string | null; source_url: string | null };
      const path = new URL(route.request().url()).pathname;
      writes.push({ method: route.request().method(), path, body });
      const job = { ...body, id: '33333333-3333-4333-8333-333333333341', revision: 1, created_at: '2026-10-16T00:00:00Z', application_status: 'saved' as const };
      jobRows.push(job);
      applications.push({ job_revision_id: job.id, title: job.title, company: job.company, created_at: job.created_at, stage: 'saved', has_contact: false, last_activity_at: job.created_at });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(job) });
      return;
    }
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jobRows.map(job => ({ ...job, application_status: statusByJob.get(job.id) ?? 'saved' }))) });
  });
  const evaluationSession = { id: evaluationSessionId, project_id: projectId, title: 'Northstar evaluation', created_at: '2026-10-13T00:00:00Z', cv_revision_id: evaluationCvRevisionId, job_revision_id: jobId, cv_name: 'Healthcare Analytics', cv_revision: 3 };
  await page.route(`**/api/v1/projects/${projectId}/sessions`, route => route.fulfill({ json: [evaluationSession] }));
  await page.route(`**/api/v1/projects/${projectId}/sessions/${evaluationSessionId}`, route => route.fulfill({ json: evaluationSession }));
  await page.route(`**/api/v1/projects/${projectId}/runs`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const run = { id: runId, project_id: projectId, session_id: evaluationSessionId, operation: 'evaluate_job', status: 'completed', job_revision_id: jobId, output_language: 'en', result_file_ids: [], created_at: '2026-10-13T00:00:00Z', finished_at: '2026-10-13T00:01:00Z', retry_of_id: null, evaluation_result: { report_markdown: 'Strong SQL and stakeholder experience. **Improve:** add one quantified experimentation example.', score: 3.7, skill_coverage: { required: ['SQL', 'experimentation', 'healthcare analytics'], matched: ['SQL', 'healthcare analytics'], missing: ['experimentation'], ratio: 2 / 3, method: 'keyword' } } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([run]) });
  });
  await page.route(`**/api/v1/projects/${projectId}/documents`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: documentId, document_type: 'cover_letter', title: 'Northstar cover letter', latest_revision: { id: '44444444-4444-4444-8444-444444444446', revision: 2, created_at: '2026-10-14T00:00:00Z' }, content_markdown: 'A concise introduction grounded in the selected role.', output_language: 'en', source_run_id: runId, partial: false }]) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/*/application`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? jobId;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id === jobId ? detail : applicationFor(id)) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/*/application-status`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const id = path.split('/').at(-2) ?? jobId;
    const body = route.request().postDataJSON() as { application_status: string };
    writes.push({ method: route.request().method(), path, body });
    const existing = applications.find(item => item.job_revision_id === id);
    if (existing) existing.stage = body.application_status as typeof existing.stage;
    if (id === jobId) detail.stage = body.application_status;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_revision_id: id, application_status: body.application_status }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/*/application/contact`, async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    writes.push({ method: route.request().method(), path, body });
    Object.assign(detail.contact, body);
    detail.events.unshift({ id: `66666666-6666-4666-8666-${String(detail.events.length + 665).padStart(12, '0')}`, kind: 'contact_updated', actor: 'user', payload: body, created_at: '2026-10-16T01:00:00Z' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });
  await page.route(`**/api/v1/projects/${projectId}/jobs/*/application/events`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as { kind: string; [key: string]: unknown };
    writes.push({ method: route.request().method(), path, body });
    const event = { id: `66666666-6666-4666-8666-${String(detail.events.length + 665).padStart(12, '0')}`, kind: body.kind, actor: 'user', payload: Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'kind')), created_at: '2026-10-16T02:00:00Z' };
    detail.events.unshift(event);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(event) });
  });

  return { projectId, jobId, secondJobId, hostileJobId, evaluationSessionId, evaluationCvRevisionId, writes, jobRows };
}
