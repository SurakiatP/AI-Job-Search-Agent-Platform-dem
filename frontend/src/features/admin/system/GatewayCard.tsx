import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import type { AdminGatewayStatus } from '@/lib/api-types';
import { SectionCard } from '../../settings/Field';

/** The old Settings > AI gateway card, now fed by /admin/system. Read-only. */
export function GatewayCard({ data }: { data: AdminGatewayStatus }) {
  const { t } = useTranslation('admin-system');
  const status = !data.configured ? 'notConfigured' : data.reachable ? 'reachable' : 'unreachable';
  const rows: [string, string][] = [[t('gateway.analyzeModel'), data.analyze_model], [t('gateway.decisionModel'), data.decision_model]];
  return <SectionCard title={t('gateway.title')} description={t('gateway.description')}>
    <Alert severity="info">{t(`gateway.status.${status}`)}</Alert>
    {!data.configured && <p className="text-sm text-muted-foreground">{t('gateway.hint')}</p>}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label} className="grid gap-0.5"><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}
    </dl>
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{t('gateway.models')}</h3>
      {data.models.length ? <ul className="flex flex-wrap gap-2">{data.models.map(id => <li key={id} className="break-all rounded-md border bg-secondary px-2 py-1 font-mono text-sm">{id}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t('gateway.noModels')}</p>}
    </div>
  </SectionCard>;
}
