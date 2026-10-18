import type { Page } from '@playwright/test';
import { projectId, sessionId, useSyntheticApplication } from './application';

export const accessSurfaces = [
  { id: 'landing', route: '/', anonymous: true },
  { id: 'login', route: '/login', anonymous: true },
  { id: 'signup', route: '/signup', anonymous: true },
  { id: 'forgot-password', route: '/forgot-password', anonymous: true },
  { id: 'reset-password', route: '/reset-password?token=synthetic-reset', anonymous: true },
  { id: 'verify-email', route: '/verify-email?token=synthetic-verification', anonymous: true },
  { id: 'unsubscribe', route: '/digest/unsubscribe?token=synthetic-digest', anonymous: true },
  { id: 'account', route: '/app/account' },
  { id: 'consent', route: '/app/oauth/consent?request=synthetic-review' },
  { id: 'projects', route: '/app/projects' },
  { id: 'new-project', route: '/app/projects/new' },
  { id: 'evaluations', route: `/app/projects/${projectId}/sessions` },
  { id: 'overview', route: `/app/projects/${projectId}/overview` },
  { id: 'session', route: `/app/projects/${projectId}/sessions/${sessionId}` },
  { id: 'missing-route', route: '/unknown-synthetic-route' },
];

export async function useAccessFixture(page: Page, anonymous = false) {
  await useSyntheticApplication(page);
  if (anonymous) await page.route('**/api/v1/auth/session', route => route.fulfill({ status: 401, json: { code: 'unauthorized', message_key: 'errors.unauthorized', retryable: false } }));
  await page.route('**/api/v1/auth/verify-email', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/account/agents', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/public/job-stats', route => route.fulfill({ json: { total: 124, new_7d: 16, thai_postings: 21, categories: [{ value: 'data_analytics', count: 38 }] } }));
  await page.route('**/api/v1/oauth/requests/synthetic-review', route => route.fulfill({ json: {
    client_name: 'Synthetic review client', client_id_host: 'client.example.test', redirect_uri: 'http://127.0.0.1:33418/callback',
    requested_scopes: ['results:read', 'jobs:evaluate', 'applications:apply', 'applications:write'],
    projects: [{ id: projectId, name: 'Synthetic analyst search' }], expires_at: '2030-01-01T00:00:00Z',
  } }));
}
