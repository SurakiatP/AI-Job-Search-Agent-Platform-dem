import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useDrawn } from './motion';
import './admin-ui.css';

export interface TrendPoint {
  /** Bucket label for the axis and the tooltip ("14:05", "3 Nov"). */
  label: string;
  value: number;
  /** Same bucket in the previous window. Leave out when there is no comparison. */
  prev?: number | null;
  /** Label of the previous bucket, shown in the tooltip. */
  prevLabel?: string;
}

export interface TrendChartProps {
  points: readonly TrendPoint[];
  /** Tooltip and keyboard text for one value ("1,204 runs"). */
  formatValue: (n: number) => string;
  /** Y axis tick text; defaults to 1.2k style. */
  formatAxis?: (n: number) => string;
  /** The question the chart answers. Names the chart for assistive technology. */
  ariaLabel: string;
  /** Text alternative with the numbers that matter ("Total 4,210, up 12%, peak 3 Nov"). */
  summary: string;
  seriesLabel: string;
  prevSeriesLabel?: string;
  /** Red line for failures. */
  danger?: boolean;
  /** Click or Enter on a bucket. Without it the chart only shows tooltips. */
  onSelectPoint?: (index: number) => void;
  /** Spoken name of the keyboard slider, e.g. "Move between buckets with the arrow keys, Enter opens details". */
  sliderLabel: string;
  /** Change it (metric, range) to play the draw-in again. Data refreshes with the same key update without animation. */
  animateKey?: string | number;
  /** Shown instead of the plot when there are no points. */
  empty?: ReactNode;
  height?: number;
  className?: string;
}

const L = 40;
const T = 8;

/** Catmull-Rom to Bezier, clamped between neighbours so the line never overshoots a bucket. */
function smooth(pts: [number, number][]) {
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const lo = Math.max(p1[1], p2[1]), hi = Math.min(p1[1], p2[1]);
    const cl = (v: number) => Math.max(hi, Math.min(lo, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function nice(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const compact = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n * 100) / 100));

/** Area line chart with an optional dashed previous window, a crosshair tooltip and a keyboard slider. The line draws in once per `animateKey`. */
export function TrendChart({ points, formatValue, formatAxis = compact, ariaLabel, summary, seriesLabel, prevSeriesLabel, danger, onSelectPoint, sliderLabel, animateKey, empty, height = 200, className }: TrendChartProps) {
  const gradId = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const drawn = useDrawn(animateKey);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length]);

  const n = points.length;
  if (n === 0) return <div className={cn('grid place-items-center text-sm text-muted-foreground', className)} style={{ height }}>{empty}</div>;

  const showPrev = points.every(p => p.prev != null);
  const maxV = Math.max(...points.map(p => p.value), ...(showPrev ? points.map(p => p.prev as number) : [0]));
  const max = nice((maxV * 1.08) / 3) * 3;
  const H = height - 24;
  const x = (i: number) => (n === 1 ? L + (W - L) / 2 : L + ((W - L) * i) / (n - 1));
  const y = (v: number) => T + (H - T) * (1 - v / max);
  const cur = points.map((p, i) => [x(i), y(p.value)] as [number, number]);
  const prev = showPrev ? points.map((p, i) => [x(i), y(p.prev as number)] as [number, number]) : null;
  const line = smooth(cur);
  const colour = danger ? 'var(--destructive)' : 'var(--primary)';
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 84))));
  const idx = active ?? n - 1;
  const tipLeft = Math.max(90, Math.min(W - 90, x(idx)));

  const at = (e: { clientX: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.max(0, Math.min(n - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)))); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setActive(e.key === 'Home' ? 0 : n - 1); }
    else if (e.key === 'Enter' && onSelectPoint) { e.preventDefault(); onSelectPoint(idx); }
    else if (e.key === 'Escape') setActive(null);
  };

  const p = points[idx];
  return <div role="group" aria-label={ariaLabel} className={className}>
    <p className="sr-only">{summary}</p>
    <div ref={box} className="relative" style={{ height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${height}`} className="block overflow-visible" aria-hidden="true">
        <defs><linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: colour, stopOpacity: 0.2 }} /><stop offset="1" style={{ stopColor: colour, stopOpacity: 0 }} /></linearGradient></defs>
        {[0, 1, 2, 3].map(k => { const v = (max * k) / 3; const yy = y(v); return <g key={k}>
          <line x1={L} x2={W} y1={yy} y2={yy} className="stroke-border" strokeDasharray={k ? '3 4' : undefined} />
          <text x={L - 8} y={yy + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{formatAxis(v)}</text>
        </g>; })}
        {points.map((pt, i) => i % labelEvery === 0 ? <text key={i} x={x(i)} y={H + 18} textAnchor={i === 0 && n > 1 ? 'start' : 'middle'} className="fill-muted-foreground text-[11px] tabular-nums">{pt.label}</text> : null)}
        <path d={`${line} L${x(n - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${gradId})`} style={{ opacity: drawn ? 1 : 0, transition: 'opacity 500ms ease 250ms' }} />
        {prev ? <path d={smooth(prev)} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 5" opacity={0.6} strokeLinejoin="round" strokeLinecap="round" /> : null}
        <path d={line} fill="none" stroke={colour} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: drawn ? 'stroke-dashoffset 800ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none' }} />
        {active != null ? <g>
          <line x1={x(idx)} x2={x(idx)} y1={T} y2={H} className="stroke-foreground" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />
          {prev ? <circle cx={x(idx)} cy={prev[idx][1]} r={4} className="fill-card stroke-muted-foreground" strokeWidth={2} /> : null}
          <circle cx={x(idx)} cy={cur[idx][1]} r={5} className="fill-card" stroke={colour} strokeWidth={2.5} />
        </g> : null}
      </svg>
      <div role="slider" tabIndex={0} aria-label={sliderLabel} aria-valuemin={1} aria-valuemax={n} aria-valuenow={idx + 1} aria-valuetext={`${p.label}: ${formatValue(p.value)}`}
        className="absolute top-0 cursor-crosshair rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ left: L, right: 0, height: H, touchAction: 'pan-y' }}
        onPointerMove={e => setActive(at(e))} onPointerLeave={() => setActive(null)} onClick={e => { if (onSelectPoint) onSelectPoint(at(e)); }}
        onFocus={() => setActive(a => a ?? n - 1)} onBlur={() => setActive(null)} onKeyDown={onKey} />
      {active != null ? <div role="presentation" className="admin-ctip pointer-events-none absolute z-10 min-w-36 rounded-[10px] border bg-card px-3 py-2 text-xs leading-relaxed shadow-[var(--shadow-lift)]"
        style={{ left: tipLeft, top: Math.max(0, Math.min(cur[idx][1], prev ? prev[idx][1] : cur[idx][1]) - 12), transform: 'translate(-50%, -100%)' }}>
        <b className="text-[13px]">{p.label}</b>
        <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: colour }} />{seriesLabel}</span><strong className="tabular-nums">{formatValue(p.value)}</strong></div>
        {prev ? <div className="flex items-center justify-between gap-3 text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-muted-foreground" />{p.prevLabel ?? prevSeriesLabel}</span><span className="tabular-nums">{formatValue(p.prev as number)}</span></div> : null}
      </div> : null}
    </div>
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span><i className="mr-1.5 inline-block w-4 border-t-[2.25px] align-middle" style={{ borderColor: colour }} />{seriesLabel}</span>
      {prev && prevSeriesLabel ? <span><i className="mr-1.5 inline-block w-4 border-t-[1.5px] border-dashed border-muted-foreground align-middle" />{prevSeriesLabel}</span> : null}
    </div>
  </div>;
}
