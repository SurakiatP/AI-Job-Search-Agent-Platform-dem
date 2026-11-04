import { useCallback, useEffect, useState } from 'react';
import { RotateCw, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminSystem } from '@/lib/api-types';
import { admin } from '@/lib/api';
import { ConnectCard } from './system/ConnectCard';
import { GatewayCard } from './system/GatewayCard';
import { isRangeKey, type RangeKey } from './ui';
import { HealthCard } from './system/HealthCard';
import { IngestCard } from './system/IngestCard';
import { ToolsCard } from './system/ToolsCard';
import { WebhooksCard } from './system/WebhooksCard';
import { useWhen } from './system/format';

const REFRESH_MS = 30_000;

/** The System page of one range. Keeps the last answer while a new range or a refresh loads; refreshes every 30 s while the tab is visible. */
function useSystem(range: RangeKey) {
  const [state, setState] = useState<{ data?: AdminSystem; status: 'loading' | 'ready' | 'error'; failedRefresh: boolean }>({ status: 'loading', failedRefresh: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => admin.system(range).then(
      data => { if (live) setState({ data, status: 'ready', failedRefresh: false }); },
      () => { if (live) setState(s => (s.data ? { ...s, status: 'ready', failedRefresh: true } : { status: 'error', failedRefresh: false })); });
    setState(s => ({ ...s, status: s.data ? s.status : 'loading' }));
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, [range, attempt]);
  return { ...state, reload: useCallback(() => setAttempt(n => n + 1), []) };
}

export function SystemPage() {
  const { t } = useTranslation('admin-system');
  const when = useWhen();
  const [params, setParams] = useSearchParams();
  const raw = params.get('range');
  const range: RangeKey = isRangeKey(raw) ? raw : '1h';
  const setRange = (r: RangeKey) => setParams(p => { const next = new URLSearchParams(p); next.set('range', r); return next; }, { replace: true });
  const state = useSystem(range);
  const s = state.data;
  const refresh = <Button variant="outline" size="sm" busy={state.status === 'loading' && !!s} onClick={state.reload}><RotateCw className="size-4" aria-hidden="true" />{t('refresh')}</Button>;
  return <>
    <PageHeader icon={Server} title={t('title')} lede={s ? `${t('lede')} ${t('updated', { time: when.clock(s.generated_at) })}` : t('lede')} actions={s ? refresh : undefined} />
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6">
      {s ? <>
        <HealthCard system={s} range={range} onRange={setRange} loading={s.range !== range} stale={state.failedRefresh} />
        <IngestCard ingest={s.ingest} />
        <WebhooksCard counts={s.webhooks} onChanged={state.reload} />
        <GatewayCard data={s.gateway} />
        <ToolsCard tools={s.tools.tools} />
        <ConnectCard />
      </> : state.status === 'error'
        ? <Alert severity="error" action={<Button variant="outline" size="sm" className="bg-card" onClick={state.reload}>{t('retry')}</Button>}><p className="font-medium">{t('loadError.title')}</p><p className="text-muted-foreground">{t('loadError.hint')}</p></Alert>
        : <div role="status" aria-label={t('loading')} className="grid gap-6"><Skeleton className="h-72 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>}
    </div>
  </>;
}
