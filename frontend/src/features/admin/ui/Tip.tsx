import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import './admin-ui.css';

// The first tooltip waits 180ms; a neighbour opened within 400ms of the last one appears at once, with no entrance.
let warmUntil = 0;

/** Text tooltip for hover (mouse only) and keyboard focus. Escape closes it. Put it around something that is already focusable, or around plain text that is also readable without it. */
export function Tip({ text, children, className, style }: { text: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>(0);
  const [at, setAt] = useState<{ x: number; y: number; instant: boolean } | null>(null);

  const show = () => {
    window.clearTimeout(timer.current);
    const go = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setAt({ x: Math.max(130, Math.min(window.innerWidth - 130, r.left + r.width / 2)), y: r.top - 4, instant: Date.now() < warmUntil });
    };
    if (Date.now() < warmUntil) go(); else timer.current = window.setTimeout(go, 180);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAt(open => { if (open) warmUntil = Date.now() + 400; return null; });
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at]);

  return <span ref={ref} className={cn('inline-flex', className)} style={style} aria-describedby={at ? id : undefined}
    onPointerEnter={e => { if (e.pointerType === 'mouse') show(); }} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    {children}
    {at && createPortal(<div id={id} role="tooltip" data-instant={at.instant} className="admin-tip pointer-events-none fixed z-[80] max-w-64 rounded-lg border bg-card px-2.5 py-1.5 text-xs leading-normal text-foreground shadow-[var(--shadow-lift)]"
      style={{ left: at.x, top: at.y, transform: 'translate(-50%, calc(-100% - 6px))' }}>{text}</div>, document.body)}
  </span>;
}
