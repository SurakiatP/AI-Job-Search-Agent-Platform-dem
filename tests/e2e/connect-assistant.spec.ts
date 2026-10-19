import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

async function connectInfo(page: Page, share_origin: string | null, oauth = false) {
  await page.route('**/api/v1/connect', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ share_origin, oauth }) }));
}

const url = `/app/projects/${projectId}/console?tab=connect`;

test('a user sees MCP, A2A and REST details with the real share address', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { admin: false });
  await connectInfo(page, 'https://agents.example.test', true);
  await page.goto(url);
  await expect(page.getByRole('status').filter({ hasText: 'Ready to connect' })).toBeVisible();
  await expect(page.getByText('https://agents.example.test/mcp', { exact: true })).toBeVisible();
  await expect(page.getByText('https://agents.example.test/.well-known/agent-card.json', { exact: true })).toBeVisible();
  await expect(page.locator('pre[aria-label="Claude Code command"]')).toContainText('claude mcp add --transport http job-search https://agents.example.test/mcp');
  await expect(page.getByText(/MCP sign-in \(OAuth\)/)).toBeVisible();
  await expect(page.locator('pre[aria-label="Example: list the work you started"]')).toContainText(`/api/v1/projects/${projectId}/runs`);
  await expect(page.getByText('--enable-sharing')).toHaveCount(0); // server commands are not for users
  await page.getByRole('button', { name: 'Issue access token' }).click();
  await expect(page).toHaveURL(/tab=agents/);
});

test('when sharing is off a user is told to ask the administrator', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { admin: false });
  await connectInfo(page, null);
  await page.goto(url);
  await expect(page.getByText('Ask your administrator to turn this on.')).toBeVisible();
  await expect(page.getByText(/--enable-sharing/)).toHaveCount(0);
});

test('when sharing is off an administrator gets the start command', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { admin: true });
  await connectInfo(page, null);
  await page.goto(url);
  await expect(page.locator('pre[aria-label="Open the connection channel (administrator)"]')).toContainText('--enable-sharing');
});

test('the Connect tab fits a phone in Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await connectInfo(page, 'https://agents.example.test');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.getByRole('status').filter({ hasText: 'พร้อมเชื่อมต่อ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
