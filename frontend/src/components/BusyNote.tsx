import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Spinner } from './ui/spinner';

// Shows how long this wait has lasted, measured in the browser; it is not an estimate of what is left.
function useElapsed(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}

function formatElapsed(seconds: number, thai: boolean): string {
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  if (thai) return minutes ? `${minutes} นาที ${rest} วินาที` : `${rest} วินาที`;
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
}

// Standard "the system is working" row: turning ring, what it is doing, and how long this wait has lasted.
// `bar` adds a thin moving bar for long jobs that report no percentage. Mount it only while work is running.
// `announce={false}` makes it visual only, for places where a separate status line already speaks for screen readers.
export function BusyNote({ label, detail, bar = false, announce = true, action, locale, className }: { locale?: 'th' | 'en'; label: string; detail?: string; bar?: boolean; announce?: boolean; action?: ReactNode; className?: string }) {
  const { i18n } = useTranslation();
  const seconds = useElapsed();
  const thai = locale ? locale === 'th' : (i18n?.language ?? 'th').startsWith('th');
  return <div {...(announce ? { role: 'status', 'aria-live': 'polite' as const } : { 'aria-hidden': true })} className={cn('grid min-w-0 gap-2 rounded-lg border border-primary/25 bg-accent/50 px-3 py-2.5 text-sm', className)}>
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Spinner className="text-primary" />
      <span className="min-w-0 break-words font-medium">{label}</span>
      {seconds >= 3 && <span className="text-xs tabular-nums text-muted-foreground">· {thai ? 'รอมา ' : 'waiting '}{formatElapsed(seconds, thai)}</span>}
      {action && <span className="ms-auto">{action}</span>}
    </div>
    {detail && <p className="break-words text-xs text-muted-foreground">{detail}</p>}
    {bar && <div className="busy-bar" aria-hidden="true" />}
  </div>;
}
