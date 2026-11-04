import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Activity, Download, LayoutDashboard, LayoutGrid, Receipt, ServerCrash, Users, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Snackbar } from '@/components/ui/snackbar';
import { PageHeader } from '../../components/PageHeader';
import { admin } from '../../lib/api';
import type { AdminFxRate, AdminHealthComponents, AdminMetric, AdminOverview } from '../../lib/api-types';
import { useLocale } from '../../app/providers';
import { useResource } from '../projects/useResource';
import { DEFAULT_RANGE, KpiCard, KpiTabs, RangeMenu, isRangeKey, rangeHasComparison, rangeRefreshMs, type RangeKey } from './ui';
import { makeFmt } from './overview/format';
import { BucketSheet, CustomizeSheet, FixSheet } from './overview/sheets';
import { WIDGET_ORDER, usePrefs, useOverview, type WidgetId } from './overview/useOverview';
import { ActivityBody, AttentionBody, METRICS, ModelsBody, SpeedBody, TasksBody, TrendWidget, WeekdayBody, Widget, Zero, changeOf, formatMetric } from './overview/widgets';

const ICONS = { runs: Activity, active_users: Users, failure_rate: CircleX, cost_usd: Receipt } as const;
const COLUMN: Record<WidgetId, 'main' | 'side'> = { trend: 'main', tasks: 'main', models: 'main', attention: 'side', weekday: 'side', speed: 'side', activity: 'side' };
const COMPONENTS: (keyof AdminHealthComponents)[] = ['postgres', 'object_store', 'llm_gateway', 'sandbox'];

function Loading({ label }: { label: string }) {
  return <div aria-busy="true" role="status" className="grid gap-6"><span className="sr-only">{label}</span>
    <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 max-[1180px]:grid-cols-1">
      <div className="grid content-start gap-6"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      <div className="grid content-start gap-6"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
    </div>
  </div>;
}

export function OverviewPage() {
  const { t } = useTranslation('admin-overview');
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const raw = params.get('range');
  const range: RangeKey = isRangeKey(raw) ? raw : DEFAULT_RANGE;
  const { data, failed, retry } = useOverview(range);
  const { prefs, setWidgets } = usePrefs();
  const fx = useResource<AdminFxRate>('/admin/fx');
  const rate = fx.data?.rate ?? null;
  const [metric, setMetric] = useState<AdminMetric>('runs');
  const [bucketAt, setBucketAt] = useState<number | null>(null);
  const [fix, setFix] = useState<keyof AdminHealthComponents | null>(null);
  const [customize, setCustomize] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<ReactNode>(null);
  const fmt = useMemo(() => makeFmt(locale, rate), [locale, rate]);
  const shown = prefs?.widgets ?? [];

  const setRange = (r: RangeKey) => setParams(p => { const next = new URLSearchParams(p); next.set('range', r); return next; }, { replace: true });
  const toggle = useCallback(async (id: WidgetId, on: boolean) => {
    const next = WIDGET_ORDER.filter(w => (w === id ? on : shown.includes(w)));
    const ok = await setWidgets(next);
    setNote(ok ? (on ? null : t('customize.hidden', { name: t(`customize.widgets.${id}.name`) })) : t('customize.saveError'));
  }, [shown, setWidgets, t]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await admin.overviewCsv(range);
      const file = `overview-${range}.csv`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: file });
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote(t('actions.exported', { file }));
    } catch {
      setNote(t('actions.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const actions = <>
    <RangeMenu value={range} onChange={setRange} labelFor={r => t(`range.${r}`)} menuLabel={t('range.menu')} />
    <Button variant="outline" onClick={() => setCustomize(true)}><LayoutGrid className="size-4" aria-hidden="true" />{t('actions.customize')}</Button>
    <Button busy={exporting} onClick={() => void exportCsv()}>{!exporting && <Download className="size-4" aria-hidden="true" />}{exporting ? t('actions.exporting') : t('actions.export')}</Button>
  </>;
  const lede = <>{t('lede')}{data ? <span className="mt-1 block text-sm tabular-nums">{t('updated', { seconds: rangeRefreshMs(range) / 1000, time: fmt.time(data.generated_at) })}</span> : null}</>;

  const render = (d: AdminOverview): ReactNode => {
    const compare = d.compare && rangeHasComparison(range);
    const approx = d.kpis.cost_has_manual;
    const down = COMPONENTS.filter(c => d.health.components[c] === 'down');
    const hide = (id: WidgetId) => () => void toggle(id, false);
    const wrap = (id: WidgetId, title: ReactNode, body: ReactNode, opts: { badge?: ReactNode; flush?: boolean } = {}) =>
      <Widget key={id} id={id} t={t} title={title} onHide={hide(id)} onCustomize={() => setCustomize(true)} {...opts}>{body}</Widget>;
    const widgets: Record<WidgetId, ReactNode> = {
      trend: wrap('trend', t(`trend.question.${metric}`), <TrendWidget data={d} range={range} metric={metric} fmt={fmt} t={t} onBucket={setBucketAt} />),
      attention: wrap('attention', t('attention.title'), <AttentionBody data={d} t={t} onFix={c => setFix(c as keyof AdminHealthComponents)} />,
        { flush: true, badge: d.attention.length ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive">{d.attention.length}</span> : undefined }),
      weekday: wrap('weekday', t('weekday.title'), <WeekdayBody data={d} range={range} fmt={fmt} t={t} />),
      speed: wrap('speed', t('speed.title'), <SpeedBody data={d} range={range} t={t} />),
      tasks: wrap('tasks', t('tasks.title'), <TasksBody data={d} range={range} fmt={fmt} t={t} />, { flush: true }),
      activity: wrap('activity', t('activity.title'), <ActivityBody data={d} fmt={fmt} t={t} />, { flush: true }),
      models: wrap('models', t('models.title'), <ModelsBody data={d} range={range} fmt={fmt} t={t} />),
    };
    const column = (c: 'main' | 'side') => <div className="grid min-w-0 content-start gap-6">{WIDGET_ORDER.filter(id => COLUMN[id] === c && shown.includes(id)).map(id => widgets[id])}</div>;
    return <div className="grid gap-6">
      {down.map(c => <div key={c} role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/10 py-2.5 pe-3 ps-4 text-sm">
        <ServerCrash className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p className="min-w-52 flex-1"><strong className="block font-semibold">{t('issue.title', { component: t(`component.${c}`) })}</strong><span className="text-muted-foreground">{t('issue.detail')}</span></p>
        <Button size="sm" variant="outline" onClick={() => setFix(c)}>{t('issue.how')}</Button>
      </div>)}
      <div className="grid gap-2">
        <KpiTabs ariaLabel={t('kpi.tabs')}>
          {METRICS.map(m => {
            const k = d.kpis[m];
            const change = compare ? changeOf(k.value, k.previous) : null;
            const pct = change == null ? 0 : Math.round(Math.abs(change) * 100);
            return <KpiCard key={m} label={t(`kpi.${m}`)} value={k.value} format={v => formatMetric(m, v, fmt, approx)} icon={(() => { const I = ICONS[m]; return <I />; })()}
              change={change} good={m === 'failure_rate' ? 'down' : 'up'} selected={metric === m} onSelect={() => setMetric(m)}
              changeLabel={change == null ? undefined : t(pct === 0 ? 'kpi.flat' : change > 0 ? 'kpi.up' : 'kpi.down', { pct })}
              vs={compare && k.previous != null ? t('kpi.vs', { value: formatMetric(m, k.previous, fmt, approx) }) : undefined} />;
          })}
        </KpiTabs>
        {approx ? <p className="text-xs text-muted-foreground">{t('kpi.costNote')}</p> : null}
        {fx.status === 'error' && !fx.data ? <p role="status" className="text-xs text-muted-foreground">{t('kpi.fxDown')}</p> : null}
      </div>
      {prefs && shown.length === 0 ? <div className="rounded-2xl border bg-card"><Zero title={t('allHidden')} hint={t('allHiddenHint')} /></div>
        : <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6 max-[1180px]:grid-cols-1">{column('main')}{column('side')}</div>}
      <BucketSheet at={bucketAt} range={range} metric={metric} data={d} onClose={() => setBucketAt(null)} fmt={fmt} t={t} />
    </div>;
  };

  return <>
    <PageHeader icon={LayoutDashboard} title={t('title')} lede={lede} actions={actions} />
    {failed ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={retry}>{t('actions.retry')}</Button>}><strong className="font-semibold">{t('error.title')}</strong> {t('error.body')}</Alert>
      : data && prefs && fx.status !== 'loading' ? render(data) : <Loading label={t('loading')} />}
    <FixSheet component={fix} onClose={() => setFix(null)} fmt={fmt} t={t} />
    <CustomizeSheet open={customize} onClose={() => setCustomize(false)} shown={shown} onToggle={(id, on) => void toggle(id, on)} t={t} />
    <Snackbar open={note != null} message={note} onClose={() => setNote(null)} />
  </>;
}
