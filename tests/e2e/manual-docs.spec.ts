import { expect, test } from '@playwright/test';
import { useSyntheticApplication } from '../fixtures/application';

const topics = ['getting-started', 'cv-and-experience', 'build-cv', 'search-and-evaluate', 'tailor-and-draft',
  'interview-practice', 'track-applications', 'job-alerts', 'safety-and-data'];

test('docs: every topic card opens its own manual page, none says coming soon', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs');
  await expect(page.getByText('เร็ว ๆ นี้')).toHaveCount(0);
  for (const topic of topics) await expect(page.locator(`main a[href="/docs/${topic}"]`)).toHaveCount(1);
});

for (const topic of topics) {
  test(`docs: /docs/${topic} shows a rendered page`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
    await useSyntheticApplication(page);
    await page.goto(`/docs/${topic}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.locator('main[data-stage]')).toHaveCount(1); // colour theme and the bar above the title
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('{{');
    expect(text).not.toContain('[[');
    expect(page.url()).toContain(`/docs/${topic}`);
  });
}

test('docs: an unknown topic says so and links back to the guide', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/no-such-topic');
  await expect(page.getByRole('link', { name: 'กลับไปคู่มือ' })).toHaveAttribute('href', '/docs');
});

test('docs: related-question links read as topic titles, not page ids', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/interview-practice');
  await expect(page.locator('.manual-body')).toBeVisible();
  const related = page.locator('.manual-body a[href^="/docs/"]');
  expect(await related.count()).toBeGreaterThan(0);
  for (const text of await related.allInnerTexts()) expect(text).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
});

test('docs: English UI shows the English guide with no Thai-only notice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto('/docs/getting-started');
  await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();
  await expect(page.getByText(/available in Thai only/i)).toHaveCount(0);
  expect(await page.locator('.manual-body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
});

const clips: Record<string, string[]> = {
  'build-cv': ['build'], 'search-and-evaluate': ['search', 'evaluate'], 'tailor-and-draft': ['tailor'],
  'interview-practice': ['practice'], 'track-applications': ['applications'],
};
const aiPictures: Record<string, string> = {
  'cv-and-experience': 'ai-experience', 'build-cv': 'build-gallery', 'search-and-evaluate': 'ai-evaluation', 'tailor-and-draft': 'ai-tailor', 'interview-practice': 'ai-feedback',
};

for (const locale of ['th', 'en'] as const) {
  test(`docs ${locale}: clips are playable videos with controls and a cover picture, and are 15 seconds or longer`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useSyntheticApplication(page);
    for (const [topic, names] of Object.entries(clips)) {
      await page.goto(`/docs/${topic}`);
      const videos = page.locator('.manual-body video');
      await expect(videos, topic).toHaveCount(names.length);
      for (const [index, name] of names.entries()) {
        const video = videos.nth(index);
        await expect(video).toHaveAttribute('controls', '');
        expect(await video.getAttribute('src')).toBe(`/manual/${name}.${locale}.mp4`);
        expect(await video.getAttribute('poster')).toBe(`/manual/${name}.${locale}.poster.png`);
        await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration), { message: `${topic}/${name} duration` }).toBeGreaterThanOrEqual(15);
      }
    }
  });

  test(`docs ${locale}: the pages that use AI show a picture of the AI result`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('ui.locale', l), locale);
    await useSyntheticApplication(page);
    for (const [topic, name] of Object.entries(aiPictures)) {
      await page.goto(`/docs/${topic}`);
      const image = page.locator(`.manual-body img[src="/manual/${name}.${locale}.png"]`);
      await expect(image, topic).toHaveCount(1);
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { message: `${topic} picture loads` }).toBeGreaterThan(0);
    }
  });
}

test('docs: pictures are figures with captions, and a long page offers an on-this-page list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/search-and-evaluate');
  const figures = page.locator('.manual-body figure');
  await expect(figures.first()).toBeVisible();
  expect(await figures.count()).toBeGreaterThan(0);
  for (let i = 0; i < await figures.count(); i++) await expect(figures.nth(i).locator('figcaption')).not.toBeEmpty();
  const toc = page.getByRole('navigation', { name: 'ในหน้านี้' });
  await expect(toc.getByRole('link')).toHaveCount(await page.locator('.manual-body h2').count());
  await toc.getByRole('link').nth(1).click();
  await expect(page).toHaveURL(/#/);
});

test('docs: the Good to know section is a callout', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.goto('/docs/getting-started');
  await expect(page.locator('.manual-body section[data-callout="note"]')).toHaveCount(1);
});

test('docs: on desktop the sections are a sub-list under the open topic in the side menu, not a chip row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/interview-practice');
  const menu = page.getByRole('navigation', { name: 'หัวข้อในคู่มือ' });
  const sections = menu.getByRole('navigation', { name: 'ในหน้านี้' }).getByRole('link');
  await expect(sections.first()).toBeVisible();
  expect(await sections.count()).toBe(await page.locator('.manual-body h2').count());
  await expect(menu.getByRole('navigation', { name: 'ในหน้านี้' })).toHaveCount(1); // only the open topic expands
  await expect(page.getByRole('navigation', { name: 'ในหน้านี้' })).toHaveCount(1); // the chip row is hidden here
  await sections.nth(2).click();
  await expect(page).toHaveURL(/#section-3$/);
});

test('docs: on a phone the sections stay reachable as chips', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  await page.goto('/docs/interview-practice');
  await expect(page.getByRole('navigation', { name: 'ในหน้านี้' }).getByRole('link').first()).toBeVisible();
});

test('docs: the index and every topic page carry the same site menu as the landing page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'th'));
  await useSyntheticApplication(page);
  for (const path of ['/', '/docs', ...topics.map(topic => `/docs/${topic}`)]) {
    await page.goto(path);
    const menu = page.getByRole('banner').getByRole('navigation', { name: 'เมนูหลัก' });
    await expect(menu, path).toBeVisible();
    for (const name of ['ฟีเจอร์', 'วิธีทำงาน', 'ข้อมูลและการเชื่อมต่อ', 'คู่มือ']) await expect(menu.getByText(name, { exact: true }), `${path} ${name}`).toBeVisible();
  }
});
