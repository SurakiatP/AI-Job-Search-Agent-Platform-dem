import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useDrawn } from './motion';

const bar = (drawn: boolean, scale: number, delay: number, ms = 500) => ({ transform: `scaleX(${drawn ? scale : 0})`, transition: `transform ${ms}ms var(--admin-ease-out) ${delay}ms` });
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Thin bar plus a percent label for table cells ("share of runs"). `share` is the filled fraction, 0..1. */
export function ShareBar({ share, label, animateKey, className }: { share: number; label: string; animateKey?: string | number; className?: string }) {
  const drawn = useDrawn(animateKey);
  return <div className={cn('grid grid-cols-[minmax(40px,1fr)_44px] items-center gap-2', className)}>
    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><i className="block h-full origin-left rounded-full bg-primary" style={bar(drawn, clamp(share), 0)} /></span>
    <span className="text-right text-sm tabular-nums">{label}</span>
  </div>;
}

export interface HBarProps {
  label: string;
  /** Filled fraction of the track, 0..1 (scale it so the biggest row is near 1). */
  fill: number;
  valueLabel: string;
  /** Row position, used to stagger the fill. */
  index?: number;
  animateKey?: string | number;
  className?: string;
}

/** Label, track and value on one row. The fill grows from the left, staggered by `index`. */
export function HBar({ label, fill, valueLabel, index = 0, animateKey, className }: HBarProps) {
  const drawn = useDrawn(animateKey);
  return <div className={cn('grid grid-cols-[140px_minmax(0,1fr)_56px] items-center gap-3 text-sm max-sm:grid-cols-[100px_minmax(0,1fr)_44px]', className)}>
    <span className="[overflow-wrap:anywhere]">{label}</span>
    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><i className="block h-full origin-left rounded-full bg-primary" style={bar(drawn, clamp(fill), index * 40)} /></span>
    <span className="text-right tabular-nums">{valueLabel}</span>
  </div>;
}

export interface MetricPairProps {
  label: string;
  /** Small note beside the label ("score 0-100, higher is better"). */
  unit?: string;
  oldLabel: string;
  newLabel: string;
  oldValue: number;
  newValue: number;
  /** Which direction counts as better. */
  better: 'higher' | 'lower';
  format: (n: number) => string;
  /** `percent` shows the change relative to the old value, `absolute` the plain difference. */
  deltaMode?: 'percent' | 'absolute';
  /** Words for assistive technology after the delta: "better" or "worse". */
  betterText: string;
  worseText: string;
  index?: number;
  animateKey?: string | number;
  className?: string;
}

/** Old and new value as two bars on a shared scale, with a delta that is green when it is better and red when worse. */
export function MetricPair({ label, unit, oldLabel, newLabel, oldValue, newValue, better, format, deltaMode = 'absolute', betterText, worseText, index = 0, animateKey, className }: MetricPairProps) {
  const drawn = useDrawn(animateKey);
  const top = Math.max(oldValue, newValue, Number.EPSILON) * 1.1;
  const d = newValue - oldValue;
  const good = better === 'higher' ? d >= 0 : d <= 0;
  const pct = deltaMode === 'percent' && oldValue !== 0;
  const delta = `${d > 0 ? '+' : d < 0 ? '−' : ''}${pct ? `${Math.abs(Math.round((d / oldValue) * 100))}%` : format(Math.abs(d))}`;
  const row = (name: string, v: number, fill: string, bold: boolean, order: number, extra?: ReactNode) => <div className="grid grid-cols-[56px_minmax(0,1fr)_120px] items-center gap-2.5 text-[13px] max-sm:grid-cols-[48px_minmax(0,1fr)_104px]">
    <span className={bold ? 'font-medium' : 'text-muted-foreground'}>{name}</span>
    <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><i className={cn('block h-full origin-left rounded-full', fill)} style={bar(drawn, v / top, (index * 2 + order) * 60, 600)} /></span>
    <span className="text-right tabular-nums">{format(v)}{extra}</span>
  </div>;
  return <div className={cn('grid gap-2 border-t py-3.5 first:border-t-0 first:pt-0 last:pb-0', className)}>
    <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">{label}{unit ? <small className="text-xs font-normal text-muted-foreground">{unit}</small> : null}</div>
    {row(oldLabel, oldValue, 'bg-[color:var(--border-strong)]', false, 0)}
    {row(newLabel, newValue, 'bg-primary', true, 1, <span className={cn('ml-1.5 font-semibold', good ? 'text-success' : 'text-destructive')}>{delta}<span className="sr-only"> ({good ? betterText : worseText})</span></span>)}
  </div>;
}
