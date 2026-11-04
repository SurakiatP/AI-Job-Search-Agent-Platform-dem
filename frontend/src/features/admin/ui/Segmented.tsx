import { cn } from '@/lib/utils';

export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Name of the group, e.g. "Group by". */
  ariaLabel: string;
  className?: string;
}

/** Pill-shaped single choice (aria-pressed buttons). Uses the shared `.segmented` look from styles.css. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedProps<T>) {
  return <div role="group" aria-label={ariaLabel} className={cn('segmented flex-wrap', className)}>
    {options.map(o => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
      className="min-h-9 cursor-pointer rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{o.label}</button>)}
  </div>;
}
