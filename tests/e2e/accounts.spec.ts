import { expect, test, type Page } from '@playwright/test';

const user = { id: '99999999-0000-4000-8000-000000000001', email: 'synthetic@example.test', locale: 'en', created_at: '2026-10-01T00:00:00Z' };
const projectId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

async function mockApi(page: Page, verified: boolean) {
  let authed = false;
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/session') return authed ? json(200, { authenticated: true, csrf_token: 'csrf', expires_at: '2030-01-01T00:00:00Z', user: { ...user, email_verified: verified } }) : json(401, { code: 'unauthorized', message_key: 'errors.unauthorized', retryable: false });
    if (path === '/auth/login') {
      const body = route.request().postDataJSON();
      if (body.password !== 'correct-password') return json(401, { code: 'invalid_credentials', message_key: 'errors.invalid_credentials', retryable: false });
      authed = true;
      return json(200, { csrf_token: 'csrf', user: { ...user, email_verified: verified } });
    }
    if (path === '/auth/signup') return json(202, { status: 'check_email' });
    if (path === '/auth/verify-email') return route.request().postDataJSON().token === 'good-token' ? route.fulfill({ status: 204 }) : json(400, { code: 'invalid_token', message_key: 'errors.invalid_token', retryable: false });
    if (path === '/account/agents') return json(200, []);
    if (path === '/projects') return json(200, [{ id: projectId, name: 'Synthetic project', created_at: '2026-10-01T00:00:00Z' }]);
    if (path === `/projects/${projectId}`) return json(200, { id: projectId, name: 'Synthetic project', created_at: '2026-10-01T00:00:00Z' });
    if (path === `/projects/${projectId}/sessions`) return json(200, [{ id: sessionId, project_id: projectId, title: 'Synthetic session', created_at: '2026-10-01T00:00:00Z' }]);
    return json(200, []);
  });
}

test('landing start leads to login; wrong then right password reaches the requested page', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/app/account');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);
  await page.getByLabel('Email').fill('synthetic@example.test');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The email or password is not correct.');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByText('No connected agents')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend email' })).toHaveCount(0);
});

test('signup shows the check-email state and verify-email consumes then hides the token', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/signup');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto('/verify-email?token=good-token');
  await expect(page.getByText('Your email is confirmed.')).toBeVisible();
  expect(page.url()).not.toContain('token');
  await page.goto('/verify-email?token=bad');
  await expect(page.getByRole('alert')).toContainText('invalid or has expired');
});

test('unverified users see the banner and disabled run controls with an explanation', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/login?next=%2Fapp%2Fprojects%2F' + projectId + '%2Fsessions%2F' + sessionId);
  await page.getByLabel('Email').fill('synthetic@example.test');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Confirm your email to start runs and connect agents.')).toBeVisible();
  await page.goto(`/app/projects/${projectId}/console?tab=agents`);
  const issue = page.getByRole('button', { name: 'Issue token' });
  await expect(issue).toBeDisabled();
  await expect(issue).toHaveAttribute('title', 'Confirm your email to use this');
  await page.goto('/app/account');
  await expect(page.getByText('Not confirmed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend email' }).first()).toBeEnabled();
});

test('auth pages fit a 320px viewport without horizontal scroll', async ({ page }) => {
  await mockApi(page, true);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/login', '/signup', '/forgot-password', '/reset-password?token=x']) {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
