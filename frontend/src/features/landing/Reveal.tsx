import { useEffect, useRef, useState, type ComponentProps } from 'react';

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sets data-seen="true" once the element enters the viewport (immediately with reduced motion). */
export function Reveal({ className, children, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(prefersReducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} data-seen={seen} className={className} {...props}>{children}</div>;
}
