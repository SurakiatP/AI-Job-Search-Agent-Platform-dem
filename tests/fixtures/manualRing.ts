import type { Locator, Page } from '@playwright/test';

// Draws numbered orange rings over elements, for the manual pictures and clips (never used by real tests).
export async function ring(page: Page, targets: Locator[]) {
  const boxes = [];
  for (const target of targets) {
    await target.first().scrollIntoViewIfNeeded();
    const box = await target.first().boundingBox();
    if (!box) throw new Error('highlight target not visible');
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
