import type { Page } from '@playwright/test';
import { documentId, projectId, useSyntheticApplication } from './application';

const cvIds = {
  analytics: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  product: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  new: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
const revisionIds = {
  analyticsOld: '11111111-aaaa-4111-8111-111111111111',
  analyticsCurrent: '22222222-aaaa-4222-8222-222222222222',
  productOld: '11111111-bbbb-4111-8111-111111111111',
  productCurrent: '22222222-bbbb-4222-8222-222222222222',
  documentOld: '33333333-aaaa-4333-8333-333333333333',
  documentCurrent: '44444444-aaaa-4444-8444-444444444444',
  oldJob: '88888888-aaaa-4888-8888-888888888888',
  currentJob: '99999999-aaaa-4999-8999-999999999999',
};

const cvRevision = (id: string, revision: number) => ({
  id, revision, created_at: `2026-10-${String(revision + 1).padStart(2, '0')}T00:00:00Z`,
  original_filename: `cv-revision-${revision}.txt`, mime_type: 'text/plain', size_bytes: 2048,
  file_id: `55555555-aaaa-4555-8555-${String(revision).padStart(12, '0')}`,
});

export type MaterialsFixture = {
  mutations: Array<{ method: string; path: string; body?: unknown }>;
  cvIds: typeof cvIds;
  revisionIds: typeof revisionIds;
};

/** Install contract-shaped materials data. This module only exports a fixture; it never registers tests. */
export async function useMaterialsFixture(page: Page, options: { emptyCvs?: boolean } = {}): Promise<MaterialsFixture> {
  await useSyntheticApplication(page);
  const mutations: MaterialsFixture['mutations'] = [];
  const cvs = options.emptyCvs ? [] : [
    { id: cvIds.analytics, name: 'Senior Data Analyst', is_primary: true, in_use: false, revision_count: 9, latest_revision: cvRevision(revisionIds.analyticsCurrent, 9) },
    { id: cvIds.product, name: 'Product Analytics', is_primary: false, in_use: false, revision_count: 4, latest_revision: cvRevision(revisionIds.productCurrent, 4) },
  ];
  const preferences = { project_id: projectId, output_language: 'en', notifications_enabled: true, submit_autopilot_daily_limit: null as number | null };
  const experience = {
    items: [
      { id: 'experience-1', kind: 'experience', text: 'Built revenue dashboards used by 18 regional teams', role: 'Senior Data Analyst', organization: 'Siam Commerce', period: '2022–2025', source: 'cv', source_cv_id: cvIds.analytics, source_cv_name: 'Senior Data Analyst', created_at: '2026-10-12T00:00:00Z' },
      { id: 'experience-2', kind: 'skill', text: 'SQL, dbt and BigQuery', role: null, organization: null, period: null, source: 'owner', source_cv_id: null, source_cv_name: null, created_at: '2026-10-13T00:00:00Z' },
    ], extraction: null, provider_configured: true,
  };
  const document = {
    id: documentId, document_type: 'cover_letter', title: 'Data Analyst — Example Co', output_language: 'en', partial: false,
    content_markdown: 'Current revision: led the migration to dbt.', source_run_id: null,
    latest_revision: { id: revisionIds.documentCurrent, revision: 8, created_at: '2026-10-14T00:00:00Z', source_cv_revision_id: revisionIds.analyticsCurrent, file_id: '66666666-aaaa-4666-8666-666666666666' },
  };
  const revisions = [
    { id: revisionIds.documentOld, document_id: documentId, revision: 3, created_at: '2026-10-08T00:00:00Z', source_cv_revision_id: revisionIds.productCurrent, source_job_revision_id: revisionIds.oldJob, file_id: null, content_markdown: 'Earlier revision: prepared weekly product reports.' },
    { ...document.latest_revision, document_id: documentId, source_job_revision_id: revisionIds.currentJob, content_markdown: document.content_markdown },
  ];
  const trash = [{ id: '77777777-7777-4777-8777-777777777777', document_type: 'other', title: 'Old portfolio note', trashed_at: '2026-10-10T00:00:00Z' }];

  await page.route(`**/api/v1/projects/${projectId}/cvs**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() as Record<string, unknown> : undefined;
    if (request.method() !== 'GET') mutations.push({ method: request.method(), path, body });
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cvs) });
    if (request.method() === 'PATCH') {
      const cv = cvs.find(item => path.endsWith(item.id));
      if (!cv) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (typeof body?.name === 'string') cv.name = body.name;
      if (body?.is_primary === true) cvs.forEach(item => { item.is_primary = item.id === cv.id; });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cv) });
    }
    if (request.method() === 'POST') {
      const created = { id: cvIds.new, name: 'research-cv', is_primary: false, in_use: false, revision_count: 1, latest_revision: cvRevision('33333333-cccc-4333-8333-333333333333', 1) };
      cvs.push(created);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fallback();
  });
  await page.route(`**/api/v1/projects/${projectId}/cvs/*/revisions`, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      mutations.push({ method: request.method(), path: new URL(request.url()).pathname.replace('/api/v1', '') });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(cvRevision('33333333-cccc-4333-8333-333333333333', 10)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/v1/projects/${projectId}/preferences`, async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutations.push({ method: request.method(), path: `/projects/${projectId}/preferences`, body });
      Object.assign(preferences, body);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preferences) });
  });
  await page.route(`**/api/v1/projects/${projectId}/experience`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(experience) }));
  await page.route(`**/api/v1/projects/${projectId}/documents`, async route => {
    if (new URL(route.request().url()).pathname.endsWith('/trash')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trash) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([document]) });
  });
  await page.route(`**/api/v1/projects/${projectId}/documents/${documentId}/revisions`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(revisions) }));
  await page.route(`**/api/v1/projects/${projectId}/cv`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cvRevision(revisionIds.analyticsOld, 3), cvRevision(revisionIds.analyticsCurrent, 9), cvRevision(revisionIds.productCurrent, 4)]) }));
  return { mutations, cvIds, revisionIds };
}

export { documentId, projectId };
