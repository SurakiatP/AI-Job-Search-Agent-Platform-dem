import { expect, test, type Page } from '@playwright/test';
import { projectId, useSyntheticApplication } from '../fixtures/application';

async function connectInfo(page: Page, share_origin: string | null, oauth = false) {
  await page.route('**/v1/connect', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ share_origin, oauth }) }));
}

const url = `/app/projects/${projectId}/console?tab=connect`;

test('a user picks an assistant and gets its own setup with the real share address', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { admin: false });
  await connectInfo(page, 'https://agents.example.test', true);
  await page.goto(url);
  await expect(page.getByRole('status').filter({ hasText: 'Ready to connect' })).toBeVisible();
  const picker = page.getByLabel('Choose your assistant');
  await expect(picker.locator('option')).toHaveCount(11);
  // Hermes is first: MCP and A2A in one config file
  await expect(page.getByRole('heading', { name: 'Hermes Agent', level: 3 })).toBeVisible();
  await expect(page.locator('pre[aria-label="Add to the Hermes config"]')).toContainText('url: "https://agents.example.test/mcp"');
  await expect(page.locator('pre[aria-label="Add to the Hermes config"]')).toContainText('url: "https://agents.example.test"');
  await expect(page.getByText('~/.hermes/config.yaml')).toBeVisible();

  await picker.selectOption('claude-code');
  await expect(page.locator('pre[aria-label="Command"]')).toContainText('claude mcp add --transport http job-search https://agents.example.test/mcp');
  await picker.selectOption('codex');
  await expect(page.locator('pre[aria-label="Command"]')).toContainText('--bearer-token-env-var JOB_SEARCH_TOKEN');
  await picker.selectOption('vscode');
  await expect(page.locator('pre[aria-label="Config file"]')).toContainText('${input:job-search-token}');
  await picker.selectOption('chatgpt');
  await expect(page.getByText(/public https domain/)).toHaveCount(0); // https share origin: no warning
  await picker.selectOption('rest');
  await expect(page.locator('pre[aria-label="Example: list the work you started"]')).toContainText(`/v1/projects/${projectId}/runs`);
  await expect(page.getByText('--enable-sharing')).toHaveCount(0); // server commands are not for users

  await page.reload(); // the choice is remembered
  await expect(page.getByLabel('Choose your assistant')).toHaveValue('rest');
  await page.getByRole('button', { name: 'Issue access token' }).click();
  await expect(page).toHaveURL(/tab=agents/);
});

test('web assistants warn while the share address is local', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page, { admin: false });
  await connectInfo(page, 'http://127.0.0.1:8011');
  await page.goto(url);
  await page.getByLabel('Choose your assistant').selectOption('claude-ai');
  await expect(page.getByRole('note').filter({ hasText: 'public https domain' })).toBeVisible();
  await page.getByLabel('Choose your assistant').selectOption('cursor');
  await expect(page.getByRole('note').filter({ hasText: 'public https domain' })).toHaveCount(0);
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
