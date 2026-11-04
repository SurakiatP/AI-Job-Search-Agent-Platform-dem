import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { Check, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { admin } from '../../../lib/api';
import type { AdminBucket, AdminHealthComponents, AdminMetric, AdminOverview, AdminProbe, AdminRange } from '../../../lib/api-types';
import { HBar, Sheet } from '../ui';
import type { Fmt } from './format';
import { formatMetric } from './widgets';
import { WIDGET_ORDER, type WidgetId } from './useOverview';

/** Start of the unbroken run of "down" probes that ends at the newest probe, or null when the newest probe is fine or there are none. */
export function downSince(probes: AdminProbe[], component: keyof AdminHealthComponents): { since: string; last: string } | null {
  const sorted = probes.filter(p => p.components[component].status !== 'unknown').sort((a, b) => a.checked_at.localeCompare(b.checked_at)); // buckets without a check say nothing
  const newest = sorted[sorted.length - 1];
  if (!newest || newest.components[component].status !== 'down') return null;
  let since = newest.checked_at;
  for (let i = sorted.length - 2; i >= 0 && sorted[i].components[component].status === 'down'; i--) since = sorted[i].checked_at;
  return { since, last: newest.checked_at };
}

export function FixSheet({ component, onClose, fmt, t }: { component: keyof AdminHealthComponents | null; onClose: () => void; fmt: Fmt; t: TFunction }) {
  const [probes, setProbes] = useState<AdminProbe[] | null>(null);
  useEffect(() => {
    if (!component) return;
    let live = true;
    setProbes(null);
    admin.system().then(s => { if (live) setProbes(Array.isArray(s?.probes) ? s.probes : []); }, () => { if (live) setProbes([]); });
    return () => { live = false; };
  }, [component]);
  const name = component ? t(`component.${component}`) : '';
  const down = component && probes ? downSince(probes, component) : null;
  const steps = component ? t(`fix.${component}.steps`, { returnObjects: true }) as unknown as string[] : [];
  return <Sheet open={component != null} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('actions.close')} title={t('fix.title', { component: name })}
    subtitle={<span className="inline-flex rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">{t('fix.badge')}</span>}
    footer={<><Button variant="outline" onClick={onClose}>{t('actions.close')}</Button><Button asChild><Link to="/admin/system">{t('fix.systemLink')}</Link></Button></>}>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
      <dt className="text-muted-foreground">{t('fix.component')}</dt><dd className="font-medium [overflow-wrap:anywhere]">{name}</dd>
      <dt className="text-muted-foreground">{t('fix.since')}</dt><dd className="tabular-nums">{probes == null ? <Skeleton className="h-5 w-32" /> : down ? fmt.dateTime(down.since) : t('fix.sinceUnknown')}</dd>
      {down ? <><dt className="text-muted-foreground">{t('fix.lastChecked')}</dt><dd className="tabular-nums">{fmt.dateTime(down.last)}</dd></> : null}
    </dl>
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{t('fix.stepsTitle')}</h3>
      <ol className="grid list-decimal gap-1.5 ps-5 text-[15px]">{Array.isArray(steps) ? steps.map(s => <li key={s}>{s}</li>) : null}</ol>
    </div>
    <p className="rounded-lg bg-accent px-4 py-3 text-sm">{t('fix.note')}</p>
  </Sheet>;
}

export function BucketSheet({ at, range, metric, data, onClose, fmt, t }: {
  at: number | null; range: AdminRange; metric: AdminMetric; data: AdminOverview; onClose: () => void; fmt: Fmt; t: TFunction;
}) {
  const point = at == null ? null : data.series[at] ?? null;
  const [bucket, setBucket] = useState<AdminBucket | null>(null);
  const [failed, setFailed] = useState(false);
  const start = point?.start;
  useEffect(() => {
    if (!start) return;
    let live = true;
    setBucket(null); setFailed(false);
    admin.bucket(range, metric, start).then(b => { if (live) setBucket(b); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [start, range, metric]);
  const approx = data.kpis.cost_has_manual;
  const parts = bucket?.parts ?? [];
  const top = Math.max(Number.EPSILON, ...parts.map(p => p.value));
  const fmtPart = (v: number) => formatMetric(metric === 'active_users' ? 'runs' : metric, v, fmt, approx);
  const title = point ? (data.bucket_seconds < 86400 ? fmt.dateTime(point.start) : fmt.date(point.start)) : '';
  const heading = metric === 'failure_rate' ? t('bucket.failureParts') : metric === 'cost_usd' ? t('bucket.costParts') : t('bucket.parts');
  return <Sheet open={at != null} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('actions.close')} title={title}
    subtitle={bucket ? <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">{t(`kpi.${metric}`)} {formatMetric(metric, bucket.value, fmt, approx)}</span> : undefined}
    footer={<Button variant="outline" onClick={onClose}>{t('actions.close')}</Button>}>
    <h3 className="text-sm font-semibold">{heading}</h3>
    {failed ? <p role="alert" className="text-sm text-destructive">{t('bucket.error')}</p>
      : !bucket ? <div className="grid gap-3" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} className="h-6" />)}</div>
      : parts.length === 0 ? <p className="text-sm text-muted-foreground">{t('bucket.empty')}</p>
      : <div className="grid gap-3">{parts.map((p, i) => <HBar key={p.operation} index={i} animateKey={`${start}:${metric}`} fill={p.value / top}
          label={t(`op.${p.operation}`, { defaultValue: p.operation })} valueLabel={fmtPart(p.value)} className="grid-cols-[150px_minmax(0,1fr)_84px] max-sm:grid-cols-[110px_minmax(0,1fr)_72px]" />)}</div>}
  </Sheet>;
}

export function CustomizeSheet({ open, onClose, shown, onToggle, t }: {
  open: boolean; onClose: () => void; shown: string[]; onToggle: (id: WidgetId, on: boolean) => void; t: TFunction;
}) {
  return <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('actions.close')} title={t('customize.title')} subtitle={t('customize.hint')}
    footer={<Button onClick={onClose}>{t('actions.close')}</Button>}>
    <ul className="grid gap-2.5">{WIDGET_ORDER.map(id => {
      const on = shown.includes(id);
      const name = t(`customize.widgets.${id}.name`);
      return <li key={id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3.5', on && 'border-primary/40 bg-accent/40')}>
        <div className="min-w-0"><p className="font-medium">{name}</p><p className="text-sm text-muted-foreground">{t(`customize.widgets.${id}.desc`)}</p></div>
        <Button size="sm" variant={on ? 'outline' : 'default'} aria-pressed={on} aria-label={`${name}: ${on ? t('customize.shown') : t('customize.add')}`} onClick={() => onToggle(id, !on)}>
          {on ? <Check aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}{on ? t('customize.shown') : t('customize.add')}
        </Button>
      </li>;
    })}</ul>
  </Sheet>;
}
