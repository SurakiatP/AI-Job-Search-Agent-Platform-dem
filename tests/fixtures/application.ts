import type { Page } from '@playwright/test';

export const projectId = '11111111-1111-4111-8111-111111111111';
export const secondProjectId = '99999999-9999-4999-8999-999999999999';
export const sessionId = '22222222-2222-4222-8222-222222222222';
export const jobId = '33333333-3333-4333-8333-333333333333';
export const documentId = '44444444-4444-4444-8444-444444444444';

const project = { id: projectId, name: 'Synthetic analyst search', created_at: '2026-10-01T00:00:00Z' };
const secondProject = { id: secondProjectId, name: 'Second synthetic project', created_at: '2026-10-02T00:00:00Z' };
const session = { id: sessionId, project_id: projectId, title: 'First synthetic session', created_at: '2026-10-01T00:00:00Z' };
const job = { id: jobId, revision: 1, created_at: '2026-10-01T00:00:00Z', title: 'Synthetic data analyst', company: 'Example Co', source_url: 'https://jobs.example.test/analyst', description: 'Synthetic posting description.' };
const preview = '**Synthetic Thai experience** <img src=x onerror=alert(1)> Draft is incomplete.';

export async function useSyntheticApplication(page: Page, options: { emptyProjects?: boolean; missingJob?: boolean; unsafeJobSource?: boolean; emptyDocuments?: boolean; sessionErrorOnce?: boolean; projectErrorOnce?: boolean; revisionErrorOnce?: boolean } = {}) {
  let sessionFailuresRemaining = options.sessionErrorOnce ? 1 : 0;
  // StrictMode mounts resources twice during development, so fail both mount requests.
  let projectFailuresRemaining = options.projectErrorOnce ? 1 : 0;
  let revisionFailuresRemaining = options.revisionErrorOnce ? 1 : 0;
  let currentPreferences = { project_id: projectId, locale: 'th', output_language: 'th', notifications_enabled: true, updated_at: '2026-10-01T00:00:00Z' };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/owner/session') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrf_token: 'synthetic-test-csrf', expires_at: '2030-01-01T00:00:00Z' }) }); return; }
    if (path.endsWith('/runs') || path.endsWith('/approvals') || path.endsWith('/messages')) { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
    if (path === `/projects/${projectId}/sessions` && sessionFailuresRemaining > 0) {
      sessionFailuresRemaining -= 1;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message_key: 'service.unavailable', retryable: true, correlation_id: '55555555-5555-4555-8555-555555555555' }) });
      return;
    }
    if (path === `/projects/${projectId}` && projectFailuresRemaining > 0) {
      projectFailuresRemaining -= 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal_error', message_key: 'service.unavailable', retryable: true }) });
      return;
    }
    if (path === `/projects/${projectId}/documents/${documentId}/revisions` && revisionFailuresRemaining > 0) {
      revisionFailuresRemaining -= 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal_error', message_key: 'service.unavailable', retryable: true }) });
      return;
    }
    if (route.request().method() === 'POST' && path === '/projects') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(project) });
      return;
    }
    if (route.request().method() === 'POST' && path === `/projects/${projectId}/sessions`) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(session) });
      return;
    }
    if (route.request().method() === 'POST' && path === `/projects/${projectId}/cv`) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '66666666-6666-4666-8666-666666666666', revision: 1 }) });
      return;
    }
    if (route.request().method() === 'PATCH' && path === `/projects/${projectId}/preferences`) {
      currentPreferences = { ...currentPreferences, ...JSON.parse(route.request().postData() ?? '{}') };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentPreferences) });
      return;
    }
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ project_id: projectId }) });
      return;
    }
    const data: Record<string, unknown> = {
      '/projects': options.emptyProjects ? [] : [project, secondProject],
      [`/projects/${projectId}`]: project,
      [`/projects/${projectId}/sessions`]: [session],
      [`/projects/${projectId}/preferences`]: currentPreferences,
      [`/projects/${secondProjectId}`]: secondProject,
      [`/projects/${secondProjectId}/sessions`]: [],
      [`/projects/${secondProjectId}/preferences`]: { project_id: secondProjectId, locale: 'en', output_language: 'en', notifications_enabled: true, updated_at: '2026-10-02T00:00:00Z' },
      [`/projects/${secondProjectId}/cv`]: [],
      [`/projects/${secondProjectId}/jobs`]: [],
      [`/projects/${secondProjectId}/documents`]: [],
      [`/projects/${projectId}/cv`]: [],
      [`/projects/${projectId}/jobs`]: options.missingJob ? [] : [options.unsafeJobSource ? { ...job, source_url: 'javascript:alert(1)' } : job],
      [`/projects/${projectId}/documents`]: options.emptyDocuments ? [] : [{ id: documentId, document_type: 'cover_letter', title: 'Synthetic cover letter', output_language: 'th', partial: true, content_markdown: preview, latest_revision: { id: '77777777-7777-4777-8777-777777777777', revision: 2, created_at: '2026-10-01T00:00:00Z' } }],
      [`/projects/${projectId}/documents/${documentId}/revisions`]: [{ id: '77777777-7777-4777-8777-777777777777', revision: 2, document_id: documentId, created_at: '2026-10-01T00:00:00Z', file_id: '88888888-8888-4888-8888-888888888888', content_markdown: preview }],
      [`/projects/${projectId}/settings/provider`]: { provider: null, model: null, configured: false, revision: null, masked_secret: null },
      '/tools': { tools: [] },
    };
    const body = data[path];
    if (body === undefined) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'not_found', message_key: 'resource.not_found', retryable: false, correlation_id: '55555555-5555-4555-8555-555555555555' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
