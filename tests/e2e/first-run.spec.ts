import { expect, test, type Page } from '@playwright/test';

// CH-01 / CH-02 / CH-10: sign up -> code -> signed in -> first project -> Today; plus the inline email code in the banner.
const newId = '33333333-3333-4333-8333-333333333333';
const user = { id: '99999999-0000-4000-8000-000000000002', email: 'new@example.test', locale: 'en', created_at: '2026-10-01T00:00:00Z' };
const err = (code: string) => JSON.stringify({ code, message_key: `errors.${code}`, retryable: false });

async function mock(page: Page, opts: { loginOk?: boolean; verified?: boolean; failCreates?: number; locale?: 'en' | 'th' } = {}) {
  const state = { authed: false, projects: [] as { id: string; name: string; created_at: string }[], posts: [] as string[], logins: 0, verified: opts.verified ?? true, failCreates: opts.failCreates ?? 0 };
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), opts.locale ?? 'en');
  await page.route('**/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/v1', '');
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const account = () => ({ ...user, email_verified: state.verified });
    if (path === '/auth/session') return state.authed ? json(200, { csrf_token: 'csrf', expires_at: '2030-01-01T00:00:00Z', user: account() }) : route.fulfill({ status: 401, contentType: 'application/json', body: err('unauthorized') });
    if (path === '/auth/signup') return json(202, { status: 'check_email' });
    if (path === '/auth/verify-email/code') {
      if (req.postDataJSON().code !== '654321') return route.fulfill({ status: 400, contentType: 'application/json', body: err('invalid_code') });
      state.verified = true; return route.fulfill({ status: 204 });
    }
    if (path === '/auth/login') {
      state.logins += 1;
      if (opts.loginOk === false) return route.fulfill({ status: 401, contentType: 'application/json', body: err('invalid_credentials') });
      state.authed = true; return json(200, { csrf_token: 'csrf', user: account() });
    }
    if (path === '/projects' && req.method() === 'POST') {
      state.posts.push(req.postDataJSON().name);
      if (state.failCreates > 0) { state.failCreates -= 1; return json(500, { code: 'internal_error', message_key: 'errors.request_failed', retryable: true }); }
      const project = { id: newId, name: req.postDataJSON().name, created_at: '2026-10-01T00:00:00Z' };
      state.projects.push(project); return json(201, project);
    }
    if (path === '/projects') return json(200, state.projects);
    if (path === `/projects/${newId}`) return json(200, state.projects[0]);
    if (path === `/projects/${newId}/sessions`) return json(200, []);
    return json(200, []);
  });
  return state;
}

async function signUpWithCode(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-pass');
  await page.getByRole('button', { name: /Create account|Sign up/ }).click();
  await page.getByLabel('6-digit code from the email').fill('654321');
  await page.getByRole('button', { name: 'Verify email' }).click();
}

test('sign up, code, automatic sign-in, first project, Today', async ({ page }) => {
  const state = await mock(page);
  await signUpWithCode(page);
  await expect(page).toHaveURL(new RegExp(`/app/projects/${newId}/overview$`));
  expect(state.logins).toBe(1);
  expect(state.posts).toEqual(['My job search']);
});

test('the Thai interface names the first project in Thai', async ({ page }) => {
  const state = await mock(page, { locale: 'th' });
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill('new@example.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('long-enough-pass');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.goto('/app');
  await expect(page).toHaveURL(new RegExp(`/overview$`));
  expect(state.posts).toEqual(['การหางานของฉัน']);
});

test('if automatic sign-in fails, login opens with the email filled', async ({ page }) => {
  await mock(page, { loginOk: false });
  await signUpWithCode(page);
  await expect(page).toHaveURL(/\/login\?notice=verified/);
  await expect(page.getByLabel('Email')).toHaveValue('new@example.test');
  await expect(page.getByText('Email verified. You can log in now.')).toBeVisible();
});

test('a failed first-project create shows a retry and a manual link; retry makes exactly one project', async ({ page }) => {
  const state = await mock(page, { failCreates: 1 });
  await signUpWithCode(page);
  await expect(page.getByText('We could not set up your first project')).toBeVisible();
  await expect(page.getByRole('link', { name: 'create a project yourself.' })).toHaveAttribute('href', '/app/projects/new');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${newId}/overview$`));
  expect(state.posts).toHaveLength(2);
});

test('opening /app with no project creates one project, not two', async ({ page }) => {
  const state = await mock(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/overview$`));
  expect(state.posts).toHaveLength(1);
});

test('the project list stays empty when someone opens it on purpose', async ({ page }) => {
  const state = await mock(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(/\/app/);
  await expect.poll(() => state.posts.length).toBe(1); // let the first-visit project finish before the reset
  state.posts.length = 0; state.projects.length = 0;
  await page.goto('/app/projects');
  await expect(page).toHaveURL(/\/app\/projects$/);
  await page.waitForTimeout(300);
  expect(state.posts).toHaveLength(0);
});

test('banner: a wrong code shows an error, the right one confirms in place', async ({ page }) => {
  await mock(page, { verified: false });
  await page.goto('/login');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  const banner = page.getByRole('region', { name: 'Email' });
  await expect(banner).toBeVisible();
  const code = banner.getByLabel('6-digit code');
  await code.fill('111111');
  await banner.getByRole('button', { name: 'Confirm' }).click();
  await expect(banner.getByRole('alert')).toContainText('That code is wrong or has expired');
  await code.fill('654321');
  await banner.getByRole('button', { name: 'Confirm' }).click();
  await expect(banner).toHaveCount(0);
});
