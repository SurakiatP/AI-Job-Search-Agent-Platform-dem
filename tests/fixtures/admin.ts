import type { Page } from '@playwright/test';
import { useSyntheticApplication } from './application';

export const adminEmail = 'ops@example.test';
const adminUser = { id: '99999999-0000-4000-8000-0000000000aa', email: adminEmail, locale: 'en', email_verified: true, is_admin: true, created_at: '2026-10-01T00:00:00Z' };

/** Signs in as an admin. Every other /v1 call answers [] until a spec routes it (later routes win), so admin specs only mock their own endpoints. */
export async function mockAdminAccount(page: Page) {
  await page.addInitScript(() => { if (!localStorage.getItem('ui.locale')) localStorage.setItem('ui.locale', 'en'); });
  await page.route('**/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/v1/auth/session', route => route.fulfill({ json: { csrf_token: 'synthetic-test-csrf', expires_at: '2030-01-01T00:00:00Z', user: adminUser } }));
}

/** Signs in as an ordinary user with the synthetic projects, sessions and jobs of fixtures/application.ts. */
export async function mockNormalAccount(page: Page) {
  await page.addInitScript(() => { if (!localStorage.getItem('ui.locale')) localStorage.setItem('ui.locale', 'en'); });
  await useSyntheticApplication(page, { admin: false });
}
