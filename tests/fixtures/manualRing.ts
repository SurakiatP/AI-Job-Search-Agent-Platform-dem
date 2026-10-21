import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';

// Draws numbered orange rings over elements that are already on screen (never scrolls, so rings cannot drift), for the manual pictures and clips (never used by real tests).
export async function ring(page: Page, targets: Locator[]) {
  const boxes = [];
  for (const target of targets) {
    await target.first().waitFor();
    const box = await target.first().boundingBox();
    if (!box || box.y < 0 || box.y + box.height > (page.viewportSize()?.height ?? 800)) throw new Error('highlight target is outside the picture');
    boxes.push(box);
  }
  await page.evaluate(list => {
    document.querySelectorAll('[data-manual-ring]').forEach(node => node.remove());
    list.forEach((b, i) => {
      const ring = document.createElement('div');
      ring.setAttribute('data-manual-ring', '');
      ring.style.cssText = `position:fixed;z-index:99998;pointer-events:none;left:${b.x - 6}px;top:${b.y - 6}px;width:${b.width + 12}px;height:${b.height + 12}px;border:3px solid #EA580C;border-radius:14px;box-shadow:0 0 0 4px rgba(234,88,12,.22)`;
      const badge = document.createElement('div');
      badge.textContent = String(i + 1);
      badge.style.cssText = 'position:absolute;left:-14px;top:-14px;width:26px;height:26px;border-radius:9999px;background:#EA580C;color:#fff;font:700 14px/26px sans-serif;text-align:center';
      ring.appendChild(badge);
      document.body.appendChild(ring);
    });
  }, boxes);
}

// A blue step caption at the bottom of the screen, so a clip explains itself without sound.
export async function caption(page: Page, text: string) {
  await page.evaluate(t => {
    let bar = document.querySelector<HTMLElement>('[data-manual-caption]');
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('data-manual-caption', '');
      bar.style.cssText = 'position:fixed;z-index:99999;left:50%;top:16px;transform:translateX(-50%);max-width:880px;padding:14px 26px;border-radius:14px;background:#2B45C4;color:#fff;font:600 20px/1.5 Prompt,Noto Sans Thai,sans-serif;text-align:center;box-shadow:0 8px 28px rgba(43,69,196,.35);pointer-events:none';
      document.body.appendChild(bar);
    }
    bar.textContent = t;
  }, text);
}

export const TEMPLATE_IDS = ['onyx', 'kakuna', 'ditgar', 'lotus', 'teak', 'saffron'] as const;
const templateImage = (template: string, locale: string) => `data:image/png;base64,${readFileSync(join(__dirname, `../../frontend/public/manual/templates/${template}.${locale}.png`)).toString('base64')}`;

// The test browser cannot show a PDF, so the preview pane shows the real render of that template (made by the app's own
// renderer, see manual/README) as a picture. Capture tooling only.
export async function showTemplate(page: Page, template: string, locale: string) {
  await page.waitForSelector('iframe', { state: 'attached', timeout: 15000 });
  await page.evaluate(([src]) => {
    const frame = document.querySelector('iframe')!;
    const pane = frame.parentElement!;
    frame.style.visibility = 'hidden'; // hidden, not removed: React keeps owning it
    let img = pane.querySelector<HTMLImageElement>('[data-manual-template]');
    if (!img) {
      img = document.createElement('img');
      img.setAttribute('data-manual-template', '');
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:top;background:#fff';
      pane.appendChild(img);
    }
    img.src = src;
  }, [templateImage(template, locale)]);
}

/** A page with all six templates side by side, each named, for the "choose a template" picture. */
export async function templateGallery(page: Page, locale: 'th' | 'en', labels: { photo: string; two: string }) {
  const photo = ['lotus', 'teak', 'saffron'], two = ['ditgar', 'teak'];
  const cards = TEMPLATE_IDS.map(id => `<figure><img src="${templateImage(id, locale)}"><figcaption><b>${id[0].toUpperCase() + id.slice(1)}</b>${photo.includes(id) ? `<i>${labels.photo}</i>` : ''}${two.includes(id) ? `<i>${labels.two}</i>` : ''}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;padding:28px;background:#F3F4EF;font-family:Prompt,'Noto Sans Thai',sans-serif}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}figure{margin:0;background:#fff;border:1px solid #D9DCE6;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(27,37,80,.08)}
    img{display:block;width:100%;height:auto;border-bottom:1px solid #E4E7F4}figcaption{padding:10px 14px;display:flex;gap:8px;align-items:center;color:#1B2550;font-size:16px}
    i{font-style:normal;font-size:12px;background:#E4E7F4;color:#1B2550;border-radius:999px;padding:2px 9px}</style><div class="g">${cards}</div>`);
}
