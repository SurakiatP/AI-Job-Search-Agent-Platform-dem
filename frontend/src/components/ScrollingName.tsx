import { useLayoutEffect, useRef, type CSSProperties } from 'react';

// Long names fade at the edge instead of ending in "…", and slide to reveal the rest
// while their row (a `group`) is hovered or focused.
export function ScrollingName({ children }: { children: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = outer.current, text = inner.current;
    if (!box || !text) return;
    const measure = () => {
      const shift = Math.max(0, text.scrollWidth - box.clientWidth);
      box.dataset.overflow = String(shift > 0);
      box.style.setProperty('--name-shift', `${-shift}px`);
      box.style.setProperty('--name-duration', `${Math.min(6, Math.max(1, shift / 40))}s`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [children]);
  return <span ref={outer} className="scrolling-name" style={{ '--name-shift': '0px' } as CSSProperties}>
    <span ref={inner} className="scrolling-name-text">{children}</span>
  </span>;
}
