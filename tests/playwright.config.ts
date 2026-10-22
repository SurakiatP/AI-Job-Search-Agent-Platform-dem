import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/tmp/job-search-platform-playwright',
  use: { baseURL: process.env.JSP_E2E_BASE_URL ?? 'http://127.0.0.1:4175', headless: true },
  webServer: process.env.JSP_E2E_BASE_URL ? undefined : {
    command: 'rtk proxy npm run dev --prefix ../frontend -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/tests/shell.html',
    reuseExistingServer: false,
  },
});
