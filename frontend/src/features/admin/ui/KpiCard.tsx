import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from './motion';

export interface DeltaChipProps {
  /** Fractional change versus the previous window (0.12 = +12%). Null hides the chip (range "all"). */
  change: number | null;
  /** Which direction is good news: runs and users up, failures and cost down. */
  good: 'up' | 'down';
  /** Screen reader text, e.g. "up 12% from the previous 7 days". The arrow and sign carry it for sighted users. */
  srLabel?: string;
  className?: string;
}

/** Change chip: green when the move is good, red when bad, grey when flat. The sign and arrow repeat the colour. */
export function DeltaChip({ change, good, srLabel, className }: DeltaChipProps) {
  if (change == null || !Number.isFinite(change)) return null;
  const pct = Math.round(Math.abs(change) * 100);
  const flat = pct === 0;
  const up = change > 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const tone = flat ? 'bg-muted text-muted-foreground' : up === (good === 'up') ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive';
  return <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-xs font-semibold tabular-nums', tone, className)}>
    <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
    <span aria-hidden={srLabel ? true : undefined}>{flat ? '0%' : `${up ? '+' : '−'}${pct}%`}</span>
    {srLabel ? <span className="sr-only">{srLabel}</span> : null}
  </span>;
}

export interface KpiCardProps {
  label: string;
  value: number;
  /** Turns the animated number into text, e.g. thousands separators, "$0.12", "3.4%". */
  format: (n: number) => string;
  /** Decorative icon at the top right. */
  icon?: ReactNode;
  change?: number | null;
  good?: 'up' | 'down';
  changeLabel?: string;
  /** Small line under the number, e.g. "vs previous 7 days: 1,204". */
  vs?: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

/** One of the four KPI cards. It is a tab: selecting it switches the trend chart. Put cards inside KpiTabs. */
export function KpiCard({ label, value, format, icon, change = null, good = 'up', changeLabel, vs, selected, onSelect, className }: KpiCardProps) {
  return <button type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={onSelect}
    className={cn('grid cursor-pointer gap-1.5 rounded-2xl border bg-card p-5 text-left shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-150 ease-out',
      'hover:border-[color:var(--border-strong)] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      'aria-selected:border-primary aria-selected:shadow-[0_0_0_1px_var(--primary),var(--shadow-soft)] max-sm:p-3.5', className)}>
    <span className="flex items-center gap-2 text-[15px] font-medium max-sm:text-[13px]">{label}{icon ? <span className="ml-auto text-primary [&_svg]:size-5" aria-hidden="true">{icon}</span> : null}</span>
    <span className="flex flex-wrap items-center gap-2.5">
      <span className="whitespace-nowrap text-[28px] font-semibold leading-tight tracking-tight tabular-nums max-sm:text-[22px]"><CountUp value={value} format={format} /></span>
      <DeltaChip change={change} good={good} srLabel={changeLabel} />
    </span>
    {vs ? <span className="text-xs text-muted-foreground tabular-nums max-sm:text-[11px]">{vs}</span> : null}
  </button>;
}

/** Tab list for KpiCards: 4 across, 2 on tablets. Arrow keys, Home and End move and select. */
export function KpiTabs({ ariaLabel, children, className }: { ariaLabel: string; children: ReactNode; className?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  };
  return <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cn('grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:gap-3', className)}>{children}</div>;
}
