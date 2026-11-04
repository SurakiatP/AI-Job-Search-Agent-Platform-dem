import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useDrawn } from './motion';
import { Tip } from './Tip';

export interface BreakdownItem {
  key: string;
  label: string;
  /** Formatted headline number ("1,240 runs"). */
  value: string;
  /** 0..1 share of the whole; sets the segment width and the hover text. */
  share: number;
  /** Shown next to the number; decorative. */
  icon?: ReactNode;
}

export interface BreakdownStripProps {
  title: string;
  items: readonly BreakdownItem[];
  /** Hover text for one segment, e.g. "Evaluate jobs: 38%". */
  tipFor: (item: BreakdownItem) => string;
  danger?: boolean;
  animateKey?: string | number;
  className?: string;
}

/** Row of segments under the trend chart: number, label and a coloured bar that draws in left to right. */
export function BreakdownStrip({ title, items, tipFor, danger, animateKey, className }: BreakdownStripProps) {
  const drawn = useDrawn(animateKey);
  const tone = danger ? 'var(--destructive)' : 'var(--primary)';
  return <section aria-label={title} className={cn('mt-4 overflow-hidden rounded-xl border px-4 pt-3.5', className)}>
    <h3 className="mb-2.5 text-sm font-semibold">{title}</h3>
    <ul className="flex gap-0.5 max-sm:flex-wrap max-sm:gap-y-3">
      {items.map((it, i) => {
        const col = `color-mix(in srgb, ${tone} ${100 - i * (danger ? 28 : 24)}%, var(--card))`;
        return <li key={it.key} className="min-w-[84px] max-sm:min-w-[42%]" style={{ flex: Math.max(it.share, 0.12) }}>
          <Tip text={tipFor(it)} className="grid w-full gap-0.5 pr-2.5">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-lg font-semibold leading-snug tabular-nums max-sm:text-[15px]"><span className="[&_svg]:size-4" style={{ color: col }} aria-hidden="true">{it.icon}</span>{it.value}</span>
            <span className="truncate text-xs text-muted-foreground">{it.label}</span>
            <span className="mt-2.5 block h-[5px] origin-left rounded-t-[3px]" style={{ background: col, transform: drawn ? 'scaleX(1)' : 'scaleX(0)', transition: `transform 500ms var(--admin-ease-out) ${i * 70}ms` }} />
          </Tip>
        </li>;
      })}
    </ul>
  </section>;
}
