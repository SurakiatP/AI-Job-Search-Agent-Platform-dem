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
