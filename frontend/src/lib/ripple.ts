import type { PointerEvent } from 'react';

/** MUI TouchRipple, minimal: a circle from the press point inside a `relative overflow-hidden` element. */
export function ripple(event: PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  if (el.matches(':disabled, [aria-disabled="true"]') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.getBoundingClientRect();
  const size = Math.max(box.width, box.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
  dot.addEventListener('animationend', () => dot.remove());
  el.appendChild(dot);
}
