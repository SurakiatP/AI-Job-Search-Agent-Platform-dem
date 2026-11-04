import { cn } from '@/lib/utils';
import { useDrawn } from './motion';
import './admin-ui.css';

export interface WeekdayDatum {
  key: string;
  /** Short label under the bar ("Mon"). */
  label: string;
  value: number;
  /** Full text for assistive technology ("Monday: 1,342 runs on average"). */
  aria: string;
}

export interface WeekdayBarsProps {
  days: readonly WeekdayDatum[];
  formatValue: (n: number) => string;
  ariaLabel: string;
  animateKey?: string | number;
  className?: string;
}

/** Seven bars; the busiest day is solid, the value shows for the peak and for the hovered or focused day. */
export function WeekdayBars({ days, formatValue, ariaLabel, animateKey, className }: WeekdayBarsProps) {
  const drawn = useDrawn(animateKey);
  const max = Math.max(1, ...days.map(d => d.value));
  return <div role="group" aria-label={ariaLabel} data-drawn={drawn} className={cn('admin-wk grid grid-cols-7 items-end gap-2', className)}>
    {days.map(d => {
      const pct = (d.value / max) * 100;
      return <div key={d.key} role="img" tabIndex={0} aria-label={d.aria} data-peak={d.value === max && d.value > 0}
        className="admin-wk-day grid cursor-default justify-items-center gap-2 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="relative block h-[118px] w-full">
          <span className="admin-wk-val absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold tabular-nums" style={{ bottom: `calc(${pct}% + 4px)` }}>{formatValue(d.value)}</span>
          <span className="admin-wk-col absolute bottom-0 left-1/2 block w-full max-w-9 -translate-x-1/2 rounded-[10px] bg-muted" style={{ height: `${pct}%`, transitionDelay: drawn ? `${days.indexOf(d) * 45}ms` : undefined }} />
        </span>
        <span className="admin-wk-lbl text-xs text-muted-foreground">{d.label}</span>
      </div>;
    })}
  </div>;
}
