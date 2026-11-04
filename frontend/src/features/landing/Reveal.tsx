import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True once the element has entered the viewport (immediately with reduced motion or without IntersectionObserver). */
export function useSeen<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(prefersReducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** A drawn check mark (one stroke weight, rounded caps). `draw` lets the demo animate it in. */
export function Tick({ draw = false, className = 'size-4' }: { draw?: boolean; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`landing-tick ${className}`}><path className={draw ? 'landing-tick-draw' : undefined} d="M5 12.5l4.5 4.5L19 7" /></svg>;
}

/** Fades and lifts its children in once, the first time they scroll into view (CSS in landing.css; none with reduced motion). */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.1);
  return <div ref={ref} data-seen={seen} className={`reveal ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>{children}</div>;
}
