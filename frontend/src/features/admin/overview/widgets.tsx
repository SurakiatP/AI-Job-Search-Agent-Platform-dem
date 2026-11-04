import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { CircleCheckBig, Ellipsis, LayoutGrid, EyeOff } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AdminMetric, AdminOverview, AdminRange } from '../../../lib/api-types';
import { BreakdownStrip, DeltaChip, Gauge, HBar, ShareBar, TrendChart, WeekdayBars, formatBucketLabel, rangeHasComparison, type BreakdownItem, type TrendPoint } from '../ui';
import type { Fmt } from './format';

export const METRICS: AdminMetric[] = ['runs', 'active_users', 'failure_rate', 'cost_usd'];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const opLabel = (t: TFunction, op: string) => t(`op.${op}`, { defaultValue: op });

export const metricValue = (p: AdminOverview['series'][number], m: AdminMetric) => m === 'runs' ? p.runs : m === 'active_users' ? p.active_users : m === 'failure_rate' ? p.failures : p.cost_usd;

/** Text of a KPI or a bucket value. Cost is baht and carries "≈" when a hand-entered price is inside. */
export const formatMetric = (m: AdminMetric, v: number, fmt: Fmt, approx: boolean) => m === 'failure_rate' ? fmt.pct(v) : m === 'cost_usd' ? fmt.money(v, approx) : fmt.n(v);

/** Relative change against the previous window. Null when there is nothing to compare (hides the chip). */
export function changeOf(value: number, previous: number | null) {
  if (previous == null) return null;
  if (previous === 0) return value === 0 ? 0 : null;
  return (value - previous) / previous;
}

export function Zero({ title, hint, className }: { title: string; hint?: string; className?: string }) {
  return <div role="status" className={cn('grid justify-items-center gap-1 px-4 py-8 text-center', className)}>
    <CircleCheckBig className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
    <p className="font-medium">{title}</p>
    {hint ? <p className="max-w-xs text-sm text-muted-foreground">{hint}</p> : null}
  </div>;
}

export function Widget({ id, title, badge, flush, onHide, onCustomize, t, children }: {
  id: string; title: ReactNode; badge?: ReactNode; flush?: boolean; onHide: () => void; onCustomize: () => void; t: TFunction; children: ReactNode;
}) {
  const name = t(`customize.widgets.${id}.name`);
  return <section aria-labelledby={`ov-${id}`} data-widget={id} className="min-w-0 rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
    <div className="flex items-center gap-2 px-5 pt-4 max-sm:px-4">
      <h2 id={`ov-${id}`} className="flex min-w-0 items-center gap-2 text-base font-semibold [overflow-wrap:anywhere]">{title}{badge}</h2>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="ms-auto" aria-label={t('customize.options', { name })}><Ellipsis className="size-5" aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onHide}><EyeOff aria-hidden="true" />{t('customize.hide')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCustomize}><LayoutGrid aria-hidden="true" />{t('actions.customize')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className={flush ? 'pb-2 pt-2' : 'px-5 pb-5 pt-3 max-sm:px-4'}>{children}</div>
  </section>;
}

export function TrendWidget({ data, range, metric, fmt, t, onBucket }: { data: AdminOverview; range: AdminRange; metric: AdminMetric; fmt: Fmt; t: TFunction; onBucket: (index: number) => void }) {
  const approx = data.kpis.cost_has_manual;
  const compare = data.compare && rangeHasComparison(range);
  const kpi = data.kpis[metric];
  const conv = (v: number) => metric === 'cost_usd' ? fmt.thb(v) : v;
  const text = (v: number) => metric === 'cost_usd' ? fmt.baht(v, approx) : t(`trend.unit.${metric === 'failure_rate' ? 'failure_rate' : metric}`, { n: fmt.n(v) });
  const points: TrendPoint[] = data.series.map((p, i) => {
    const before = data.previous_series[i];
    return { label: formatBucketLabel(p.start, range, fmt.loc), value: conv(metricValue(p, metric)),
      ...(compare && before ? { prev: conv(metricValue(before, metric)), prevLabel: formatBucketLabel(before.start, range, fmt.loc) } : {}) };
  });
  const empty = points.every(p => p.value === 0);
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0] ?? { label: '', value: 0 });
  const change = changeOf(kpi.value, kpi.previous);
  const share = (items: { key: string; label: string; value: string; n: number }[], title: string, danger = false) => {
    const total = sum(items.map(i => i.n));
    const list: BreakdownItem[] = items.slice(0, 5).map(i => ({ key: i.key, label: i.label, value: i.value, share: total ? i.n / total : 0 }));
    return { title, danger, list, total };
  };
  const strip = metric === 'runs' ? share(data.top_tasks.filter(x => x.runs > 0).map(x => ({ key: x.operation, label: opLabel(t, x.operation), value: fmt.n(x.runs), n: x.runs })), t('trend.byTask'))
    : metric === 'failure_rate' ? share(data.top_tasks.map(x => ({ x, n: Math.round(x.runs * x.failure_rate) })).filter(x => x.n > 0).map(({ x, n }) => ({ key: x.operation, label: opLabel(t, x.operation), value: fmt.n(n), n })), t('trend.byTaskFailed'), true)
    : metric === 'cost_usd' ? share(data.cost_by_model.filter(x => x.cost_usd > 0).map(x => ({ key: x.model, label: x.model, value: fmt.money(x.cost_usd, x.has_manual), n: x.cost_usd })), t('trend.byModel'))
    : null;
  const label = t(`kpi.${metric}`);
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <div className="grid"><span className="text-sm text-muted-foreground">{label}</span><span className="text-2xl font-semibold tabular-nums">{formatMetric(metric, kpi.value, fmt, approx)}</span></div>
      {compare ? <span className="flex items-center gap-2 pb-1 text-sm text-muted-foreground">
        <DeltaChip change={change} good={metric === 'failure_rate' ? 'down' : 'up'} />{change != null ? t('trend.fromPrevious') : null}</span> : null}
    </div>
    <TrendChart points={empty ? [] : points} animateKey={`${metric}:${range}`} danger={metric === 'failure_rate'}
      ariaLabel={t(`trend.question.${metric}`)} seriesLabel={t('trend.now')} prevSeriesLabel={compare ? t('trend.before') : undefined}
      summary={t('trend.summary', { label: t(`trend.series.${metric}`), total: formatMetric(metric, kpi.value, fmt, approx), peak: peak.label, peakValue: text(peak.value) })}
      sliderLabel={t('trend.slider')} formatValue={text} formatAxis={metric === 'failure_rate' ? undefined : metric === 'cost_usd' ? v => fmt.baht(v).slice(approx ? 2 : 1) : undefined}
      onSelectPoint={onBucket} empty={<Zero title={t('trend.empty')} />} />
    {!empty && strip && strip.list.length ? <BreakdownStrip title={strip.title} items={strip.list} danger={strip.danger} animateKey={`${metric}:${range}`} className="mt-0"
      tipFor={i => t('trend.tip', { label: i.label, share: `${Math.round(i.share * 100)}%` })} /> : null}
  </div>;
}

export function AttentionBody({ data, t, onFix }: { data: AdminOverview; t: TFunction; onFix: (component: string) => void }) {
  if (!data.attention.length) return <Zero title={t('attention.empty')} hint={t('attention.emptyHint')} />;
  return <ul className="divide-y">
    {data.attention.map((a, i) => {
      const params = { ...a.params, operation: opLabel(t, String(a.params.operation ?? '')), component: t(`component.${a.params.component}`, { defaultValue: String(a.params.component ?? '') }) };
      const why = a.kind === 'ingest_failed' || a.kind === 'ingest_partial' ? (a.params.error ? t('attention.error', { error: a.params.error }) : t('attention.why.ingest')) : t(`attention.why.${a.kind}`);
      const tone = a.severity === 'bad' ? 'bg-destructive' : 'bg-warning';
      return <li key={`${a.kind}:${i}:${JSON.stringify(a.params)}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-5 py-4 max-sm:px-4">
        <span className={cn('mt-2 size-2.5 rounded-full', tone)} aria-hidden="true" />
        <div className="grid min-w-0 gap-1">
          <p className="font-medium leading-snug [overflow-wrap:anywhere]"><span className="sr-only">{t(a.severity === 'bad' ? 'attention.sevBad' : 'attention.sevWarn')}: </span>{t(a.title_key, params)}</p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{why}</p>
          <div className="mt-2">
            {a.kind === 'health_down'
              ? <Button size="sm" onClick={() => onFix(String(a.params.component))}>{t('attention.open.health_down')}</Button>
              : <Button size="sm" variant={a.kind === 'failed_runs' ? 'default' : 'outline'} asChild><Link to={a.target}>{t(`attention.open.${a.kind}`)}</Link></Button>}
          </div>
        </div>
      </li>;
    })}
  </ul>;
}

export function WeekdayBody({ data, range, fmt, t }: { data: AdminOverview; range: AdminRange; fmt: Fmt; t: TFunction }) {
  const days = data.weekday;
  if (days.length !== 7 || days.every(v => v === 0)) return <Zero title={t('weekday.empty')} />;
  const low = days.indexOf(Math.min(...days));
  return <div className="grid gap-3">
    <WeekdayBars ariaLabel={t('weekday.ariaGroup')} animateKey={range} formatValue={v => fmt.n(v)}
      days={days.map((value, i) => ({ key: String(i), label: fmt.weekday(i), value, aria: t('weekday.aria', { day: fmt.weekday(i, true), value: fmt.n(value) }) }))} />
    <p className="text-sm text-muted-foreground">{t('weekday.quiet', { day: fmt.weekday(low, true) })}</p>
  </div>;
}

export function SpeedBody({ data, range, t }: { data: AdminOverview; range: AdminRange; t: TFunction }) {
  const { within_30s_ratio: ratio, target } = data.speed;
  if (ratio == null) return <Zero title={t('speed.empty')} />;
  const value = Math.round(ratio * 100), goal = Math.round(target * 100), gap = Math.abs(goal - value);
  const caption = gap === 0 ? t('speed.captionOn', { target: goal }) : value < goal ? t('speed.caption', { target: goal, gap }) : t('speed.captionOver', { target: goal, gap });
  return <Gauge value={value} target={goal} caption={caption} ariaLabel={t('speed.aria', { value, target: goal })} animateKey={range} />;
}

export function TasksBody({ data, range, fmt, t }: { data: AdminOverview; range: AdminRange; fmt: Fmt; t: TFunction }) {
  const rows = data.top_tasks;
  if (!rows.length) return <Zero title={t('tasks.empty')} />;
  const top = Math.max(1, ...rows.map(r => r.runs));
  const total = Math.max(1, data.kpis.runs.value);
  const approx = data.kpis.cost_has_manual;
  const th = 'px-5 py-2 text-start text-xs font-medium text-muted-foreground max-sm:px-4';
  return <div className="overflow-x-auto"><table className="w-full min-w-0 border-collapse text-sm">
    <thead><tr className="border-b">
      <th scope="col" className={th}>{t('tasks.task')}</th><th scope="col" className={cn(th, 'max-sm:hidden')}>{t('tasks.share')}</th><th scope="col" className={cn(th, 'text-end')}>{t('tasks.runs')}</th>
      <th scope="col" className={cn(th, 'text-end max-sm:hidden')}>{t('tasks.failed')}</th><th scope="col" className={cn(th, 'text-end max-sm:hidden')}>{t('tasks.p50')}</th><th scope="col" className={cn(th, 'text-end')}>{t('tasks.cost')}</th>
    </tr></thead>
    <tbody className="divide-y">{rows.map(r => <tr key={r.operation}>
      <td className="px-5 py-3 font-medium [overflow-wrap:anywhere] max-sm:px-4">{opLabel(t, r.operation)}</td>
      <td className="min-w-32 px-5 py-3 max-sm:hidden"><ShareBar share={r.runs / top} label={`${Math.round((r.runs / total) * 100)}%`} animateKey={range} /></td>
      <td className="px-5 py-3 text-end tabular-nums max-sm:px-4">{fmt.n(r.runs)}</td>
      <td className={cn('px-5 py-3 text-end tabular-nums max-sm:hidden', r.failure_rate >= 0.5 && 'font-medium text-destructive')}>{fmt.pct(r.failure_rate)}</td>
      <td className="whitespace-nowrap px-5 py-3 text-end tabular-nums max-sm:hidden">{r.p50_seconds == null ? '–' : t('tasks.seconds', { n: r.p50_seconds.toFixed(1) })}</td>
      <td className="whitespace-nowrap px-5 py-3 text-end tabular-nums max-sm:px-4">{fmt.money(r.cost_usd, approx)}</td>
    </tr>)}</tbody>
  </table></div>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export function ActivityBody({ data, fmt, t }: { data: AdminOverview; fmt: Fmt; t: TFunction }) {
  if (!data.activity.length) return <Zero title={t('activity.empty')} />;
  return <ul className="divide-y">{data.activity.map(a => {
    const what = t(`activity.action.${a.action.replace(/\./g, '_')}`, { defaultValue: a.action });
    const target = a.target_id ? (UUID.test(a.target_id) ? a.target_id.slice(0, 8) : a.target_id) : '';
    return <li key={a.id} className="grid gap-0.5 px-5 py-3 max-sm:px-4">
      <p className="text-sm leading-snug [overflow-wrap:anywhere]">{what}{target ? <> <span className="font-medium tabular-nums">{target}</span></> : null}</p>
      <p className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{a.actor_email} · {fmt.dateTime(a.created_at)}</p>
    </li>;
  })}</ul>;
}

export function ModelsBody({ data, range, fmt, t }: { data: AdminOverview; range: AdminRange; fmt: Fmt; t: TFunction }) {
  const rows = data.cost_by_model.filter(m => m.calls > 0);
  if (!rows.length) return <Zero title={t('models.empty')} />;
  const top = Math.max(Number.EPSILON, ...rows.map(r => r.cost_usd));
  return <div className="grid gap-3">{rows.map((r, i) => <HBar key={r.model} index={i} animateKey={range} fill={r.cost_usd / top}
    label={r.has_manual ? `${r.model} (${t('models.manual')})` : r.model} valueLabel={fmt.money(r.cost_usd, r.has_manual)}
    className="grid-cols-[minmax(0,200px)_minmax(0,1fr)_104px] max-sm:grid-cols-[minmax(0,1fr)_72px_96px]" />)}</div>;
}
