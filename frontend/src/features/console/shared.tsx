import { useEffect, useRef, useState } from 'react';
import { Check, Copy as CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Copy } from './copy';

export type Locale = 'th' | 'en';

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), intervalMs); return () => window.clearInterval(id); }, [intervalMs]);
  return now;
}

export function relativeTime(iso: string, now: number, locale: Locale) {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return rtf.format(Math.round(minutes / 60), 'hour');
  return rtf.format(Math.round(minutes / 1440), 'day');
}

export function CopyButton({ text, c, label }: { text: string; c: Copy; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function run() {
    try { await navigator.clipboard.writeText(text); setState('ok'); } catch { setState('fail'); }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  }
  return <span className="inline-flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" size="sm" onClick={() => void run()} aria-label={label ? `${c.copy}: ${label}` : undefined}>
      {state === 'ok' ? <Check size={14} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}{c.copy}
    </Button>
    <span role="status" className={state === 'fail' ? 'text-xs text-destructive' : 'text-xs text-success'}>{state === 'ok' ? c.copied : state === 'fail' ? c.copyFailed : ''}</span>
  </span>;
}

export function Empty({ title, next }: { title: string; next?: string }) {
  return <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed p-4"><p className="font-medium">{title}</p>{next && <p className="text-sm text-muted-foreground">{next}</p>}</div>;
}
