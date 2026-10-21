// Tooling, not a test: records the clips used by the in-app manual from synthetic data (webm; convert with ffmpeg).
// Each clip shows a blue pointer, an orange ring on what is used, and a step caption, so it reads without sound.
// Run: MANUAL_SHOTS=1 JSP_E2E_BASE_URL=http://127.0.0.1:4175 npm test --prefix tests -- manual-clips.spec.ts
import { test, type Locator, type Page } from '@playwright/test';
import { jobId, projectId, sessionId, useSyntheticApplication } from '../fixtures/application';
import { builderApi, cvId } from '../fixtures/builder';
import { boot, practiceApi, setId } from '../fixtures/practice';
import { caption, ring, showTemplate } from '../fixtures/manualRing';
import { evaluationScene, feedbackScene, tailorScene } from '../fixtures/manualScenes';

test.skip(!process.env.MANUAL_SHOTS, 'manual clip refresh only');
test.use({ viewport: { width: 1280, height: 800 }, video: { mode: 'on', size: { width: 1280, height: 800 } } });
test.setTimeout(120_000);

type Locale = 'th' | 'en';
const T = <A>(locale: Locale, th: A, en: A) => (locale === 'th' ? th : en);

// A blue dot follows the pointer so a viewer can see where the click happens.
const cursor = () => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(43,69,196,.45);border:2px solid #2B45C4;pointer-events:none;left:-50px;top:-50px';
  addEventListener('DOMContentLoaded', () => document.body.appendChild(dot));
  addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
};
const pause = (page: Page, ms = 1500) => page.waitForTimeout(ms);
async function glide(page: Page, target: Locator) {
  const box = (await target.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await pause(page, 400);
}
/** Say what to do, circle it, move the pointer to it, then do it. */
async function step(page: Page, text: string, target: Locator, act: 'click' | 'none' | ((t: Locator) => Promise<void>) = 'click', hold = 1800) {
  await caption(page, text);
  await target.first().evaluate(el => el.scrollIntoView({ block: 'center' }));
  await ring(page, [target]);
  await glide(page, target);
  await pause(page, hold / 2);
  if (act === 'click') await target.first().click(); else if (typeof act === 'function') await act(target);
  await pause(page, hold / 2);
}
const typeInto = (text: string, delay = 70) => async (t: Locator) => { await t.first().click(); await t.first().pressSequentially(text, { delay }); };
async function boots(page: Page, locale: Locale) {
  await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
  await page.addInitScript(cursor);
}
async function finish(page: Page, name: string, locale: Locale) {
  await pause(page, 1500);
  const video = page.video()!; await page.close(); await video.saveAs(`/tmp/manual-clips/${name}.${locale}.webm`);
}

for (const locale of ['th', 'en'] as const) {
  test(`clip build ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page); await builderApi(page);
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/overview`); await pause(page, 1500);
    await step(page, T(locale, '1. กดปุ่ม “สร้าง CV”', '1. Click “Build a CV”'), page.getByRole('button', { name: /สร้าง CV|Build a CV/ }).first());
    await step(page, T(locale, '2. ตั้งชื่อ CV แล้วกด “เริ่มสร้าง”', '2. Name your CV, then click “Start”'), page.getByRole('dialog').getByRole('button').last(), 'click', 3000);
    await page.waitForURL(/builder$/); await pause(page, 1500);
    await step(page, T(locale, '3. กรอกชื่อ-นามสกุล', '3. Enter your full name'), page.getByLabel(/ชื่อ-นามสกุล|Full name/).first(), typeInto(T(locale, 'สมชาย ทดสอบ', 'Somchai Example')));
    await step(page, T(locale, '4. ใส่ตำแหน่งที่ต้องการ', '4. Add the role you want'), page.getByLabel(/ตำแหน่งหรือคำแนะนำ|Headline/).first(), typeInto(T(locale, 'นักวิเคราะห์ข้อมูล', 'Data Analyst')));
    await step(page, T(locale, '5. ใส่อีเมลที่ใช้สมัครงาน', '5. Add the email you apply with'), page.getByLabel(/^(อีเมล|Email)/).first(), typeInto('somchai@example.com', 45));
    await step(page, T(locale, '6. กด “อัปเดตพรีวิว” เพื่อดูตัวอย่าง CV', '6. Click “Update preview” to see your CV'), page.getByRole('button', { name: /^(อัปเดตพรีวิว|Update preview)$/ }).first(), async t => { await t.click(); await showTemplate(page, 'onyx', locale); }, 3200);
    for (const [index, template] of ['Kakuna', 'Lotus', 'Saffron'].entries()) {
      await step(page, T(locale, `${7 + index}. ลองเทมเพลต ${template} แล้วดูพรีวิวเปลี่ยนตาม`, `${7 + index}. Try the ${template} template and watch the preview change`), page.getByRole('button', { name: new RegExp(template) }).first(),
        async t => { await t.click(); await showTemplate(page, template.toLowerCase(), locale); }, 3200);
    }
    await step(page, T(locale, '10. พอใจแล้วกด “บันทึกเป็นเวอร์ชันใหม่”', '10. Happy? Click “Save as new version”'), page.getByRole('button', { name: /บันทึกเป็นเวอร์ชันใหม่|Save as new version/ }).first(), 'click', 3500);
    await finish(page, 'build', locale);
  });

  test(`clip tailor ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page); await tailorScene(page, locale);
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`); await pause(page, 1800);
    const tab = page.getByRole('tab').nth(1);
    await step(page, T(locale, `1. เปิดแท็บ “${(await tab.innerText()).trim()}”`, `1. Open the “${(await tab.innerText()).trim()}” tab`), tab);
    const mode = page.getByLabel(/^(เลือกเอง|Interactive)/);
    await step(page, T(locale, '2. เลือกโหมด “เลือกเอง” เพื่อเลือกข้อเสนอเอง', '2. Choose “Interactive” to pick the changes yourself'), mode, async t => { await t.check(); }, 2600);
    await step(page, T(locale, '3. กด “ปรับ CV” แล้วรอเอเจนต์ทำงาน', '3. Click “Tailor CV” and let the agent work'), page.getByRole('button', { name: /^(ปรับ CV|Tailor CV)$/ }), 'click', 2500);
    await page.getByRole('button', { name: /^(ใช้ข้อเสนอที่เลือก|Apply selected)$/ }).waitFor();
    await caption(page, T(locale, '4. เอเจนต์เสนอข้อความใหม่ พร้อมหลักฐานจากคลังประสบการณ์ของคุณ', '4. The agent proposes new lines, each backed by your experience bank'));
    await page.getByRole('checkbox', { name: /(เลือกข้อเสนอ|Select proposal) 1/ }).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await pause(page, 3500);
    await step(page, T(locale, '5. ติ๊กเลือกข้อเสนอที่ต้องการ', '5. Tick the proposals you want'), page.getByRole('checkbox', { name: /(เลือกข้อเสนอ|Select proposal) 1/ }), async t => { await t.check(); }, 2800);
    await step(page, T(locale, '6. กด “ใช้ข้อเสนอที่เลือก” ระบบจะบันทึกเป็น CV เวอร์ชันใหม่', '6. Click “Apply selected” to save a new CV version'), page.getByRole('button', { name: /^(ใช้ข้อเสนอที่เลือก|Apply selected)$/ }), 'none', 4000);
    await finish(page, 'tailor', locale);
  });

  test(`clip evaluate ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page); await evaluationScene(page, locale);
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}`); await pause(page, 1800);
    await step(page, T(locale, '1. เอเจนต์ประเมินงานเทียบกับ CV แล้วให้คะแนน 1–5', '1. The agent compares the job with your CV and scores it 1–5'), page.getByText(/^4\.2$/).first(), 'none', 3800);
    await step(page, T(locale, '2. อ่านสรุปว่าควรสมัครหรือไม่ พร้อมเหตุผล', '2. Read the verdict and the reasons'), page.getByText(/ควรสมัคร: ทักษะหลัก|Worth applying: most core/).first(), 'none', 3800);
    await step(page, T(locale, '3. ดูทีละข้อว่า CV ของคุณตรง บางส่วน หรือยังไม่พบ', '3. See, requirement by requirement, what matches'), page.getByText('LLM pipelines / RAG').first(), 'none', 3800);
    await step(page, T(locale, '4. กรองดูเฉพาะข้อที่ “บางส่วน” เพื่อรู้ว่าต้องเสริมอะไร', '4. Filter “Partial” to see what to strengthen'), page.getByText(/^(บางส่วน|Partial)/).first(), 'click', 3800);
    await finish(page, 'evaluate', locale);
  });

  test(`clip practice ${locale}`, async ({ page }) => {
    await boot(page); const state = await practiceApi(page, {});
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/sessions/${sessionId}/practice/${setId}`); await pause(page, 1800);
    const answer = page.locator('textarea').first();
    await step(page, T(locale, '1. อ่านคำถาม แล้วพิมพ์คำตอบเหมือนพูดกับผู้สัมภาษณ์', '1. Read the question and type your answer as you would say it'), answer, typeInto(T(locale, 'ทีมอยากได้โมเดลใหญ่ที่สุด ผมสร้างชุดทดสอบ 500 ข้อและเทียบสามโมเดลก่อนตัดสินใจ', 'The team wanted the largest model. I built a 500-question test set and compared three models.'), 55), 1500);
    await step(page, T(locale, '2. กด “บันทึกคำตอบ”', '2. Click “Save answer”'), page.getByRole('button', { name: /^(บันทึกคำตอบ|Save answer)$/ }), 'click', 2500);
    const ask = page.getByRole('button', { name: /^(ขอความเห็นจาก AI|Get AI feedback)$/ });
    await step(page, T(locale, '3. กด “ขอความเห็นจาก AI” เอเจนต์จะอ่านคำตอบของคุณ', '3. Click “Get AI feedback” and the agent reads your answer'), ask, 'click', 2500);
    // the agent answers a moment later
    const attempts = state.questions[0].attempts;
    if (attempts?.[0]) attempts[0].feedback = (await import('../fixtures/manualScenes')).feedbackFor(locale);
    await page.getByRole('region', { name: /ความเห็นจาก AI|AI feedback/ }).waitFor({ timeout: 15000 });
    await page.getByRole('region', { name: /ความเห็นจาก AI|AI feedback/ }).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    await caption(page, T(locale, '4. ได้คะแนน 5 ด้าน แยกคำตอบตาม STAR และบอกสิ่งที่ควรเพิ่ม', '4. Five scores, your answer split by STAR, and what to add'));
    await pause(page, 5000);
    await finish(page, 'practice', locale);
  });

  test(`clip search ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page);
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/search`); await pause(page, 1500);
    await page.getByRole('button', { name: /ดูข้อมูลตัวอย่าง|sample/i }).click(); await pause(page, 1200);
    await step(page, T(locale, '1. พิมพ์ตำแหน่งหรือทักษะที่อยากหา', '1. Type the role or skill you want'), page.getByPlaceholder(/Frontend/).first(), typeInto('Frontend', 110), 2200);
    await step(page, T(locale, '2. ดูผลที่ตรงกับคำค้น แล้วเลือกงานที่สนใจ', '2. Browse the matches and pick a job'), page.getByRole('button', { name: /บันทึก|Save/ }).first(), 'none', 3200);
    await step(page, T(locale, '3. กด “ประเมินงานนี้” ให้เอเจนต์เทียบกับ CV ของคุณ', '3. Click “Evaluate this job” so the agent compares it with your CV'), page.getByRole('button', { name: /ประเมินงานนี้|Evaluate this job/ }).first(), 'none', 3800);
    await step(page, T(locale, '4. หรือสลับไปที่ “Smart match” ให้เอเจนต์จัดอันดับงานให้', '4. Or switch to “Smart match” to let the agent rank jobs'), page.getByText(/^Smart match$/).first(), 'click', 3500);
    await finish(page, 'search', locale);
  });

  test(`clip applications ${locale}`, async ({ page }) => {
    await useSyntheticApplication(page);
    await boots(page, locale);
    await page.goto(`/app/projects/${projectId}/applications`); await pause(page, 1800);
    await step(page, T(locale, '1. เห็นงานที่บันทึกไว้ทั้งหมดเป็นรายการ พร้อมขั้นตอนถัดไป', '1. All saved jobs in a list, each with its next step'), page.getByText(/Synthetic data analyst/).first(), 'none', 3500);
    await step(page, T(locale, '2. กด “บอร์ด” เพื่อดูเป็นคอลัมน์ตามสถานะ', '2. Click “Board” to see columns by status'), page.getByText(/^(บอร์ด|Board)$/).first(), 'click', 3500);
    await step(page, T(locale, '3. ลากการ์ดไปคอลัมน์ใหม่เมื่อสถานะเปลี่ยน', '3. Drag a card to a new column when the status changes'), page.getByText(/Synthetic data analyst/).first(), async card => {
      const from = (await card.boundingBox())!, to = (await page.getByRole('heading', { name: /สมัครแล้ว|Applied/ }).first().boundingBox())!;
      await page.mouse.move(from.x + 20, from.y + 10); await page.mouse.down();
      await page.mouse.move(to.x + 60, to.y + 70, { steps: 30 }); await pause(page, 600); await page.mouse.up();
    }, 3500);
    await finish(page, 'applications', locale);
  });
}
