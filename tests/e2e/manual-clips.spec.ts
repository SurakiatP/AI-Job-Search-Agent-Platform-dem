// Tooling, not a test: records the short clips used by the in-app manual from synthetic data (webm; convert with ffmpeg).
// Run: MANUAL_SHOTS=1 JSP_E2E_BASE_URL=http://127.0.0.1:4175 npm test --prefix tests -- manual-clips.spec.ts
import { test, type Page } from '@playwright/test';
import { useSyntheticApplication, projectId, sessionId } from '../fixtures/application';
import { boot, practiceApi, setId } from '../fixtures/practice';

test.skip(!process.env.MANUAL_SHOTS, 'manual clip refresh only');
test.use({ viewport: { width: 1280, height: 800 }, video: { mode: 'on', size: { width: 1280, height: 800 } } });

// A blue dot follows the pointer so a viewer can see where the click happens.
const cursor = () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(43,69,196,.45);border:2px solid #2B45C4;pointer-events:none;transition:transform .05s;left:-50px;top:-50px';
  addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));
  addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
};
async function glide(page: Page, locator: ReturnType<Page['locator']>) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(350);
}

for (const locale of ['th', 'en'] as const) {
  test(`clip practice ${locale}`, async ({ page }) => {
    await boot(page); await practiceApi(page, {});
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale); await page.addInitScript(cursor);
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`);
    await page.waitForTimeout(1200);
    const answer = page.locator('textarea').first();
    await glide(page, answer); await answer.click();
    await page.keyboard.type(locale === 'th' ? 'ผมทำชุดทดสอบ 500 ข้อ แล้วเทียบผลก่อนเลือกโมเดล' : 'I built a 500-question test set and compared results before choosing the model.', { delay: 35 });
    await page.waitForTimeout(900);
    const video = page.video()!; await page.close(); await video.saveAs(`/tmp/manual-clips/practice.${locale}.webm`);
  });
  test(`clip search ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page);
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale); await page.addInitScript(cursor);
    await page.goto(`/app/projects/${projectId}/search`);
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /ดูข้อมูลตัวอย่าง|sample/i }).click(); await page.waitForTimeout(900);
    const box = page.getByPlaceholder(/Frontend/).first();
    await glide(page, box); await box.click();
    await page.keyboard.type('Frontend', { delay: 90 }); await page.waitForTimeout(1400);
    const video = page.video()!; await page.close(); await video.saveAs(`/tmp/manual-clips/search.${locale}.webm`);
  });
  test(`clip applications ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page);
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale); await page.addInitScript(cursor);
    await page.goto(`/app/projects/${projectId}/applications`);
    await page.waitForTimeout(1200);
    await glide(page, page.getByRole('button', { name: /บอร์ด|Board/ })); await page.getByRole('button', { name: /บอร์ด|Board/ }).click();
    await page.waitForTimeout(1600);
    const video = page.video()!; await page.close(); await video.saveAs(`/tmp/manual-clips/applications.${locale}.webm`);
  });
}
