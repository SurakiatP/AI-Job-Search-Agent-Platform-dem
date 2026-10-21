// Tooling, not a test: refreshes the pictures used by the in-app manual from synthetic data.
// Run: MANUAL_SHOTS=1 JSP_E2E_BASE_URL=http://127.0.0.1:4175 npm test --prefix tests -- manual-shots.spec.ts
import { test } from '@playwright/test';
import { useSyntheticApplication, projectId, sessionId } from '../fixtures/application';

const shots: [string, string][] = [
  ['signup', '/signup'],
  ['projects', '/app/projects'],
  ['overview', `/app/projects/${projectId}/overview`],
  ['profile', `/app/projects/${projectId}/profile`],
  ['search', `/app/projects/${projectId}/search`],
  ['session', `/app/projects/${projectId}/sessions/${sessionId}`],
  ['applications', `/app/projects/${projectId}/applications`],
  ['settings', '/app/settings'],
];

test.skip(!process.env.MANUAL_SHOTS, 'manual picture refresh only');
for (const locale of ['th', 'en'] as const) {
  for (const [name, path] of shots) {
    test(`manual picture ${name} ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
      await useSyntheticApplication(page);
      await page.goto(path);
      await page.waitForTimeout(1200);
      if (name === 'search') { await page.getByRole('button', { name: /ดูข้อมูลตัวอย่าง|sample/i }).click(); await page.waitForTimeout(600); }
      const text = await page.locator('body').innerText();
      if (/ไม่สามารถโหลด|ไม่สำเร็จ|Could not load|Failed to load|couldn.t load/i.test(text)) throw new Error(`${name}.${locale} shows an error, not a usable picture`);
      await page.screenshot({ path: `../frontend/public/manual/${name}.${locale}.png` });
    });
  }
}
