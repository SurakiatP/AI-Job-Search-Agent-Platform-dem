import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { PAGE_SIZE, Pager, ShareBar, usePagerLabels } from '../ui';
import type { AdminUsage, AdminUsageRow } from '../../../lib/api-types';
import { count, dayLabel, money, type Currency } from './format';

type SortKey = 'cost' | 'requests';

export function UsageTable({ data, currency, rate, lang }: { data: AdminUsage; currency: Currency; rate: number; lang: string }) {
  const { t, i18n } = useTranslation('admin-usage');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const labels = usePagerLabels();
  const top = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const total = data.totals.cost_usd ?? 0;
  const value = (r: AdminUsageRow, k: SortKey) => (k === 'cost' ? r.cost_usd : r.requests);
  // Rows without a cost ("—") always sort last. Without a sort the server order stands (cost desc; day ascending).
  const rows = sort ? [...data.rows].sort((a, b) => {
    const x = value(a, sort.key), y = value(b, sort.key);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return sort.dir === 'asc' ? x - y : y - x;
  }) : data.rows;
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const toggle = (key: SortKey) => { setPage(0); setSort(s => (s?.key === key && s.dir === 'desc' ? { key, dir: 'asc' } : { key, dir: 'desc' })); };
  const name = (r: AdminUsageRow) => !r.key ? t('unknown')
    : data.group_by === 'task' ? i18n.t(`workspace.operations.${r.key}`, { ns: 'common', defaultValue: r.key })
    : data.group_by === 'day' ? dayLabel(r.key, lang) : r.key;
  const th = 'px-3 py-2 text-xs font-medium text-muted-foreground';
  const sortable = (key: SortKey, label: string) => {
    const on = sort?.key === key;
    const Icon = !on ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return <th scope="col" className={`${th} text-end`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggle(key)} aria-label={t('sortBy', { col: label })}
        className="-me-1 inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-1 text-xs font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {label}<Icon className="size-3.5" aria-hidden="true" /></button>
    </th>;
  };
  const num = 'px-2 py-3 text-end tabular-nums sm:px-3';
  const cell = (usd: number | null, approx: boolean) => usd == null ? <span className="text-muted-foreground" aria-label="—">—</span> : `${approx ? '≈ ' : ''}${money(usd, currency, rate, lang)}`;

  return <><div ref={top} className="overflow-x-auto">
    <table className="w-full sm:min-w-[640px] border-collapse text-sm" aria-label={t('tableLabel', { group: t(`groupBy.${data.group_by}`) })}>
      <thead><tr className="border-b">
        <th scope="col" className={`${th} text-start`}>{t(`groupBy.${data.group_by}`)}</th>
        <th scope="col" className={`${th} text-start max-sm:hidden`}>{t('cols.share')}</th>
        {sortable('requests', t('cols.requests'))}
        <th scope="col" className={`${th} text-end max-sm:hidden`}>{t('cols.input')}</th>
        <th scope="col" className={`${th} text-end max-sm:hidden`}>{t('cols.output')}</th>
        <th scope="col" className={`${th} text-end max-sm:hidden`}>{t('cols.cached')}</th>
        {sortable('cost', t('cols.cost'))}
        <th scope="col" className={`${th} text-end`}>{t('cols.perRequest')}</th>
      </tr></thead>
      <tbody>{shown.map(r => {
        const share = r.cost_usd != null && total > 0 ? r.cost_usd / total : 0;
        const pct = r.cost_usd == null ? '—' : share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
        return <tr key={r.key} className="border-b last:border-b-0 hover:bg-primary/[0.03]">
          <th scope="row" className="px-3 py-3 text-start font-medium">
            <span className="[overflow-wrap:anywhere]">{name(r)}</span>
            {r.has_manual && <Badge variant="warning" className="ms-2 align-middle">{t('manual')}</Badge>}
          </th>
          <td className="px-3 py-3 max-sm:hidden"><ShareBar share={share} label={pct} animateKey={`${data.group_by}:${data.range}`} /></td>
          <td className={num}>{count(r.requests, lang)}</td>
          <td className={`${num} max-sm:hidden`}>{count(r.input_tokens, lang)}</td>
          <td className={`${num} max-sm:hidden`}>{count(r.output_tokens, lang)}</td>
          <td className={`${num} max-sm:hidden`}>{count(r.cached_tokens, lang)}</td>
          <td className={`${num} whitespace-nowrap font-medium`}>{cell(r.cost_usd, r.has_manual)}</td>
          <td className={`${num} whitespace-nowrap`}>{cell(r.cost_per_request_usd, r.has_manual)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>
  <Pager page={page} total={rows.length} onPage={setPage} labels={labels} anchor={top} /></>;
}
