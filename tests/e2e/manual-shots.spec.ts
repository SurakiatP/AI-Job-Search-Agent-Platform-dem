// Tooling, not a test: refreshes the pictures used by the in-app manual from synthetic data.
// Run: MANUAL_SHOTS=1 JSP_E2E_BASE_URL=http://127.0.0.1:4175 npm test --prefix tests -- manual-shots.spec.ts
import { test, type Locator, type Page } from '@playwright/test';
import { useSyntheticApplication, projectId, sessionId } from '../fixtures/application';
import { ring, showTemplate, templateGallery } from '../fixtures/manualRing';
import { boot, practiceApi, setId } from '../fixtures/practice';
import { builderScene, cvId, evaluationScene, experienceScene, feedbackScene, tailorScene } from '../fixtures/manualScenes';
import { builderApi } from '../fixtures/builder';

// Each picture circles what the page's steps tell the reader to use (Thai | English label).
const marks: Record<string, (page: Page) => Locator[]> = {
  signup: p => [p.locator('form button[type=submit]').first()],
  projects: p => [p.getByRole('link', { name: /โปรเจกต์ใหม่|สร้างโปรเจกต์|New project|Create project/i }).first()],
  profile: p => [p.getByRole('button', { name: /^เพิ่ม CV$|^Add CV$|อัปโหลด CV|Upload/i }).first(), p.getByRole('tab', { name: /คลังประสบการณ์|Experience/i })],
  search: p => [p.getByText(/^Smart match$/).first(), p.getByPlaceholder(/Frontend/).first()],
  session: p => [p.getByRole('button', { name: /ประเมินงานนี้|Evaluate this job/i }).first()],
  'practice-tab': p => [p.getByRole('button', { name: /ชุดซ้อมใหม่|สร้างชุดซ้อม|New practice set/i }).first()],
  'practice-set': p => [p.locator('textarea').first(), p.getByRole('button', { name: /บันทึกคำตอบ|Save answer/i }).first()],
  applications: p => [p.getByText(/^(บอร์ด|Board)$/).first(), p.getByText(/^(เพิ่มประกาศงาน|Add posting)$/i).first()],
  alerts: p => [p.getByRole('combobox').last(), p.locator('button:has(svg.lucide-mail)').first()],
  'build-start': p => [p.getByRole('dialog').getByRole('button').last()],
  'build-editor': p => [p.getByLabel(/ชื่อ-นามสกุล|Full name/).first(), p.getByRole('button', { name: /^(อัปเดตพรีวิว|Update preview)$/ }).first()],
  'build-template': p => [p.getByRole('button', { name: /Lotus/ }).first(), p.getByLabel(/ภาษาของ CV|CV language/).first()],
  'ai-evaluation': p => [p.getByText(/ควรสมัคร: ทักษะหลัก|Worth applying: most core/).first()],
  'ai-tailor': p => [p.getByRole('button', { name: /^(ใช้ข้อเสนอที่เลือก|Apply selected)$/ })],
  'ai-feedback': p => [p.getByRole('region', { name: /ความเห็นจาก AI|AI feedback/ }).getByRole('heading').first()],
  'ai-experience': p => [p.getByRole('button', { name: /AI/ }).first()],
  settings: p => [p.getByRole('link', { name: /ความปลอดภัยของบัญชี|Account security/i }).first()],
};

const shots: [string, string][] = [
  ['signup', '/signup'],
  ['projects', '/app/projects'],
  ['overview', `/app/projects/${projectId}/overview`],
  ['profile', `/app/projects/${projectId}/profile`],
  ['search', `/app/projects/${projectId}/search`],
  ['session', `/app/projects/${projectId}/sessions/${sessionId}`],
  ['applications', `/app/projects/${projectId}/applications`],
  ['settings', '/app/settings'],
  ['practice-tab', `/app/projects/${projectId}/sessions/${sessionId}?tab=practice`],
  ['practice-set', `/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`],
  ['alerts', `/app/projects/${projectId}/search`],
  ['build-start', `/app/projects/${projectId}/overview`],
  ['build-editor', `/app/projects/${projectId}/cvs/${cvId}/builder`],
  ['build-template', `/app/projects/${projectId}/cvs/${cvId}/builder`],
  ['build-gallery', '/'],
  ['ai-evaluation', `/app/projects/${projectId}/sessions/${sessionId}`],
  ['ai-tailor', `/app/projects/${projectId}/sessions/${sessionId}`],
  ['ai-feedback', `/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`],
  ['ai-experience', `/app/projects/${projectId}/profile?tab=experience`],
];

async function alertsApi(page: Page) {
  const row = { id: '00000000-0000-4000-8000-000000000001', name: 'Data analyst in Bangkok', filters: { q: 'Data analyst', city: 'Bangkok' }, frequency: 'daily', digest_enabled: true, push_enabled: false, next_run_at: '2026-10-22T01:00:00Z', last_sent_at: '2026-10-21T01:00:00Z', created_at: '2026-10-15T00:00:00Z' };
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`**/v1/projects/${projectId}/job-search**`, r => r.fulfill(json(r.request().url().includes('/facets') ? { total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 0, thai_postings: 0 } : { items: [], total: 0, limit: 20, offset: 0 })));
  await page.route(`**/v1/projects/${projectId}/webhooks`, r => r.fulfill(json([])));
  await page.route(`**/v1/projects/${projectId}/saved-searches**`, r => r.fulfill(json({ items: [row], status: { email_verified: true, notifications_enabled: true } })));
}

test.skip(!process.env.MANUAL_SHOTS, 'manual picture refresh only');
for (const locale of ['th', 'en'] as const) {
  for (const [name, path] of shots) {
    test(`manual picture ${name} ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      if (name === 'ai-feedback') await feedbackScene(page, locale);
      else if (name.startsWith('practice')) { await boot(page); await practiceApi(page, {}); } else await useSyntheticApplication(page);
      if (name === 'build-start') await builderApi(page);
      if (name === 'build-editor' || name === 'build-template') await builderScene(page, locale);
      if (name === 'ai-evaluation') await evaluationScene(page, locale);
      if (name === 'ai-tailor') await tailorScene(page, locale);
      if (name === 'ai-experience') await experienceScene(page, locale);
      if (name === 'signup') await page.route('**/v1/auth/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"unauthorized"}' }));
      await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale); // after boot(): it sets its own locale
      if (name === 'alerts') await alertsApi(page);
      if (name === 'build-gallery') {
        await page.setViewportSize({ width: 1280, height: 640 });
        await templateGallery(page, locale, { photo: locale === 'th' ? 'มีรูป' : 'Photo', two: locale === 'th' ? 'สองคอลัมน์' : 'Two columns' });
        await page.screenshot({ path: `../frontend/public/manual/build-gallery.${locale}.png`, fullPage: true });
        return;
      }
      await page.goto(path);
      await page.waitForTimeout(1200);
      if (name === 'search') { await page.getByRole('button', { name: /ดูข้อมูลตัวอย่าง|sample/i }).click(); await page.waitForTimeout(600); }
      if (name === 'build-editor' || name === 'build-template') {
        await page.getByRole('button', { name: /^(อัปเดตพรีวิว|Update preview)$/ }).waitFor();
        if (name === 'build-template') await page.getByRole('button', { name: /Lotus/ }).first().click();
        await page.getByText(/^(บันทึกแล้ว|Saved)/).first().waitFor();
        await showTemplate(page, name === 'build-template' ? 'lotus' : 'onyx', locale);
      }
      if (name === 'build-start') { await page.getByRole('button', { name: /สร้าง CV|Build a CV/ }).first().click(); await page.waitForTimeout(500); }
      if (name === 'ai-tailor') {
        await page.getByRole('tab').nth(1).click();
        await page.getByLabel(/^(เลือกเอง|Interactive)/).check();
        await page.getByRole('button', { name: /^(ปรับ CV|Tailor CV)$/ }).click();
        await page.getByRole('button', { name: /^(ใช้ข้อเสนอที่เลือก|Apply selected)$/ }).waitFor();
        await page.getByRole('checkbox', { name: /(เลือกข้อเสนอ|Select proposal) 1/ }).check();
      }
      if (name === 'ai-feedback') await page.getByRole('region', { name: /ความเห็นจาก AI|AI feedback/ }).evaluate(el => el.scrollIntoView({ block: 'start' }));
      if (marks[name]) { if (name !== 'ai-feedback') await marks[name](page)[0].first().scrollIntoViewIfNeeded(); await ring(page, marks[name](page)); }
      const text = await page.locator('body').innerText();
      if (/ไม่สามารถโหลด|ไม่สำเร็จ|Could not load|Failed to load|couldn.t load/i.test(text)) throw new Error(`${name}.${locale} shows an error, not a usable picture`);
      await page.screenshot({ path: `../frontend/public/manual/${name}.${locale}.png` });
    });
  }
}
