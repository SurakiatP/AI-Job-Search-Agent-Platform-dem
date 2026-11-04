import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { isRangeKey, RangeMenu, type RangeKey } from './ui';
import { RunSheet } from './runs/RunSheet';
import { RunTable, RunTableSkeleton } from './runs/RunTable';
import { OPERATIONS, STATUSES } from './runs/format';
import { useOperationLabel } from './runs/useOperationLabel';
import { useRunList } from './runs/useRunList';

const DEFAULT_RANGE: RangeKey = 'all';

/** Filters and the open run live in the URL (?status=failed&operation=&model=&range=&run=), so Overview and shared links land on the same view. */
export function RunsPage() {
  const { t } = useTranslation('admin-runs');
  const [params, setParams] = useSearchParams();
  const operationLabel = useOperationLabel();
  const status = STATUSES.find(s => s === params.get('status'));
  const operation = OPERATIONS.find(o => o === params.get('operation'));
  const model = params.get('model') ?? '';
  const range = isRangeKey(params.get('range')) ? params.get('range') as RangeKey : DEFAULT_RANGE;
  const runId = params.get('run');

  const set = useCallback((changes: Record<string, string | null>, replace = false) => setParams(prev => {
    const next = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    return next;
  }, { replace }), [setParams]);

  // The model box types freely; the URL (and the request) follow 400 ms after the last key.
  const [typed, setTyped] = useState(model);
  useEffect(() => setTyped(model), [model]);
  useEffect(() => {
    if (typed.trim() === model) return;
    const timer = window.setTimeout(() => set({ model: typed.trim() || null }, true), 400);
    return () => window.clearTimeout(timer);
  }, [typed, model, set]);

  const list = useRunList({ status, operation, model: model || undefined, range });
  const filtered = Boolean(status || operation || model || range !== DEFAULT_RANGE);
  const models = [...new Set(list.items.map(r => r.model).filter((m): m is string => Boolean(m)))];
  const { patch, refresh } = list;
  const onChanged = useCallback((run: Parameters<typeof patch>[0] | null) => { if (run) patch(run); else void refresh(); }, [patch, refresh]);

  return <>
    <PageHeader icon={Activity} title={t('title')} lede={t('lede')} />
    <div className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label={t('title')}>
      <label className="grid min-w-36 gap-1 text-xs font-medium text-muted-foreground max-sm:flex-1">{t('filters.status')}
        <Select value={status ?? ''} onChange={e => set({ status: e.target.value || null })}>
          <option value="">{t('status.all')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
      </label>
      <label className="grid min-w-36 gap-1 text-xs font-medium text-muted-foreground max-sm:flex-1">{t('filters.operation')}
        <Select value={operation ?? ''} onChange={e => set({ operation: e.target.value || null })}>
          <option value="">{t('filters.allOperations')}</option>
          {OPERATIONS.map(o => <option key={o} value={o}>{operationLabel(o)}</option>)}
        </Select>
      </label>
      <label className="grid min-w-48 gap-1 text-xs font-medium text-muted-foreground max-sm:w-full">{t('filters.model')}
        <Input value={typed} list="run-models" placeholder={t('filters.allModels')} autoComplete="off" spellCheck={false} onChange={e => setTyped(e.target.value)} />
        <datalist id="run-models">{models.map(m => <option key={m} value={m} />)}</datalist>
      </label>
      <RangeMenu value={range} onChange={r => set({ range: r === DEFAULT_RANGE ? null : r })} menuLabel={t('filters.range')} labelFor={r => t(`range.${r}`)} />
      {filtered && <Button variant="ghost" onClick={() => setParams(prev => { const n = new URLSearchParams(); if (prev.get('run')) n.set('run', prev.get('run')!); return n; })}>{t('filters.clear')}</Button>}
    </div>
    {list.live && <p className="mt-3 text-xs text-muted-foreground">{t('live')}</p>}

    <section className="mt-4 overflow-hidden rounded-2xl border bg-card" aria-busy={list.status === 'loading'}>
      {list.status === 'loading' ? <RunTableSkeleton />
        : list.status === 'error' ? <div className="p-4"><Alert severity="error" action={<Button variant="outline" size="sm" onClick={() => void list.reload()}>{t('error.retry')}</Button>}><p className="font-medium">{t('error.title')}</p><p>{t('error.body')}</p></Alert></div>
        : list.items.length === 0 ? <div className="grid gap-1 px-6 py-12 text-center"><h2 className="text-lg font-semibold">{t(filtered ? 'empty.filteredTitle' : 'empty.title')}</h2><p className="text-muted-foreground">{t(filtered ? 'empty.filteredBody' : 'empty.body')}</p></div>
        : <RunTable items={list.items} selected={runId} onSelect={id => set({ run: id })} />}
      {list.status === 'ready' && list.next && <div className="grid justify-items-center gap-2 border-t p-3">
        {list.more === 'error' && <p role="alert" className="text-sm text-destructive">{t('loadMoreFailed')}</p>}
        <Button variant="outline" busy={list.more === 'loading'} onClick={() => void list.loadMore()}>{list.more === 'loading' ? t('loadingMore') : t('loadMore')}</Button>
      </div>}
    </section>

    <RunSheet runId={runId} onClose={() => set({ run: null })} onOpen={id => set({ run: id })} onChanged={onChanged} />
  </>;
}
