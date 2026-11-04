import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useDrawn } from '../ui';

export type BarStatus = 'ok' | 'slow' | 'down' | 'none';
export interface BarDatum {
  key: number;
  status: BarStatus;
  /** Height value; null draws a short stub (a check that was not timed). */
  ms: number | null;
  /** Tooltip and spoken text for this bar. */
  text: string;
}

const FILL: Record<BarStatus, string> = { ok: 'bg-success', slow: 'bg-warning', down: 'bg-destructive-fill', none: 'bg-muted' };
const nice = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/** Bars on a time axis. Height is ms (auto scale from the working bars), a down bar fills the height, an empty slot has no bar.
 *  One tab stop: arrow keys move between bars. The bars grow in once per `animateKey`; refreshed data does not replay it. */
export function BarChart({ bars, ariaLabel, sliderLabel, animateKey, formatAxis, axisStart, axisEnd, height = 96 }: {
  bars: readonly BarDatum[]; ariaLabel: string; sliderLabel: string; animateKey: string | number;
  formatAxis: (ms: number) => string; axisStart: string; axisEnd: string; height?: number;
}) {
  const drawn = useDrawn(animateKey);
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const n = bars.length;
  const top = nice(Math.max(100, ...bars.filter(b => b.status === 'ok' || b.status === 'slow').map(b => (b.ms ?? 0) * 1.05)));
  const pct = (b: BarDatum) => b.status === 'down' ? 100 : b.status === 'none' ? 0 : b.ms == null ? 10 : Math.max(3, (b.ms / top) * 100);
  useEffect(() => { // a tap on a phone keeps its tooltip until the next tap elsewhere
    if (active == null) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setActive(null); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [active]);
  const idx = active ?? n - 1;
  const width = box.current?.clientWidth ?? 600;
  const left = Math.max(90, Math.min(width - 90, ((idx + 0.5) / Math.max(1, n)) * width));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.max(0, Math.min(n - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)))); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setActive(e.key === 'Home' ? 0 : n - 1); }
    else if (e.key === 'Escape') setActive(null);
  };
  return <div role="group" aria-label={ariaLabel}>
    <div className="relative ms-12" style={{ height }} ref={box} onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 border-t border-border" />
      <span aria-hidden="true" className="absolute -start-12 top-0 w-10 -translate-y-1/2 text-end text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">{formatAxis(top)}</span>
      <span aria-hidden="true" className="absolute -start-12 bottom-0 w-10 translate-y-1/2 text-end text-[11px] tabular-nums text-muted-foreground">0</span>
      <div className="absolute inset-0 flex items-end gap-px max-sm:gap-0">
        {bars.map((b, i) => <div key={b.key} data-status={b.status} className="flex h-full min-w-0 flex-1 items-end" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
          <i data-bar={b.status} className={cn('block w-full', FILL[b.status], b.status === 'none' && 'opacity-50')}
            style={{ height: b.status === 'none' ? 2 : `${pct(b)}%`, opacity: active != null && active !== i ? 0.45 : undefined, transformOrigin: 'bottom',
              transform: drawn ? 'scaleY(1)' : 'scaleY(0)', transition: drawn ? 'transform 450ms var(--admin-ease-out), opacity 100ms ease' : 'none' }} />
        </div>)}
      </div>
      <div role="slider" tabIndex={0} aria-label={sliderLabel} aria-valuemin={1} aria-valuemax={Math.max(1, n)} aria-valuenow={idx + 1} aria-valuetext={bars[idx]?.text}
        className="pointer-events-none absolute -inset-0.5 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onFocus={() => setActive(a => a ?? n - 1)} onBlur={() => setActive(null)} onKeyDown={onKey} />
      {active != null && bars[active] ? <div role="tooltip" className="admin-ctip pointer-events-none absolute z-10 w-max max-w-[min(18rem,90vw)] rounded-[10px] border bg-card px-3 py-2 text-xs leading-relaxed shadow-[var(--shadow-lift)]"
        style={{ left, top: -6, transform: 'translate(-50%, -100%)' }}>{bars[active].text}</div> : null}
    </div>
    <div aria-hidden="true" className="ms-12 mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{axisStart}</span><span>{axisEnd}</span></div>
  </div>;
}
