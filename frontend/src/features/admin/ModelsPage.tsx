import { useState } from 'react';
import { FlaskConical, Layers, ListChecks, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { admin } from '@/lib/api';
import type { AdminTaskSetting } from '@/lib/api-types';
import { AddModelSheet } from './models/AddModelSheet';
import { ChangeSheet } from './models/ChangeSheet';
import { HistoryTab } from './models/HistoryTab';
import { LibraryTab } from './models/LibraryTab';
import { TasksTab } from './models/TasksTab';
import { errText, useLoad } from './models/lib';
import { PageSkeleton } from './models/states';

type Change = { key: number; task: AdminTaskSetting | null; open: boolean };

export function ModelsPage() {
  const { t } = useTranslation('admin-models');
  const { data, error, loading, reload } = useLoad(async () => {
    const [tasks, models, history] = await Promise.all([admin.tasks(), admin.models(), admin.benchmarks()]);
    return { tasks, models, history };
  });
  const [tab, setTab] = useState('tasks');
  const [change, setChange] = useState<Change | null>(null);
  const [adding, setAdding] = useState(false);
  const flow = [['choose', ListChecks], ['test', FlaskConical], ['decide', Layers]] as const;
  const open = (task: AdminTaskSetting | null) => setChange(c => ({ key: (c?.key ?? 0) + 1, task, open: true }));

  return <>
    <PageHeader icon={SlidersHorizontal} title={t('title')} lede={t('lede')}
      actions={data ? <Button variant="outline" onClick={() => open(null)}>{t('tasks.useOne')}</Button> : undefined} />
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5">
      {!data && loading ? <PageSkeleton label={t('load.refreshing')} /> : null}
      {!data && !loading ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={reload}>{t('load.retry')}</Button>}>{t('load.failed')} {errText(t, error)}</Alert> : null}
      {data ? <>
        <ol aria-label={t('flow.label')} className="grid overflow-hidden rounded-2xl border bg-card grid-cols-[minmax(0,1fr)] md:grid-cols-3 md:divide-x max-md:divide-y">
          {flow.map(([k, Icon]) => <li key={k} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3 px-5 py-4">
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-accent-foreground" aria-hidden="true"><Icon className="size-[18px]" /></span>
            <div><b className="block text-[15px] font-semibold leading-normal">{t(`flow.${k}.t`)}</b><span className="block text-[13px] leading-relaxed text-muted-foreground">{t(`flow.${k}.d`)}</span></div>
          </li>)}
        </ol>
        <Tabs value={tab} onValueChange={v => { setTab(v); if (v === 'history') reload(); }}>
          <TabsList aria-label={t('tabs.label')} className="flex-nowrap overflow-x-auto">
            {([['tasks', data.tasks.length], ['library', data.models.length], ['history', data.history.length]] as const).map(([k, n]) =>
              <TabsTrigger key={k} value={k}>{t(`tabs.${k}`)}<span className="ms-2 rounded-full bg-muted px-2 text-xs leading-5 text-muted-foreground tabular-nums">{n}</span></TabsTrigger>)}
          </TabsList>
          <TabsContent value="tasks"><TasksTab tasks={data.tasks} models={data.models} onChange={task => open(task)} /></TabsContent>
          <TabsContent value="library"><LibraryTab models={data.models} onAdd={() => setAdding(true)} onChanged={reload} onShowTasks={() => setTab('tasks')} /></TabsContent>
          <TabsContent value="history"><HistoryTab items={data.history} tasks={data.tasks} /></TabsContent>
        </Tabs>
      </> : null}
    </div>
    {data && change ? <ChangeSheet key={change.key} open={change.open} task={change.task} tasks={data.tasks} registered={data.models} onChanged={reload}
      onClose={() => setChange(c => c && { ...c, open: false })} /> : null}
    {data ? <AddModelSheet key={adding ? 'open' : 'closed'} open={adding} onClose={() => setAdding(false)} onChanged={reload} /> : null}
  </>;
}
