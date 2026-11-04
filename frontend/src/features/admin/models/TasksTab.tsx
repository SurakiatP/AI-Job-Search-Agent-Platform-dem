import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminRegisteredModel, AdminTaskSetting } from '@/lib/api-types';
import { useDrawn } from '../ui';
import { Tip } from '../ui';
import { perCall, score, taskName } from './lib';
import { Dots, card } from './parts';
import { EmptyHint } from './states';

const cols = 'grid items-center gap-x-4 gap-y-2.5 px-6 py-4 grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_150px_130px_96px] max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_96px] max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:px-4';

function ScoreBar({ value }: { value: number }) {
  const drawn = useDrawn(value);
  return <span className="grid gap-1.5"><span className="text-[15px] font-semibold tabular-nums">{score(value)}</span>
    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <i className={`block h-full origin-left rounded-full ${value < 92 ? 'bg-warning' : 'bg-success'}`} style={{ transform: `scaleX(${drawn ? value / 100 : 0})`, transition: 'transform 500ms var(--admin-ease-out)' }} />
    </span></span>;
}

export function TasksTab({ tasks, models, onChange }: { tasks: AdminTaskSetting[]; models: AdminRegisteredModel[]; onChange: (task: AdminTaskSetting, opener: HTMLElement) => void }) {
  const { t } = useTranslation('admin-models');
  const manual = new Set(models.filter(m => m.price_source === 'manual').map(m => m.model));
  return <section className={card} aria-labelledby="tasks-h">
    <div className="px-6 pb-4 pt-5 max-sm:px-4"><h2 id="tasks-h" className="text-lg font-semibold">{t('tasks.title')}</h2><p className="mt-0.5 text-sm text-muted-foreground">{t('tasks.sub')}</p></div>
    {tasks.length === 0 ? <EmptyHint title={t('tasks.empty')} hint={t('tasks.emptyHint')} /> : <>
      <div className={`${cols} bg-muted py-2.5 text-xs font-medium text-muted-foreground max-sm:hidden`} aria-hidden="true">
        <span>{t('tasks.colTask')}</span><span>{t('tasks.colModel')}</span><span>{t('tasks.colScore')}</span><span className="text-end max-lg:hidden">{t('tasks.colCost')}</span><span />
      </div>
      <ul className="divide-y divide-border">
        {tasks.map(row => {
          const isManual = manual.has(row.model) || row.cost_has_manual;
          const nm = taskName(t, row.operation);
          return <li key={row.operation} className={`${cols} transition-colors hover:bg-primary/[0.04]`}>
            <div className="min-w-0"><div className="font-medium leading-normal">{nm}</div><div className="text-[13px] leading-normal text-muted-foreground">{t(`task.${row.operation}.desc`, { defaultValue: '' })}</div></div>
            <div className="grid min-w-0 gap-1 max-sm:col-span-full max-sm:row-start-2">
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium [overflow-wrap:anywhere]">{row.model}
                {isManual ? <Tip text={t('tasks.manualTip')}><Badge variant="warning"><Pencil className="size-3" aria-hidden="true" />{t('tasks.manual')}</Badge></Tip> : null}</span>
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Dots effort={row.effort} />{t('tasks.effortLine', { effort: t(`effort.${row.effort}`) })}</span>
            </div>
            <div className="max-sm:col-span-full max-sm:row-start-3">{row.quality == null ? <span className="text-sm text-muted-foreground">{t('tasks.notTested')}</span> : <ScoreBar value={row.quality} />}</div>
            <div className="text-end text-sm tabular-nums max-lg:hidden">{row.cost_per_call_usd == null ? '—' : `${isManual ? '≈ ' : ''}${perCall(row.cost_per_call_usd)}`}<small className="block text-xs text-muted-foreground">{t('tasks.perCall')}</small></div>
            <div className="text-end max-sm:col-start-2 max-sm:row-start-1"><Button size="sm" variant="outline" aria-label={t('tasks.changeFor', { task: nm })} onClick={e => onChange(row, e.currentTarget)}>{t('tasks.change')}</Button></div>
          </li>;
        })}
      </ul></>}
  </section>;
}
