import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminRunItem } from '../../../lib/api-types';
import { compact, formatCost, formatDuration, formatTime } from './format';
import { useOperationLabel } from './useOperationLabel';

const COLS = ['task', 'status', 'model', 'user', 'started', 'duration', 'tokens', 'cost'] as const;
// Under 768px each row becomes a small card (task + status, then model, time, tokens and cost); `data-label` supplies the caption.
const cell = 'px-3 py-3 align-top max-md:block max-md:px-0 max-md:py-0 max-md:before:me-2 max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]';

export function RunTableSkeleton() {
  const { t } = useTranslation('admin-runs');
  return <div role="status" aria-label={t('loading')} className="grid divide-y">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 px-3 py-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-5 flex-1 max-md:hidden" /><Skeleton className="h-5 w-24 max-md:hidden" /></div>)}</div>;
}

export function RunTable({ items, selected, onSelect }: { items: AdminRunItem[]; selected: string | null; onSelect: (id: string) => void }) {
  const { t, i18n } = useTranslation('admin-runs');
  const lang = i18n.language, locale = lang.startsWith('th') ? 'th' : 'en';
  const unit = t('dur', { returnObjects: true }) as { s: string; m: string; h: string };
  const operationLabel = useOperationLabel();
  return <table aria-label={t('list')} className="w-full border-collapse text-sm max-md:block">
    <thead className="max-md:sr-only"><tr className="border-b text-start text-xs text-muted-foreground">
      {COLS.map(c => <th key={c} scope="col" className={`px-3 py-2 font-medium ${c === 'duration' || c === 'tokens' || c === 'cost' ? 'text-end' : 'text-start'}`}>{t(`cols.${c}`)}</th>)}
    </tr></thead>
    <tbody className="max-md:block">{items.map(r => <tr key={r.id} onClick={() => onSelect(r.id)} aria-selected={selected === r.id || undefined}
      className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-primary/[0.04] aria-selected:bg-[color:var(--nav-active)] max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3">
      <td className={`${cell} font-medium max-md:text-base`}>
        <button type="button" onClick={e => { e.stopPropagation(); onSelect(r.id); }} className="min-h-6 rounded text-start font-medium [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{operationLabel(r.operation)}</button>
        {r.retry_of_id && <span className="ms-2 text-xs font-normal text-muted-foreground">↻</span>}
      </td>
      <td className={`${cell} max-md:justify-self-end`}><StatusBadge status={r.status} locale={locale} /></td>
      <td className={`${cell} max-md:col-span-2 max-md:text-muted-foreground`}>
        <span className="[overflow-wrap:anywhere]">{r.model ?? '—'}</span>{r.model && r.effort ? <span className="text-muted-foreground"> · {t('effort', { value: r.effort })}</span> : null}
      </td>
      <td className={`${cell} whitespace-nowrap font-mono text-xs max-md:hidden`}>{r.user_short_id ?? '—'}</td>
      <td className={`${cell} whitespace-nowrap tabular-nums max-md:col-span-2 max-md:text-xs`} data-label={t('cols.started')}>{r.started_at ? formatTime(r.started_at, lang) : <span className="text-muted-foreground">{t('queuedNotStarted')}</span>}</td>
      <td className={`${cell} whitespace-nowrap text-end tabular-nums max-md:text-start max-md:text-xs`} data-label={t('cols.duration')}>{formatDuration(r.duration_seconds, unit)}</td>
      <td className={`${cell} text-end tabular-nums max-md:text-start max-md:text-xs`} data-label={t('cols.tokens')}>
        <span className="whitespace-nowrap">{compact(r.input_tokens, lang)} {t('tokens.in')} · {compact(r.output_tokens, lang)} {t('tokens.out')}</span>
        {r.cached_tokens > 0 && <span className="block whitespace-nowrap text-xs text-muted-foreground max-md:inline max-md:before:content-['·_']">{compact(r.cached_tokens, lang)} {t('tokens.cached')}</span>}
      </td>
      <td className={`${cell} whitespace-nowrap text-end tabular-nums max-md:text-start max-md:text-xs`} data-label={t('cols.cost')} title={r.cost_usd === null ? t('cost.none') : r.cost_is_manual ? t('cost.manualNote') : undefined}>
        {formatCost(r.cost_usd, r.cost_is_manual)}{r.cost_usd === null && <span className="sr-only">{t('cost.none')}</span>}
      </td>
    </tr>)}</tbody>
  </table>;
}
