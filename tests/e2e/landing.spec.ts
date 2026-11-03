import { expect, test } from '@playwright/test';
import { useAccessFixture } from '../fixtures/access-surfaces';

test('landing tour is compact and remains keyboard navigable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const tour = page.locator('#how');
  expect((await tour.boundingBox())!.height).toBeLessThan(1200);
  const first = tour.getByRole('tab').first();
  await first.focus();
  await expect(tour.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  await page.keyboard.press('ArrowDown');
  await expect(tour.getByRole('tab').nth(1)).toBeFocused();
  await expect(tour.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(tour.getByRole('tab').nth(0)).toBeFocused();
  await expect(tour.getByRole('tab').nth(0)).toHaveAttribute('aria-selected', 'true');
});

test('landing skip link targets the main region and moves focus there', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#main');
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('landing FAQ has six questions that open, and the footer links to real pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const faq = page.locator('#faq');
  await expect(faq.getByRole('heading', { name: 'Questions worth asking first' })).toBeVisible();
  const items = faq.locator('details');
  await expect(items).toHaveCount(6);
  await expect(items.locator('summary')).toHaveText([
    'Does the app submit applications for me?', 'Where does my CV go?', 'What does a score of 84% mean?',
    'If I upload a new CV, do old evaluations change?', 'Can I start without a CV file?', 'Can I connect the AI assistant I already use?',
  ]);
  await items.first().locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(items.first()).toHaveAttribute('open', '');
  await expect(items.first()).toContainText('No. You apply yourself');
  const footer = page.getByRole('navigation', { name: 'Footer links' });
  await expect(footer.getByRole('link')).toHaveText(['How it works', 'Data & connections', 'Docs']);
  await expect(footer.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
  await expect(footer.getByRole('link', { name: 'Data & connections' })).toHaveAttribute('href', '/data');
  await expect(footer.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
});
test('landing data section: two readable cards with ticks and a three-part approval flow', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const mine = page.getByRole('region', { name: 'Your workspace and AI' });
  await expect(mine.locator('svg.landing-tick')).toHaveCount(4);
  const flow = page.getByRole('list', { name: 'How a connected assistant asks' });
  await expect(flow.getByRole('listitem')).toHaveCount(3);
  await expect(flow.getByRole('listitem').nth(2)).toContainText('Approve');
  await expect(flow.getByRole('listitem').nth(2)).toContainText('Reject');
});
const featureTabs = {
  en: ['Add CV', 'Build CV', 'Search', 'Evaluate', 'Interview practice', 'Draft', 'Track', 'Job alerts', 'Connect'],
  th: ['ใส่ CV', 'สร้าง CV', 'ค้นหางาน', 'ประเมิน', 'ซ้อมสัมภาษณ์', 'ร่างเอกสาร', 'ติดตามสมัคร', 'แจ้งเตือนงาน', 'เชื่อมผู้ช่วย'],
};
const featureSlugs = ['add-cv', 'build-cv', 'search', 'evaluate', 'practice', 'draft', 'track', 'alerts', 'connect'];

for (const locale of ['en', 'th'] as const) {
  test(`landing tour lists every feature and each feature page renders (${locale})`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useAccessFixture(page, true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const tabs = page.locator('#how').getByRole('tab');
    await expect(tabs).toHaveText(featureTabs[locale]);
    await tabs.nth(4).click();
    await expect(page.locator('#how').getByRole('tabpanel')).toContainText(locale === 'en' ? 'Practise for the interview' : 'ซ้อมสัมภาษณ์');
    for (const slug of featureSlugs) {
      await page.goto(`/features/${slug}`);
      await expect(page).toHaveURL(`/features/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toContainText(featureTabs[locale][featureSlugs.indexOf(slug)]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('landing demo is labelled illustrative and states what the app will not do', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  await expect(page.getByText('Illustrative demo · Sample data').first()).toBeVisible();
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  await expect(demo.getByText('Senior Data Analyst', { exact: true })).toBeVisible();
  await expect(demo.getByText('Step 4 of 5')).toBeVisible();
  const steps = demo.getByRole('list', { name: 'Journey of this job' }).getByRole('listitem');
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(2)).toContainText('Fit evaluation');
  await expect(steps.nth(2).getByText('AI', { exact: true })).toBeVisible();
  await expect(steps.nth(2)).toContainText('84%');
  await expect(steps.nth(2)).toContainText('Skills found: 8 of 11, counted from keywords, no AI');
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(3)).toContainText('Waiting for you to review the CV changes');
  await expect(steps.nth(4)).toContainText('You apply yourself');
  await expect(page.getByText('Upload a CV file (PDF, DOCX or text) or build one in the app with a form.')).toBeVisible();
  await expect(page.getByText('AI features work once your administrator has set up AI.')).toBeVisible();
  // honesty: no false CV requirement, no approval sample for drafting (the product never asks for that)
  await expect(page.getByText(/You need a CV file/i)).toHaveCount(0);
  await expect(page.getByText(/Approval needed: draft documents/i)).toHaveCount(0);
  await expect(page.getByText('Approval needed: Record this job as applied · Full-stack Engineer')).toBeVisible();
  await expect(page.getByText('No automatic submission.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Create account', exact: true }).first()).toHaveAttribute('href', '/signup');
});

test('landing Thai headline stays within three lines at 390px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useAccessFixture(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const lines = await page.getByRole('heading', { level: 1 }).evaluate(h => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
  expect(lines).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('landing explains AI use without naming internal infrastructure, protocols or data sources', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('AI that runs on your machine');
  await expect(page.getByText(/Keychain/)).toHaveCount(0);
  await expect(page.getByText(/supported AI providers/)).toHaveCount(0);
  await expect(page.getByText('AI helps evaluate and draft documents', { exact: true })).toBeVisible();
  await expect(page.getByText(/LiteLLM|gateway|\bMCP\b|\bA2A\b|open-source|\(MIT\)/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('AI ที่ทำงานบนเครื่องคุณ');
  await expect(page.getByText('ใช้ AI ช่วยประเมินและร่างเอกสาร', { exact: true })).toBeVisible();
  await expect(page.getByText(/LiteLLM|gateway|\bMCP\b|\bA2A\b|โอเพนซอร์ส|\(MIT\)/i)).toHaveCount(0);
});

test('landing hero puts AI first and lists what stays in the visitor\'s control with ticks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toContainText('AI');
  await expect(h1.locator('.landing-ai')).toHaveText('AI');
  const promises = page.getByRole('list', { name: 'What stays in your control' }).first();
  await expect(promises.getByRole('listitem')).toHaveText(['You review everything before it is used', 'You apply yourself; the app never submits', 'Each project keeps its own data']);
  await expect(promises.locator('svg.landing-tick')).toHaveCount(3);
  // The closing repeats the hero's one action, not its promise list.
  const closing = page.getByRole('region', { name: 'Start with one CV and one job' });
  await expect(closing.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/signup');
  await expect(page.getByRole('list', { name: 'What stays in your control' })).toHaveCount(1);
});

test('landing demo plays a short sequence: ticks draw in and the last step settles; reduced motion shows the end state at once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  const last = demo.getByRole('listitem').last();
  await expect(demo).toHaveAttribute('data-play', 'true');
  await expect.poll(() => last.evaluate(el => getComputedStyle(el).opacity), { timeout: 5000 }).toBe('1');
  const tick = demo.locator('.landing-tick-draw').first();
  await expect.poll(() => tick.evaluate(el => getComputedStyle(el).strokeDashoffset), { timeout: 5000 }).toBe('0px');
});

test('landing demo with reduced motion has no animation or transition on its steps', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page, true);
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'Illustrative demo · Sample data' });
  for (const li of await demo.getByRole('listitem').all()) {
    expect(await li.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await li.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  }
  expect(await demo.locator('.landing-tick-draw').first().evaluate(el => getComputedStyle(el).strokeDashoffset)).toBe('0px');
  await context.close();
});

for (const locale of ['th', 'en'] as const) {
  test(`landing page carries no exclamation or info marks (${locale})`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useAccessFixture(page, true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const marks = page.locator('main svg.lucide-info, main svg.lucide-triangle-alert, main svg.lucide-circle-alert, main svg.lucide-octagon-alert');
    await expect(page.locator('#how').getByRole('tab')).toHaveCount(9);
    await expect(marks, 'warning or info icon on the landing page').toHaveCount(0);
    for (const tab of await page.locator('#how').getByRole('tab').all()) {
      await tab.click();
      await expect(marks, 'warning or info icon on the landing page').toHaveCount(0);
    }
    expect(await page.locator('main').innerText(), 'an exclamation mark in the landing text').not.toContain('!');
  });
}
