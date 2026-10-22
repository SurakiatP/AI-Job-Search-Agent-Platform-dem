import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useResource } from '../projects/useResource';
import { LoadingBlock, Notice, SectionCard } from './Field';

type GatewayView = { configured: boolean; reachable: boolean; base_url: string | null; analyze_model: string; decision_model: string; models: string[] };

export function GatewaySettings() {
  const { t } = useTranslation('settings');
  const state = useResource<GatewayView>('/gateway');
  const title = t('nav.gateway'), description = t('gateway.description');
  if (state.status === 'error') return <SectionCard title={title} description={description} footer={<Button variant="outline" onClick={state.reload}>{t('retry')}</Button>}><Notice>{t('loadError')}</Notice></SectionCard>;
  const data = state.data;
  if (!data) return <SectionCard title={title} description={description}><LoadingBlock label={t('loading')} /></SectionCard>;

  const status = !data.configured ? 'notConfigured' : data.reachable ? 'reachable' : 'unreachable';
  const rows: [string, string][] = [[t('gateway.analyzeModel'), data.analyze_model], [t('gateway.decisionModel'), data.decision_model]];
  return <SectionCard title={title} description={description}
    footer={data.base_url ? <Button asChild variant="outline"><a href={`${data.base_url.replace(/\/+$/, '')}/ui`} target="_blank" rel="noopener noreferrer">{t('gateway.manage')}</a></Button> : undefined}>
    <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{t(`gateway.status.${status}`)}</p>
    {!data.configured && <p className="text-sm text-muted-foreground">{t('gateway.hint')}</p>}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label} className="grid gap-0.5"><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}
    </dl>
    <div className="grid gap-1.5">
      <h3 className="text-sm font-medium">{t('gateway.models')}</h3>
      {data.models.length ? <ul className="flex flex-wrap gap-2">{data.models.map(id => <li key={id} className="break-all rounded-md border bg-secondary px-2 py-1 font-mono text-sm">{id}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t('gateway.noModels')}</p>}
    </div>
  </SectionCard>;
}
