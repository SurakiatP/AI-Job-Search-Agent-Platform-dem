import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './admin-ui.css';

export type CaseStatus = 'pending' | 'running' | 'ok' | 'bad';

export interface CaseGridProps {
  /** One entry per test case (20 for a benchmark). */
  cases: readonly CaseStatus[];
  /** Text alternative: "12 of 20 cases done, 1 failed". The squares are not read out. */
  ariaLabel: string;
  className?: string;
}

const tone: Record<CaseStatus, string> = {
  pending: 'bg-muted',
  running: 'bg-primary/20',
  ok: 'bg-success/20 text-success',
  bad: 'bg-destructive/20 text-destructive',
};

/** Grid of squares, 10 per row. A square pops once when its result arrives; passes and failures also carry a check or a cross, so colour is not the only signal. */
export function CaseGrid({ cases, ariaLabel, className }: CaseGridProps) {
  const prev = useRef<readonly CaseStatus[]>([]);
  useEffect(() => { prev.current = cases; });
  return <div role="img" aria-label={ariaLabel} className={cn('grid grid-cols-10 gap-1.5', className)}>
    {cases.map((s, i) => {
      const was = prev.current[i];
      const pop = was !== undefined && was !== s && (s === 'ok' || s === 'bad');
      return <i key={i} className={cn('grid aspect-square place-items-center rounded-md not-italic transition-colors duration-200', tone[s], pop && 'admin-pop')}>
        {s === 'ok' ? <Check className="size-3.5" aria-hidden="true" /> : s === 'bad' ? <X className="size-3.5" aria-hidden="true" /> : null}
      </i>;
    })}
  </div>;
}
