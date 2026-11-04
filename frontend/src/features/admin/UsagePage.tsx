import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '../../components/PageHeader';
import type { AdminFxRate, AdminUsage, AdminUsageGroup } from '../../lib/api-types';
import { useResource } from '../projects/useResource';
import { DEFAULT_RANGE, isRangeKey, RangeMenu, Segmented, Tip } from './ui';
import { count, money, type Currency } from './usage/format';
import { RateControl } from './usage/RateControl';
import { UsageTable } from './usage/UsageTable';

const GROUPS: AdminUsageGroup[] = ['task', 'model', 'day', 'user'];

export function UsagePage() {
  const { t, i18n } = useTranslation('admin-usage');
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const range = isRangeKey(params.get('range')) ? (params.get('range') as typeof DEFAULT_RANGE) : DEFAULT_RANGE;
  const [group, setGroup] = useState<AdminUsageGroup>('task');
  const [currency, setCurrency] = useState<Currency>('usd');
  const usage = useResource<AdminUsage>(`/admin/usage?range=${range}&group_by=${group}`);
  const fx = useResource<AdminFxRate>('/admin/fx');
  const rate = fx.data?.rate ?? 0;
  const cur: Currency = currency === 'thb' && fx.data ? 'thb' : 'usd';
  const d = usage.data;
  const totals = d?.totals;

  const stat = (label: string, value: React.ReactNode) => <div className="grid gap-1 rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] max-sm:p-3">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd className="m-0 text-2xl font-semibold leading-tight tabular-nums max-sm:text-xl [overflow-wrap:anywhere]">{value}</dd>
  </div>;
  const approx = (on: boolean) => on ? <Tip text={t('approxTip')}><span tabIndex={0} role="note" aria-label={`≈ ${t('approxTip')}`} className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">≈</span></Tip> : null;
  const cost = (usd: number | null, on: boolean) => usd == null ? '—' : <>{approx(on)}{on ? ' ' : ''}{money(usd, cur, rate, lang)}</>;

  // min-w-0: the shell's grid track would otherwise grow to the table's minimum width at 390 px.
  return <div className="min-w-0">
    <PageHeader icon={Receipt} title={t('title')} lede={t('lede')}
      actions={<RangeMenu value={range} onChange={r => setParams({ range: r })} labelFor={r => t(`range.${r}`)} menuLabel={t('range.menu')} />} />
    <div className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-3">
      <Segmented ariaLabel={t('groupBy.label')} value={group} onChange={setGroup} options={GROUPS.map(g => ({ value: g, label: t(`groupBy.${g}`) }))} />
      <Segmented ariaLabel={t('currency.label')} value={cur} onChange={setCurrency} options={[{ value: 'usd', label: 'USD' }, ...(fx.data ? [{ value: 'thb' as const, label: 'THB' }] : [])]} />
      <RateControl fx={fx.data} loadFailed={fx.status === 'error' && !fx.data} onRetry={fx.reload} lang={lang} />
    </div>

    {usage.status === 'error' && !d ? <Alert severity="error" className="mt-6" action={<Button variant="outline" size="sm" onClick={usage.reload}>{t('error.retry')}</Button>}>
      <strong className="font-medium">{t('error.title')}</strong> {t('error.body')}</Alert>
    : !d || !totals ? <div className="mt-6 grid gap-4" role="status" aria-label={t('loading')}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
    : totals.requests === 0 ? <section className="mt-6 grid gap-1 rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-semibold">{t('empty.title')}</h2><p className="text-muted-foreground">{t('empty.body')}</p>
    </section>
    : <>
      <dl aria-label={t('totals.label')} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stat(t('totals.requests'), count(totals.requests, lang))}
        {stat(t('totals.input'), count(totals.input_tokens, lang))}
        {stat(t('totals.output'), count(totals.output_tokens, lang))}
        {stat(t('totals.cached'), count(totals.cached_tokens, lang))}
        {stat(t('totals.cost'), cost(totals.cost_usd, totals.has_manual))}
        {stat(t('totals.perRequest'), cost(totals.cost_per_request_usd, totals.has_manual))}
      </dl>
      <section className="mt-4 rounded-2xl border bg-card p-2 shadow-[var(--shadow-soft)] sm:p-3">
        <UsageTable key={group} data={d} currency={cur} rate={rate} lang={lang} />
      </section>
      {totals.uncosted_requests > 0 && <p className="mt-3 text-sm text-muted-foreground">{t('uncosted', { n: count(totals.uncosted_requests, lang) })}</p>}
    </>}
  </div>;
}
