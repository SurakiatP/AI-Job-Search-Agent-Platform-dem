import type { AdminEffort } from '@/lib/api-types';

const FILLED: Record<AdminEffort, number> = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, default: 2 };

/** Four dots, filled by effort. Decoration only: the effort name is always written next to it. */
export function Dots({ effort, size = 6 }: { effort: AdminEffort; size?: number }) {
  return <span className="inline-flex gap-[3px]" aria-hidden="true">
    {[0, 1, 2, 3].map(i => <i key={i} className={`block rounded-full ${i < FILLED[effort] ? 'bg-primary' : 'bg-[color:var(--border-strong)]'}`} style={{ width: size, height: size }} />)}
  </span>;
}

export const card = 'overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]';
export const rowRule = 'divide-y divide-border';
