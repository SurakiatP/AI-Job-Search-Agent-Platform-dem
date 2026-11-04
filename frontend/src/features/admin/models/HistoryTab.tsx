import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { AdminBenchmark, AdminTaskSetting } from '@/lib/api-types';
import { score, taskName, useWhen } from './lib';
import { card } from './parts';
import { EmptyHint } from './states';

export function HistoryTab({ items, tasks }: { items: AdminBenchmark[]; tasks: AdminTaskSetting[] }) {
  const { t } = useTranslation('admin-models');
  const when = useWhen();
  const inUse = new Set(tasks.map(x => x.benchmark_id).filter(Boolean));
  const badge = (b: AdminBenchmark) => b.status === 'failed' ? <Badge variant="danger">{t('history.error')}</Badge>
    : b.status === 'queued' ? <Badge variant="muted">{t('history.queued')}</Badge>
    : b.status === 'running' ? <Badge variant="default">{t('history.running')}</Badge>
    : b.verdict === 'green' ? <Badge variant={inUse.has(b.id) ? 'success' : 'muted'}>{inUse.has(b.id) ? t('history.passedUsed') : t('history.passed')}</Badge>
    : b.verdict === 'red' ? <Badge variant="danger">{t('history.failed')}</Badge> : <Badge variant="muted">{t('history.na')}</Badge>;
  return <section className={card} aria-labelledby="hist-h">
    <div className="px-6 pb-4 pt-5 max-sm:px-4"><h2 id="hist-h" className="text-lg font-semibold">{t('history.title')}</h2></div>
    {items.length === 0 ? <EmptyHint title={t('history.empty')} hint={t('history.emptyHint')} /> : <ul className="divide-y divide-border border-t">
      {items.map(b => <li key={b.id} className="grid items-center gap-x-4 gap-y-1.5 px-6 py-3.5 text-sm grid-cols-[130px_minmax(0,1fr)_auto] max-md:grid-cols-1 max-sm:px-4">
        <span>{badge(b)}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{taskName(t, b.operation)} · {b.model} / {t(`effort.${b.effort}`)}
          {b.summary ? <> · <strong className="tabular-nums">{score(b.summary.quality)}</strong>{b.baseline ? <span className="text-muted-foreground tabular-nums"> ({t('history.was', { value: score(b.baseline.quality) })})</span> : null}</> : null}</span>
        <span className="text-muted-foreground tabular-nums max-md:text-xs">{when(b.finished_at ?? b.started_at ?? '')} · {b.created_by}</span>
      </li>)}
    </ul>}
  </section>;
}
