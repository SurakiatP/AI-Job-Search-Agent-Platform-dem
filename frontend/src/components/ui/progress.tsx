import { cn } from '@/lib/utils';

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(value, 100));
  return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
    <div className="h-full w-full rounded-full bg-primary" style={{ transform: `translateX(-${100 - clamped}%)`, transition: 'transform var(--dur-base) var(--ease-out)' }} />
  </div>;
}
