import { createElement, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

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

/** Sets data-seen="true" once the element enters the viewport (immediately with reduced motion). */
export function Reveal({ className, children, ...props }: ComponentProps<'div'>) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return <div ref={ref} data-seen={seen} className={className} {...props}>{children}</div>;
}

/** A list whose items rise in one after another when it scrolls into view. Items get --i for the delay. */
export function Stagger({ as = 'ul', className, children, ...props }: { as?: 'ul' | 'ol'; className?: string; children: ReactNode[] } & Omit<ComponentProps<'ul'>, 'children'>) {
  const [ref, seen] = useSeen<HTMLUListElement>(0.2);
  return createElement(as, { ref, 'data-seen': seen, className: `landing-stagger ${className ?? ''}`, ...props }, children);
}

/** A drawn check mark (one stroke weight, rounded caps). `draw` lets the demo animate it in. */
export function Tick({ draw = false, className = 'size-4' }: { draw?: boolean; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`landing-tick ${className}`}><path className={draw ? 'landing-tick-draw' : undefined} d="M5 12.5l4.5 4.5L19 7" /></svg>;
}
