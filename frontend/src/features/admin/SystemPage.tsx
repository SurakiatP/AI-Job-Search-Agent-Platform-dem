import { RotateCw, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminSystem } from '@/lib/api-types';
import { useResource } from '../projects/useResource';
import { ConnectCard } from './system/ConnectCard';
import { GatewayCard } from './system/GatewayCard';
import { HealthCard } from './system/HealthCard';
import { IngestCard } from './system/IngestCard';
import { ToolsCard } from './system/ToolsCard';
import { WebhooksCard } from './system/WebhooksCard';
import { useWhen } from './system/format';

export function SystemPage() {
  const { t } = useTranslation('admin-system');
  const when = useWhen();
  const state = useResource<AdminSystem>('/admin/system');
  const s = state.data;
  const refresh = <Button variant="outline" size="sm" busy={state.status === 'loading' && !!s} onClick={state.reload}><RotateCw className="size-4" aria-hidden="true" />{t('refresh')}</Button>;
  return <>
    <PageHeader icon={Server} title={t('title')} lede={s ? `${t('lede')} ${t('updated', { time: when.clock(s.generated_at) })}` : t('lede')} actions={s ? refresh : undefined} />
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6">
      {s ? <>
        <HealthCard system={s} />
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
