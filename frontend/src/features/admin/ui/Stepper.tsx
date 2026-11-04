import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import './admin-ui.css';

export interface StepperProps {
  /** Step names in order, e.g. Choose, Test, Decide. */
  steps: readonly string[];
  /** Zero-based index of the current step; steps before it show a check. */
  current: number;
  className?: string;
}

/** Numbered progress for a multi-step sheet. The current step is marked with aria-current. */
export function Stepper({ steps, current, className }: StepperProps) {
  return <ol className={cn('flex flex-wrap items-center gap-2 text-[13px] font-medium text-muted-foreground', className)}>
    {steps.map((label, i) => {
      const done = i < current;
      const cur = i === current;
      return <li key={label} aria-current={cur ? 'step' : undefined} className={cn('inline-flex items-center gap-2', cur && 'text-foreground')}>
        {i > 0 ? <span className="mr-0 h-px w-6 bg-[color:var(--border-strong)]" aria-hidden="true" /> : null}
        <span className={cn('grid size-6 place-items-center rounded-full border text-xs transition-colors duration-200',
          cur ? 'border-transparent bg-primary-fill text-primary-fill-foreground' : done ? 'border-transparent bg-success/15 text-success' : 'border-[color:var(--border-strong)] bg-card')} aria-hidden="true">
          {done ? <Check className="size-3.5" /> : i + 1}
        </span>
        <span>{label}</span>
      </li>;
    })}
  </ol>;
}

/** One screen of a stepped flow. Inactive panes stay mounted (their state survives) but hidden; the active one slides in. */
export function StepPane({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  return <div hidden={!active} className={cn('grid gap-5', active && 'admin-pane-in', className)}>{children}</div>;
}
